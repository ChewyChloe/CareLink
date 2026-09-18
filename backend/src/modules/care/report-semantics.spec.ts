import { Test, TestingModule } from '@nestjs/testing';
import { TimelineService } from './timeline.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Report Semantics & Sleep Allocation Policy', () => {
  let service: TimelineService;
  let prisma: PrismaService;

  const childId = 'test-child-report-sem';
  const caregiverId = 'test-caregiver-report-sem';
  const guardianId = 'test-guardian-report-sem';

  let events: any[] = [];
  let revisions: any[] = [];

  const mockGrant = {
    id: 'grant-sem-1',
    user_id: caregiverId,
    child_id: childId,
    role: 'CAREGIVER',
    scopes: ['CARE_READ', 'CARE_WRITE'],
    starts_at: new Date('2026-01-01'),
    ends_at: null,
    revoked_at: null,
    relationship: {
      id: 'rel-sem-1',
      status: 'ACTIVE',
      caregiver_user_id: caregiverId,
    },
  };

  beforeEach(async () => {
    events = [];
    revisions = [];

    const mockPrisma = {
      accessGrant: {
        findFirst: jest.fn().mockResolvedValue(mockGrant),
      },
      careEvent: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return events
            .filter((e) => e.child_id === where.child_id)
            .map((e) => ({
              ...e,
              revisions: revisions.filter((r) => r.care_event_id === e.id),
            }));
        }),
      },
      dailyLogView: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
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

  // Helper to add mock event with revisions
  function addMockEvent(
    id: string,
    eventType: string,
    revList: Array<{
      id: string;
      revision_no: number;
      occurred_at: string;
      payload: any;
      action?: string;
    }>,
  ) {
    const currentRev = revList[revList.length - 1];
    events.push({
      id,
      child_id: childId,
      event_type: eventType,
      current_revision_id: currentRev.id,
      attendance_session_id: null,
      source_type: 'MANUAL',
    });

    for (const r of revList) {
      revisions.push({
        id: r.id,
        care_event_id: id,
        revision_no: r.revision_no,
        occurred_at: new Date(r.occurred_at),
        payload: r.payload,
        action: r.action || (r.revision_no > 1 ? 'CORRECT' : 'RECORD'),
        confirmed_by: caregiverId,
        confirmed_at: new Date(r.occurred_at),
      });
    }
  }

  describe('1. Corrected FEED (150 -> 120 = exactly 120, never 270)', () => {
    it('calculates exactly 120ml in daily summary, ignoring superseded revision', async () => {
      addMockEvent('ev-feed-1', 'FEED', [
        {
          id: 'rev-feed-1a',
          revision_no: 1,
          occurred_at: '2026-09-17T10:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 150 },
        },
        {
          id: 'rev-feed-1b',
          revision_no: 2,
          occurred_at: '2026-09-17T10:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 120 },
        },
      ]);

      const summary = await service.getDailySummaryMetrics(childId, caregiverId, '2026-09-17');
      expect(summary.feed_count).toBe(1);
      expect(summary.total_feed_amount_ml).toBe(120); // exactly 120, not 270

      const reports = await service.getReportsData(childId, caregiverId, '2026-09');
      expect(reports.milk_total_count).toBe(1);
      expect(reports.milk_total_volume_ml).toBe(120); // exactly 120, not 270
    });
  });

  describe('2. VOID FEED = 0ml', () => {
    it('completely excludes voided events from counts and totals', async () => {
      addMockEvent('ev-feed-void', 'FEED', [
        {
          id: 'rev-void-1',
          revision_no: 1,
          occurred_at: '2026-09-17T11:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 150 },
        },
        {
          id: 'rev-void-2',
          revision_no: 2,
          occurred_at: '2026-09-17T11:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 150 },
          action: 'VOID',
        },
      ]);

      const summary = await service.getDailySummaryMetrics(childId, caregiverId, '2026-09-17');
      expect(summary.feed_count).toBe(0);
      expect(summary.total_feed_amount_ml).toBe(0);

      const reports = await service.getReportsData(childId, caregiverId, '2026-09');
      expect(reports.milk_total_count).toBe(0);
      expect(reports.milk_total_volume_ml).toBe(0);
    });
  });

  describe('3. Corrected Temperature = current only', () => {
    it('uses the current revision temperature value only', async () => {
      addMockEvent('ev-temp-1', 'TEMPERATURE', [
        {
          id: 'rev-temp-1a',
          revision_no: 1,
          occurred_at: '2026-09-17T09:00:00+08:00',
          payload: { value_celsius: 38.5, measurement_site: '額溫' },
        },
        {
          id: 'rev-temp-1b',
          revision_no: 2,
          occurred_at: '2026-09-17T09:00:00+08:00',
          payload: { value_celsius: 37.0, measurement_site: '額溫' },
        },
      ]);

      const summary = await service.getDailySummaryMetrics(childId, caregiverId, '2026-09-17');
      expect(summary.latest_temperature).toBe(37.0); // current only, not 38.5
    });
  });

  describe('4. Cross-Midnight Sleep & Month Boundary Allocation', () => {
    it('splits sleep 2026-09-30 23:30 -> 2026-10-01 00:30 into 30m on 9/30 and 30m on 10/1', async () => {
      addMockEvent('ev-sleep-start', 'SLEEP_START', [
        {
          id: 'rev-sleep-s1',
          revision_no: 1,
          occurred_at: '2026-09-30T23:30:00+08:00',
          payload: {},
        },
      ]);
      addMockEvent('ev-sleep-end', 'SLEEP_END', [
        {
          id: 'rev-sleep-e1',
          revision_no: 1,
          occurred_at: '2026-10-01T00:30:00+08:00',
          payload: {},
        },
      ]);

      // Day 9/30 daily summary
      const summarySept30 = await service.getDailySummaryMetrics(childId, caregiverId, '2026-09-30');
      expect(summarySept30.sleep_segments).toBe(1);
      expect(summarySept30.total_sleep_minutes).toBe(30);

      // Day 10/1 daily summary
      const summaryOct1 = await service.getDailySummaryMetrics(childId, caregiverId, '2026-10-01');
      expect(summaryOct1.sleep_segments).toBe(1);
      expect(summaryOct1.total_sleep_minutes).toBe(30);

      // September monthly report: receives exactly 30 minutes
      const reportSept = await service.getReportsData(childId, caregiverId, '2026-09');
      const sept30Sleep = reportSept.sleep_trend.find((d) => d.date === '2026-09-30');
      expect(sept30Sleep?.total_minutes).toBe(30);

      // October monthly report: receives exactly 30 minutes
      const reportOct = await service.getReportsData(childId, caregiverId, '2026-10');
      const oct1Sleep = reportOct.sleep_trend.find((d) => d.date === '2026-10-01');
      expect(oct1Sleep?.total_minutes).toBe(30);
    });
  });

  describe('5. PLANNED Events Excluded from ACTUAL Metrics', () => {
    it('excludes PLANNED events from daily metrics and report actuals', async () => {
      addMockEvent('ev-planned-feed', 'FEED', [
        {
          id: 'rev-pfeed',
          revision_no: 1,
          occurred_at: '2026-09-17T15:00:00+08:00',
          payload: { milk_type: 'FORMULA', amount: 200, temporal_status: 'PLANNED' },
        },
      ]);
      addMockEvent('ev-planned-pickup', 'PLANNED_PICKUP', [
        {
          id: 'rev-ppickup',
          revision_no: 1,
          occurred_at: '2026-09-17T17:00:00+08:00',
          payload: { pickup_time: '17:30', person: '媽媽' },
        },
      ]);

      const summary = await service.getDailySummaryMetrics(childId, caregiverId, '2026-09-17');
      expect(summary.feed_count).toBe(0);
      expect(summary.total_feed_amount_ml).toBe(0);

      const reports = await service.getReportsData(childId, caregiverId, '2026-09');
      expect(reports.milk_total_count).toBe(0);
      expect(reports.milk_total_volume_ml).toBe(0);
    });
  });

  describe('6. Attendance Days Deduplication', () => {
    it('does not inflate attendance days on duplicate check events or multiple entries', async () => {
      addMockEvent('ev-cin-1', 'CHECK_IN', [
        {
          id: 'rev-cin-1',
          revision_no: 1,
          occurred_at: '2026-09-17T08:30:00+08:00',
          payload: {},
        },
      ]);
      addMockEvent('ev-cin-2', 'CHECK_IN', [
        {
          id: 'rev-cin-2',
          revision_no: 1,
          occurred_at: '2026-09-17T08:35:00+08:00',
          payload: {},
        },
      ]);
      addMockEvent('ev-cout-1', 'CHECK_OUT', [
        {
          id: 'rev-cout-1',
          revision_no: 1,
          occurred_at: '2026-09-17T16:30:00+08:00',
          payload: {},
        },
      ]);

      const reports = await service.getReportsData(childId, caregiverId, '2026-09');
      expect(reports.attendance_days).toBe(1); // exactly 1, not 3
    });
  });
});
