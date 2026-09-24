import { FlexMessageBuilder, FlexDraftBatchData } from './flex-message.builder';
import { ExtractionWorker } from '../../jobs/extraction.worker';
import { DraftService } from '../../care/draft.service';

describe('Stage 6.5.1: Flex Message Builder & Golden Path Regression Tests', () => {
  const miniAppChannelId = '2011632269';

  describe('Flex Presentation of "11:40喝150ml，13:10睡著"', () => {
    it('should format FEED and SLEEP_START with valid times and amounts, never Invalid Date', () => {
      // Test both with raw time-of-day strings (HH:mm) and normalized ISO 8601 strings
      const mockFlexDataRawTimes: FlexDraftBatchData = {
        id: 'draft_test_123',
        child_alias: '湯圓',
        status: 'PENDING_CONFIRMATION',
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '11:40',
            payload: {
              feed_type: 'FORMULA',
              amount: 150,
              amount_unit: 'ml',
            },
            missing_fields: [],
          },
          {
            item_index: 1,
            event_type: 'SLEEP_START',
            temporal_status: 'ACTUAL',
            occurred_at: '13:10',
            payload: {
              sleep_type: 'NAP',
            },
            missing_fields: [],
          },
        ],
        created_at: new Date('2026-09-17T03:40:00.000Z'),
        expires_at: new Date('2026-09-18T03:40:00.000Z'),
      };

      const bubbleRaw = FlexMessageBuilder.buildDraftConfirmationFlex(mockFlexDataRawTimes, miniAppChannelId);
      const bubbleRawJson = JSON.stringify(bubbleRaw);

      // Verify no "Invalid Date"
      expect(bubbleRawJson).not.toContain('Invalid Date');

      // Verify Redesigned Brand & Title Hierarchy
      expect(bubbleRawJson).toContain('CareLink');
      expect(bubbleRawJson).toContain('湯圓的今日照護');
      expect(bubbleRawJson).toContain('待確認');
      expect(bubbleRawJson).toContain('CareLink AI 已整理好，請家長確認內容。');

      // Verify FEED content
      expect(bubbleRawJson).toContain('11:40');
      expect(bubbleRawJson).toContain('150 ml');
      expect(bubbleRawJson).toContain('配方奶');

      // Verify SLEEP_START content
      expect(bubbleRawJson).toContain('13:10');
      expect(bubbleRawJson).toContain('開始午睡');

      // Verify Actions hierarchy
      expect(bubbleRawJson).toContain('確認 2 筆記錄');
      expect(bubbleRawJson).toContain('查看 / 修改');
      expect(bubbleRawJson).toContain('捨棄');

      // Also test with ISO 8601 strings (2026-09-17T03:40:00.000Z is 11:40 UTC+8)
      const mockFlexDataIso: FlexDraftBatchData = {
        ...mockFlexDataRawTimes,
        items: [
          {
            item_index: 0,
            event_type: 'FEED',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-17T03:40:00.000Z',
            payload: {
              feed_type: 'FORMULA',
              amount: 150,
              amount_ml: 150,
              amount_unit: 'ml',
            },
            missing_fields: [],
          },
          {
            item_index: 1,
            event_type: 'SLEEP_START',
            temporal_status: 'ACTUAL',
            occurred_at: '2026-09-17T05:10:00.000Z',
            payload: {
              sleep_type: 'NAP',
            },
            missing_fields: [],
          },
        ],
      };

      const bubbleIso = FlexMessageBuilder.buildDraftConfirmationFlex(mockFlexDataIso, miniAppChannelId);
      const bubbleIsoJson = JSON.stringify(bubbleIso);

      expect(bubbleIsoJson).not.toContain('Invalid Date');
      expect(bubbleIsoJson).toContain('11:40');
      expect(bubbleIsoJson).toContain('150 ml');
      expect(bubbleIsoJson).toContain('配方奶');
      expect(bubbleIsoJson).toContain('13:10');
      expect(bubbleIsoJson).toContain('開始午睡');
      expect(bubbleIsoJson).toContain('確認 2 筆');
    });

    it('should build confirmed success card with friendly copy and no billing language', () => {
      const successBubble = FlexMessageBuilder.buildConfirmedSuccessFlex('湯圓', 2, miniAppChannelId);
      const str = JSON.stringify(successBubble);

      expect(str).toContain('✓ 已記錄');
      expect(str).toContain('湯圓的 2 筆照護紀錄');
      expect(str).toContain('已加入今天的時間軸');
      expect(str).toContain('查看今天的紀錄');
      expect(str).not.toContain('照護紀錄已入帳');
      expect(str).not.toContain('受託幼兒');
    });
  });

  describe('Timezone Boundary Handling (Asia/Taipei UTC+8)', () => {
    const worker = new ExtractionWorker(null as any, null as any, null as any, null as any, null as any);

    it('should resolve HH:mm correctly across UTC midnight boundary', () => {
      // 2026-09-16T23:30:00.000Z in UTC is 2026-09-17T07:30:00+08:00 in Taipei
      const messageSentAt = new Date('2026-09-16T23:30:00.000Z');

      const resolvedIso = worker.resolveOccurredAtToIso('07:30', messageSentAt);
      expect(resolvedIso).toBeDefined();

      // The resolved ISO string should be 2026-09-16T23:30:00.000Z
      const resolvedDate = new Date(resolvedIso!);
      expect(resolvedDate.toISOString()).toBe('2026-09-16T23:30:00.000Z');

      // Formatted in Asia/Taipei should be 07:30 on 2026-09-17
      const taipeiTime = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(resolvedDate);
      expect(taipeiTime).toBe('07:30');

      const taipeiDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
      }).format(resolvedDate);
      expect(taipeiDate).toBe('2026-09-17');
    });

    it('should format Flex card correctly for events occurring in morning UTC+8', () => {
      const morningIso = '2026-09-16T23:30:00.000Z'; // 07:30 Taipei
      const flexData: FlexDraftBatchData = {
        id: 'draft_boundary',
        child_alias: '湯圓',
        status: 'PENDING_CONFIRMATION',
        lock_version: 1,
        items: [
          {
            item_index: 0,
            event_type: 'CHECK_IN',
            temporal_status: 'ACTUAL',
            occurred_at: morningIso,
            payload: {},
            missing_fields: [],
          },
        ],
        created_at: new Date('2026-09-16T23:35:00.000Z'),
        expires_at: new Date('2026-09-17T23:35:00.000Z'),
      };

      const bubble = FlexMessageBuilder.buildDraftConfirmationFlex(flexData, miniAppChannelId);
      const bubbleJson = JSON.stringify(bubble);

      expect(bubbleJson).not.toContain('Invalid Date');
      expect(bubbleJson).toContain('07:30');
    });
  });
});
