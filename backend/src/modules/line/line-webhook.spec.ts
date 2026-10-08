import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { LineSignatureService } from './line-signature.service';
import { LineWebhookService } from './line-webhook.service';
import { LineWebhookController } from './line-webhook.controller';
import { MessageEncryptionService } from './crypto/message-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LineWebhookPayload, LineWebhookEvent } from './dto/line-webhook.dto';

describe('Stage 2: LINE Messaging API Webhook Tests', () => {
  const channelSecret = 'test_channel_secret_key_12345';
  const encryptionKey = 'test_encryption_key_32_bytes_test!';

  let signatureService: LineSignatureService;
  let webhookService: LineWebhookService;
  let encryptionService: MessageEncryptionService;
  let controller: LineWebhookController;

  // Mock Database State for testing transaction boundaries & idempotency
  let receiptsTable: Map<string, any>;
  let sourceMessagesTable: Map<string, any>;
  let jobsTable: Map<string, any>;

  const createMockPrisma = (simulateJobFailure = false) => {
    return {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        // Create transactional snapshot
        const snapshotReceipts = new Map(receiptsTable);
        const snapshotMessages = new Map(sourceMessagesTable);
        const snapshotJobs = new Map(jobsTable);

        const tx = {
          webhookReceipt: {
            findUnique: jest.fn().mockImplementation(async ({ where }) => {
              const key = `${where.channel_id_webhook_event_id.channel_id}:${where.channel_id_webhook_event_id.webhook_event_id}`;
              return receiptsTable.get(key) || null;
            }),
            create: jest.fn().mockImplementation(async ({ data }) => {
              const id = `receipt_${Date.now()}_${Math.random()}`;
              const record = { id, ...data };
              const key = `${data.channel_id}:${data.webhook_event_id}`;
              receiptsTable.set(key, record);
              return record;
            }),
          },
          sourceMessage: {
            findUnique: jest.fn().mockImplementation(async ({ where }) => {
              const key = `${where.channel_id_line_message_id.channel_id}:${where.channel_id_line_message_id.line_message_id}`;
              return sourceMessagesTable.get(key) || null;
            }),
            create: jest.fn().mockImplementation(async ({ data }) => {
              const id = `msg_${Date.now()}_${Math.random()}`;
              const record = { id, ...data };
              const key = `${data.channel_id}:${data.line_message_id}`;
              sourceMessagesTable.set(key, record);
              return record;
            }),
            update: jest.fn().mockImplementation(async ({ where, data }) => {
              for (const [key, val] of sourceMessagesTable.entries()) {
                if (val.id === where.id) {
                  const updated = { ...val, ...data };
                  sourceMessagesTable.set(key, updated);
                  return updated;
                }
              }
              return null;
            }),
          },
          job: {
            create: jest.fn().mockImplementation(async ({ data }) => {
              if (simulateJobFailure) {
                throw new Error('Simulated Database Failure on Job Insertion');
              }
              const id = `job_${Date.now()}_${Math.random()}`;
              const record = { id, ...data };
              jobsTable.set(data.dedupe_key, record);
              return record;
            }),
            updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
              let count = 0;
              for (const [key, val] of jobsTable.entries()) {
                if (val.kind === where.kind && val.dedupe_key === where.dedupe_key && val.status === where.status) {
                  jobsTable.set(key, { ...val, ...data });
                  count++;
                }
              }
              return { count };
            }),
          },
          user: {
            findUnique: jest.fn().mockImplementation(async () => null),
          },
        };

        try {
          return await callback(tx);
        } catch (err) {
          // Rollback on failure
          receiptsTable = snapshotReceipts;
          sourceMessagesTable = snapshotMessages;
          jobsTable = snapshotJobs;
          throw err;
        }
      }),
    };
  };

  beforeEach(async () => {
    receiptsTable = new Map();
    sourceMessagesTable = new Map();
    jobsTable = new Map();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LineWebhookController],
      providers: [
        LineSignatureService,
        LineWebhookService,
        MessageEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'LINE_CHANNEL_SECRET') return channelSecret;
              if (key === 'MESSAGE_ENCRYPTION_KEY') return encryptionKey;
              return null;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: createMockPrisma(),
        },
      ],
    }).compile();

    signatureService = module.get<LineSignatureService>(LineSignatureService);
    webhookService = module.get<LineWebhookService>(LineWebhookService);
    encryptionService = module.get<MessageEncryptionService>(MessageEncryptionService);
    controller = module.get<LineWebhookController>(LineWebhookController);
  });

  // Helper to compute valid signature
  const signBody = (rawBody: Buffer): string => {
    return crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  };

  describe('1. Webhook Signature Verification', () => {
    it('should accept valid signature for exact raw body', () => {
      const rawBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');
      const signature = signBody(rawBody);

      expect(signatureService.verifySignature(signature, rawBody)).toBe(true);
    });

    it('should reject invalid signature with 401 UnauthorizedException', () => {
      const rawBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');
      const invalidSignature = 'invalid_base64_signature_here';

      expect(() => signatureService.verifySignature(invalidSignature, rawBody)).toThrow(UnauthorizedException);
    });

    it('should reject missing signature with 400 BadRequestException', () => {
      const rawBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');

      expect(() => signatureService.verifySignature(undefined, rawBody)).toThrow(BadRequestException);
    });

    it('should reject modified raw body even with valid original signature', () => {
      const rawBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');
      const signature = signBody(rawBody);

      // Modified body with extra whitespace or altered content
      const tamperedBody = Buffer.from(JSON.stringify({ events: [] }) + ' ', 'utf8');

      expect(() => signatureService.verifySignature(signature, tamperedBody)).toThrow(UnauthorizedException);
    });
  });

  describe('2. Message Event Ingestion & Privacy', () => {
    it('should successfully ingest text message, encrypt body, and create EXTRACT job', async () => {
      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'message',
            mode: 'active',
            timestamp: 1625642911000,
            source: { type: 'user', userId: 'U123456789' },
            webhookEventId: 'evt_msg_001',
            deliveryContext: { isRedelivery: false },
            message: { id: 'line_msg_101', type: 'text', text: '11:40喝150，13:10睡著' },
          },
        ],
      };

      const results = await webhookService.handleWebhook(payload);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('created');
      expect(results[0].eventId).toBe('evt_msg_001');

      // Verify receipt persisted
      expect(receiptsTable.size).toBe(1);
      const receipt = Array.from(receiptsTable.values())[0];
      expect(receipt.webhook_event_id).toBe('evt_msg_001');

      // Verify source message persisted with encrypted body
      expect(sourceMessagesTable.size).toBe(1);
      const msg = Array.from(sourceMessagesTable.values())[0];
      expect(msg.line_message_id).toBe('line_msg_101');
      expect(msg.author_user_id).toBeNull(); // Not faking identity before Stage 3
      expect(msg.body_ciphertext).not.toContain('11:40喝150'); // NO PLAINTEXT!

      // Verify body can be decrypted using encryption service
      const decrypted = encryptionService.decrypt(msg.body_ciphertext);
      expect(decrypted).toBe('11:40喝150，13:10睡著');

      // Verify EXTRACT job persisted with internal payload refs
      expect(jobsTable.size).toBe(1);
      const job = Array.from(jobsTable.values())[0];
      expect(job.kind).toBe('EXTRACT');
      expect(job.status).toBe('READY');
      expect(job.payload_refs.sourceMessageId).toBe(msg.id);
      expect(JSON.stringify(job.payload_refs)).not.toContain('11:40喝150'); // NO PLAINTEXT IN JOB!
    });
  });

  describe('3. Webhook Idempotency (Deduplication)', () => {
    it('should acknowledge redelivered webhook without creating duplicate message or job', async () => {
      const event: LineWebhookEvent = {
        type: 'message',
        mode: 'active',
        timestamp: 1625642911000,
        source: { type: 'user', userId: 'U123456789' },
        webhookEventId: 'evt_duplicate_test',
        deliveryContext: { isRedelivery: false },
        message: { id: 'line_msg_dup_1', type: 'text', text: '12:00喝奶' },
      };

      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [event],
      };

      // First delivery
      const res1 = await webhookService.handleWebhook(payload);
      expect(res1[0].status).toBe('created');
      expect(receiptsTable.size).toBe(1);
      expect(sourceMessagesTable.size).toBe(1);
      expect(jobsTable.size).toBe(1);

      // Redelivery with deliveryContext.isRedelivery = true (or same webhookEventId)
      const redeliveryPayload: LineWebhookPayload = {
        ...payload,
        events: [{ ...event, deliveryContext: { isRedelivery: true } }],
      };

      const res2 = await webhookService.handleWebhook(redeliveryPayload);
      expect(res2[0].status).toBe('duplicate_acknowledged');

      // State counts must remain exactly 1 (no duplicates!)
      expect(receiptsTable.size).toBe(1);
      expect(sourceMessagesTable.size).toBe(1);
      expect(jobsTable.size).toBe(1);
    });
  });

  describe('4. Transaction Rollback on Failure', () => {
    it('should roll back receipt and source message if job creation fails', async () => {
      // Re-create service with failing job creation
      const failingModule = await Test.createTestingModule({
        providers: [
          LineWebhookService,
          MessageEncryptionService,
          {
            provide: ConfigService,
            useValue: { get: () => encryptionKey },
          },
          {
            provide: PrismaService,
            useValue: createMockPrisma(true), // simulate failure
          },
        ],
      }).compile();

      const failingService = failingModule.get<LineWebhookService>(LineWebhookService);

      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'message',
            mode: 'active',
            timestamp: 1625642911000,
            source: { type: 'user', userId: 'U123456789' },
            webhookEventId: 'evt_fail_tx',
            deliveryContext: { isRedelivery: false },
            message: { id: 'line_msg_fail_1', type: 'text', text: 'fail test' },
          },
        ],
      };

      await expect(failingService.handleWebhook(payload)).rejects.toThrow('Simulated Database Failure');

      // Entire transaction must have rolled back: 0 receipts, 0 messages, 0 jobs
      expect(receiptsTable.size).toBe(0);
      expect(sourceMessagesTable.size).toBe(0);
      expect(jobsTable.size).toBe(0);
    });
  });

  describe('5. Unsend Event Ordering & Tombstone', () => {
    it('Order A: message then unsend -> marks withdrawn, wipes ciphertext, kills pending extract job', async () => {
      const channelId = 'Utest_bot_channel';
      const messageEvent: LineWebhookEvent = {
        type: 'message',
        mode: 'active',
        timestamp: 1000,
        source: { type: 'user', userId: 'U123' },
        webhookEventId: 'evt_orderA_msg',
        deliveryContext: { isRedelivery: false },
        message: { id: 'msg_orderA', type: 'text', text: '撤回測試內容' },
      };

      await webhookService.handleWebhook({ destination: channelId, events: [messageEvent] });

      const msgBefore = Array.from(sourceMessagesTable.values())[0];
      expect(msgBefore.withdrawn_at).toBeNull();
      expect(msgBefore.body_ciphertext).toBeDefined();

      const unsendEvent: LineWebhookEvent = {
        type: 'unsend',
        mode: 'active',
        timestamp: 2000,
        source: { type: 'user', userId: 'U123' },
        webhookEventId: 'evt_orderA_unsend',
        deliveryContext: { isRedelivery: false },
        unsend: { messageId: 'msg_orderA' },
      };

      const unsendRes = await webhookService.handleWebhook({ destination: channelId, events: [unsendEvent] });
      expect(unsendRes[0].status).toBe('withdrawn');

      // Verify source message updated
      const msgAfter = Array.from(sourceMessagesTable.values())[0];
      expect(msgAfter.withdrawn_at).toEqual(new Date(2000));
      expect(msgAfter.body_ciphertext).toBeNull(); // Ciphertext wiped!

      // Verify job marked DEAD
      const job = Array.from(jobsTable.values())[0];
      expect(job.status).toBe('DEAD');
      expect(job.last_error_code).toBe('MESSAGE_UNSENT');
    });

    it('Order B: unsend arrives before message -> tombstone created, later message cannot revive content', async () => {
      const channelId = 'Utest_bot_channel';
      const unsendFirstEvent: LineWebhookEvent = {
        type: 'unsend',
        mode: 'active',
        timestamp: 1000,
        source: { type: 'user', userId: 'U123' },
        webhookEventId: 'evt_orderB_unsend',
        deliveryContext: { isRedelivery: false },
        unsend: { messageId: 'msg_orderB' },
      };

      const unsendRes = await webhookService.handleWebhook({ destination: channelId, events: [unsendFirstEvent] });
      expect(unsendRes[0].status).toBe('tombstone_created');

      // Tombstone exists
      expect(sourceMessagesTable.size).toBe(1);
      const tombstone = Array.from(sourceMessagesTable.values())[0];
      expect(tombstone.withdrawn_at).toEqual(new Date(1000));
      expect(tombstone.body_ciphertext).toBeNull();

      // Later arriving message
      const lateMessageEvent: LineWebhookEvent = {
        type: 'message',
        mode: 'active',
        timestamp: 1500,
        source: { type: 'user', userId: 'U123' },
        webhookEventId: 'evt_orderB_late_msg',
        deliveryContext: { isRedelivery: false },
        message: { id: 'msg_orderB', type: 'text', text: '遲到的原文' },
      };

      const msgRes = await webhookService.handleWebhook({ destination: channelId, events: [lateMessageEvent] });
      expect(msgRes[0].status).toBe('ignored_due_to_prior_unsend');

      // Tombstone remains un-revived
      const checkTombstone = Array.from(sourceMessagesTable.values())[0];
      expect(checkTombstone.body_ciphertext).toBeNull();
      // NO EXTRACT JOB CREATED!
      expect(jobsTable.size).toBe(0);
    });
  });

  describe('6. Postback and Unsupported Events', () => {
    it('should acknowledge postback event without executing fake draft confirmation', async () => {
      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'postback',
            mode: 'active',
            timestamp: 1000,
            source: { type: 'user', userId: 'U123' },
            webhookEventId: 'evt_postback_1',
            deliveryContext: { isRedelivery: false },
            postback: { data: 'action=confirm&draftId=abc' },
          },
        ],
      };

      const res = await webhookService.handleWebhook(payload);
      expect(res[0].status).toBe('postback_received');
      expect(receiptsTable.size).toBe(1);
      expect(jobsTable.size).toBe(0);
    });

    it('Priority 2: should handle quick_record postback with prompt text and zero jobs/drafts', async () => {
      const mockMessaging = {
        replyTextMessage: jest.fn().mockResolvedValue(true),
      };
      (webhookService as any).lineMessagingService = mockMessaging;

      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'postback',
            mode: 'active',
            timestamp: 1000,
            source: { type: 'user', userId: 'U123' },
            replyToken: 'test_reply_token_qr',
            webhookEventId: 'evt_quick_record_1',
            deliveryContext: { isRedelivery: false },
            postback: { data: 'action=quick_record' },
          },
        ],
      };

      const res = await webhookService.handleWebhook(payload);
      expect(res[0].status).toBe('quick_record_prompt_sent');
      expect(mockMessaging.replyTextMessage).toHaveBeenCalledWith(
        'test_reply_token_qr',
        '請輸入實際照護內容，CareLink 會先整理成草稿，確認後才正式記錄。',
      );
      // Zero jobs or source messages created!
      expect(jobsTable.size).toBe(0);
      expect(sourceMessagesTable.size).toBe(0);
    });

    it('should safely record minimal receipt for unsupported event without crashing or queuing jobs', async () => {
      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'follow',
            mode: 'active',
            timestamp: 1000,
            source: { type: 'user', userId: 'U123' },
            webhookEventId: 'evt_follow_1',
            deliveryContext: { isRedelivery: false },
          },
        ],
      };

      const res = await webhookService.handleWebhook(payload);
      expect(res[0].status).toBe('unsupported_event');
      expect(receiptsTable.size).toBe(1);
      expect(jobsTable.size).toBe(0);
    });
  });

  describe('7. Controller End-to-End Signature & Processing Flow', () => {
    it('should authenticate request and return HTTP 200 with process count', async () => {
      const payload: LineWebhookPayload = {
        destination: 'Utest_bot_channel',
        events: [
          {
            type: 'message',
            mode: 'active',
            timestamp: 1625642911000,
            source: { type: 'user', userId: 'U123456789' },
            webhookEventId: 'evt_e2e_1',
            deliveryContext: { isRedelivery: false },
            message: { id: 'line_msg_e2e', type: 'text', text: '18:30下班簽退' },
          },
        ],
      };

      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const signature = signBody(rawBody);

      const mockReq: any = {
        rawBody,
        body: payload,
      };

      const response = await controller.handleWebhook(signature, 'req_123', mockReq);
      expect(response.status).toBe('ok');
      expect(response.processed).toBe(1);
      expect(receiptsTable.size).toBe(1);
      expect(jobsTable.size).toBe(1);
    });
  });
});
