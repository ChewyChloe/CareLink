import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { SessionService } from './modules/auth/session.service';
import { PersistentSessionStore, InMemorySessionStore } from './modules/auth/session-store.interface';
import { UnauthorizedException } from '@nestjs/common';
import { MessageEncryptionService } from './modules/line/crypto/message-encryption.service';
import { ExtractionWorker } from './modules/jobs/extraction.worker';
import { AiModule } from './modules/ai/ai.module';
import { LineModule } from './modules/line/line.module';
import { CareModule } from './modules/care/care.module';
import { DraftService } from './modules/care/draft.service';
import { TimelineService } from './modules/care/timeline.service';
import { FlexMessageBuilder } from './modules/line/flex/flex-message.builder';
import { LineWebhookService } from './modules/line/line-webhook.service';
import * as crypto from 'crypto';

describe('Live PostgreSQL Integration & Regression Suite (Neon carelink-dev)', () => {
  jest.setTimeout(60000);

  let prisma: PrismaService;
  let configService: ConfigService;
  let sessionService: SessionService;
  let encryptionService: MessageEncryptionService;
  let worker: ExtractionWorker;
  let draftService: DraftService;
  let timelineService: TimelineService;
  let webhookService: LineWebhookService;

  // Test identifiers to clean up
  const testUserId = crypto.randomUUID();
  const testChildId = crypto.randomUUID();
  const testChildBId = crypto.randomUUID();
  const testUserBId = crypto.randomUUID();
  let providerId = 'live_test_provider';
  const testUserSub = `sub_live_${Date.now()}_A`;
  const testUserBSub = `sub_live_${Date.now()}_B`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '.env.local'],
        }),
        PrismaModule,
        AiModule,
        LineModule,
        CareModule,
      ],
      providers: [SessionService, ExtractionWorker],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    configService = moduleRef.get<ConfigService>(ConfigService);
    sessionService = moduleRef.get<SessionService>(SessionService);
    encryptionService = moduleRef.get<MessageEncryptionService>(MessageEncryptionService);
    worker = moduleRef.get<ExtractionWorker>(ExtractionWorker);
    draftService = moduleRef.get<DraftService>(DraftService);
    timelineService = moduleRef.get<TimelineService>(TimelineService);
    webhookService = moduleRef.get<LineWebhookService>(LineWebhookService);
    providerId = configService.get<string>('LINE_PROVIDER_ID') || 'live_test_provider';

    // Ensure connection with retry for cold scale-to-zero compute wake-up
    let health = await prisma.checkHealth();
    for (let attempt = 1; attempt <= 3 && !health.isHealthy; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      health = await prisma.checkHealth();
    }
    expect(health.isHealthy).toBe(true);

    // Setup base test users
    await prisma.user.createMany({
      data: [
        {
          id: testUserId,
          line_provider_id: providerId,
          line_sub: testUserSub,
          status: 'ACTIVE',
        },
        {
          id: testUserBId,
          line_provider_id: providerId,
          line_sub: testUserBSub,
          status: 'ACTIVE',
        },
      ],
    });

    // Setup test children
    await prisma.child.createMany({
      data: [
        {
          id: testChildId,
          display_alias: '樂樂',
          created_by: testUserId,
        },
        {
          id: testChildBId,
          display_alias: '安安',
          created_by: testUserBId,
        },
      ],
    });
  });

  afterAll(async () => {
    // Cleanup test records in foreign key order
    try {
      await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: [testUserId, testUserBId] } } });
      await prisma.careEventRevision.deleteMany({ where: { confirmed_by: { in: [testUserId, testUserBId] } } });
      await prisma.careEvent.deleteMany({ where: { created_by: { in: [testUserId, testUserBId] } } });
      await prisma.draftBatch.deleteMany({ where: { created_by: { in: [testUserId, testUserBId] } } });
      await prisma.careRelationship.deleteMany({ where: { caregiver_user_id: { in: [testUserId, testUserBId] } } });
      await prisma.accessGrant.deleteMany({ where: { user_id: { in: [testUserId, testUserBId] } } });
      await prisma.authSession.deleteMany({ where: { user_id: { in: [testUserId, testUserBId] } } });
      await prisma.job.deleteMany({ where: { dedupe_key: { contains: 'live_test' } } });
      await prisma.sourceMessage.deleteMany({ where: { author_user_id: { in: [testUserId, testUserBId] } } });
      await prisma.child.deleteMany({ where: { id: { in: [testChildId, testChildBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [testUserId, testUserBId] } } });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
    await prisma.$disconnect();
  });

  // ===========================================================================
  // 1. Live PostgreSQL PersistentSessionStore Verification
  // ===========================================================================
  describe('1. Live PersistentSessionStore', () => {
    it('should persist session to PostgreSQL, survive service restart, and revoke on logout', async () => {
      // Create session
      const { token, session } = await sessionService.createSession(testUserId, 'sub_live_A', providerId);
      expect(token).toBeDefined();

      // Direct DB verification
      const dbSession = await prisma.authSession.findUnique({
        where: { session_id: session.sessionId },
      });
      expect(dbSession).toBeDefined();
      expect(dbSession?.user_id).toBe(testUserId);
      expect(dbSession?.revoked_at).toBeNull();

      // SIMULATE SERVICE RESTART: Create a brand new SessionService instance
      const restartedSessionService = new SessionService(configService, prisma);
      const validated = await restartedSessionService.validateSession(token);
      expect(validated.userId).toBe(testUserId);
      expect(validated.sessionId).toBe(session.sessionId);

      // Logout / Revoke
      await restartedSessionService.invalidateSession(token);

      // Verify DB shows revoked_at
      const revokedDbSession = await prisma.authSession.findUnique({
        where: { session_id: session.sessionId },
      });
      expect(revokedDbSession?.revoked_at).not.toBeNull();

      // Verify subsequent validation fails
      await expect(restartedSessionService.validateSession(token)).rejects.toThrow(
        'Session has been revoked or invalidated',
      );
    });

    it('should reject expired session in live PostgreSQL', async () => {
      const { token, session } = await sessionService.createSession(testUserId, 'sub_live_A', providerId);

      // Force expires_at in PostgreSQL to past
      await prisma.authSession.update({
        where: { session_id: session.sessionId },
        data: { expires_at: new Date(Date.now() - 60000) },
      });

      await expect(sessionService.validateSession(token)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 2. Webhook Unique / Idempotency Constraint
  // ===========================================================================
  describe('2. Webhook Unique / Idempotency Constraint', () => {
    it('should enforce unique constraint on (channel_id, webhook_event_id)', async () => {
      const testChannelId = 'live_channel_1';
      const testEventId = `ev_live_${Date.now()}`;

      // Insert first receipt
      const receipt1 = await prisma.webhookReceipt.create({
        data: {
          channel_id: testChannelId,
          webhook_event_id: testEventId,
          event_type: 'message',
          event_timestamp: BigInt(Date.now()),
        },
      });
      expect(receipt1.id).toBeDefined();

      // Attempt duplicate insert with exact same unique key
      await expect(
        prisma.webhookReceipt.create({
          data: {
            channel_id: testChannelId,
            webhook_event_id: testEventId,
            event_type: 'message',
            event_timestamp: BigInt(Date.now()),
          },
        }),
      ).rejects.toThrow(); // Prisma P2002 Unique constraint violation
    });
  });

  // ===========================================================================
  // 3. Transaction Rollback Verification
  // ===========================================================================
  describe('3. Transaction Rollback in Live PostgreSQL', () => {
    it('should rollback entire transaction if an error occurs mid-operation', async () => {
      const canaryMessageId = `msg_canary_${Date.now()}`;

      try {
        await prisma.$transaction(async (tx) => {
          // 1. First step succeeds
          await tx.sourceMessage.create({
            data: {
              channel_id: 'chan_tx_test',
              line_message_id: canaryMessageId,
              author_user_id: testUserId,
              body_ciphertext: 'test_cipher',
            },
          });

          // 2. Second step deliberately fails
          throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
        });
      } catch (err: any) {
        expect(err.message).toContain('INTENTIONAL_TRANSACTION_FAILURE');
      }

      // Assert first step was completely rolled back in live database
      const canary = await prisma.sourceMessage.findUnique({
        where: {
          channel_id_line_message_id: {
            channel_id: 'chan_tx_test',
            line_message_id: canaryMessageId,
          },
        },
      });
      expect(canary).toBeNull();
    });
  });

  // ===========================================================================
  // 4. Unsend Security & Ordering Verification
  // ===========================================================================
  describe('4. Unsend Ordering & AI Call Cancellation', () => {
    it('should cancel extraction with DEAD status when message was withdrawn before job execution', async () => {
      const unsendMessageId = `unsend_msg_${Date.now()}`;

      // Ingest withdrawn message
      const sourceMessage = await prisma.sourceMessage.create({
        data: {
          channel_id: 'chan_unsend_live',
          line_message_id: unsendMessageId,
          author_user_id: testUserId,
          body_ciphertext: null, // Ciphertext purged upon unsend
          withdrawn_at: new Date(), // Marked withdrawn
        },
      });

      // Create EXTRACT Job
      const job = await prisma.job.create({
        data: {
          kind: 'EXTRACT',
          dedupe_key: `live_test_unsend_${Date.now()}`,
          payload_refs: { source_message_id: sourceMessage.id },
          status: 'READY',
        },
      });

      // Run worker
      const result = await worker.processExtractJob(job.id, 'mock');

      expect(result.status).toBe('DEAD');
      expect(result.errorCode).toBe('MESSAGE_WITHDRAWN_BEFORE_EXTRACTION');

      // Verify DB job status
      const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(updatedJob?.status).toBe('DEAD');
      expect(updatedJob?.last_error_code).toBe('MESSAGE_WITHDRAWN_BEFORE_EXTRACTION');
    });
  });

  // ===========================================================================
  // 5. Child IDOR & Revoked Access Grant
  // ===========================================================================
  describe('5. Child Access Authorization & Revocation', () => {
    it('should respect active access grant and revoke immediately upon revocation', async () => {
      // Grant User A access to Child A
      const grant = await prisma.accessGrant.create({
        data: {
          user_id: testUserId,
          child_id: testChildId,
          role: 'GUARDIAN',
          scopes: ['CARE_READ', 'CARE_WRITE'],
        },
      });

      // Query active grants for User A
      let activeGrants = await prisma.accessGrant.findMany({
        where: {
          user_id: testUserId,
          child_id: testChildId,
          revoked_at: null,
        },
      });
      expect(activeGrants).toHaveLength(1);

      // Verify User B has no grant for Child A (IDOR boundary)
      const userBGrants = await prisma.accessGrant.findMany({
        where: {
          user_id: testUserBId,
          child_id: testChildId,
          revoked_at: null,
        },
      });
      expect(userBGrants).toHaveLength(0);

      // Revoke User A grant
      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: { revoked_at: new Date() },
      });

      // Query active grants again
      activeGrants = await prisma.accessGrant.findMany({
        where: {
          user_id: testUserId,
          child_id: testChildId,
          revoked_at: null,
        },
      });
      expect(activeGrants).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 6. SourceMessage → EXTRACT Job → Live DraftBatch Persistence
  // ===========================================================================
  describe('6. End-to-End Extraction Pipeline to Live DraftBatch', () => {
    it('should decrypt, extract, and persist DraftBatch in live PostgreSQL, and enforce idempotency', async () => {
      // 1. Create active grant so child is known
      await prisma.accessGrant.create({
        data: {
          user_id: testUserId,
          child_id: testChildId,
          role: 'CAREGIVER',
          scopes: ['CARE_WRITE'],
        },
      });

      // 2. Encrypt care message
      const plaintext = '今天11:40喝150ml';
      const ciphertext = encryptionService.encrypt(plaintext);

      // 3. Ingest SourceMessage
      const msgId = `msg_extract_live_${Date.now()}`;
      const sourceMsg = await prisma.sourceMessage.create({
        data: {
          channel_id: 'chan_extract_live',
          line_message_id: msgId,
          author_user_id: testUserId,
          body_ciphertext: ciphertext,
          received_at: new Date(),
        },
      });

      // 4. Create Job
      const job = await prisma.job.create({
        data: {
          kind: 'EXTRACT',
          dedupe_key: `live_test_extract_${Date.now()}`,
          payload_refs: { source_message_id: sourceMsg.id },
          status: 'READY',
        },
      });

      // 5. Worker execution
      const result = await worker.processExtractJob(job.id, 'mock');
      expect(result.status).toBe('SUCCEEDED');
      expect(result.draftBatchId).toBeDefined();

      // 6. Query DraftBatch in live PostgreSQL
      const draft = await prisma.draftBatch.findUnique({
        where: { id: result.draftBatchId },
      });
      expect(draft).toBeDefined();
      expect(draft?.source_message_id).toBe(sourceMsg.id);
      expect(draft?.child_id).toBe(testChildId);
      expect(draft?.status).toBe('PENDING_CONFIRMATION');
      expect(draft?.status).not.toBe('CONFIRMED'); // STAGE 4 INVARIANT: NEVER CONFIRMED

      // 7. IDEMPOTENCY CHECK 1: Re-running the already-succeeded job must be safely SKIPPED
      const rerunResult = await worker.processExtractJob(job.id, 'mock');
      expect(rerunResult.status).toBe('SKIPPED');

      // 7. IDEMPOTENCY CHECK 2: A second job for the same source message resolves to existing draft
      const duplicateJob = await prisma.job.create({
        data: {
          kind: 'EXTRACT',
          dedupe_key: `live_test_extract_dup_${Date.now()}`,
          status: 'READY',
          payload_refs: { source_message_id: sourceMsg.id },
        },
      });
      const dupResult = await worker.processExtractJob(duplicateJob.id, 'mock');
      expect(dupResult.status).toBe('SUCCEEDED');
      expect(dupResult.draftBatchId).toBe(draft?.id);

      // Assert no duplicate draft was created in live PostgreSQL
      const allDrafts = await prisma.draftBatch.findMany({
        where: { source_message_id: sourceMsg.id },
      });
      expect(allDrafts).toHaveLength(1);
    });

    it('7. Live Flex Confirmation & CareEvent Creation in PostgreSQL', async () => {
      // 1. Setup CareRelationship and active DraftBatch in live PostgreSQL
      const testRelId = crypto.randomUUID();
      await prisma.careRelationship.create({
        data: {
          id: testRelId,
          child_id: testChildId,
          caregiver_user_id: testUserId,
          starts_at: new Date(),
          status: 'ACTIVE',
        },
      });

      const draftId = crypto.randomUUID();
      const draft = await prisma.draftBatch.create({
        data: {
          id: draftId,
          child_id: testChildId,
          relationship_id: testRelId,
          created_by: testUserId,
          status: 'PENDING_CONFIRMATION',
          lock_version: 1,
          expires_at: new Date(Date.now() + 3600000),
          items: [
            {
              item_index: 0,
              event_type: 'FEED',
              temporal_status: 'ACTUAL',
              occurred_at: '2026-09-16T11:40:00.000Z',
              payload: { amount_ml: 150, feed_type: 'FORMULA' },
              missing_fields: [],
              source_span: '11:40 喝150',
            },
            {
              item_index: 1,
              event_type: 'SLEEP_START',
              temporal_status: 'ACTUAL',
              occurred_at: '2026-09-16T13:10:00.000Z',
              payload: {},
              missing_fields: [],
              source_span: '13:10 睡著',
            },
            {
              item_index: 2,
              event_type: 'PLANNED_PICKUP',
              temporal_status: 'PLANNED',
              occurred_at: '2026-09-16T19:00:00.000Z',
              payload: { planned_at: '19:00', pickup_label: '阿嬤' },
              missing_fields: [],
              source_span: '今天阿嬤七點接',
            },
          ],
        },
      });

      // 2. Validate Flex Message generator produces valid LINE container
      const flexBubble = FlexMessageBuilder.buildDraftConfirmationFlex(
        {
          id: draft.id,
          child_alias: '小安',
          status: draft.status,
          lock_version: draft.lock_version,
          items: draft.items as any,
          created_at: draft.created_at,
          expires_at: draft.expires_at,
        },
        'test-mini-app-channel',
      );
      expect(flexBubble.type).toBe('bubble');
      expect(JSON.stringify(flexBubble)).toContain('150 ml');
      expect(JSON.stringify(flexBubble)).toContain('預約接回');

      // 3. Confirm draft in live PostgreSQL
      const confirmResult = await draftService.confirmDraft({
        draftId: draft.id,
        userId: testUserId,
        expectedVersion: 1,
      });

      expect(confirmResult.status).toBe('CONFIRMED');
      expect(confirmResult.eventCount).toBe(3);

      // 4. Verify live database records: CareEvents and CareEventRevisions
      const liveEvents = await prisma.careEvent.findMany({
        where: { draft_batch_id: draft.id },
        include: { revisions: true },
        orderBy: { source_item_index: 'asc' },
      });

      expect(liveEvents).toHaveLength(3);
      expect(liveEvents[0].event_type).toBe('FEED');
      expect(liveEvents[0].current_revision_id).toBeDefined();
      expect(liveEvents[0].revisions).toHaveLength(1);
      expect(liveEvents[0].revisions[0].action).toBe('RECORD');

      expect(liveEvents[1].event_type).toBe('SLEEP_START');

      // Stage 5.1 Verification: PLANNED_PICKUP event has null attendance_session_id and payload.temporal_status = PLANNED
      expect(liveEvents[2].event_type).toBe('PLANNED_PICKUP');
      expect(liveEvents[2].attendance_session_id).toBeNull();
      const rev2Payload = liveEvents[2].revisions[0].payload as any;
      expect(rev2Payload.temporal_status).toBe('PLANNED');
      expect(rev2Payload.pickup_label).toBe('阿嬤');

      // 5. Verify AuditLog entry was persisted in live PostgreSQL
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          resource_id: draft.id,
          action: 'CONFIRM_DRAFT',
        },
      });
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.actor_user_id).toBe(testUserId);

      // 6. Test Idempotency in live PostgreSQL: Confirming already confirmed draft
      const reConfirm = await draftService.confirmDraft({
        draftId: draft.id,
        userId: testUserId,
      });
      expect(reConfirm.status).toBe('ALREADY_CONFIRMED');
      expect(reConfirm.eventCount).toBe(3);

      // Verify no duplicate CareEvents were created in live DB
      const postEvents = await prisma.careEvent.findMany({
        where: { draft_batch_id: draft.id },
      });
      expect(postEvents).toHaveLength(3);

      // 7. Verify live DB rejection of PLANNED FEED and NEGATED FEED
      const invalidDraft = await prisma.draftBatch.create({
        data: {
          id: crypto.randomUUID(),
          child_id: testChildId,
          relationship_id: testRelId,
          created_by: testUserId,
          status: 'PENDING_CONFIRMATION',
          lock_version: 1,
          expires_at: new Date(Date.now() + 3600000),
          items: [
            {
              item_index: 0,
              event_type: 'FEED',
              temporal_status: 'PLANNED', // Forbidden!
              occurred_at: '2026-09-16T15:00:00.000Z',
              payload: { amount_ml: 120 },
              missing_fields: [],
            },
          ],
        },
      });

      await expect(
        draftService.confirmDraft({
          draftId: invalidDraft.id,
          userId: testUserId,
        }),
      ).rejects.toThrow();
    });

    it('8. Live Confirmed Timeline, Versioning, History, and Revision Preservation (Neon carelink-dev)', async () => {
      // 1. Setup CareEvent with revision 1 in live PostgreSQL
      const eventId = crypto.randomUUID();
      const rev1Id = crypto.randomUUID();

      await prisma.careEvent.create({
        data: {
          id: eventId,
          child_id: testChildId,
          relationship_id: (await prisma.careRelationship.findFirst({ where: { child_id: testChildId } }))!.id,
          event_type: 'FEED',
          created_by: testUserId,
          current_revision_id: null, // Will be set after revision creation
        },
      });

      await prisma.careEventRevision.create({
        data: {
          id: rev1Id,
          care_event_id: eventId,
          revision_no: 1,
          occurred_at: new Date('2026-09-16T11:40:00.000Z'),
          payload: { amount_ml: 150, feed_type: 'FORMULA' },
          action: 'RECORD',
          confirmed_by: testUserId,
        },
      });

      await prisma.careEvent.update({
        where: { id: eventId },
        data: { current_revision_id: rev1Id },
      });

      // 2. Query timeline on live PostgreSQL -> returns revision 1
      const timelineV1 = await timelineService.getTimeline(testChildId, testUserId, {});
      const itemV1 = timelineV1.items.find((it) => it.event_id === eventId);
      expect(itemV1).toBeDefined();
      expect(itemV1?.revision_no).toBe(1);
      expect(itemV1?.payload.amount_ml).toBe(150);
      expect(itemV1?.status).toBe('RECORDED');

      // 3. Caregiver submits correction in live PostgreSQL (amount 160ml, time 11:45)
      const correctionResult = await timelineService.createCorrection(eventId, testUserId, {
        action: 'CORRECT',
        expected_revision_no: 1,
        occurred_at: '2026-09-16T11:45:00.000Z',
        payload: { amount_ml: 160 },
        reason: '修正實際餵食量為 160ml',
      });

      expect(correctionResult.revision_no).toBe(2);
      expect(correctionResult.status).toBe('CORRECTED');
      expect(correctionResult.payload.amount_ml).toBe(160);

      // 4. Verify in live PostgreSQL: revision 1 remains completely unchanged!
      const originalRev1 = await prisma.careEventRevision.findUnique({
        where: { id: rev1Id },
      });
      expect(originalRev1).toBeDefined();
      expect((originalRev1?.payload as any)?.amount_ml).toBe(150);
      expect(originalRev1?.revision_no).toBe(1);

      // Verify CareEvent.current_revision_id is updated to revision 2 in live DB
      const updatedEvent = await prisma.careEvent.findUnique({
        where: { id: eventId },
      });
      expect(updatedEvent?.current_revision_id).not.toBe(rev1Id);

      // 5. Query event history on live PostgreSQL -> returns both revisions [v1, v2]
      const history = await timelineService.getEventHistory(eventId, testUserId);
      expect(history.revisions).toHaveLength(2);
      expect(history.revisions[0].revision_no).toBe(1);
      expect(history.revisions[0].payload.amount_ml).toBe(150);
      expect(history.revisions[1].revision_no).toBe(2);
      expect(history.revisions[1].payload.amount_ml).toBe(160);
      expect(history.revisions[1].reason).toBe('修正實際餵食量為 160ml');

      // 6. Test VOID flow in live PostgreSQL
      const voidResult = await timelineService.createCorrection(eventId, testUserId, {
        action: 'VOID',
        expected_revision_no: 2,
        reason: '保母紀錄錯誤作廢',
      });
      expect(voidResult.status).toBe('VOID');
      expect(voidResult.revision_no).toBe(3);

      // Verify live DB has all 3 revisions preserved
      const allRevisionsInDb = await prisma.careEventRevision.findMany({
        where: { care_event_id: eventId },
        orderBy: { revision_no: 'asc' },
      });
      expect(allRevisionsInDb).toHaveLength(3);
      expect(allRevisionsInDb[0].action).toBe('RECORD');
      expect(allRevisionsInDb[1].action).toBe('CORRECT');
      expect(allRevisionsInDb[2].action).toBe('VOID');

      // 7. Authorization in live PostgreSQL: cross-family child access returns 404
      await expect(
        timelineService.getTimeline(testChildBId, testUserId, {}),
      ).rejects.toThrow();

      // 8. Concurrency conflict (OCC) in live PostgreSQL: modifying with stale revision throws 409
      await expect(
        timelineService.createCorrection(eventId, testUserId, {
          action: 'CORRECT',
          expected_revision_no: 1, // Current revision is 3
          reason: '並行衝突測試',
        }),
      ).rejects.toThrow();
    });

    it('9. Real LINE Mock-AI Regression: OA -> webhook -> Draft -> Flex -> human confirm -> Timeline -> Correction (Neon carelink-dev)', async () => {
      // Step A: OA sends webhook payload -> LineWebhookService handles ingestion
      const text = '11:40 喝150ml，13:10睡著';
      const lineMsgId = `line_oa_golden_${Date.now()}`;
      const webhookEventId = `evt_oa_golden_${Date.now()}`;

      const webhookResults = await webhookService.handleWebhook({
        destination: 'chan_golden_path',
        events: [
          {
            type: 'message',
            mode: 'active',
            timestamp: Date.now(),
            source: { type: 'user', userId: testUserSub },
            webhookEventId,
            deliveryContext: { isRedelivery: false },
            message: { id: lineMsgId, type: 'text', text },
          },
        ],
      });

      expect(webhookResults).toHaveLength(1);
      expect(webhookResults[0].status).toBe('created');
      const sourceMsgId = webhookResults[0].sourceMessageId!;
      const jobId = webhookResults[0].jobId!;

      // Verify webhook created receipt and source message with AES-256 ciphertext
      const sourceMsg = await prisma.sourceMessage.findUnique({ where: { id: sourceMsgId } });
      expect(sourceMsg).toBeDefined();
      expect(sourceMsg?.author_user_id).toBe(testUserId);
      expect(sourceMsg?.body_ciphertext).toBeDefined();

      // Step B: Worker processes EXTRACT job (Mock AI mode) -> DraftBatch
      let draftBatch = null;
      for (let attempt = 0; attempt < 25; attempt++) {
        draftBatch = await prisma.draftBatch.findFirst({
          where: { source_message_id: sourceMsgId },
        });
        if (draftBatch) break;
        const currentJob = await prisma.job.findUnique({ where: { id: jobId } });
        if (currentJob && currentJob.status !== 'SUCCEEDED') {
          await prisma.job.update({ where: { id: jobId }, data: { status: 'READY', lease_until: null } });
          await worker.processExtractJob(jobId, 'mock');
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      expect(draftBatch).toBeDefined();
      expect(draftBatch?.status).toBe('PENDING_CONFIRMATION');
      const extractedItems = draftBatch?.items as any[];
      expect(extractedItems).toHaveLength(2);

      // Step C: Deliver / Build Flex confirmation card for human review
      const flexBubble = FlexMessageBuilder.buildDraftConfirmationFlex(
        {
          id: draftBatch!.id,
          child_alias: '樂樂',
          status: draftBatch!.status,
          lock_version: draftBatch!.lock_version,
          items: draftBatch!.items as any,
          created_at: draftBatch!.created_at,
          expires_at: draftBatch!.expires_at,
        },
        'test-mini-app-channel',
      );
      expect(flexBubble.type).toBe('bubble');
      expect(JSON.stringify(flexBubble)).toContain('150 ml');

      // Step D: Human confirmation via DraftService
      const confirmResult = await draftService.confirmDraft({
        draftId: draftBatch!.id,
        userId: testUserId,
        expectedVersion: 1,
      });
      expect(confirmResult.status).toBe('CONFIRMED');
      expect(confirmResult.eventCount).toBe(2);

      // Verify CareEvent provenance on live Neon DB
      for (const ev of confirmResult.careEvents) {
        expect(ev.source_type).toBe('LINE_AI');
        expect(ev.source_message_id).toBe(sourceMsg!.id);
      }

      // Step E: Timeline API query returns both confirmed events
      const confirmedFeedEvent = confirmResult.careEvents.find((e: any) => e.event_type === 'FEED');
      const confirmedSleepEvent = confirmResult.careEvents.find((e: any) => e.event_type === 'SLEEP_START');

      const timelineRes = await timelineService.getTimeline(testChildId, testUserId, {});
      const feedItem = timelineRes.items.find((it) => it.event_id === confirmedFeedEvent.id);
      const sleepItem = timelineRes.items.find((it) => it.event_id === confirmedSleepEvent.id);

      expect(feedItem).toBeDefined();
      expect(feedItem?.payload.amount ?? feedItem?.payload.amount_ml).toBe(150);
      expect(feedItem?.status).toBe('RECORDED');
      expect(feedItem?.revision_no).toBe(1);

      expect(sleepItem).toBeDefined();
      expect(sleepItem?.event_type).toBe('SLEEP_START');
      expect(sleepItem?.status).toBe('RECORDED');

      // Step F: Caregiver modifies FEED event time to 11:45 (Asia/Taipei)
      const correctedFeed = await timelineService.createCorrection(feedItem!.event_id, testUserId, {
        action: 'CORRECT',
        expected_revision_no: 1,
        occurred_at: '2026-09-16T11:45:00+08:00',
        payload: { amount: 150, amount_unit: 'ml' },
        reason: '修正喝奶時間為 11:45',
      });
      expect(correctedFeed.revision_no).toBe(2);
      expect(correctedFeed.status).toBe('CORRECTED');

      // Step G: Query timeline again: shows revision 2 (11:45, CORRECTED)
      const updatedTimeline = await timelineService.getTimeline(testChildId, testUserId, {});
      const updatedFeedItem = updatedTimeline.items.find((it) => it.event_id === feedItem!.event_id);
      expect(updatedFeedItem?.revision_no).toBe(2);
      expect(updatedFeedItem?.status).toBe('CORRECTED');
      expect(new Date(updatedFeedItem!.occurred_at).toISOString()).toContain('03:45:00');

      // Step H: Event History query shows both revisions [v1, v2] preserved
      const historyRes = await timelineService.getEventHistory(feedItem!.event_id, testUserId);
      expect(historyRes.revisions).toHaveLength(2);
      expect(historyRes.revisions[0].revision_no).toBe(1);
      expect(new Date(historyRes.revisions[0].occurred_at).toISOString()).toContain('03:40:00');

      expect(historyRes.revisions[1].revision_no).toBe(2);
      expect(new Date(historyRes.revisions[1].occurred_at).toISOString()).toContain('03:45:00');
      expect(historyRes.revisions[1].reason).toBe('修正喝奶時間為 11:45');
    });

    it('proves PostgreSQL transaction atomicity on Neon: aborted transaction leaves zero CareEvent / Revision / Audit residue', async () => {
      const probeChildId = testChildId;
      const probeUserId = testUserId;
      const probeEventId = crypto.randomUUID();

      const activeRel = await prisma.careRelationship.findFirst({
        where: { child_id: probeChildId },
      });
      expect(activeRel).toBeDefined();

      // Query baseline counts on live Neon
      const eventsCountBefore = await prisma.careEvent.count({ where: { child_id: probeChildId } });
      const revisionsCountBefore = await prisma.careEventRevision.count();
      const auditCountBefore = await prisma.auditLog.count({ where: { actor_user_id: probeUserId } });

      // Run an atomic transaction that inserts into care_events and care_event_revisions, but throws before commit
      await expect(
        prisma.$transaction(async (tx) => {
          const ev = await tx.careEvent.create({
            data: {
              id: probeEventId,
              child_id: probeChildId,
              relationship_id: activeRel!.id,
              created_by: probeUserId,
              event_type: 'FEED',
              source_type: 'MANUAL',
            },
          });

          await tx.careEventRevision.create({
            data: {
              care_event_id: ev.id,
              revision_no: 1,
              occurred_at: new Date(),
              payload: { milk_type: 'FORMULA', amount: 150 },
              action: 'RECORD',
              confirmed_by: probeUserId,
            },
          });

          // Abort transaction deliberately
          throw new Error('Neon real transaction abort test');
        }),
      ).rejects.toThrow('Neon real transaction abort test');

      // Verify zero residue in PostgreSQL
      const probeEvent = await prisma.careEvent.findUnique({ where: { id: probeEventId } });
      expect(probeEvent).toBeNull();

      const probeRevisions = await prisma.careEventRevision.findMany({ where: { care_event_id: probeEventId } });
      expect(probeRevisions).toHaveLength(0);

      const eventsCountAfter = await prisma.careEvent.count({ where: { child_id: probeChildId } });
      expect(eventsCountAfter).toBe(eventsCountBefore);

      const revisionsCountAfter = await prisma.careEventRevision.count();
      expect(revisionsCountAfter).toBe(revisionsCountBefore);

      const auditCountAfter = await prisma.auditLog.count({ where: { actor_user_id: probeUserId } });
      expect(auditCountAfter).toBe(auditCountBefore);
    });
  });
});
