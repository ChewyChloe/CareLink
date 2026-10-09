export interface FlexDraftItem {
  item_index: number;
  event_type: string;
  temporal_status?: string;
  occurred_at: string;
  payload: Record<string, any>;
  missing_fields?: string[];
  source_span?: string;
}

export interface FlexDraftBatchData {
  id: string;
  child_id?: string | null;
  child_alias?: string;
  status: string;
  lock_version: number;
  items: FlexDraftItem[];
  created_at: string | Date;
  expires_at: string | Date;
}

export class FlexMessageBuilder {
  /**
   * Translates internal event_type to user-friendly label and icon.
   */
  public static getEventTypeDisplay(eventType: string): { label: string; icon: string; color: string } {
    switch (eventType) {
      case 'FEED':
        return { label: '喝奶', icon: '🍼', color: '#466B53' };
      case 'SLEEP_START':
        return { label: '開始午睡', icon: '😴', color: '#466B53' };
      case 'SLEEP_END':
        return { label: '醒來', icon: '⏰', color: '#466B53' };
      case 'CHECK_IN':
        return { label: '抵達簽到', icon: '📍', color: '#466B53' };
      case 'CHECK_OUT':
        return { label: '接回簽退', icon: '🚪', color: '#466B53' };
      case 'MEAL':
        return { label: '用餐', icon: '🥣', color: '#466B53' };
      case 'NIGHT_STAY':
        return { label: '過夜住宿', icon: '🌙', color: '#466B53' };
      case 'PLANNED_PICKUP':
        return { label: '預約接回', icon: '⏱️', color: '#466B53' };
      default:
        return { label: eventType, icon: '📝', color: '#555555' };
    }
  }

  /**
   * Formats item payload into readable summary string.
   */
  public static formatItemSummary(item: FlexDraftItem): string {
    if (item.missing_fields?.includes('requires_manual_entry')) return '此項尚未記錄；請改用手動記錄';
    const p = item.payload || {};
    const parts: string[] = [];

    const amount = p.amount !== undefined ? p.amount : p.amount_ml;
    const unit = p.amount_unit || (amount !== undefined ? '單位未指定' : '');
    if (amount !== undefined) {
      parts.push(`${amount} ${unit}`.trim());
    }

    if (p.feed_type) {
      const ftMap: Record<string, string> = { FORMULA: '配方奶', BREAST_MILK: '母乳', COW_MILK: '鮮奶' };
      parts.push(ftMap[p.feed_type] || p.feed_type);
    }
    if (p.meal_type) parts.push(`餐別: ${p.meal_type}`);
    if (p.solid_food_name) parts.push(p.solid_food_name);
    if (p.portions) parts.push(`${p.portions} 份`);
    if (p.diaper_type) parts.push(`尿布: ${p.diaper_type}`);
    if (p.notes) parts.push(p.notes);

    if (parts.length === 0) {
      if (item.event_type === 'SLEEP_START') return '';
      if (item.event_type === 'CHECK_IN') return '抵達托育場所';
      if (item.event_type === 'CHECK_OUT') return '家長接回簽退';
      return '';
    }

    return parts.join(' · ');
  }

  /**
   * Formats an ISO date string or HH:mm time to Taiwan local display time (HH:mm).
   * Guaranteed never to produce "Invalid Date".
   */
  public static formatTime(rawTime: string): string {
    if (!rawTime || typeof rawTime !== 'string') {
      return '';
    }
    const trimmed = rawTime.trim();

    // 1. If already HH:mm or H:mm format, return normalized HH:mm directly
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [h, m] = trimmed.split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }

