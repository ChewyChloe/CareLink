import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageEncryptionService } from './crypto/message-encryption.service';
import { LineWebhookPayload, LineWebhookEvent } from './dto/line-webhook.dto';
import { DraftService } from '../care/draft.service';
import { LineMessagingService } from './line-messaging.service';
import { ExtractionWorker } from '../jobs/extraction.worker';
import { FlexMessageBuilder } from './flex/flex-message.builder';

export interface WebhookProcessResult {
  eventId: string;
  eventType: string;
  status:
    | 'created'
    | 'duplicate_acknowledged'
    | 'withdrawn'
    | 'tombstone_created'
    | 'ignored_due_to_prior_unsend'
    | 'postback_received'
    | 'confirmed'
    | 'already_confirmed'
    | 'cancelled'
    | 'postback_failed'
    | 'unsupported_event'
    | 'missing_source_user'
    | 'user_not_registered';
  receiptId?: string;
  sourceMessageId?: string;
  jobId?: string;
  eventCount?: number;
  error?: string;
}

@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: MessageEncryptionService,
    private readonly configService: ConfigService,
    @Optional() private readonly draftService?: DraftService,
    @Optional() private readonly lineMessagingService?: LineMessagingService,
    @Optional() @Inject(forwardRef(() => ExtractionWorker)) private readonly extractionWorker?: ExtractionWorker,
  ) {}

  /**
   * Processes a verified LINE webhook payload within database transactions.
   * Ensures idempotency, durable persistence, raw message encryption, and unsend ordering.
   */
  async handleWebhook(payload: LineWebhookPayload, channelIdFromHeader?: string): Promise<WebhookProcessResult[]> {
    const channelId = channelIdFromHeader || payload.destination || 'default_channel';
    const results: WebhookProcessResult[] = [];

    for (const event of payload.events) {
      const result = await this.processSingleEvent(event, channelId);
      results.push(result);

      if (result.status === 'created' && result.jobId && this.extractionWorker) {
        this.extractionWorker.processExtractJob(result.jobId).catch((err) => {
          this.logger.error(`Extract job ${result.jobId} execution failed: ${err.message}`);
        });
      }
    }

    return results;
  }

  /**
   * Processes an individual event inside an isolated Prisma transaction.
   */
  async processSingleEvent(event: LineWebhookEvent, channelId: string): Promise<WebhookProcessResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Idempotency check: Look up existing receipt
      const existingReceipt = await tx.webhookReceipt.findUnique({
        where: {
          channel_id_webhook_event_id: {
            channel_id: channelId,
            webhook_event_id: event.webhookEventId,
          },
        },
      });

      if (existingReceipt) {
        // Redelivered event: safe acknowledgment without side-effects
        return {
          eventId: event.webhookEventId,
          eventType: event.type,
          status: 'duplicate_acknowledged',
          receiptId: existingReceipt.id,
        };
      }

      // 2. Create WebhookReceipt
      const receipt = await tx.webhookReceipt.create({
        data: {
          channel_id: channelId,
          webhook_event_id: event.webhookEventId,
          event_type: event.type,
          event_timestamp: BigInt(event.timestamp),
          received_at: new Date(),
          status: 'PROCESSED',
        },
      });

      // 3. Handle by event type
      switch (event.type) {
        case 'message':
          return this.handleMessageEvent(tx, event, channelId, receipt.id);

        case 'unsend':
          return this.handleUnsendEvent(tx, event, channelId, receipt.id);

        case 'postback':
          return this.handlePostbackEvent(event, receipt.id);

        default:
          // Unsupported events (follow, image, etc.): minimal receipt saved, no job created, no crash
          return {
            eventId: event.webhookEventId,
            eventType: event.type,
            status: 'unsupported_event',
            receiptId: receipt.id,
          };
      }
    });
  }

  /**
   * Handles text message events.
   */
  private async handleMessageEvent(
    tx: any,
    event: LineWebhookEvent,
    channelId: string,
    receiptId: string,
  ): Promise<WebhookProcessResult> {
    if (event.message?.type !== 'text' || !event.message?.text) {
      return {
        eventId: event.webhookEventId,
        eventType: 'message',
        status: 'unsupported_event',
        receiptId,
      };
    }

    const lineMessageId = event.message.id;

    // Check if an unsend tombstone or prior message already exists
    const existingMessage = await tx.sourceMessage.findUnique({
      where: {
        channel_id_line_message_id: {
          channel_id: channelId,
          line_message_id: lineMessageId,
        },
      },
    });

    if (existingMessage) {
      if (existingMessage.withdrawn_at) {
        // Unsend arrived before message: tombstone prevents message from becoming active
        return {
          eventId: event.webhookEventId,
          eventType: 'message',
          status: 'ignored_due_to_prior_unsend',
          receiptId,
          sourceMessageId: existingMessage.id,
        };
      }
      return {
        eventId: event.webhookEventId,
        eventType: 'message',
        status: 'duplicate_acknowledged',
        receiptId,
        sourceMessageId: existingMessage.id,
      };
    }

    // Encrypt raw message body using AES-256-GCM
    const encryptedBody = this.encryptionService.encrypt(event.message.text);

    // 24-hour retention window per System Architecture
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Resolve author_user_id if a CareLink user exists for this LINE userId in the same provider
    let authorUserId: string | null = null;
    if (event.source?.userId) {
      const providerId = this.configService.get<string>('LINE_PROVIDER_ID') || 'default_provider';
      let matchedUser = await tx.user.findUnique({
        where: {
          line_provider_id_line_sub: {
            line_provider_id: providerId,
            line_sub: event.source.userId,
          },
        },
        select: { id: true },
      });
      if (!matchedUser && typeof tx.user?.create === 'function') {
        matchedUser = await tx.user.create({
          data: {
            line_provider_id: providerId,
            line_sub: event.source.userId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
      }
      if (matchedUser) {
        authorUserId = matchedUser.id;
      }
    }

    // Persist SourceMessage (author_user_id linked if user identified, null otherwise)
    const sourceMessage = await tx.sourceMessage.create({
      data: {
        receipt_id: receiptId,
        channel_id: channelId,
        line_message_id: lineMessageId,
        author_user_id: authorUserId,
        body_ciphertext: encryptedBody,
        received_at: new Date(event.timestamp),
        withdrawn_at: null,
        expires_at: expiresAt,
      },
    });

    // Create EXTRACT Job in jobs table
    // payload_refs only contains internal references (NO message body in job payload!)
    const dedupeKey = `extract:${channelId}:${lineMessageId}`;
    const job = await tx.job.create({
      data: {
        kind: 'EXTRACT',
        dedupe_key: dedupeKey,
        payload_refs: {
          sourceMessageId: sourceMessage.id,
          channelId,
          lineMessageId,
          lineUserId: event.source?.userId,
          replyToken: event.replyToken,
        },
        status: 'READY',
        attempts: 0,
      },
    });

    this.logger.log(
      `[Stage 6.5 Checkpoint] LINE Webhook message ingested -> SourceMessage [${sourceMessage.id.slice(0, 8)}] & EXTRACT Job [${job.id.slice(0, 8)}] (Author=[MASKED])`,
    );

    return {
      eventId: event.webhookEventId,
      eventType: 'message',
      status: 'created',
      receiptId,
      sourceMessageId: sourceMessage.id,
      jobId: job.id,
    };
  }

  /**
   * Handles unsend events.
   */
  private async handleUnsendEvent(
    tx: any,
    event: LineWebhookEvent,
    channelId: string,
    receiptId: string,
  ): Promise<WebhookProcessResult> {
    const targetMessageId = event.unsend?.messageId;
    if (!targetMessageId) {
      return {
        eventId: event.webhookEventId,
        eventType: 'unsend',
        status: 'unsupported_event',
        receiptId,
      };
    }

    const existingMessage = await tx.sourceMessage.findUnique({
      where: {
        channel_id_line_message_id: {
          channel_id: channelId,
          line_message_id: targetMessageId,
        },
      },
    });

    if (existingMessage) {
      // Message was already persisted: mark as withdrawn and clear ciphertext immediately
      await tx.sourceMessage.update({
        where: { id: existingMessage.id },
        data: {
          withdrawn_at: new Date(event.timestamp),
          body_ciphertext: null,
        },
      });

      // Invalidate any pending EXTRACT jobs for this message
      const dedupeKey = `extract:${channelId}:${targetMessageId}`;
      await tx.job.updateMany({
        where: {
          kind: 'EXTRACT',
          dedupe_key: dedupeKey,
          status: 'READY',
        },
        data: {
          status: 'DEAD',
          last_error_code: 'MESSAGE_UNSENT',
        },
      });

      return {
        eventId: event.webhookEventId,
        eventType: 'unsend',
        status: 'withdrawn',
        receiptId,
        sourceMessageId: existingMessage.id,
      };
    } else {
      // Unsend arrived before the message: create a tombstone
      const tombstone = await tx.sourceMessage.create({
        data: {
          receipt_id: receiptId,
          channel_id: channelId,
          line_message_id: targetMessageId,
          author_user_id: null,
          body_ciphertext: null,
          received_at: new Date(event.timestamp),
          withdrawn_at: new Date(event.timestamp),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return {
        eventId: event.webhookEventId,
        eventType: 'unsend',
        status: 'tombstone_created',
        receiptId,
        sourceMessageId: tombstone.id,
      };
    }
  }

  /**
   * Handles postback events (e.g. from LINE Flex confirmation cards).
   * Validates user identity and delegates to DraftService for atomic confirmation/cancellation.
   */
  private async handlePostbackEvent(
    event: LineWebhookEvent,
    receiptId: string,
  ): Promise<WebhookProcessResult> {
    const postbackData = event.postback?.data || '';
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');
    const draftId = params.get('draft_id');
    const expectedVersionStr = params.get('expected_version');
    const expectedVersion = expectedVersionStr ? parseInt(expectedVersionStr, 10) : undefined;

    if (!action || !draftId) {
      return {
        eventId: event.webhookEventId,
        eventType: 'postback',
        status: 'postback_received',
        receiptId,
      };
    }

    if (!this.draftService) {
      return {
        eventId: event.webhookEventId,
        eventType: 'postback',
        status: 'postback_received',
        receiptId,
      };
    }

    const lineUserId = event.source?.userId;
    if (!lineUserId) {
      return {
        eventId: event.webhookEventId,
        eventType: 'postback',
        status: 'missing_source_user',
        receiptId,
      };
    }

    const providerId = this.configService.get<string>('LINE_PROVIDER_ID') || 'provider_001';
    const user = await this.prisma.user.findUnique({
      where: {
        line_provider_id_line_sub: {
          line_provider_id: providerId,
          line_sub: lineUserId,
        },
      },
    });

    if (!user) {
      return {
        eventId: event.webhookEventId,
        eventType: 'postback',
        status: 'user_not_registered',
        receiptId,
      };
    }

    if (action === 'confirm_draft') {
      try {
        const result = await this.draftService.confirmDraft({
          draftId,
          userId: user.id,
          expectedVersion,
        });

        if (this.lineMessagingService && lineUserId) {
          try {
            const miniAppChannelId = this.configService.get<string>('LINE_MINI_APP_CHANNEL_ID') || '';
            const successBubble = FlexMessageBuilder.buildConfirmedSuccessFlex(
              '受托幼兒',
              result.eventCount || 1,
              miniAppChannelId,
            );
            await this.lineMessagingService.pushFlexMessage(
              lineUserId,
              'CareLink 照護紀錄已存入時間軸',
              successBubble,
            );
          } catch (flexErr: any) {
            this.logger.warn(`Failed to push success Flex card: ${flexErr.message}`);
          }
        }

        this.logger.log(
          `[Stage 6.5 Checkpoint] Flex confirmation postback processed -> Draft [${draftId.slice(0, 8)}] confirmed into ${result.eventCount} CareEvents (User=[MASKED])`,
        );

        return {
          eventId: event.webhookEventId,
          eventType: 'postback',
          status: result.status === 'ALREADY_CONFIRMED' ? 'already_confirmed' : 'confirmed',
          receiptId,
          eventCount: result.eventCount,
        };
      } catch (err: any) {
        this.logger.warn(`Postback draft confirmation failed for ${draftId}: ${err.message}`);
        return {
          eventId: event.webhookEventId,
          eventType: 'postback',
          status: 'postback_failed',
          receiptId,
          error: err.message,
        };
      }
    } else if (action === 'cancel_draft') {
      try {
        await this.draftService.cancelDraft(draftId, user.id);
        return {
          eventId: event.webhookEventId,
          eventType: 'postback',
          status: 'cancelled',
          receiptId,
        };
      } catch (err: any) {
        return {
          eventId: event.webhookEventId,
          eventType: 'postback',
          status: 'postback_failed',
          receiptId,
          error: err.message,
        };
      }
    }

    return {
      eventId: event.webhookEventId,
      eventType: 'postback',
      status: 'postback_received',
      receiptId,
    };
  }
}
