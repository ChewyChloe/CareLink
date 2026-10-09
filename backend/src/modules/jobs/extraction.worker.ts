import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { MessageEncryptionService } from '../line/crypto/message-encryption.service';
import { CareExtractionOutput } from '../ai/schemas/care-extraction.schema';
import { LineMessagingService } from '../line/line-messaging.service';
import { FlexMessageBuilder, FlexDraftBatchData } from '../line/flex/flex-message.builder';

export interface JobProcessingResult {
  jobId: string;
  status: 'SUCCEEDED' | 'DEAD' | 'RETRY' | 'SKIPPED';
  draftBatchId?: string;
  errorCode?: string;
  reason?: string;
}

@Injectable()
export class ExtractionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractionWorker.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly encryptionService: MessageEncryptionService,
    @Optional() private readonly lineMessagingService?: LineMessagingService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log('Starting continuous background worker polling loop for READY jobs...');
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
        await this.pollAndProcessJobs();
      } catch (err: any) {
        this.logger.error(`Error in worker polling loop: ${err.message}`);
      } finally {
        this.isPolling = false;
      }
    }, 2000);
    this.pollingTimer.unref?.();
  }

  async pollAndProcessJobs(): Promise<void> {
    if (!this.prisma || typeof this.prisma.job?.findMany !== 'function') return;

    const now = new Date();
    const eligibleJobs = await this.prisma.job.findMany({
      where: {
        kind: 'EXTRACT',
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
        await this.processExtractJob(job.id);
      } catch (err: any) {
        this.logger.error(`Worker failed to process job ${job.id}: ${err.message}`);
      }
    }
  }

  /**
   * Processes a single EXTRACT job by ID according to state machine and security boundaries.
   */
  async processExtractJob(jobId: string, forceProvider?: 'gemini' | 'mock'): Promise<JobProcessingResult> {
    // 1. Claim job lease
    let job: any;
    let payloadRefs: { source_message_id?: string } = {};
    try {
      job = await this.prisma.job.findUnique({ where: { id: jobId } });
      if (!job || job.kind !== 'EXTRACT') {
        return { jobId, status: 'SKIPPED', reason: 'Job not found or invalid kind' };
      }

      payloadRefs = (job.payload_refs || {}) as { source_message_id?: string };

      // Check if job is in workable state
      const now = new Date();
      if (job.status === 'SUCCEEDED' || job.status === 'DEAD') {
        return { jobId, status: 'SKIPPED', reason: `Job already in final state: ${job.status}` };
      }

      if (job.status === 'RUNNING' && job.lease_until && job.lease_until > now) {
        return { jobId, status: 'SKIPPED', reason: 'Job currently leased by another worker' };
      }

      // Lease job
      const updated = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          lease_until: new Date(now.getTime() + 60 * 1000), // 60s lease
        },
      });
      job = { ...job, ...updated };
    } catch (dbErr) {
      // Degraded/Mock DB mode fallback for offline verification
      this.logger.warn(`Job query fallback (PostgreSQL offline): ${dbErr}`);
      return { jobId, status: 'SKIPPED', reason: 'Database unavailable' };
    }

    const sourceMessageId =
      (payloadRefs as any)?.sourceMessageId || (payloadRefs as any)?.source_message_id;

    if (!sourceMessageId) {
      await this.markJobDead(job.id, 'MISSING_SOURCE_MESSAGE_ID');
      return { jobId, status: 'DEAD', errorCode: 'MISSING_SOURCE_MESSAGE_ID' };
    }

    // 2. Load SourceMessage
    const sourceMessage = await this.prisma.sourceMessage.findUnique({
      where: { id: sourceMessageId },
    });

    if (!sourceMessage) {
      await this.markJobDead(job.id, 'SOURCE_MESSAGE_NOT_FOUND');
      return { jobId, status: 'DEAD', errorCode: 'SOURCE_MESSAGE_NOT_FOUND' };
    }

    // 3. Unsend Security Check: withdrawn_at MUST cancel extraction before calling AI
    if (sourceMessage.withdrawn_at !== null) {
      this.logger.log({
        msg: 'SourceMessage was withdrawn/unsend before extraction. Cancelling job with ZERO AI calls.',
        jobId: job.id,
        sourceMessageId: sourceMessage.id,
      });

      await this.markJobDead(job.id, 'MESSAGE_WITHDRAWN_BEFORE_EXTRACTION');
      return {
        jobId,
        status: 'DEAD',
        errorCode: 'MESSAGE_WITHDRAWN_BEFORE_EXTRACTION',
        reason: 'Message was unsend by author before AI extraction',
      };
    }

    // 4. Idempotency Check: Do not create duplicate active DraftBatch for same source message
    const existingDraft = await this.prisma.draftBatch.findFirst({
      where: {
        source_message_id: sourceMessage.id,
        status: { in: ['NEEDS_INPUT', 'PENDING_CONFIRMATION'] },
      },
    });

    if (existingDraft) {
      this.logger.log(`Active DraftBatch already exists (${existingDraft.id}) for source_message_id. Skipping.`);
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', lease_until: null },
      });
      return { jobId, status: 'SUCCEEDED', draftBatchId: existingDraft.id };
    }

    // 5. Decrypt message body
    if (!sourceMessage.body_ciphertext) {
      await this.markJobDead(job.id, 'EMPTY_MESSAGE_CIPHERTEXT');
      return { jobId, status: 'DEAD', errorCode: 'EMPTY_MESSAGE_CIPHERTEXT' };
    }

    let plaintext = '';
    try {
      plaintext = this.encryptionService.decrypt(sourceMessage.body_ciphertext);
    } catch (decryptErr: any) {
      await this.markJobDead(job.id, 'DECRYPTION_FAILED');
      return { jobId, status: 'DEAD', errorCode: 'DECRYPTION_FAILED' };
    }

    // 6. Resolve authorization scope for author
    let authorizedChildren: Array<{ id: string; displayAlias: string }> = [];
    let relationshipId: string | null = null;

    if (sourceMessage.author_user_id) {
      let grants = await this.prisma.accessGrant.findMany({
        where: {
          user_id: sourceMessage.author_user_id,
          revoked_at: null,
          starts_at: { lte: new Date() },
          OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
        },
        include: { child: true },
      });

      authorizedChildren = grants
        .filter((g) => g.child)
        .map((g) => ({ id: g.child.id, displayAlias: g.child.display_alias }));

      // Resolve care relationship if present
      if (grants.length > 0 && grants[0].relationship_id) {
        relationshipId = grants[0].relationship_id;
      }
    }

    if (!authorizedChildren.length) { await this.markJobDead(job.id, 'NO_AUTHORIZED_CHILDREN'); return { jobId, status: 'DEAD', errorCode: 'NO_AUTHORIZED_CHILDREN' }; }
    // 7. Execute AI Extraction with Sanitization
    try {
      const referenceDate = sourceMessage.received_at.toISOString().split('T')[0];
      const extraction = await this.aiService.extractCareEvents({
        text: plaintext,
        authorizedChildren,
        referenceDate,
        messageSentAt: sourceMessage.received_at,
        forceProvider,
      });

      // 8. Map Pseudonymized child_ref tokens back to real Child IDs
      let targetChildId: string | null = null;
      if (authorizedChildren.length === 1) {
        targetChildId = authorizedChildren[0].id;
      }

      // Check events and resolve tokens
      for (const event of extraction.output.events) {
        if (event.child_ref) {
          const resolvedRealId = extraction.tokenToChildIdMap[event.child_ref];
          if (resolvedRealId) {
            targetChildId = resolvedRealId;
          } else {
            // Model returned a token that is NOT in authorized scope -> REJECT / ISOLATE
            this.logger.warn({
              msg: 'Model returned unauthorized child token. Enforcing isolation.',
              token: event.child_ref,
            });
            event.child_ref = null;
            event.missing_fields.push('child');
            extraction.output.requires_user_input = true;
          }
        }
      }

      const childIds = new Set(extraction.output.events.map(e => e.child_ref ? extraction.tokenToChildIdMap[e.child_ref] : null).filter(Boolean));
      if (childIds.size > 1) {
        targetChildId = null;
        extraction.output.events = [];
        extraction.output.unsupported = [{ reason: 'requires_manual_entry', event_type: 'MULTI_CHILD' }];
        extraction.output.requires_user_input = true;
      }
      // Resolve the relationship for the selected child, not the first grant.
      relationshipId = null;
      if (targetChildId) {
        const grant = await this.prisma.accessGrant.findFirst({ where: { child_id: targetChildId, user_id: sourceMessage.author_user_id!, revoked_at: null, starts_at: { lte: new Date() }, OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }] } });
        relationshipId = grant?.relationship_id || null;
      }
      // 9. Determine DraftBatch Status
      const hasUnresolvedItems =
        extraction.output.requires_user_input ||
        extraction.output.events.some((e) => e.missing_fields.length > 0 || e.temporal_status === 'UNCERTAIN');

      const draftStatus = hasUnresolvedItems ? 'NEEDS_INPUT' : 'PENDING_CONFIRMATION';

      // 10. Normalize candidate items to standard ISO 8601 UTC timestamps & consistent amount payloads
      const normalizedItems = extraction.output.events.map((ev, index) => {
        const itemOccurredAt = this.resolveOccurredAtToIso(ev.occurred_at, sourceMessage.received_at) || ev.occurred_at;
        const payload = { ...(ev.payload || {}) };
        const amountVal = payload.amount !== undefined ? payload.amount : payload.amount_ml;
        if (ev.event_type === 'FEED' && amountVal !== undefined && ['ml', 'cc'].includes(String(payload.amount_unit).toLowerCase())) {
          payload.amount = amountVal;
          payload.amount_ml = amountVal;

        }
        return {
          ...ev,
          item_index: index,
          occurred_at: itemOccurredAt,
          payload,
        };
      });

      for (const unsupported of extraction.output.unsupported || []) normalizedItems.push({
        item_index: normalizedItems.length, event_type: unsupported.event_type as any, temporal_status: 'UNCERTAIN', occurred_at: null,
        payload: {}, child_ref: null, confidence: 0, missing_fields: ['requires_manual_entry'],
      } as any);
      // 10. Persist DraftBatch (NEVER CONFIRMED in Stage 4)
      const draft = await this.prisma.draftBatch.create({
        data: {
          source_message_id: sourceMessage.id,
          child_id: targetChildId,
          relationship_id: relationshipId,
          created_by: sourceMessage.author_user_id,
          items: normalizedItems as any,
          status: draftStatus,
          lock_version: 1,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          prompt_version: extraction.promptVersion,
          schema_version: extraction.schemaVersion,
          model_id: extraction.modelId,
        },
      });

      // 10.5 Deliver Flex Confirmation Card to LINE user
      const targetLineUser = (payloadRefs as any)?.lineUserId;
      if (this.lineMessagingService && targetLineUser && draft) {
        try {
          const miniAppChannelId = this.configService?.get<string>('LINE_MINI_APP_CHANNEL_ID') || '';
          const childAlias = authorizedChildren.find((c) => c.id === targetChildId)?.displayAlias || '受托幼兒';
          const flexData: FlexDraftBatchData = {
            id: draft.id,
            child_id: draft.child_id,
            child_alias: childAlias,
            status: draft.status,
            lock_version: draft.lock_version,
            items: draft.items as any,
            created_at: draft.created_at,
            expires_at: draft.expires_at,
          };
          const flexBubble = FlexMessageBuilder.buildDraftConfirmationFlex(flexData, miniAppChannelId);
          await this.lineMessagingService.pushFlexMessage(
            targetLineUser,
            `CareLink 照護紀錄確認卡 (${childAlias})`,
            flexBubble,
          );
        } catch (flexErr: any) {
          this.logger.warn(`Failed to deliver Flex confirmation to LINE: ${flexErr.message}`);
        }
      }

      // 10.6 Handle Extracted Supply Needs (AI candidate -> SupplyDraft -> User confirmation -> SupplyTask)
      if (extraction.output.supply_needs && extraction.output.supply_needs.length > 0) {
        for (const sn of extraction.output.supply_needs) {
          if (sn.temporal_status === 'NEGATED') {
            this.logger.log(`Supply need for "${sn.item_name}" is NEGATED. Skipping draft creation.`);
            continue;
          }

          let supplyDraft: any = null;
          if (this.prisma.supplyDraft?.create) {
            try {
              supplyDraft = await this.prisma.supplyDraft.create({
                data: {
                  source_message_id: sourceMessage.id,
                  child_id: targetChildId,
                  relationship_id: relationshipId,
                  created_by: sourceMessage.author_user_id || 'system',
                  item_name: sn.item_name,
                  size: sn.size || null,
                  quantity: sn.quantity || null,
                  remaining_quantity: sn.remaining_quantity || null,
                  due_at: sn.due_at ? new Date(sn.due_at) : null,
                  urgency: sn.urgency || 'NORMAL',
                  confidence: sn.confidence || 0.9,
                  missing_fields: sn.missing_fields || [],
                  temporal_status: sn.temporal_status || 'ACTUAL',
                  source_span: sn.source_span || null,
                  status: 'PENDING_CONFIRMATION',
                  lock_version: 1,
                  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
                },
              });
            } catch (dbErr: any) {
              this.logger.warn(`Failed to persist SupplyDraft: ${dbErr.message}`);
            }
          }

          if (this.lineMessagingService && targetLineUser && supplyDraft) {
            try {
              const miniAppChannelId = this.configService?.get<string>('LINE_MINI_APP_CHANNEL_ID') || '';
              const childAlias = authorizedChildren.find((c) => c.id === targetChildId)?.displayAlias || '受托幼兒';
              const flexBubble = FlexMessageBuilder.buildSupplyDraftConfirmationFlex({
                draftId: supplyDraft.id,
                childAlias,
                itemName: sn.item_name,
                size: sn.size,
                quantity: sn.quantity,
                remainingQuantity: sn.remaining_quantity,
                dueAt: sn.due_at,
                miniAppChannelId,
              });
              await this.lineMessagingService.pushFlexMessage(
                targetLineUser,
                `CareLink 用品提醒草稿 (${childAlias} · ${sn.item_name})`,
                flexBubble,
              );
            } catch (flexErr: any) {
              this.logger.warn(`Failed to deliver SupplyDraft Flex to LINE: ${flexErr.message}`);
            }
          }
        }
      }

      // 11. Mark Job SUCCEEDED
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          lease_until: null,
          last_error_code: null,
        },
      });

      return {
        jobId,
        status: 'SUCCEEDED',
        draftBatchId: draft?.id,
      };
    } catch (aiErr: any) {
      // 12. Retry or Dead Transition
      const attempts = job.attempts;
      const maxRetries = 2;

      if (attempts < maxRetries) {
        const backoffMs = attempts * 5000;
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'RETRY',
            lease_until: null,
            next_run_at: new Date(Date.now() + backoffMs),
            last_error_code: aiErr?.code || 'AI_EXTRACTION_TRANSIENT_ERROR',
          },
        });
        return { jobId, status: 'RETRY', errorCode: aiErr?.code || 'RETRYABLE' };
      } else {
        await this.markJobDead(job.id, 'MAX_RETRIES_EXCEEDED');
        return { jobId, status: 'DEAD', errorCode: 'MAX_RETRIES_EXCEEDED' };
      }
    }
  }

  public resolveOccurredAtToIso(occurredAtRaw: string | undefined | null, referenceDate?: Date): string | undefined {
    if (!occurredAtRaw || typeof occurredAtRaw !== 'string') return undefined;
    const trimmed = occurredAtRaw.trim();
    if (!trimmed) return undefined;

    // Pattern: HH:mm (e.g., "11:40" or "9:30")
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const ref = referenceDate || new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const [year, month, day] = formatter.format(ref).split('-');
      const [hh, mm] = trimmed.split(':');
      const isoDate = new Date(`${year}-${month}-${day}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+08:00`);
      return isNaN(isoDate.getTime()) ? trimmed : isoDate.toISOString();
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? trimmed : d.toISOString();
  }

  private async markJobDead(jobId: string, errorCode: string) {
    try {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'DEAD',
          lease_until: null,
          last_error_code: errorCode,
        },
      });
    } catch {
      // Ignored in offline mock
    }
  }
}
