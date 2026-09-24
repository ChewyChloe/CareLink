import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateReminderInput {
  item_name: string;
  quantity?: string;
  due_at: string; // ISO 8601
  guardian_user_id?: string;
}

const ALLOWED_ITEM_NAMES = ['尿布', '濕紙巾', '奶粉', '換洗衣物', '其他'];

@Injectable()
export class SupplyReminderService {
  private readonly logger = new Logger(SupplyReminderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a supply reminder (SupplyTask) and schedules a SUPPLY_REMINDER Job.
   */
  async createReminder(caregiverId: string, childId: string, input: CreateReminderInput) {
    // 1. Validate item_name
    if (!ALLOWED_ITEM_NAMES.includes(input.item_name)) {
      throw new BadRequestException(`Invalid item_name. Allowed: ${ALLOWED_ITEM_NAMES.join(', ')}`);
    }

    // 2. Validate due_at
    const dueAt = new Date(input.due_at);
    if (isNaN(dueAt.getTime())) {
      throw new BadRequestException('Invalid due_at datetime');
    }

    // 3. Validate caregiver has active AccessGrant with HANDOFF_WRITE for this child
    const caregiverGrant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: caregiverId,
        child_id: childId,
        role: 'CAREGIVER',
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!caregiverGrant || !caregiverGrant.scopes.includes('HANDOFF_WRITE')) {
      throw new ForbiddenException('Caregiver does not have HANDOFF_WRITE access for this child');
    }

    // 4. Resolve & validate target guardian (specified or auto-resolved from child's active guardians)
    let targetGuardianUserId = input.guardian_user_id;
    let guardianGrant = null;

    if (targetGuardianUserId && targetGuardianUserId !== 'RESOLVE_FROM_RELATIONSHIP') {
      guardianGrant = await this.prisma.accessGrant.findFirst({
        where: {
          user_id: targetGuardianUserId,
          child_id: childId,
          role: 'GUARDIAN',
          revoked_at: null,
          OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
        },
        include: { user: { select: { id: true, line_sub: true, status: true } } },
      });

      if (!guardianGrant) {
        throw new ForbiddenException('Target user is not an active Guardian for this child');
      }
    } else {
      guardianGrant = await this.prisma.accessGrant.findFirst({
        where: {
          child_id: childId,
          role: 'GUARDIAN',
          revoked_at: null,
          OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
        },
        include: { user: { select: { id: true, line_sub: true, status: true } } },
      });

      if (!guardianGrant) {
        throw new NotFoundException('No active Guardian found for this child');
      }
      targetGuardianUserId = guardianGrant.user_id;
    }

    if (!guardianGrant.user || !guardianGrant.user.line_sub || guardianGrant.user.status !== 'ACTIVE') {
      throw new BadRequestException('Guardian does not have a valid LINE identity');
    }

    // 5. Resolve relationship_id
    const relationship = await this.prisma.careRelationship.findFirst({
      where: {
        child_id: childId,
        caregiver_user_id: caregiverId,
        status: 'ACTIVE',
      },
    });

    if (!relationship) {
      throw new ForbiddenException('No active care relationship found');
    }

    // 6. Create SupplyTask + Job in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const supplyTask = await tx.supplyTask.create({
        data: {
          relationship_id: relationship.id,
          created_by: caregiverId,
          assigned_to: targetGuardianUserId!,
          item_name: input.item_name,
          quantity: input.quantity || null,
          due_at: dueAt,
          status: 'PENDING',
          lock_version: 1,
        },
      });

      const dedupeKey = `supply:${supplyTask.id}`;
      const job = await tx.job.create({
        data: {
          kind: 'SUPPLY_REMINDER',
          dedupe_key: dedupeKey,
          payload_refs: {
            supplyTaskId: supplyTask.id,
            guardianLineSub: guardianGrant.user.line_sub,
          },
          status: 'READY',
          attempts: 0,
          next_run_at: dueAt,
        },
      });

      this.logger.log(
        `Supply reminder created: task=${supplyTask.id.slice(0, 8)}, job=${job.id.slice(0, 8)}, item=${input.item_name}, due=${dueAt.toISOString()}`,
      );

      return { supplyTask, jobId: job.id };
    });

    return result.supplyTask;
  }

  /**
   * Lists supply reminders for a child, with computed reminder_sent.
   */
  async listByChild(userId: string, childId: string) {
    // Validate user has any active AccessGrant for child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: childId,
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!grant) {
      throw new ForbiddenException('No access to this child');
    }

    // Find all relationships for this child where user is involved
    const relationships = await this.prisma.careRelationship.findMany({
      where: {
        child_id: childId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const relationshipIds = relationships.map((r) => r.id);

    const tasks = await this.prisma.supplyTask.findMany({
      where: {
        relationship_id: { in: relationshipIds },
        status: { not: 'CANCELLED' },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    // Compute reminder_sent from Job state
    const taskIds = tasks.map((t) => t.id);
    const jobs = taskIds.length > 0
      ? await this.prisma.job.findMany({
          where: {
            kind: 'SUPPLY_REMINDER',
            dedupe_key: { in: taskIds.map((id) => `supply:${id}`) },
          },
          select: { dedupe_key: true, status: true },
        })
      : [];

    const sentJobSet = new Set(
      jobs.filter((j) => j.status === 'SUCCEEDED').map((j) => j.dedupe_key.replace('supply:', '')),
    );

    return tasks.map((t) => ({
      ...t,
      reminder_sent: sentJobSet.has(t.id),
    }));
  }

  /**
   * Guardian marks a supply reminder as prepared (PENDING → PACKED).
   */
  async markPacked(guardianUserId: string, supplyTaskId: string) {
    const task = await this.prisma.supplyTask.findUnique({
      where: { id: supplyTaskId },
      include: { relationship: { select: { child_id: true } } },
    });

    if (!task) {
      throw new NotFoundException('Supply reminder not found');
    }

    // Authorization: must be the assigned guardian
    if (task.assigned_to !== guardianUserId) {
      throw new ForbiddenException('Only the assigned guardian can mark this as prepared');
    }

    // Verify guardian has active AccessGrant for this child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: guardianUserId,
        child_id: task.relationship.child_id,
        role: 'GUARDIAN',
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!grant) {
      throw new ForbiddenException('Guardian access grant expired or revoked');
    }

    if (task.status !== 'PENDING') {
      throw new BadRequestException(`Cannot mark as prepared: current status is ${task.status}`);
    }

    return this.prisma.supplyTask.update({
      where: { id: supplyTaskId },
      data: {
        status: 'PACKED',
        packed_at: new Date(),
      },
    });
  }

  /**
   * Caregiver confirms receipt of supply (PACKED → RECEIVED).
   */
  async markReceived(caregiverId: string, supplyTaskId: string) {
    const task = await this.prisma.supplyTask.findUnique({
      where: { id: supplyTaskId },
      include: { relationship: { select: { child_id: true } } },
    });

    if (!task) {
      throw new NotFoundException('Supply reminder not found');
    }

    // Verify caregiver has AccessGrant for child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: caregiverId,
        child_id: task.relationship.child_id,
        role: 'CAREGIVER',
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!grant) {
      throw new ForbiddenException('Caregiver does not have access to this child');
    }

    if (task.status !== 'PACKED') {
      throw new BadRequestException(`Cannot confirm receipt: current status is ${task.status}`);
    }

    return this.prisma.supplyTask.update({
      where: { id: supplyTaskId },
      data: {
        status: 'RECEIVED',
        received_at: new Date(),
      },
    });
  }

  /**
   * Cancel a supply reminder.
   */
  async cancel(userId: string, supplyTaskId: string) {
    const task = await this.prisma.supplyTask.findUnique({
      where: { id: supplyTaskId },
      include: { relationship: { select: { child_id: true } } },
    });

    if (!task) {
      throw new NotFoundException('Supply reminder not found');
    }

    // Verify user has AccessGrant for child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: task.relationship.child_id,
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!grant) {
      throw new ForbiddenException('No access to this child');
    }

    if (task.status === 'CANCELLED' || task.status === 'RECEIVED') {
      throw new BadRequestException(`Cannot cancel: current status is ${task.status}`);
    }

    // Cancel SupplyTask
    const updated = await this.prisma.supplyTask.update({
      where: { id: supplyTaskId },
      data: { status: 'CANCELLED' },
    });

    // Mark corresponding Job DEAD if still READY/RETRY
    await this.prisma.job.updateMany({
      where: {
        kind: 'SUPPLY_REMINDER',
        dedupe_key: `supply:${supplyTaskId}`,
        status: { in: ['READY', 'RETRY'] },
      },
      data: {
        status: 'DEAD',
        last_error_code: 'TASK_CANCELLED',
      },
    });

    return updated;
  }
}
