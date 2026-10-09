import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DraftService } from './draft.service';
import { FlexMessageBuilder } from '../line/flex/flex-message.builder';
import { PrismaService } from '../../prisma/prisma.service';

describe('Stage 5: Flex Confirmation & Draft Lifecycle Tests', () => {
  let draftService: DraftService;

  // In-memory data store for isolated unit testing
  let draftBatchesTable: Map<string, any>;
  let accessGrantsTable: Map<string, any>;
  let careEventsTable: Map<string, any>;
  let careRevisionsTable: Map<string, any>;
  let attendanceSessionsTable: Map<string, any>;
  let auditLogsTable: any[];

  const testUserId = 'u_caregiver_101';
  const testChildId = 'c_baby_001';
  const testRelId = 'rel_care_001';

  const createMockPrisma = () => ({
    draftBatch: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        return draftBatchesTable.get(where.id) || null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        const results: any[] = [];
        for (const draft of draftBatchesTable.values()) {
          if (where.child_id && draft.child_id !== where.child_id) continue;
          if (where.status?.in && !where.status.in.includes(draft.status)) continue;
          results.push(draft);
        }
        return results;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = draftBatchesTable.get(where.id);
        if (!existing) throw new Error('DraftBatch not found');
        const updated = {
          ...existing,
          ...data,
          lock_version: data.lock_version?.increment
            ? existing.lock_version + 1
            : data.lock_version || existing.lock_version,
          updated_at: new Date(),
        };
        draftBatchesTable.set(where.id, updated);
        return updated;
      }),
    },
    accessGrant: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        for (const grant of accessGrantsTable.values()) {
          if (grant.user_id === where.user_id && grant.child_id === where.child_id) {
            if (where.revoked_at === null && grant.revoked_at !== null) continue;
            return grant;
          }
        }
        return null;
      }),
    },
    careEvent: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        // Enforce uniqueness on (draft_batch_id, source_item_index)
        for (const ev of careEventsTable.values()) {
          if (
            ev.draft_batch_id === data.draft_batch_id &&
            ev.source_item_index === data.source_item_index
          ) {
            throw new Error(
              `Unique constraint failed on (draft_batch_id, source_item_index): ${data.draft_batch_id}, ${data.source_item_index}`,
            );
          }
        }
        const id = `ev_${Date.now()}_${Math.random()}`;
        const record = { id, ...data, created_at: new Date() };
        careEventsTable.set(id, record);
        return record;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        const results: any[] = [];
        for (const ev of careEventsTable.values()) {
          if (where.draft_batch_id && ev.draft_batch_id === where.draft_batch_id) {
            const revs = Array.from(careRevisionsTable.values()).filter(
              (r) => r.care_event_id === ev.id,
            );
            results.push({ ...ev, revisions: revs });
          }
        }
        return results;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = careEventsTable.get(where.id);
        if (!existing) throw new Error('CareEvent not found');
        const updated = { ...existing, ...data };
        careEventsTable.set(where.id, updated);
        return updated;
      }),
    },
    careEventRevision: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = `rev_${Date.now()}_${Math.random()}`;
        const record = { id, ...data, confirmed_at: new Date() };
        careRevisionsTable.set(id, record);
        return record;
      }),
    },
    attendanceSession: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        for (const s of attendanceSessionsTable.values()) {
          if (s.relationship_id === where.relationship_id && s.status === where.status) {
            return s;
          }
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = `att_${Date.now()}_${Math.random()}`;
        const record = { id, ...data, created_at: new Date() };
        attendanceSessionsTable.set(id, record);
        return record;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = attendanceSessionsTable.get(where.id);
        if (!existing) throw new Error('AttendanceSession not found');
        const updated = { ...existing, ...data };
        attendanceSessionsTable.set(where.id, updated);
        return updated;
      }),
    },
    auditLog: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const entry = { id: `aud_${Date.now()}`, ...data, occurred_at: new Date() };
        auditLogsTable.push(entry);
        return entry;
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(createMockPrisma());
    }),
  });

  beforeEach(async () => {
    draftBatchesTable = new Map();
    accessGrantsTable = new Map();
    careEventsTable = new Map();
    careRevisionsTable = new Map();
    attendanceSessionsTable = new Map();
    auditLogsTable = [];

    // Active caregiver grant
    accessGrantsTable.set('grant_1', {
      id: 'grant_1',
      user_id: testUserId,
      child_id: testChildId,
      relationship_id: testRelId,
      role: 'CAREGIVER',
      scopes: ['CARE_WRITE', 'CARE_READ'],
      revoked_at: null,
      ends_at: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((k) => {
              if (k === 'LINE_MINI_APP_CHANNEL_ID') return '1234567890';
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

    draftService = module.get<DraftService>(DraftService);
  });

  describe('1. Flex Message Generation', () => {
    it('should generate valid LINE Flex Bubble container with correct components and actions', () => {
      const flexData = {
        id: 'draft_123',
        child_alias: '小安',
        status: 'PENDING_CONFIRMATION',
        lock_version: 1,
        created_at: '2026-09-16T11:45:00.000Z',
        expires_at: '2026-09-17T11:45:00.000Z',
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
        ],
      };

      const bubble = FlexMessageBuilder.buildDraftConfirmationFlex(flexData, 'test-channel-id');

      expect(bubble.type).toBe('bubble');
      expect(bubble.body).toBeDefined();
      expect(bubble.footer).toBeDefined();

      // Check brand label, child alias, and status pill in body
      const bodyTexts = JSON.stringify(bubble.body);
      expect(bodyTexts).toContain('CARELINK');
      expect(bodyTexts).toContain('小安的今日照護');
      expect(bodyTexts).toContain('待確認');

      // Check items rendered
      expect(bodyTexts).toContain('喝奶');
      expect(bodyTexts).toContain('150 ml');
      expect(bodyTexts).toContain('配方奶');

      // Check footer actions
      const footerJson = JSON.stringify(bubble.footer);
      expect(footerJson).toContain('action=confirm_draft&draft_id=draft_123&expected_version=1');
      expect(footerJson).toContain('action=cancel_draft&draft_id=draft_123');
      expect(footerJson).toContain('https://liff.line.me/test-channel-id/timeline');
    });

    it('should show missing fields warning and disable direct postback confirm if fields missing', () => {
      const flexData = {
        id: 'draft_incomplete',
        child_alias: '小安',
        status: 'NEEDS_INPUT',
        lock_version: 1,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: {},
            missing_fields: ['amount_ml'],
            source_span: '11:40 喝奶',
          },
        ],
      };

      const bubble = FlexMessageBuilder.buildDraftConfirmationFlex(flexData, 'test-channel-id');
      const bodyTexts = JSON.stringify(bubble.body);
      expect(bodyTexts).toContain('需補填');
      expect(bodyTexts).toContain('缺少必填: amount_ml');

      const footerJson = JSON.stringify(bubble.footer);
      // Confirm postback must NOT be available directly; prompt user to MINI App
      expect(footerJson).not.toContain('action=confirm_draft');
      expect(footerJson).toContain('改用手動記錄');
    });

    it('should build confirmed success Flex bubble with calm consumer wording', () => {
      const successBubble = FlexMessageBuilder.buildConfirmedSuccessFlex('小安', 2, 'channel_123');
      expect(successBubble.type).toBe('bubble');
      const bubbleStr = JSON.stringify(successBubble);
      expect(bubbleStr).toContain('✓ 已記錄');
      expect(bubbleStr).toContain('小安的 2 筆照護紀錄');
      expect(bubbleStr).toContain('已加入今天的時間軸');
      expect(bubbleStr).toContain('查看今天的紀錄');
      expect(bubbleStr).not.toContain('照護紀錄已入帳');
      expect(bubbleStr).not.toContain('受託幼兒');
      expect(bubbleStr).toContain('https://liff.line.me/channel_123/timeline');
    });
  });

  describe('2. Authorization & IDOR Protection', () => {
    it('should reject getDraft with NotFoundException (404) if user lacks access grant (IDOR protection)', async () => {
      const draftId = 'draft_idor_test';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: 'c_other_child',
        created_by: 'other_user',
        status: 'PENDING_CONFIRMATION',
      });

      await expect(draftService.getDraft(draftId, testUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject confirmDraft if user access grant has been revoked', async () => {
      // Revoke grant
      accessGrantsTable.set('grant_1', {
        id: 'grant_1',
        user_id: testUserId,
        child_id: testChildId,
        revoked_at: new Date(),
      });

      const draftId = 'draft_revoked_test';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: new Date().toISOString(),
            payload: { amount_ml: 120 },
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Draft Confirmation & Atomic Event Creation', () => {
    it('should atomically create CareEvent and CareEventRevision and mark draft CONFIRMED', async () => {
      const draftId = 'draft_valid_001';
      const occurredTime = new Date('2026-09-16T11:40:00.000Z');

      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: occurredTime.toISOString(),
            payload: { amount_ml: 160, feed_type: 'FORMULA' },
            missing_fields: [],
          },
          {
            item_index: 1,
            event_type: 'SLEEP_START',
            temporal_status: 'ACTUAL',
            occurred_at: new Date('2026-09-16T13:00:00.000Z').toISOString(),
            payload: {},
            missing_fields: [],
          },
        ],
      });

      const result = await draftService.confirmDraft({
        draftId,
        userId: testUserId,
        expectedVersion: 1,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(result.eventCount).toBe(2);
      expect(result.careEvents).toHaveLength(2);

      // Verify draft status in table
      const updatedDraft = draftBatchesTable.get(draftId);
      expect(updatedDraft.status).toBe('CONFIRMED');
      expect(updatedDraft.lock_version).toBe(2);

      // Verify CareEvents created
      expect(careEventsTable.size).toBe(2);
      for (const ev of careEventsTable.values()) {
        expect(ev.child_id).toBe(testChildId);
        expect(ev.relationship_id).toBe(testRelId);
        expect(ev.draft_batch_id).toBe(draftId);
        expect(ev.current_revision_id).toBeDefined();
        expect(ev.created_by).toBe(testUserId);
      }

      // Verify CareEventRevisions created
      expect(careRevisionsTable.size).toBe(2);
      for (const rev of careRevisionsTable.values()) {
        expect(rev.revision_no).toBe(1);
        expect(rev.action).toBe('RECORD');
        expect(rev.confirmed_by).toBe(testUserId);
      }

      // Verify AuditLog written
      expect(auditLogsTable).toHaveLength(1);
      expect(auditLogsTable[0].action).toBe('CONFIRM_DRAFT');
      expect(auditLogsTable[0].actor_user_id).toBe(testUserId);
    });

    it('should manage AttendanceSession lifecycle on CHECK_IN and CHECK_OUT', async () => {
      const draftCheckInId = 'draft_checkin';
      draftBatchesTable.set(draftCheckInId, {
        id: draftCheckInId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'CHECK_IN',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T08:00:00.000Z',
            payload: {},
            missing_fields: [],
          },
        ],
      });

      await draftService.confirmDraft({
        draftId: draftCheckInId,
        userId: testUserId,
      });

      // AttendanceSession opened
      expect(attendanceSessionsTable.size).toBe(1);
      const session = Array.from(attendanceSessionsTable.values())[0];
      expect(session.status).toBe('OPEN');
      expect(session.check_in_event_id).toBeDefined();

      // Now CHECK_OUT
      const draftCheckOutId = 'draft_checkout';
      draftBatchesTable.set(draftCheckOutId, {
        id: draftCheckOutId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'CHECK_OUT',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T17:30:00.000Z',
            payload: {},
            missing_fields: [],
          },
        ],
      });

      await draftService.confirmDraft({
        draftId: draftCheckOutId,
        userId: testUserId,
      });

      // Session closed
      const closedSession = attendanceSessionsTable.get(session.id);
      expect(closedSession.status).toBe('CLOSED');
      expect(closedSession.check_out_event_id).toBeDefined();
    });
  });

  describe('4. Idempotency & Concurrency Safety', () => {
    it('should return ALREADY_CONFIRMED and existing events without creating duplicates on repeated confirm', async () => {
      const draftId = 'draft_idempotent_test';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: { amount_ml: 150 },
            missing_fields: [],
          },
        ],
      });

      // First confirmation
      const res1 = await draftService.confirmDraft({
        draftId,
        userId: testUserId,
      });
      expect(res1.status).toBe('CONFIRMED');
      expect(careEventsTable.size).toBe(1);

      // Second confirmation: idempotent
      const res2 = await draftService.confirmDraft({
        draftId,
        userId: testUserId,
      });
      expect(res2.status).toBe('ALREADY_CONFIRMED');
      expect(res2.eventCount).toBe(1);

      // CareEvents count must NOT increase
      expect(careEventsTable.size).toBe(1);
    });

    it('should throw ConflictException (409) if expectedVersion does not match lock_version', async () => {
      const draftId = 'draft_occ_test';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 2, // Version is already 2
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: { amount_ml: 120 },
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
          expectedVersion: 1, // Stale version
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('5. Invariants & Business Rule Validations', () => {
    it('should reject draft confirmation if items have missing_fields', async () => {
      const draftId = 'draft_missing_field';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'NEEDS_INPUT',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: {},
            missing_fields: ['amount_ml'],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Stage 5.1: should allow PLANNED_PICKUP with PLANNED temporal_status, but never create AttendanceSession (Billing source = 0)', async () => {
      const draftId = 'draft_planned_pickup_ok';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'PLANNED_PICKUP',
            temporal_status: 'PLANNED',
            occurred_at: '2026-09-16T19:00:00.000Z',
            payload: { planned_at: '19:00', pickup_label: '阿嬤' },
            missing_fields: [],
            source_span: '今天阿嬤七點接',
          },
        ],
      });

      const result = await draftService.confirmDraft({
        draftId,
        userId: testUserId,
      });

      expect(result.status).toBe('CONFIRMED');
      expect(result.eventCount).toBe(1);

      // Verify CareEvent created
      const event = careEventsTable.get(result.careEvents[0].id);
      expect(event).toBeDefined();
      expect(event.event_type).toBe('PLANNED_PICKUP');
      expect(event.attendance_session_id).toBeFalsy(); // NEVER touches AttendanceSession!

      // Verify AttendanceSession was NOT created (Billing source count remains 0)
      expect(attendanceSessionsTable.size).toBe(0);

      // Verify CareEventRevision payload records temporal_status = PLANNED
      const rev = careRevisionsTable.get(event.current_revision_id);
      expect(rev).toBeDefined();
      expect(rev.payload.temporal_status).toBe('PLANNED');
      expect(rev.payload.pickup_label).toBe('阿嬤');
    });

    it('Stage 5.1: should reject PLANNED FEED from entering official CareEvents', async () => {
      const draftId = 'draft_planned_feed';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'PLANNED', // PLANNED FEED is forbidden!
            occurred_at: '2026-09-16T14:00:00.000Z',
            payload: { amount_ml: 120 },
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Stage 5.1: should reject NEGATED FEED from entering official CareEvents', async () => {
      const draftId = 'draft_negated_feed';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'NEGATED', // "今天沒有喝奶" cannot enter timeline
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: {},
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Stage 5.1: should reject UNCERTAIN CHECK_OUT from direct confirmation until clarified', async () => {
      const draftId = 'draft_uncertain_checkout';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() + 3600000),
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'CHECK_OUT',
            temporal_status: 'UNCERTAIN', // "可能七點接"
            occurred_at: '2026-09-16T19:00:00.000Z',
            payload: {},
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject expired draft batches', async () => {
      const draftId = 'draft_expired';
      draftBatchesTable.set(draftId, {
        id: draftId,
        child_id: testChildId,
        relationship_id: testRelId,
        status: 'PENDING_CONFIRMATION',
        expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-16T11:40:00.000Z',
            payload: { amount_ml: 120 },
            missing_fields: [],
          },
        ],
      });

      await expect(
        draftService.confirmDraft({
          draftId,
          userId: testUserId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
