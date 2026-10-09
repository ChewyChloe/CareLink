import { Test, TestingModule } from '@nestjs/testing';
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { validateEventPayload } from './event-payload.schemas';

describe('Manual Entry & Deterministic Care Events (Phases 1–25)', () => {
  let service: TimelineService;
  let prisma: PrismaService;

  const mockCaregiverId = 'caregiver-uuid-001';
  const mockGuardianId = 'guardian-uuid-002';
  const mockChildIdA = 'child-uuid-aaa';
  const mockChildIdB = 'child-uuid-bbb';
  const mockRelationshipId = 'rel-uuid-001';

  const mockChildA = {
    id: mockChildIdA,
    display_alias: '湯圓',
    birth_date: new Date('2025-06-15T00:00:00+08:00'),
    created_at: new Date('2025-06-15T00:00:00+08:00'),
    archived_at: null,
  };

  const mockGrantCaregiverA = {
    id: 'grant-cg-a',
    user_id: mockCaregiverId,
    child_id: mockChildIdA,
    relationship_id: mockRelationshipId,
    role: 'CAREGIVER',
    scopes: ['CARE_READ', 'CARE_WRITE', 'HANDOFF_WRITE'],
    starts_at: new Date('2026-01-01'),
    ends_at: null,
    revoked_at: null,
    relationship: {
      id: mockRelationshipId,
      status: 'ACTIVE',
      caregiver_user_id: mockCaregiverId,
    },
  };

  const mockGrantGuardianA = {
    id: 'grant-gd-a',
    user_id: mockGuardianId,
    child_id: mockChildIdA,
    relationship_id: null,
    role: 'GUARDIAN',
    scopes: ['CARE_READ', 'HANDOFF_WRITE', 'CONTRACT_READ', 'BILLING_READ'],
    starts_at: new Date('2026-01-01'),
    ends_at: null,
    revoked_at: null,
    relationship: null,
  };

  let inMemoryEvents: any[] = [];
  let inMemoryRevisions: any[] = [];
  let inMemoryDailyLogViews: any[] = [];
  let inMemoryAuditLogs: any[] = [];
  let inMemoryInstructions: any[] = [];

  beforeEach(async () => {
    inMemoryEvents = [];
    inMemoryRevisions = [];
    inMemoryDailyLogViews = [];
    inMemoryAuditLogs = [];
    inMemoryInstructions = [];

    const mockPrisma = {
      accessGrant: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.user_id === mockCaregiverId && where.child_id === mockChildIdA) {
            return mockGrantCaregiverA;
          }
          if (where.user_id === mockGuardianId && where.child_id === mockChildIdA) {
            return mockGrantGuardianA;
          }
          return null; // Cross-child or unauthorized
        }),
      },
      careRelationship: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockRelationshipId,
          status: 'ACTIVE',
          caregiver_user_id: mockCaregiverId,
        }),
      },
      dailyLogView: {
        upsert: jest.fn().mockImplementation(({ create, update, where }) => {
          const item = {
            id: 'dlv-uuid-1',
            user_id: create.user_id,
            child_id: create.child_id,
            care_date: create.care_date,
            viewed_at: new Date(),
          };
          inMemoryDailyLogViews.push(item);
          return item;
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return (
            inMemoryDailyLogViews.find(
              (v) =>
                v.child_id === where.child_id &&
                v.care_date.getTime() === where.care_date.getTime(),
            ) || null
          );
        }),
      },
      careEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          const ev = { id: `event-${Date.now()}-${Math.random()}`, ...data, revisions: [] };
          inMemoryEvents.push(ev);
          return ev;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const ev = inMemoryEvents.find((e) => e.id === where.id);
          if (ev) Object.assign(ev, data);
          return ev;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return inMemoryEvents
            .filter((e) => e.child_id === where.child_id)
            .map((e) => ({
              ...e,
              guardian_instruction:
                inMemoryInstructions.find((i) => i.id === e.guardian_instruction_id) || null,
              revisions: inMemoryRevisions.filter((r) => r.care_event_id === e.id),
            }));
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const ev = inMemoryEvents.find((e) => e.id === where.id);
          if (!ev) return null;
          return {
            ...ev,
            relationship: {
              id: mockRelationshipId,
              status: 'ACTIVE',
              caregiver_user_id: mockCaregiverId,
            },
            guardian_instruction:
              inMemoryInstructions.find((i) => i.id === ev.guardian_instruction_id) || null,
            revisions: inMemoryRevisions.filter((r) => r.care_event_id === ev.id),
          };
        }),
      },
      careEventRevision: {
        create: jest.fn().mockImplementation(({ data }) => {
          const rev = { id: `rev-${Date.now()}-${Math.random()}`, ...data };
          inMemoryRevisions.push(rev);
          return rev;
        }),
      },
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'att-session-1', status: 'OPEN' }),
        update: jest.fn().mockResolvedValue({ id: 'att-session-1', status: 'CLOSED' }),
      },
      guardianInstruction: {
        create: jest.fn().mockImplementation(({ data }) => {
          const item = {
            id: `inst-${Date.now()}-${Math.random()}`,
            ...data,
            created_at: new Date(),
            updated_at: new Date(),
            revoked_at: null,
          };
          inMemoryInstructions.push(item);
          return item;
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const item = inMemoryInstructions.find((i) => i.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          return inMemoryInstructions.find((i) => i.id === where.id) || null;
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return inMemoryInstructions.filter((i) => i.child_id === where.child_id);
        }),
      },
      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => {
          inMemoryAuditLogs.push(data);
          return data;
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimelineService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<TimelineService>(TimelineService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('1. Schema Validation (event-payload.schemas.ts)', () => {
    it('TEMPERATURE: accepts valid facts, rejects outside 25–50 technical sanity bounds', () => {
      const valid = validateEventPayload('TEMPERATURE', {
        value_celsius: 36.5,
        measurement_site: '耳溫',
      });
      expect(valid.value_celsius).toBe(36.5);

      expect(() =>
        validateEventPayload('TEMPERATURE', { value_celsius: 55.0 }),
      ).toThrow(BadRequestException);
      expect(() =>
        validateEventPayload('TEMPERATURE', { value_celsius: 20.0 }),
      ).toThrow(BadRequestException);
    });

    it('FEED: requires positive amount and valid milk_type', () => {
      const valid = validateEventPayload('FEED', {
        milk_type: 'FORMULA',
        amount: 150,
      });
      expect(valid.milk_type).toBe('FORMULA');
      expect(valid.amount).toBe(150);

      expect(() =>
        validateEventPayload('FEED', { milk_type: 'JUICE', amount: 150 }),
      ).toThrow(BadRequestException);
      expect(() =>
        validateEventPayload('FEED', { milk_type: 'FORMULA', amount: -50 }),
      ).toThrow(BadRequestException);
    });

    it('MEAL: requires completion to be FULL, PARTIAL, REFUSED, or UNKNOWN', () => {
      const valid = validateEventPayload('MEAL', {
        meal_type: '午餐',
        description: '南瓜粥',
        completion: 'FULL',
      });
      expect(valid.completion).toBe('FULL');

      expect(() =>
        validateEventPayload('MEAL', {
          meal_type: '午餐',
          description: '南瓜粥',
          completion: 'EXCELLENT',
        }),
      ).toThrow(BadRequestException);
    });

    it('DIAPER & BOWEL_MOVEMENT: validates diaper condition without medical judgment', () => {
      const validDiaper = validateEventPayload('DIAPER', { condition: 'WET' });
      expect(validDiaper.condition).toBe('WET');

      expect(() =>
        validateEventPayload('DIAPER', { condition: 'DIRTY_BAD' }),
      ).toThrow(BadRequestException);

      const validBowel = validateEventPayload('BOWEL_MOVEMENT', {
        consistency: '軟便',
        color: '金黃',
      });
      expect(validBowel.consistency).toBe('軟便');
    });

    it('MEDICATION: requires medication_name, dosage_text, and administered_at', () => {
      const valid = validateEventPayload('MEDICATION', {
        medication_name: '感冒糖漿',
        dosage_text: '5ml',
        administered_at: '15:30',
        note: '醫師處方藥品',
      });
      expect(valid.medication_name).toBe('感冒糖漿');

      expect(() =>
        validateEventPayload('MEDICATION', {
          medication_name: '',
          dosage_text: '5ml',
          administered_at: '15:30',
        }),
      ).toThrow(BadRequestException);
    });

    it('GROWTH_MEASUREMENT: requires at least one objective measurement', () => {
      const valid = validateEventPayload('GROWTH_MEASUREMENT', {
        height_cm: 77.1,
        weight_kg: 10.0,
      });
      expect(valid.height_cm).toBe(77.1);

      expect(() =>
        validateEventPayload('GROWTH_MEASUREMENT', { note: '看起來有長大' }),
      ).toThrow(BadRequestException);
    });

    it('NOTE: requires note_type and non-empty content', () => {
      const valid = validateEventPayload('NOTE', {
        note_type: 'TEACHER_REMARK',
        content: '今天中午吃飽後精神極佳！',
      });
      expect(valid.content).toBe('今天中午吃飽後精神極佳！');

      expect(() =>
        validateEventPayload('NOTE', {
          note_type: 'INVALID_NOTE',
          content: 'test',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('2. Manual Event Creation Endpoint', () => {
    it('creates a valid FEED event with revision and audit log', async () => {
      const item = await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '11:40',
        payload: {
          milk_type: 'FORMULA',
          amount: 150,
          unit: 'ml',
        },
      });

      expect(item.event_type).toBe('FEED');
      expect(item.status).toBe('RECORDED');
      expect(item.revision_no).toBe(1);
      expect(item.payload.amount).toBe(150);
      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('MANUAL_CREATE_EVENT');
    });

    it('creates all 10+ event types successfully', async () => {
      const types = [
        { type: 'TEMPERATURE', payload: { value_celsius: 36.5 } },
        { type: 'FEED', payload: { milk_type: 'BREAST_MILK', amount: 120 } },
        { type: 'MEAL', payload: { meal_type: '點心', description: '米餅', completion: 'FULL' } },
        { type: 'DIAPER', payload: { condition: 'WET' } },
        { type: 'BOWEL_MOVEMENT', payload: { consistency: '軟便' } },
        { type: 'MEDICATION', payload: { medication_name: '退燒藥', dosage_text: '5ml', administered_at: '13:00' } },
        { type: 'ACTIVITY', payload: { activity_type: '閱讀', title: '繪本共讀', duration_minutes: 20 } },
        { type: 'HYGIENE', payload: { hygiene_type: 'CLOTHING_CHANGE' } },
        { type: 'GROWTH_MEASUREMENT', payload: { weight_kg: 10.0 } },
        { type: 'NOTE', payload: { note_type: 'TEACHER_REMARK', content: '今天作息正常' } },
      ];

      for (const t of types) {
        const res = await service.createManualEvent(mockChildIdA, mockCaregiverId, {
          event_type: t.type,
          occurred_at: '12:00',
          payload: t.payload,
        });
        expect(res.event_type).toBe(t.type);
      }
    });

    it('rejects unauthorized creation by user without CARE_WRITE (e.g. Guardian)', async () => {
      await expect(
        service.createManualEvent(mockChildIdA, mockGuardianId, {
          event_type: 'FEED',
          occurred_at: '11:40',
          payload: { milk_type: 'FORMULA', amount: 150 },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-child creation when user lacks access to child B', async () => {
      await expect(
        service.createManualEvent(mockChildIdB, mockCaregiverId, {
          event_type: 'FEED',
          occurred_at: '11:40',
          payload: { milk_type: 'FORMULA', amount: 150 },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Deterministic Sleep Duration & Daily Aggregation', () => {
    it('computes deterministic sleep duration between SLEEP_START and SLEEP_END', async () => {
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_START',
        occurred_at: '2026-09-17T13:10:00+08:00',
        payload: {},
      });

      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_END',
        occurred_at: '2026-09-17T14:35:00+08:00',
        payload: {},
      });

      const timeline = await service.getTimeline(mockChildIdA, mockCaregiverId, {
        date: '2026-09-17',
      });

      const sleepEndItem = timeline.items.find((x) => x.event_type === 'SLEEP_END');
      expect(sleepEndItem).toBeDefined();
      expect(sleepEndItem?.duration_text).toBe('本次午睡 1小時25分');
    });

    it('computes deterministic daily summary metrics', async () => {
      // Create milk: 150ml and 180ml
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '2026-09-17T09:00:00+08:00',
        payload: { milk_type: 'FORMULA', amount: 150 },
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '2026-09-17T12:00:00+08:00',
        payload: { milk_type: 'FORMULA', amount: 180 },
      });
      // Diaper: 2 times
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'DIAPER',
        occurred_at: '2026-09-17T10:00:00+08:00',
        payload: { condition: 'WET' },
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'DIAPER',
        occurred_at: '2026-09-17T14:00:00+08:00',
        payload: { condition: 'SOILED' },
      });
      // Temperature
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'TEMPERATURE',
        occurred_at: '2026-09-17T08:30:00+08:00',
        payload: { value_celsius: 36.6 },
      });
      // Sleep
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_START',
        occurred_at: '2026-09-17T13:10:00+08:00',
        payload: {},
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_END',
        occurred_at: '2026-09-17T14:35:00+08:00',
        payload: {},
      });

      const summary = await service.getDailySummaryMetrics(mockChildIdA, mockCaregiverId, '2026-09-17');
      expect(summary.feed_count).toBe(2);
      expect(summary.total_feed_amount_ml).toBe(330);
      expect(summary.diaper_count).toBe(2);
      expect(summary.latest_temperature).toBe(36.6);
      expect(summary.sleep_segments).toBe(1);
      expect(summary.total_sleep_minutes).toBe(85); // 1h25m
      expect(summary.sleep_duration_text).toBe('1h25m');
    });
  });

  describe('4. Parent Read Status & Calendar Breakdown', () => {
    it('records and retrieves real parent read status', async () => {
      // Initially not viewed
      const timelineBefore = await service.getTimeline(mockChildIdA, mockCaregiverId, {
        date: '2026-09-17',
      });
      expect(timelineBefore.parent_read_status?.viewed).toBe(false);

      // Guardian reads log
      const viewResult = await service.recordDailyLogView(mockChildIdA, mockGuardianId, {
        care_date: '2026-09-17',
      });
      expect(viewResult.viewed).toBe(true);

      // Now timeline reflects viewed = true
      const timelineAfter = await service.getTimeline(mockChildIdA, mockCaregiverId, {
        date: '2026-09-17',
      });
      expect(timelineAfter.parent_read_status?.viewed).toBe(true);
      expect(timelineAfter.parent_read_status?.viewed_at).toBeDefined();
    });

    it('getMonthSummary provides deterministic breakdown per day', async () => {
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '2026-09-17T09:00:00+08:00',
        payload: { milk_type: 'FORMULA', amount: 150 },
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '2026-09-17T12:00:00+08:00',
        payload: { milk_type: 'FORMULA', amount: 180 },
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_START',
        occurred_at: '2026-09-17T13:10:00+08:00',
        payload: {},
      });
      await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'SLEEP_END',
        occurred_at: '2026-09-17T14:35:00+08:00',
        payload: {},
      });

      const calendar = await service.getMonthSummary(mockChildIdA, mockCaregiverId, '2026-09');
      expect(calendar['2026-09-17']).toBeDefined();
      expect(calendar['2026-09-17'].confirmed_count).toBeGreaterThan(0);
      expect(calendar['2026-09-17'].breakdown.feed).toBe(2);
      expect(calendar['2026-09-17'].breakdown.sleep).toBe(2); // SLEEP_START + SLEEP_END
    });
  });

  describe('5. Event Correction & Void', () => {
    it('creates revision 2 upon correction with audit log preservation', async () => {
      const feed = await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'FEED',
        occurred_at: '2026-09-17T11:40:00+08:00',
        payload: { milk_type: 'FORMULA', amount: 150 },
      });

      const corrected = await service.createCorrection(feed.event_id, mockCaregiverId, {
        action: 'CORRECT',
        expected_revision_no: 1,
        reason: '家長更正喝奶量為 180ml',
        payload: { amount: 180 },
      });

      expect(corrected.revision_no).toBe(2);
      expect(corrected.status).toBe('CORRECTED');
      expect(corrected.payload.amount).toBe(180);
      expect(corrected.reason).toBe('家長更正喝奶量為 180ml');

      // VOID event
      const voided = await service.createCorrection(feed.event_id, mockCaregiverId, {
        action: 'VOID',
        expected_revision_no: 2,
        reason: '誤植記錄，作廢',
      });

      expect(voided.status).toBe('VOID');
      expect(voided.revision_no).toBe(3);
    });
  });

  describe('6. Manual Entry Transaction Rollback Invariant', () => {
    it('rolls back completely if AuditLog creation fails', async () => {
      (prisma.auditLog.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('AuditLog database write failed');
      });

      // Emulate real transaction rollback in mockPrisma.$transaction
      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const eventsBefore = [...inMemoryEvents];
        const revisionsBefore = [...inMemoryRevisions];
        try {
          return await cb(prisma);
        } catch (err) {
          inMemoryEvents = eventsBefore;
          inMemoryRevisions = revisionsBefore;
          throw err;
        }
      });

      await expect(
        service.createManualEvent(mockChildIdA, mockCaregiverId, {
          event_type: 'FEED',
          occurred_at: '2026-09-17T10:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 120 },
        }),
      ).rejects.toThrow('AuditLog database write failed');

      expect(inMemoryEvents.length).toBe(0);
      expect(inMemoryRevisions.length).toBe(0);
    });
  });

  describe('7. GuardianInstruction Lifecycle & Medication Authority', () => {
    it('allows only Guardian to create instruction', async () => {
      const instruction = await service.createGuardianInstruction(mockChildIdA, mockGuardianId, {
        instruction_type: 'MEDICATION',
        content: '每日下午用藥叮嚀',
      });
      expect(instruction.id).toBeDefined();
      expect(instruction.content).toBe('每日下午用藥叮嚀');

      // Caregiver cannot create instruction
      await expect(
        service.createGuardianInstruction(mockChildIdA, mockCaregiverId, {
          instruction_type: 'MEDICATION',
          content: '保母偽造醫囑',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows only Guardian to revoke instruction', async () => {
      const instruction = await service.createGuardianInstruction(mockChildIdA, mockGuardianId, {
        instruction_type: 'MEDICATION',
        content: '用藥醫囑 A',
      });

      // Caregiver cannot revoke
      await expect(
        service.revokeGuardianInstruction(mockChildIdA, instruction.id, mockCaregiverId),
      ).rejects.toThrow(ForbiddenException);

      // Guardian revokes
      const revoked = await service.revokeGuardianInstruction(mockChildIdA, instruction.id, mockGuardianId);
      expect(revoked.revoked_at).toBeDefined();
    });

    it('rejects attaching revoked instruction to manual medication event', async () => {
      const instruction = await service.createGuardianInstruction(mockChildIdA, mockGuardianId, {
        instruction_type: 'MEDICATION',
        content: '已過期醫囑',
      });
      await service.revokeGuardianInstruction(mockChildIdA, instruction.id, mockGuardianId);

      await expect(
        service.createManualEvent(mockChildIdA, mockCaregiverId, {
          event_type: 'MEDICATION',
          occurred_at: '2026-09-17T14:00:00+08:00',
          payload: { medication_name: '感冒糖漿', dosage_text: '5ml', administered_at: '14:00' },
          guardian_instruction_id: instruction.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects attaching instruction belonging to another child', async () => {
      const otherChildInstruction = {
        id: 'inst-other-child',
        child_id: mockChildIdB,
        created_by_guardian_user_id: mockGuardianId,
        instruction_type: 'MEDICATION',
        content: '另一個小孩的醫囑',
        created_at: new Date(),
        revoked_at: null,
      };
      inMemoryInstructions.push(otherChildInstruction);

      await expect(
        service.createManualEvent(mockChildIdA, mockCaregiverId, {
          event_type: 'MEDICATION',
          occurred_at: '2026-09-17T14:00:00+08:00',
          payload: { medication_name: '感冒糖漿', dosage_text: '5ml', administered_at: '14:00' },
          guardian_instruction_id: 'inst-other-child',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('attaches valid instruction with provenance metadata', async () => {
      const instruction = await service.createGuardianInstruction(mockChildIdA, mockGuardianId, {
        instruction_type: 'MEDICATION',
        content: '咳嗽藥水 5ml',
      });

      const event = await service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'MEDICATION',
        occurred_at: '2026-09-17T14:00:00+08:00',
        payload: { medication_name: '止咳糖漿', dosage_text: '5ml', administered_at: '14:00' },
        guardian_instruction_id: instruction.id,
      });

      expect(event.source_type).toBe('MANUAL');
      expect(event.guardian_instruction_id).toBe(instruction.id);
      expect(event.provenance_text).toContain('咳嗽藥水 5ml');
    });
    it('a parent comment cannot serve as medication authorization', async () => {
      const note = await service.createGuardianInstruction(mockChildIdA, mockGuardianId, { instruction_type: 'COMMENT', content: '合成一般留言' });
      await expect(service.createManualEvent(mockChildIdA, mockCaregiverId, {
        event_type: 'MEDICATION', occurred_at: '2026-09-17T14:00:00+08:00',
        payload: { medication_name: '合成測試藥名', dosage_text: '5ml', administered_at: '14:00' },
        guardian_instruction_id: note.id,
      })).rejects.toThrow('not medication authorization');
    });
  });

  describe('8. Guardian Read Receipt Authorization', () => {
    it('enforces guardian-only authorization for daily log read receipts', async () => {
      // Caregiver cannot record daily log read receipts
      await expect(
        service.recordDailyLogView(mockChildIdA, mockCaregiverId, {
          care_date: '2026-09-17',
        }),
      ).rejects.toThrow(ForbiddenException);

      // Guardian succeeds
      const res = await service.recordDailyLogView(mockChildIdA, mockGuardianId, {
        care_date: '2026-09-17',
      });
      expect(res.viewed).toBe(true);
    });
  });
});
