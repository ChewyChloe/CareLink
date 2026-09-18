import { FlexMessageBuilder, FlexDraftBatchData } from './flex-message.builder';

describe('Flex Message Schema Structural Validation (flex-message.schema.spec)', () => {
  const miniAppChannelId = '2011632269';

  const goldenPathData: FlexDraftBatchData = {
    id: 'draft_golden_001',
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

  it('should generate a valid LINE Flex Bubble conforming to LINE Flex specification', () => {
    const bubble = FlexMessageBuilder.buildDraftConfirmationFlex(goldenPathData, miniAppChannelId);

    // 1. Root Container
    expect(bubble.type).toBe('bubble');
    expect(['nano', 'micro', 'kilo', 'mega', 'giga']).toContain(bubble.size);

    // 2. Body Box
    expect(bubble.body).toBeDefined();
    expect(bubble.body.type).toBe('box');
    expect(['vertical', 'horizontal', 'baseline']).toContain(bubble.body.layout);
    expect(Array.isArray(bubble.body.contents)).toBe(true);
    expect(bubble.body.contents.length).toBeGreaterThan(0);

    // 3. Footer Box
    expect(bubble.footer).toBeDefined();
    expect(bubble.footer.type).toBe('box');
    expect(['vertical', 'horizontal', 'baseline']).toContain(bubble.footer.layout);
    expect(Array.isArray(bubble.footer.contents)).toBe(true);

    // 4. Primary and Secondary Buttons in Footer
    const primaryBtn = bubble.footer.contents[0];
    expect(primaryBtn.type).toBe('button');
    expect(primaryBtn.style).toBe('primary');
    expect(primaryBtn.action).toBeDefined();
    expect(primaryBtn.action.type).toBe('postback');
    expect(primaryBtn.action.label).toBe('確認 2 筆');

    const secondaryRow = bubble.footer.contents[1];
    expect(secondaryRow.type).toBe('box');
    expect(secondaryRow.layout).toBe('horizontal');
    expect(secondaryRow.contents).toHaveLength(2);
    expect(secondaryRow.contents[0].type).toBe('button');
    expect(secondaryRow.contents[0].action.label).toBe('查看／修改');
    expect(secondaryRow.contents[1].type).toBe('button');
    expect(secondaryRow.contents[1].action.label).toBe('捨棄');

    // 5. Check serialization integrity
    const serialized = JSON.stringify(bubble);
    expect(serialized).not.toContain('undefined');
    expect(serialized).not.toContain('NaN');
    expect(serialized).not.toContain('Invalid Date');
    expect(serialized).toContain('湯圓的今日照護');
    expect(serialized).toContain('11:40');
    expect(serialized).toContain('150 ml · 配方奶');
    expect(serialized).toContain('13:10');
    expect(serialized).toContain('開始午睡');
    expect(serialized).toContain('AI 已整理好，請確認內容。');
  });

  it('should generate a valid Success Flex Bubble conforming to LINE Flex specification', () => {
    const successBubble = FlexMessageBuilder.buildConfirmedSuccessFlex('湯圓', 2, miniAppChannelId);

    expect(successBubble.type).toBe('bubble');
    expect(successBubble.body).toBeDefined();
    expect(successBubble.footer).toBeDefined();

    const serialized = JSON.stringify(successBubble);
    expect(serialized).not.toContain('照護紀錄已入帳');
    expect(serialized).not.toContain('受託幼兒');
    expect(serialized).toContain('✓ 已記錄');
    expect(serialized).toContain('湯圓的 2 筆照護紀錄');
    expect(serialized).toContain('已加入今天的時間軸');
    expect(serialized).toContain('查看今天的紀錄');
  });
});
