import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Stage 6: Confirmed Timeline + Revision / Correction Tests', () => {
  let timelineService: TimelineService;

  // In-memory data tables
  let accessGrantsTable: Map<string, any>;
  let relationshipsTable: Map<string, any>;
  let careEventsTable: Map<string, any>;
  let careRevisionsTable: Map<string, any>;
  let attendanceSessionsTable: Map<string, any>;
  let auditLogsTable: any[];

  const guardianUserId = 'u_guardian_001';
  const caregiverUserId = 'u_caregiver_001';
  const otherUserId = 'u_other_999';

  const childAId = 'child_001';
  const childBId = 'child_002';
  const relId = 'rel_active_001';

  const createMockPrisma = () => ({
    accessGrant: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        for (const grant of accessGrantsTable.values()) {
          if (grant.user_id === where.user_id && grant.child_id === where.child_id) {
            if (where.revoked_at === null && grant.revoked_at !== null) continue;
            // Attach relationship if present
            const rel = grant.relationship_id ? relationshipsTable.get(grant.relationship_id) : null;
            return { ...grant, relationship: rel };
          }
        }
        return null;
      }),
    },
    careEvent: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        const results: any[] = [];
        for (const ev of careEventsTable.values()) {
          if (where.child_id && ev.child_id !== where.child_id) continue;
          if (where.event_type && ev.event_type !== where.event_type) continue;
          if (where.current_revision_id?.not === null && !ev.current_revision_id) continue;

          const revs = Array.from(careRevisionsTable.values())
            .filter((r) => r.care_event_id === ev.id)
            .sort((a, b) => b.revision_no - a.revision_no);

          results.push({ ...ev, revisions: revs });
        }
        return results;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const ev = careEventsTable.get(where.id);
        if (!ev) return null;
        const revs = Array.from(careRevisionsTable.values())
          .filter((r) => r.care_event_id === ev.id)
          .sort((a, b) => a.revision_no - b.revision_no);
        const rel = ev.relationship_id ? relationshipsTable.get(ev.relationship_id) : null;
        return { ...ev, relationship: rel, revisions: revs };
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
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        return attendanceSessionsTable.get(where.id) || null;
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
    accessGrantsTable = new Map();
    relationshipsTable = new Map();
    careEventsTable = new Map();
    careRevisionsTable = new Map();
    attendanceSessionsTable = new Map();
    auditLogsTable = [];

    // Active relationship
    relationshipsTable.set(relId, {
      id: relId,
      child_id: childAId,
      caregiver_user_id: caregiverUserId,
      status: 'ACTIVE',
    });

    // Guardian active grant for Child A
    accessGrantsTable.set('grant_guardian_A', {
      id: 'grant_guardian_A',
      user_id: guardianUserId,
      child_id: childAId,
      role: 'PARENT',
      scopes: ['CARE_READ', 'CARE_WRITE'],
      revoked_at: null,
      ends_at: null,
    });

    // Caregiver active grant for Child A
    accessGrantsTable.set('grant_caregiver_A', {
      id: 'grant_caregiver_A',
      user_id: caregiverUserId,
      child_id: childAId,
      relationship_id: relId,
      role: 'CAREGIVER',
      scopes: ['CARE_READ', 'CARE_WRITE'],
      revoked_at: null,
      ends_at: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        {
          provide: PrismaService,
          useValue: createMockPrisma(),
        },
      ],
    }).compile();

    timelineService = module.get<TimelineService>(TimelineService);
  });

  describe('1. Authorization & IDOR Protection', () => {
    it('should allow authorized Guardian to view Child A timeline (200)', async () => {
      const res = await timelineService.getTimeline(childAId, guardianUserId, {});
      expect(res).toBeDefined();
      expect(Array.isArray(res.items)).toBe(true);
    });

    it('should reject Guardian accessing Child B with 404 NotFoundException (cross-family IDOR protection)', async () => {
      await expect(
        timelineService.getTimeline(childBId, guardianUserId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject revoked caregiver with 404 NotFoundException', async () => {
      // Revoke caregiver grant
      accessGrantsTable.set('grant_caregiver_A', {
        id: 'grant_caregiver_A',
        user_id: caregiverUserId,
        child_id: childAId,
        revoked_at: new Date(),
      });

      await expect(
        timelineService.getTimeline(childAId, caregiverUserId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject caregiver when relationship status has ended with 404 NotFoundException', async () => {
      // End relationship
      relationshipsTable.set(relId, {
        id: relId,
        child_id: childAId,
        caregiver_user_id: caregiverUserId,
        status: 'ENDED',
      });

      await expect(
        timelineService.getTimeline(childAId, caregiverUserId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Confirmed Timeline & Sanitation', () => {
    it('should return confirmed CareEvents ordered by occurred_at DESC and sanitize internal secrets', async () => {
      // Setup confirmed events
      const event1Id = 'ev_feed_1';
      const rev1Id = 'rev_feed_1';
      careEventsTable.set(event1Id, {
        id: event1Id,
        child_id: childAId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: event1Id,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150, feed_type: 'FORMULA' },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      const event2Id = 'ev_sleep_1';
      const rev2Id = 'rev_sleep_1';
      careEventsTable.set(event2Id, {
        id: event2Id,
        child_id: childAId,
        event_type: 'SLEEP_START',
        current_revision_id: rev2Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev2Id, {
        id: rev2Id,
        care_event_id: event2Id,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T13:10:00.000Z'), // More recent
        payload: {},
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      const res = await timelineService.getTimeline(childAId, guardianUserId, {});

      expect(res.total_returned).toBe(2);
      // Order: occurred_at DESC -> sleep (13:10) then feed (11:40)
      expect(res.items[0].event_id).toBe(event2Id);
      expect(res.items[0].event_type).toBe('SLEEP_START');
      expect(res.items[0].temporal_status).toBe('ACTUAL');
      expect(res.items[0].status).toBe('RECORDED');

      expect(res.items[1].event_id).toBe(event1Id);
      expect(res.items[1].event_type).toBe('FEED');
      expect(res.items[1].payload.amount_ml).toBe(150);

      // Verify sanitation: no secret leaks
      const json = JSON.stringify(res.items[0]);
      expect(json).not.toContain('ciphertext');
      expect(json).not.toContain('prompt');
      expect(json).not.toContain('raw_output');
      expect(json).not.toContain('audit_internals');
    });

    it('should distinguish PLANNED_PICKUP as temporal_status=PLANNED', async () => {
      const eventId = 'ev_planned_pickup_1';
      const revId = 'rev_planned_pickup_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        event_type: 'PLANNED_PICKUP',
        current_revision_id: revId,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(revId, {
        id: revId,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T19:00:00.000Z'),
        payload: { planned_at: '19:00', pickup_label: '阿嬤', temporal_status: 'PLANNED' },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      const res = await timelineService.getTimeline(childAId, guardianUserId, {});
      expect(res.items[0].event_type).toBe('PLANNED_PICKUP');
      expect(res.items[0].temporal_status).toBe('PLANNED');
      expect(res.items[0].payload.pickup_label).toBe('阿嬤');
    });

    it('should support deterministic cursor pagination', async () => {
      // Insert 5 events spaced 1 hour apart
      for (let i = 1; i <= 5; i++) {
        const evId = `ev_batch_${i}`;
        const revId = `rev_batch_${i}`;
        careEventsTable.set(evId, {
          id: evId,
          child_id: childAId,
          event_type: 'FEED',
          current_revision_id: revId,
          created_by: caregiverUserId,
        });
        careRevisionsTable.set(revId, {
          id: revId,
          care_event_id: evId,
          revision_no: 1,
          occurred_at: new Date(`2026-09-16T${10 + i}:00:00.000Z`),
          payload: { amount_ml: 100 + i * 10 },
          action: 'RECORD',
          confirmed_by: caregiverUserId,
        });
      }

      // Page 1: limit 2
      const page1 = await timelineService.getTimeline(childAId, guardianUserId, { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.has_more).toBe(true);
      expect(page1.next_cursor).toBeDefined();

      // Page 2: with next_cursor
      const page2 = await timelineService.getTimeline(childAId, guardianUserId, {
        limit: 2,
        cursor: page1.next_cursor!,
      });
      expect(page2.items).toHaveLength(2);
      expect(page2.has_more).toBe(true);

      // Verify no duplicate events across pages
      const page1Ids = page1.items.map((it) => it.event_id);
      const page2Ids = page2.items.map((it) => it.event_id);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });
  });

  describe('3. Correction Flow & Versioning', () => {
    it('should create revision v2 without overwriting revision v1, and update CareEvent current pointer', async () => {
      const eventId = 'ev_correct_test';
      const rev1Id = 'rev_correct_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      // Caregiver corrects time to 11:45 and amount to 160
      const correctedResult = await timelineService.createCorrection(eventId, caregiverUserId, {
        action: 'CORRECT',
        expected_revision_no: 1,
        occurred_at: '2026-09-16T11:45:00.000Z',
        payload: { amount_ml: 160 },
        reason: '修正實際餵食量與時間',
      });

      expect(correctedResult.revision_no).toBe(2);
      expect(correctedResult.status).toBe('CORRECTED');
      expect(correctedResult.payload.amount_ml).toBe(160);
      expect(correctedResult.reason).toBe('修正實際餵食量與時間');
      expect(correctedResult.supersedes_revision_id).toBe(rev1Id);

      // Invariant: Revision v1 remains untouched!
      const originalRev1 = careRevisionsTable.get(rev1Id);
      expect(originalRev1.payload.amount_ml).toBe(150);
      expect(originalRev1.occurred_at.toISOString()).toBe('2026-09-16T11:40:00.000Z');

      // CareEvent current pointer points to revision v2
      const updatedEvent = careEventsTable.get(eventId);
      expect(updatedEvent.current_revision_id).not.toBe(rev1Id);

      // AuditLog recorded
      expect(auditLogsTable).toHaveLength(1);
      expect(auditLogsTable[0].action).toBe('CARE_EVENT_CORRECT');
    });

    it('1. Caregiver A corrects own relationship event → allowed', async () => {
      const eventId = 'ev_caregiver_a_own';
      const rev1Id = 'rev_cg_a_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      const res = await timelineService.createCorrection(eventId, caregiverUserId, {
        action: 'CORRECT',
        expected_revision_no: 1,
        payload: { amount_ml: 160 },
        reason: '保母本人正常修訂',
      });
      expect(res.revision_no).toBe(2);
      expect(res.status).toBe('CORRECTED');
    });

    it('2. Guardian directly modifies caregiver event → rejected (ForbiddenException)', async () => {
      const eventId = 'ev_guardian_forbidden';
      const rev1Id = 'rev_caregiver_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      await expect(
        timelineService.createCorrection(eventId, guardianUserId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          payload: { amount_ml: 180 },
          reason: '家長試圖直接覆寫保母事件',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. Different caregiver modifies event → rejected (ForbiddenException)', async () => {
      const caregiverBId = 'u_caregiver_002';
      const relBId = 'rel_caregiver_b';
      // Register Caregiver B in grants
      accessGrantsTable.set('grant_caregiver_B', {
        id: 'grant_caregiver_B',
        user_id: caregiverBId,
        child_id: childAId,
        relationship_id: relBId,
        role: 'CAREGIVER',
        scopes: ['CARE_READ', 'CARE_WRITE'],
        revoked_at: null,
        ends_at: null,
      });
      relationshipsTable.set(relBId, {
        id: relBId,
        child_id: childAId,
        caregiver_user_id: caregiverBId,
        status: 'ACTIVE',
      });

      const eventId = 'ev_caregiver_a_target';
      const rev1Id = 'rev_cg_a_target_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId, // Belongs to Caregiver A's relationship!
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      // Caregiver B attempts to modify Caregiver A's event
      await expect(
        timelineService.createCorrection(eventId, caregiverBId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          payload: { amount_ml: 120 },
          reason: '其他保母越權修改',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4. Revoked caregiver modifies event → rejected (NotFoundException 404)', async () => {
      const eventId = 'ev_revoked_cg_target';
      const rev1Id = 'rev_revoked_cg_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      // Revoke caregiver's grant
      accessGrantsTable.set('grant_caregiver_A', {
        id: 'grant_caregiver_A',
        user_id: caregiverUserId,
        child_id: childAId,
        relationship_id: relId,
        role: 'CAREGIVER',
        scopes: ['CARE_READ', 'CARE_WRITE'],
        revoked_at: new Date(),
        ends_at: null,
      });

      await expect(
        timelineService.createCorrection(eventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          payload: { amount_ml: 130 },
          reason: '已被撤銷保母試圖修改',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('5. Ended relationship caregiver modifies event → rejected (ForbiddenException)', async () => {
      const eventId = 'ev_ended_rel_target';
      const rev1Id = 'rev_ended_rel_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      // Terminate relationship
      relationshipsTable.set(relId, {
        id: relId,
        child_id: childAId,
        caregiver_user_id: caregiverUserId,
        status: 'ENDED',
        ends_at: new Date(Date.now() - 3600000),
      });

      await expect(
        timelineService.createCorrection(eventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          payload: { amount_ml: 140 },
          reason: '已結束照護關係之保母試圖修改',
        }),
      ).rejects.toThrow();
    });

    it('should enforce OCC: throw 409 ConflictException when expected_revision_no does not match', async () => {
      const eventId = 'ev_occ_conflict';
      const rev1Id = 'rev_occ_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 2, // Current is 2
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      await expect(
        timelineService.createCorrection(eventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 1, // Stale expected revision
          payload: { amount_ml: 160 },
          reason: '並行修改測試',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. VOID Flow & Invariants', () => {
    it('should mark CareEvent as VOID and retain revision history', async () => {
      const eventId = 'ev_void_test';
      const rev1Id = 'rev_void_1';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'FEED',
        current_revision_id: rev1Id,
        created_by: caregiverUserId,
      });
      careRevisionsTable.set(rev1Id, {
        id: rev1Id,
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      const voidResult = await timelineService.createCorrection(eventId, caregiverUserId, {
        action: 'VOID',
        expected_revision_no: 1,
        reason: '保母記錯寶寶，此紀錄作廢',
      });

      expect(voidResult.status).toBe('VOID');
      expect(voidResult.action).toBe('VOID');
      expect(voidResult.revision_no).toBe(2);

      // Invariant: Cannot correct an event that is already VOID
      await expect(
        timelineService.createCorrection(eventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 2,
          payload: { amount_ml: 120 },
          reason: '試圖修改已作廢事件',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject attendance correction violating session order (CHECK_OUT before CHECK_IN)', async () => {
      const checkInEventId = 'ev_checkin';
      const checkOutEventId = 'ev_checkout';
      const sessionId = 'att_session_001';

      attendanceSessionsTable.set(sessionId, {
        id: sessionId,
        status: 'CLOSED',
        check_in_event_id: checkInEventId,
        check_out_event_id: checkOutEventId,
      });

      careEventsTable.set(checkInEventId, {
        id: checkInEventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'CHECK_IN',
        attendance_session_id: sessionId,
        current_revision_id: 'rev_in_1',
        created_by: caregiverUserId,
      });
      careRevisionsTable.set('rev_in_1', {
        id: 'rev_in_1',
        care_event_id: checkInEventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T08:00:00.000Z'),
        payload: {},
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      careEventsTable.set(checkOutEventId, {
        id: checkOutEventId,
        child_id: childAId,
        relationship_id: relId,
        event_type: 'CHECK_OUT',
        attendance_session_id: sessionId,
        current_revision_id: 'rev_out_1',
        created_by: caregiverUserId,
      });
      careRevisionsTable.set('rev_out_1', {
        id: 'rev_out_1',
        care_event_id: checkOutEventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T17:00:00.000Z'),
        payload: {},
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      // Try to correct CHECK_IN to 18:00 (after CHECK_OUT at 17:00)
      await expect(
        timelineService.createCorrection(checkInEventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          occurred_at: '2026-09-16T18:00:00.000Z',
          reason: '錯誤簽到時間測試',
        }),
      ).rejects.toThrow(BadRequestException);

      // Try to correct CHECK_OUT to 07:00 (before CHECK_IN at 08:00)
      await expect(
        timelineService.createCorrection(checkOutEventId, caregiverUserId, {
          action: 'CORRECT',
          expected_revision_no: 1,
          occurred_at: '2026-09-16T07:00:00.000Z',
          reason: '錯誤簽退時間測試',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. History API', () => {
    it('should return complete chronological revision history for an event', async () => {
      const eventId = 'ev_hist_test';
      careEventsTable.set(eventId, {
        id: eventId,
        child_id: childAId,
        event_type: 'FEED',
        current_revision_id: 'rev_v2',
        created_by: caregiverUserId,
      });

      careRevisionsTable.set('rev_v1', {
        id: 'rev_v1',
        care_event_id: eventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-16T11:40:00.000Z'),
        payload: { amount_ml: 150 },
        action: 'RECORD',
        confirmed_by: caregiverUserId,
      });

      careRevisionsTable.set('rev_v2', {
        id: 'rev_v2',
        care_event_id: eventId,
        revision_no: 2,
        occurred_at: new Date('2026-09-16T11:45:00.000Z'),
        payload: { amount_ml: 160 },
        action: 'CORRECT',
        reason: '修正奶量',
        supersedes_revision_id: 'rev_v1',
        confirmed_by: caregiverUserId,
      });

      const history = await timelineService.getEventHistory(eventId, guardianUserId);

      expect(history.event_id).toBe(eventId);
      expect(history.revisions).toHaveLength(2);
      expect(history.revisions[0].revision_no).toBe(1);
      expect(history.revisions[0].payload.amount_ml).toBe(150);
      expect(history.revisions[1].revision_no).toBe(2);
      expect(history.revisions[1].payload.amount_ml).toBe(160);
      expect(history.revisions[1].reason).toBe('修正奶量');
    });
  });

  describe('6. Month Calendar Summary API', () => {
    it('should aggregate confirmed events and planned pickup flags per day in Asia/Taipei', async () => {
      // 2026-09-14 09:00 UTC (17:00 Taipei)
      const ev1Id = 'ev_cal_1';
      careEventsTable.set(ev1Id, {
        id: ev1Id,
        child_id: childAId,
        event_type: 'FEED',
        current_revision_id: 'rev_cal_1',
      });
      careRevisionsTable.set('rev_cal_1', {
        id: 'rev_cal_1',
        care_event_id: ev1Id,
        revision_no: 1,
        occurred_at: new Date('2026-09-14T09:00:00.000Z'),
        action: 'RECORD',
      });

      // 2026-09-14 12:00 UTC (20:00 Taipei)
      const ev2Id = 'ev_cal_2';
      careEventsTable.set(ev2Id, {
        id: ev2Id,
        child_id: childAId,
        event_type: 'SLEEP_START',
        current_revision_id: 'rev_cal_2',
      });
      careRevisionsTable.set('rev_cal_2', {
        id: 'rev_cal_2',
        care_event_id: ev2Id,
        revision_no: 1,
        occurred_at: new Date('2026-09-14T12:00:00.000Z'),
        action: 'RECORD',
      });

      // 2026-09-17 03:40 UTC (11:40 Taipei)
      const ev3Id = 'ev_cal_3';
      careEventsTable.set(ev3Id, {
        id: ev3Id,
        child_id: childAId,
        event_type: 'PLANNED_PICKUP',
        current_revision_id: 'rev_cal_3',
      });
      careRevisionsTable.set('rev_cal_3', {
        id: 'rev_cal_3',
        care_event_id: ev3Id,
        revision_no: 1,
        occurred_at: new Date('2026-09-17T03:40:00.000Z'),
        action: 'RECORD',
      });

      // Voided event on 2026-09-17 (should be ignored)
      const evVoidId = 'ev_cal_void';
      careEventsTable.set(evVoidId, {
        id: evVoidId,
        child_id: childAId,
        event_type: 'FEED',
        current_revision_id: 'rev_cal_void',
      });
      careRevisionsTable.set('rev_cal_void', {
        id: 'rev_cal_void',
        care_event_id: evVoidId,
        revision_no: 1,
        occurred_at: new Date('2026-09-17T04:00:00.000Z'),
        action: 'VOID',
      });

      const summary = await timelineService.getMonthSummary(childAId, guardianUserId, '2026-09');

      expect(summary['2026-09-14']).toEqual(expect.objectContaining({
        confirmed_count: 2,
        has_planned_pickup: false,
        pending_handoff_count: 0,
      }));

      expect(summary['2026-09-17']).toEqual(expect.objectContaining({
        confirmed_count: 1,
        has_planned_pickup: true,
        pending_handoff_count: 0,
      }));

      // Days with 0 events should not be populated
      expect(summary['2026-09-15']).toBeUndefined();
    });

    it('Invariant: confirmed_count only counts valid current revisions; VOID/superseded revisions do not double count, pending_handoff_count is 0', async () => {
      // Event with 3 revisions (RECORD -> CORRECT -> CORRECT)
      const multiRevEventId = 'ev_multi_rev';
      careEventsTable.set(multiRevEventId, {
        id: multiRevEventId,
        child_id: childAId,
        event_type: 'FEED',
        current_revision_id: 'rev_v3',
      });
      careRevisionsTable.set('rev_v1', {
        id: 'rev_v1',
        care_event_id: multiRevEventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-18T02:00:00.000Z'),
        action: 'RECORD',
      });
      careRevisionsTable.set('rev_v2', {
        id: 'rev_v2',
        care_event_id: multiRevEventId,
        revision_no: 2,
        occurred_at: new Date('2026-09-18T02:30:00.000Z'),
        action: 'CORRECT',
      });
      careRevisionsTable.set('rev_v3', {
        id: 'rev_v3',
        care_event_id: multiRevEventId,
        revision_no: 3,
        occurred_at: new Date('2026-09-18T03:00:00.000Z'),
        action: 'CORRECT',
      });

      // Event that was VOIDed
      const voidEventId = 'ev_voided_later';
      careEventsTable.set(voidEventId, {
        id: voidEventId,
        child_id: childAId,
        event_type: 'SLEEP_START',
        current_revision_id: 'rev_void_v2',
      });
      careRevisionsTable.set('rev_void_v1', {
        id: 'rev_void_v1',
        care_event_id: voidEventId,
        revision_no: 1,
        occurred_at: new Date('2026-09-18T04:00:00.000Z'),
        action: 'RECORD',
      });
      careRevisionsTable.set('rev_void_v2', {
        id: 'rev_void_v2',
        care_event_id: voidEventId,
        revision_no: 2,
        occurred_at: new Date('2026-09-18T04:00:00.000Z'),
        action: 'VOID',
      });

      const summary = await timelineService.getMonthSummary(childAId, guardianUserId, '2026-09');

      // Despite having 5 total revision rows between both events on 2026-09-18,
      // confirmed_count must be exactly 1 (1 valid non-void event), and pending_handoff_count must be 0
      expect(summary['2026-09-18']).toEqual(expect.objectContaining({
        confirmed_count: 1,
        has_planned_pickup: false,
        pending_handoff_count: 0,
      }));
    });

    it('should throw BadRequestException if month format is invalid', async () => {
      await expect(
        timelineService.getMonthSummary(childAId, guardianUserId, 'invalid-month'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if user is unauthorized', async () => {
      await expect(
        timelineService.getMonthSummary(childAId, otherUserId, '2026-09'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