    // 2. Parse ISO string / full date in Asia/Taipei
    try {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) {
        return trimmed;
      }
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return trimmed;
    }
  }

  /**
   * Formats date to YYYY/MM/DD.
   */
  public static formatDate(dateInput: string | Date): string {
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      return date.toLocaleDateString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return '';
    }
  }

  /**
   * Formats date to friendly Taiwan format (M 月 D 日).
   */
  public static formatFriendlyDate(dateInput: string | Date): string {
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      const parts = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: 'numeric',
        day: 'numeric',
      }).formatToParts(date);
      const m = parts.find((p) => p.type === 'month')?.value;
      const d = parts.find((p) => p.type === 'day')?.value;
      if (m && d) {
        return `${m} 月 ${d} 日`;
      }
      return this.formatDate(dateInput);
    } catch {
      return '';
    }
  }

  /**
   * Helper to determine day period (上午 / 午後 / 晚上) from raw time.
   */
  public static getDayPeriod(rawTime: string): string {
    const formatted = this.formatTime(rawTime);
    if (!formatted || !formatted.includes(':')) return '';
    const hour = parseInt(formatted.split(':')[0], 10);
    if (isNaN(hour)) return '';
    if (hour < 12) return '上午';
    if (hour < 18) return '午後';
    return '晚上';
  }

  /**
   * Helper to extract subtype badge tag and detail summary text from a draft item.
   */
  public static getItemDisplayDetails(item: FlexDraftItem): {
    tag?: string;
    summary: string;
  } {
    const p = item.payload || {};
    let tag: string | undefined;
    const parts: string[] = [];

    if (item.event_type === 'FEED') {
      if (p.feed_type) {
        const ftMap: Record<string, string> = {
          FORMULA: '配方奶',
          BREAST_MILK: '母乳',
          COW_MILK: '鮮奶',
        };
        tag = ftMap[p.feed_type] || p.feed_type;
      }
      const amount = p.amount !== undefined ? p.amount : p.amount_ml;
      const unit = p.amount_unit || (amount !== undefined ? 'ml' : '');
      if (amount !== undefined) {
        parts.push(`${amount} ${unit}`.trim());
      }
      if (p.appetite) {
        parts.push(`食慾${p.appetite}`);
      } else if (p.notes) {
        parts.push(p.notes);
      } else if (item.source_span && item.source_span.includes('食慾正常')) {
        parts.push('食慾正常');
      }
    } else if (item.event_type === 'SLEEP_START') {
      if (p.location) {
        const locMap: Record<string, string> = { CRIB: '嬰兒床', BED: '大床', MAT: '地墊' };
        tag = locMap[p.location] || p.location;
      } else if (p.sleep_type) {
        const stMap: Record<string, string> = { NAP: '嬰兒床', NIGHT: '夜間' };
        tag = stMap[p.sleep_type] || p.sleep_type;
      }
      if (p.notes) {
        parts.push(p.notes);
      } else {
        parts.push('已入睡 · 狀態穩定');
      }
    } else if (item.event_type === 'SLEEP_END') {
      tag = '清醒';
      if (p.notes) parts.push(p.notes);
      else parts.push('精神良好');
    } else if (item.event_type === 'MEAL') {
      if (p.meal_type) tag = p.meal_type;
      if (p.solid_food_name) parts.push(p.solid_food_name);
      if (p.portions) parts.push(`${p.portions} 份`);
      if (p.notes) parts.push(p.notes);
    } else {
      if (p.notes) parts.push(p.notes);
    }

    if (parts.length === 0 && !tag) {
      return { summary: this.formatItemSummary(item) };
    }

    return {
      tag,
      summary: parts.join(' · '),
    };
  }

  /**
   * Generates a LINE Flex Message bubble container for a DraftBatch.
   * Redesigned with warm tactile aesthetic, brand green (#3B4B3D), record cards, and editorial hierarchy.
   */
  public static buildDraftConfirmationFlex(
    draft: FlexDraftBatchData,
    miniAppChannelId: string,
  ): Record<string, any> {
    const childName = draft.child_alias || '幼兒';
    const dateStr = this.formatFriendlyDate(draft.created_at);
    const hasMissingFields = draft.items.some(
      (it) => it.missing_fields && it.missing_fields.length > 0,
    );

    const statusBadge = hasMissingFields
      ? { text: '需補填', color: '#A04437', bg: '#FFEBEE', border: '#FFCDD2' }
      : { text: '待確認', color: '#4A463F', bg: '#EFECE4', border: '#E2DDD3' };

    // Record card items
    const recordCards: any[] = [];

    draft.items.forEach((item) => {
      const display = this.getEventTypeDisplay(item.event_type);
      const time = this.formatTime(item.occurred_at);
      const period = this.getDayPeriod(item.occurred_at);
      const details = this.getItemDisplayDetails(item);
      const itemMissing = item.missing_fields && item.missing_fields.length > 0;

      // Event title row with optional tag pill
      const titleRowContents: any[] = [
        {
          type: 'text',
          text: display.label,
          weight: 'bold',
          size: 'sm',
          color: '#1C1A17',
          flex: 0,
        },
      ];

      if (details.tag) {
        titleRowContents.push({
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F2EFE8',
          borderColor: '#E5E0D5',
          borderWidth: 'light',
          cornerRadius: 'sm',
          paddingStart: 'xs',
          paddingEnd: 'xs',
          paddingTop: 'none',
          paddingBottom: 'none',
          justifyContent: 'center',
          flex: 0,
          contents: [
            {
              type: 'text',
              text: details.tag,
              size: 'xxs',
              color: '#5C564D',
              weight: 'bold',
            },
          ],
        });
      }

      const middleContents: any[] = [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          alignItems: 'center',
          contents: titleRowContents,
        },
      ];

      if (details.summary) {
        middleContents.push({
          type: 'text',
          text: details.summary,
          size: 'xs',
          color: '#78736A',
          margin: 'xs',
          wrap: true,
        });
      }

      if (itemMissing) {
        middleContents.push({
          type: 'text',
          text: `⚠️ 缺少必填: ${item.missing_fields!.join(', ')}`,
          size: 'xxs',
          color: '#A04437',
          margin: 'xs',
          wrap: true,
        });
      }

      const timeContents: any[] = [
        {
          type: 'text',
          text: time,
          weight: 'bold',
          size: 'xs',
          color: '#1C1A17',
          align: 'end',
        },
      ];

      if (period) {
        timeContents.push({
          type: 'text',
          text: period,
          size: 'xxs',
          color: '#8C867C',
          align: 'end',
        });
      }

      recordCards.push({
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#FFFFFF',
        borderColor: '#EBE7DF',
        borderWidth: 'light',
        cornerRadius: 'md',
        paddingAll: 'md',
        spacing: 'md',
        alignItems: 'center',
        contents: [
          // Icon box
          {
            type: 'box',
            layout: 'vertical',
            width: '34px',
            height: '34px',
            backgroundColor: '#F5F2EB',
            borderColor: '#E6E2D8',
            borderWidth: 'light',
            cornerRadius: 'md',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 0,
            contents: [
              {
                type: 'text',
                text: display.icon,
                size: 'sm',
                align: 'center',
              },
            ],
          },
          // Middle content
          {
            type: 'box',
            layout: 'vertical',
            flex: 5,
            contents: middleContents,
          },
          // Right time
          {
            type: 'box',
            layout: 'vertical',
            alignItems: 'flex-end',
            justifyContent: 'center',
            flex: 2,
            contents: timeContents,
          },
        ],
      });
    });

    const childQuery = draft.child_id ? `?child_id=${encodeURIComponent(draft.child_id)}` : '';
    const liffUrl = `https://liff.line.me/${miniAppChannelId}/${hasMissingFields ? 'entry' : 'timeline'}${childQuery}`;

    // Status Note (AI Callout banner)
    const calloutBanner = {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: '#F2EFE8',
      borderColor: '#E6E2D8',
      borderWidth: 'light',
      cornerRadius: 'md',
      paddingAll: 'sm',
      spacing: 'xs',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: '✓',
          size: 'xs',
          color: '#3B4B3D',
          weight: 'bold',
          flex: 0,
        },
        {
          type: 'text',
          text: hasMissingFields ? '草稿尚未成為照護紀錄，請改用手動記錄。' : '草稿尚未成為照護紀錄，請核對後確認。',
          size: 'xxs',
          color: '#4A463F',
          wrap: true,
          flex: 1,
        },
      ],
    };

    // Footer actions
    const footerContents: any[] = [];

    // Primary CTA: 確認 N 筆記錄
    if (!hasMissingFields) {
      footerContents.push({
        type: 'button',
        style: 'primary',
        color: '#3B4B3D',
        height: 'sm',
        action: {
          type: 'postback',
          label: `確認 ${draft.items.length} 筆記錄`,
          data: `action=confirm_draft&draft_id=${draft.id}&expected_version=${draft.lock_version}`,
          displayText: '要求確認照護紀錄',
        },
      });
    }

    // Secondary actions row: 查看 / 修改 + 捨棄
    const secondaryButtons: any[] = [
      {
        type: 'button',
        style: hasMissingFields ? 'primary' : 'link',
        color: hasMissingFields ? '#3B4B3D' : '#4A463F',
        height: 'sm',
        action: {
          type: 'uri',
          label: hasMissingFields ? '改用手動記錄' : '查看已保存紀錄',
          uri: liffUrl,
        },
      },
    ];

    if (!hasMissingFields) {
      secondaryButtons.push({
        type: 'button',
        style: 'link',
        color: '#DC2626',
        height: 'sm',
        action: {
          type: 'postback',
          label: '捨棄',
          data: `action=cancel_draft&draft_id=${draft.id}`,
          displayText: '要求捨棄草稿',
        },
      });
    }

    footerContents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: secondaryButtons,
    });

    const headerBox = {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FFFFFF',
      paddingAll: 'lg',
      paddingBottom: 'md',
      contents: [
        // Row 1: Brand dot + CARELINK, Status pill
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'xs',
              alignItems: 'center',
              flex: 4,
              contents: [
                {
                  type: 'text',
                  text: '● CARELINK',
                  weight: 'bold',
                  size: 'xxs',
                  color: '#3B4B3D',
                },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: statusBadge.bg,
              borderColor: statusBadge.border,
              borderWidth: 'light',
              cornerRadius: 'sm',
              paddingStart: 'md',
              paddingEnd: 'md',
              paddingTop: 'xs',
              paddingBottom: 'xs',
              contents: [
                {
                  type: 'text',
                  text: statusBadge.text,
                  size: 'xxs',
                  color: statusBadge.color,
                  align: 'center',
                  weight: 'bold',
                },
              ],
            },
          ],
        },
        // Row 2: Title & subtitle, Tag
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          alignItems: 'center',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              flex: 5,
              contents: [
                {
                  type: 'text',
                  text: `${childName}的今日照護`,
                  weight: 'bold',
                  size: 'md',
                  color: '#1C1A17',
                },
                {
                  type: 'text',
                  text: `${dateStr} · ${draft.items.length} 筆待確認`,
                  size: 'xs',
                  color: '#78736A',
                  margin: 'xs',
                },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 2,
              alignItems: 'flex-end',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  backgroundColor: '#F2EFE8',
                  borderColor: '#E6E2D8',
                  borderWidth: 'light',
                  cornerRadius: 'xxl',
                  paddingStart: 'md',
                  paddingEnd: 'md',
                  paddingTop: 'xs',
                  paddingBottom: 'xs',
                  contents: [
                    {
                      type: 'text',
                      text: '幼兒作息',
                      size: 'xxs',
                      color: '#78736A',
                      align: 'center',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    return {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'none',
        backgroundColor: '#FBF9F5',
        contents: [
          headerBox,
          {
            type: 'separator',
            color: '#E6E2D8',
          },
          {
            type: 'box',
            layout: 'vertical',
            paddingAll: 'md',
            spacing: 'sm',
            contents: [
              ...recordCards,
              calloutBanner,
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: 'md',
        backgroundColor: '#FBF9F5',
        contents: footerContents,
      },
      styles: {
        body: {
          backgroundColor: '#FBF9F5',
        },
        footer: {
          backgroundColor: '#FBF9F5',
          separator: true,
          separatorColor: '#EBE7DF',
        },
      },
    };
  }

  /**
   * Generates a LINE Flex Message bubble container for a confirmed CareEvent batch.
   * Redesigned with calm tone, no billing language, and consumer-friendly phrasing.
   */
  public static buildConfirmedSuccessFlex(
    childAlias: string,
    eventCount: number,
    miniAppChannelId: string,
  ): Record<string, any> {
    const liffUrl = `https://liff.line.me/${miniAppChannelId}/timeline`;

    return {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: '#FFFFFF',
        contents: [
          {
            type: 'text',
            text: '✓ 已記錄',
            weight: 'bold',
            size: 'md',
            color: '#466B53',
          },
          {
            type: 'text',
            text: `${childAlias}的 ${eventCount} 筆照護紀錄`,
            weight: 'bold',
            size: 'sm',
            color: '#293C32',
            margin: 'sm',
          },
          {
            type: 'text',
            text: '已加入今天的時間軸',
            size: 'xs',
            color: '#56665B',
            margin: 'xs',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        backgroundColor: '#FFFFFF',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#466B53',
            height: 'sm',
            action: {
              type: 'uri',
              label: '查看今天的紀錄',
              uri: liffUrl,
            },
          },
        ],
      },
    };
  }

  /**
   * Generates a LINE Flex Message bubble container for an AI Supply Draft confirmation.
   * Prompts the caregiver to confirm, modify, or cancel the draft before creating a SupplyTask.
   */
  public static buildSupplyDraftConfirmationFlex(params: {
    draftId: string;
    childAlias?: string;
    itemName: string;
    size?: string | null;
    quantity?: string | null;
    remainingQuantity?: string | null;
    dueAt?: string | Date | null;
    miniAppChannelId?: string;
  }): Record<string, any> {
    const { draftId, childAlias, itemName, size, quantity, remainingQuantity, dueAt, miniAppChannelId } = params;

    const childLabel = childAlias || '幼兒';
    const liffBase = miniAppChannelId ? `https://liff.line.me/${miniAppChannelId}` : '';
    const modifyUrl = liffBase ? `${liffBase}/handoff?draft_id=${draftId}` : 'https://line.me';

    let friendlyDue = '明天';
    if (dueAt) {
      try {
        friendlyDue = this.formatFriendlyDate(dueAt);
      } catch {
        friendlyDue = '明天';
      }
    }

    const bodyContents: any[] = [
      // Brand Header
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: 'CareLink',
            weight: 'bold',
            size: 'xs',
            color: '#56665B',
            flex: 4,
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#E8F5E9',
            cornerRadius: 'md',
            paddingStart: 'sm',
            paddingEnd: 'sm',
            paddingTop: 'xs',
            paddingBottom: 'xs',
            contents: [
              {
                type: 'text',
                text: '用品提醒草稿',
                size: 'xxs',
                color: '#2E7D32',
                align: 'center',
                weight: 'bold',
              },
            ],
          },
        ],
      },
      // Title
      {
        type: 'text',
        text: `${childLabel} · ${itemName}${size ? ` (${size}號)` : ''}`,
        weight: 'bold',
        size: 'md',
        color: '#293C32',
        margin: 'lg',
        wrap: true,
      },
      // Details Box
      {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'sm',
        backgroundColor: '#F7F9F6',
        paddingAll: 'md',
        cornerRadius: 'md',
        contents: [
          ...(remainingQuantity
            ? [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: '剩餘庫存', size: 'xs', color: '#6D776C', flex: 3 },
                    { type: 'text', text: remainingQuantity, size: 'xs', color: '#293C32', weight: 'bold', flex: 5 },
                  ],
                },
              ]
            : []),
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '建議補充', size: 'xs', color: '#6D776C', flex: 3 },
              { type: 'text', text: quantity || '1包', size: 'xs', color: '#293C32', weight: 'bold', flex: 5 },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '需求期限', size: 'xs', color: '#6D776C', flex: 3 },
              { type: 'text', text: friendlyDue, size: 'xs', color: '#855316', weight: 'bold', flex: 5 },
            ],
          },
        ],
      },
      {
        type: 'text',
        text: '確認後將排程推播給家長，AI 不會直接建立未經確認的任務。',
        size: 'xxs',
        color: '#6D776C',
        margin: 'md',
        wrap: true,
      },
    ];

    return {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: '#FFFFFF',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: 'md',
        backgroundColor: '#FFFFFF',
        contents: [
          // Confirm Draft
          {
            type: 'button',
            style: 'primary',
            color: '#466B53',
            height: 'sm',
            action: {
              type: 'postback',
              label: '確認提醒',
              data: `action=confirm_supply_draft&id=${draftId}`,
              displayText: `確認建立${itemName}提醒`,
            },
          },
          // Modify / Cancel row
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'uri',
                  label: '修改',
                  uri: modifyUrl,
                },
              },
              {
                type: 'button',
                style: 'link',
                color: '#BA1A1A',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '取消',
                  data: `action=cancel_supply_draft&id=${draftId}`,
                  displayText: '取消此用品提醒草稿',
                },
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Generates a LINE Flex Message bubble container for a supply reminder push to Guardian.
   * Uses Tender Bloom palette consistent with existing CareLink Flex messages.
   */
  public static buildSupplyReminderFlex(params: {
    childAlias: string;
    itemName: string;
    note: string;
    size?: string | null;
    supplyTaskId: string;
    commerceUrl?: string | null;
    miniAppChannelId?: string;
  }): Record<string, any> {
    const { childAlias, itemName, note, size, supplyTaskId, commerceUrl, miniAppChannelId } = params;

    const bodyContents: any[] = [
      // Brand header
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: 'CareLink',
            weight: 'bold',
            size: 'xs',
            color: '#56665B',
            flex: 4,
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFF3E0',
            cornerRadius: 'md',
            paddingStart: 'sm',
            paddingEnd: 'sm',
            paddingTop: 'xs',
            paddingBottom: 'xs',
            contents: [
              {
                type: 'text',
                text: '用品提醒',
                size: 'xxs',
                color: '#855316',
                align: 'center',
                weight: 'bold',
              },
            ],
          },
        ],
      },
      // Main title
      {
        type: 'text',
        text: `${childAlias}需要補充${itemName}`,
        weight: 'bold',
        size: 'md',
        color: '#293C32',
        margin: 'lg',
        wrap: true,
      },
      // Note & Size details
      {
        type: 'text',
        text: `${size ? `尺寸：${size} · ` : ''}${note}`,
        size: 'sm',
        color: '#56665B',
        margin: 'sm',
        wrap: true,
      },
      // Divider
      {
        type: 'separator',
        margin: 'lg',
        color: '#DFE4D8',
      },
      // Helper text
      {
        type: 'text',
        text: '今天需要準備，老師提醒您準備以上用品',
        size: 'xxs',
        color: '#6D776C',
        align: 'center',
        margin: 'sm',
      },
    ];

    const liffBase = miniAppChannelId ? `https://liff.line.me/${miniAppChannelId}` : '';
    const commerceOptionsUrl = liffBase
      ? `${liffBase}/handoff?task_id=${supplyTaskId}&action=commerce`
      : commerceUrl || null;

    // Footer actions
    const footerContents: any[] = [
      // Primary: 我已準備
      {
        type: 'button',
        style: 'primary',
        color: '#466B53',
        height: 'sm',
        action: {
          type: 'postback',
          label: '我已準備',
          data: `action=supply_packed&id=${supplyTaskId}`,
          displayText: '我已準備',
        },
      },
    ];

    if (commerceOptionsUrl) {
      footerContents.push({
        type: 'button',
        style: 'link',
        color: '#2E7D32',
        height: 'sm',
        action: {
          type: 'uri',
          label: '查看購買選項',
          uri: commerceOptionsUrl,
        },
      });
    }

    return {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: '#FFFFFF',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: 'md',
        backgroundColor: '#FFFFFF',
        contents: footerContents,
      },
    };
  }
}
