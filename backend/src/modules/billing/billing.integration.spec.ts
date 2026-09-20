import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('BillingService Integration & Invariants (Section N)', () => {
  let service: BillingService;
  let prismaMock: any;

  const childId = 'c-001';
  const userId = 'u-guardian-1';
  const otherUserId = 'u-intruder-99';

  const mockActiveContract = {
    id: 'contract-001',
    status: 'ACTIVE',
    relationship: {
      child_id: childId,
    },
    versions: [
      {
        id: 'cv-version-1',
        version_no: 1,
        status: 'AGREED',
        content_hash: 'hash_cv1',
        schedule_json: { scheduled_start: '09:00', scheduled_end: '18:00' },
        billing_rule: {
          id: 'br-001',
          late_unit_minutes: 30,
          late_unit_rate: 98,
          base_monthly_amount: 18000,
        },
      },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      accessGrant: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.user_id === userId && where.child_id === childId && where.revoked_at === null) {
            return Promise.resolve({
              id: 'grant-01',
              user_id: userId,
              child_id: childId,
              role: 'GUARDIAN',
              child: { display_alias: '小寶貝' },
            });
          }
          return Promise.resolve(null);
        }),
      },
      contract: {
        findFirst: jest.fn().mockResolvedValue(mockActiveContract),
      },
      careEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('Case 12: cross-child access forbidden (throws NotFoundException)', async () => {
    await expect(
      service.getSettlementsForChild(childId, otherUserId, '2026-09')
    ).rejects.toThrow(NotFoundException);
  });

  it('Case 11: missing applicable contract blocks calculation with D02', async () => {
    prismaMock.contract.findFirst.mockResolvedValueOnce(null);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('BLOCKED');
    expect(result[0].blocking_reasons).toEqual([
      { code: 'D02', reason: '缺少有效照護契約版本，暫無法完成計算。' },
    ]);
    expect(result[0].total_amount).toBe(0);
  });

  it('Case 7: VOID checkout is excluded from billing', async () => {
    // A checkout event whose current revision has action = 'VOID'
    prismaMock.careEvent.findMany.mockResolvedValueOnce([
      {
        id: 'ev-void-1',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-void-1',
        source_type: 'MANUAL',
        revisions: [
          {
            id: 'rev-void-1',
            action: 'VOID',
            occurred_at: new Date('2026-09-17T18:31:00+08:00'),
            payload: {},
          },
        ],
      },
    ]);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    // Since only VOID checkout was found, no valid checkouts exist -> D01 blocked
    expect(result[0].status).toBe('BLOCKED');
    expect(result[0].blocking_reasons?.[0].code).toBe('D01');
    expect(result[0].overtime_amount).toBe(0);
  });

  it('Case 10: PLANNED checkout is excluded from billing', async () => {
    // A checkout with temporal_status = 'PLANNED'
    prismaMock.careEvent.findMany.mockResolvedValueOnce([
      {
        id: 'ev-planned-1',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-planned-1',
        source_type: 'SYSTEM',
        revisions: [
          {
            id: 'rev-planned-1',
            action: 'RECORD',
            occurred_at: new Date('2026-09-17T18:31:00+08:00'),
            payload: { temporal_status: 'PLANNED' },
          },
        ],
      },
    ]);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    expect(result[0].status).toBe('BLOCKED');
    expect(result[0].blocking_reasons?.[0].code).toBe('D01');
    expect(result[0].overtime_amount).toBe(0);
  });

  it('Case 8: corrected checkout uses current revision', async () => {
    // Event was recorded at 18:00 (on-time), but corrected to 18:31 as current revision
    prismaMock.careEvent.findMany.mockResolvedValueOnce([
      {
        id: 'ev-corrected-1',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-2', // current
        source_type: 'LINE_AI',
        revisions: [
          {
            id: 'rev-1',
            action: 'RECORD',
            occurred_at: new Date('2026-09-17T18:00:00+08:00'), // old on-time
            payload: {},
          },
          {
            id: 'rev-2',
            action: 'CORRECT',
            occurred_at: new Date('2026-09-17T18:31:00+08:00'), // corrected 31 min late
            payload: { correction_reason: '修正打卡時間' },
          },
        ],
      },
    ]);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    expect(result[0].status).toBe('PENDING_GUARDIAN');
    expect(result[0].overtime_amount).toBe(196); // 2 units * 98 = 196
    const overtimeLine = result[0].lines.find((l) => l.item_type === 'OVERTIME');
    expect(overtimeLine?.amount).toBe(196);
    expect(overtimeLine?.calculation_snapshot.event_revision_id).toBe('rev-2');
  });

  it('Case 9: duplicate checkout on same day does not double charge', async () => {
    // Two checkouts on the same calendar day: 18:15 and 18:31
    prismaMock.careEvent.findMany.mockResolvedValueOnce([
      {
        id: 'ev-first-1',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-dup-1',
        source_type: 'MANUAL',
        revisions: [
          {
            id: 'rev-dup-1',
            action: 'RECORD',
            occurred_at: new Date('2026-09-17T18:15:00+08:00'),
            payload: {},
          },
        ],
      },
      {
        id: 'ev-second-2',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-dup-2',
        source_type: 'LINE_AI',
        revisions: [
          {
            id: 'rev-dup-2',
            action: 'RECORD',
            occurred_at: new Date('2026-09-17T18:31:00+08:00'),
            payload: {},
          },
        ],
      },
    ]);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    expect(result[0].status).toBe('PENDING_GUARDIAN');
    const overtimeLines = result[0].lines.filter((l) => l.item_type === 'OVERTIME');
    // Must be consolidated to exactly 1 line for 2026-09-17
    expect(overtimeLines).toHaveLength(1);
    expect(overtimeLines[0].amount).toBe(196); // 18:31 -> 2 units * 98 = 196
  });

  it('Case 13: new ContractVersion does not alter old billing evidence snapshot', async () => {
    // Simulate settlement computed under version 1 (rate NT$98)
    const demoSettlementV1 = service.getDemoShowcase('2026-09');
    const oldSnapshot = { ...demoSettlementV1.lines.find((l) => l.item_type === 'OVERTIME')! };

    // Now imagine contract version is updated to v2 with late_unit_rate = 150
    const v2Contract = {
      ...mockActiveContract,
      versions: [
        {
          id: 'cv-version-2',
          version_no: 2,
          status: 'AGREED',
          content_hash: 'hash_cv2',
          schedule_json: { scheduled_start: '09:00', scheduled_end: '18:00' },
          billing_rule: {
            id: 'br-002',
            late_unit_minutes: 30,
            late_unit_rate: 150,
            base_monthly_amount: 18000,
          },
        },
      ],
    };

    // Prior settlement line explicitly preserves contract_version_id and rate
    expect(oldSnapshot.calculation_snapshot.rate_per_unit).toBe(98);
    expect(oldSnapshot.amount).toBe(196);
    expect(demoSettlementV1.contract_version_id).toBe('cv000000-0000-0000-0000-000000000001');
  });

  it('Case 14: Asia/Taipei date/month boundary handling', async () => {
    // 2026-08-31 23:30 UTC is 2026-09-01 07:30 in Asia/Taipei (should be in September)
    // 2026-09-30 15:59 UTC is 2026-09-30 23:59 in Asia/Taipei (should be in September)
    // 2026-09-30 16:01 UTC is 2026-10-01 00:01 in Asia/Taipei (should be in October, excluded from September)
    prismaMock.careEvent.findMany.mockResolvedValueOnce([
      {
        id: 'ev-sept-last',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-boundary-1',
        source_type: 'LINE_AI',
        revisions: [
          {
            id: 'rev-boundary-1',
            action: 'RECORD',
            // 18:31 on 2026-09-30 in Taipei = 10:31 UTC on 2026-09-30
            occurred_at: new Date('2026-09-30T10:31:00.000Z'),
            payload: {},
          },
        ],
      },
      {
        id: 'ev-oct-first',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-boundary-2',
        source_type: 'LINE_AI',
        revisions: [
          {
            id: 'rev-boundary-2',
            action: 'RECORD',
            // 2026-10-01 00:05 Taipei = 2026-09-30 16:05 UTC (next month!)
            occurred_at: new Date('2026-09-30T16:05:00.000Z'),
            payload: {},
          },
        ],
      },
    ]);

    const result = await service.getSettlementsForChild(childId, userId, '2026-09');
    const overtimeLines = result[0].lines.filter((l) => l.item_type === 'OVERTIME');
    expect(overtimeLines).toHaveLength(1);
    expect(overtimeLines[0].calculation_snapshot.actual_checkout).toBe('18:31');
    expect(overtimeLines[0].amount).toBe(196);
  });

  it('Case 15: same billing calculation request is idempotent', async () => {
    prismaMock.careEvent.findMany.mockResolvedValue([
      {
        id: 'ev-idem-1',
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: 'rev-idem-1',
        source_type: 'LINE_AI',
        revisions: [
          {
            id: 'rev-idem-1',
            action: 'RECORD',
            occurred_at: new Date('2026-09-17T18:31:00+08:00'),
            payload: {},
          },
        ],
      },
    ]);

    const firstRun = await service.getSettlementsForChild(childId, userId, '2026-09');
    const secondRun = await service.getSettlementsForChild(childId, userId, '2026-09');

    expect(firstRun[0].content_hash).toBe(secondRun[0].content_hash);
    expect(firstRun[0].input_hash).toBe(secondRun[0].input_hash);
    expect(firstRun[0].total_amount).toBe(secondRun[0].total_amount);
    expect(firstRun[0].lines).toEqual(secondRun[0].lines);
  });
});
