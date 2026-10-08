import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LineMessagingService } from '../line/line-messaging.service';
import { FlexMessageBuilder } from '../line/flex/flex-message.builder';
import { CommerceLinkResolver } from '../handoff/commerce-link.resolver';

@Injectable()
export class SupplyReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupplyReminderWorker.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly lineMessagingService?: LineMessagingService,
    @Optional() private readonly commerceLinkResolver?: CommerceLinkResolver,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log('Starting supply reminder worker polling loop...');
      this.startPollingLoop();
    }
  }

  onModuleDestroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private startPollingLoop() {
    this.pollingTimer = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;
      try {
        await this.pollAndProcess();
      } catch (err: any) {
        this.logger.error(`Error in supply reminder polling loop: ${err.message}`);
      } finally {
        this.isPolling = false;
      }
    }, 2000);
    this.pollingTimer.unref?.();
  }

  async pollAndProcess(): Promise<void> {
    if (!this.prisma || typeof this.prisma.job?.findMany !== 'function') return;

    const now = new Date();
    const eligibleJobs = await this.prisma.job.findMany({
      where: {
        kind: 'SUPPLY_REMINDER',
        OR: [
          { status: 'READY', next_run_at: { lte: now } },
          { status: 'RETRY', next_run_at: { lte: now } },
          { status: 'RUNNING', lease_until: { lt: now } },
        ],
      },
      take: 5,
      orderBy: { created_at: 'asc' },
    });

    for (const job of eligibleJobs) {
      try {
        await this.processJob(job.id);
      } catch (err: any) {
        this.logger.error(`Failed to process supply reminder job ${job.id}: ${err.message}`);
      }
    }
  }

  /**
   * Processes a single SUPPLY_REMINDER job.
   */
  async processJob(jobId: string): Promise<{ status: string; reason?: string }> {
    // 1. Load and validate job
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.kind !== 'SUPPLY_REMINDER') {
      return { status: 'SKIPPED', reason: 'Job not found or invalid kind' };
    }

    // Already in final state
    if (job.status === 'SUCCEEDED' || job.status === 'DEAD') {
      return { status: 'SKIPPED', reason: `Job already in final state: ${job.status}` };
    }

    // Leased by another worker
    const now = new Date();
    if (job.status === 'RUNNING' && job.lease_until && job.lease_until > now) {
      return { status: 'SKIPPED', reason: 'Job currently leased by another worker' };
    }

    // 2. Lease job
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        lease_until: new Date(now.getTime() + 60 * 1000),
      },
    });

    const payloadRefs = (job.payload_refs || {}) as {
      supplyTaskId?: string;
      guardianLineSub?: string;
    };

    if (!payloadRefs.supplyTaskId) {
      await this.markJobDead(jobId, 'MISSING_SUPPLY_TASK_ID');
      return { status: 'DEAD', reason: 'Missing supplyTaskId in payload_refs' };
    }

    // 3. Load SupplyTask
    const task = await this.prisma.supplyTask.findUnique({
      where: { id: payloadRefs.supplyTaskId },
      include: {
        relationship: {
          include: {
            child: { select: { display_alias: true } },
          },
        },
        assignee: { select: { line_sub: true, status: true } },
      },
    });

    if (!task) {
      await this.markJobDead(jobId, 'SUPPLY_TASK_NOT_FOUND');
      return { status: 'DEAD', reason: 'SupplyTask not found' };
    }

    // 4. Gate: CANCELLED task
    if (task.status === 'CANCELLED') {
      await this.markJobDead(jobId, 'TASK_CANCELLED');
      return { status: 'DEAD', reason: 'SupplyTask is cancelled' };
    }

    // Gate: task already actioned (PACKED or RECEIVED)
    if (task.status !== 'PENDING') {
      await this.markJobSucceeded(jobId);
      return { status: 'SUCCEEDED', reason: `Task already in state ${task.status}, no push needed` };
    }

    // 5. Gate: due_at in future (defensive — should not happen via query)
    if (task.due_at && task.due_at > now) {
      // Release lease, let it be picked up later
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'READY', lease_until: null, attempts: { decrement: 1 } },
      });
      return { status: 'SKIPPED', reason: 'due_at has not arrived yet' };
    }

    // 6. Resolve guardian LINE identity
    const guardianLineSub = task.assignee?.line_sub || payloadRefs.guardianLineSub;
    if (!guardianLineSub) {
      await this.markJobDead(jobId, 'GUARDIAN_LINE_SUB_MISSING');
      return { status: 'DEAD', reason: 'Guardian has no LINE identity' };
    }

    if (task.assignee?.status !== 'ACTIVE') {
      await this.markJobDead(jobId, 'GUARDIAN_INACTIVE');
      return { status: 'DEAD', reason: 'Guardian user is not active' };
    }

    // 7. Build Flex message
    const childAlias = task.relationship?.child?.display_alias || '幼兒';
    const commerceUrl = this.commerceLinkResolver?.resolve(task.item_name) || null;
    const note = task.quantity || `請補充${task.item_name}`;

    const flexBubble = FlexMessageBuilder.buildSupplyReminderFlex({
      childAlias,
      itemName: task.item_name,
      note,
      supplyTaskId: task.id,
      commerceUrl,
    });

    // 8. Send LINE push with X-Line-Retry-Key = Job.id
    if (!this.lineMessagingService) {
      await this.markJobDead(jobId, 'LINE_SERVICE_UNAVAILABLE');
      return { status: 'DEAD', reason: 'LineMessagingService not available' };
    }

    const pushSuccess = await this.lineMessagingService.pushFlexMessage(
      guardianLineSub,
      `CareLink 用品提醒 — ${childAlias}需要補充${task.item_name}`,
      flexBubble,
      jobId, // retryKey = Job.id UUID
    );

    if (pushSuccess) {
      await this.markJobSucceeded(jobId);
      this.logger.log(
        `Supply reminder push sent: task=${task.id.slice(0, 8)}, child=${childAlias}, item=${task.item_name}`,
      );
      return { status: 'SUCCEEDED' };
    } else {
      // Transient failure → retry with backoff
      const attempts = (job.attempts || 0) + 1;
      const maxRetries = 3;

      if (attempts >= maxRetries) {
        await this.markJobDead(jobId, 'MAX_RETRIES_EXCEEDED');
        return { status: 'DEAD', reason: 'Max retries exceeded' };
      }

      const backoffMs = attempts * 5000;
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RETRY',
          lease_until: null,
          next_run_at: new Date(Date.now() + backoffMs),
          last_error_code: 'LINE_PUSH_FAILED',
        },
      });
      return { status: 'RETRY', reason: 'LINE push failed, will retry' };
    }
  }

  private async markJobDead(jobId: string, errorCode: string) {
    try {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'DEAD', lease_until: null, last_error_code: errorCode },
      });
    } catch {
      // Ignored in offline mock
    }
  }

  private async markJobSucceeded(jobId: string) {
    try {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', lease_until: null, last_error_code: null },
      });
    } catch {
      // Ignored in offline mock
    }
  }
}
