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
    const p = item.payload || {};
    const parts: string[] = [];

    const amount = p.amount !== undefined ? p.amount : p.amount_ml;
    const unit = p.amount_unit || (amount !== undefined ? 'ml' : '');
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
   * Generates a LINE Flex Message bubble container for a DraftBatch.
   * Redesigned with warm off-white, sage green accents, and clear information hierarchy.
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
      ? { text: '需補填', color: '#A04437', bg: '#FFEBEE' }
      : { text: '待確認', color: '#466B53', bg: '#E8EFE2' };

    // Event rows with clean divider and whitespace (no heavy gray boxes)
    const eventRowContents: any[] = [];

    draft.items.forEach((item, idx) => {
      if (idx > 0) {
        eventRowContents.push({
          type: 'separator',
          margin: 'md',
          color: '#DFE4D8',
        });
      }

      const display = this.getEventTypeDisplay(item.event_type);
      const time = this.formatTime(item.occurred_at);
      const summary = this.formatItemSummary(item);
      const itemMissing = item.missing_fields && item.missing_fields.length > 0;

      const itemBoxContents: any[] = [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: display.label,
              weight: 'bold',
              size: 'sm',
              color: '#293C32',
              flex: 4,
            },
            {
              type: 'text',
              text: time,
              size: 'xs',
              color: '#6D776C',
              align: 'end',
              flex: 2,
            },
          ],
        },
      ];

      if (summary) {
        itemBoxContents.push({
          type: 'text',
          text: summary,
          size: 'xs',
          color: '#56665B',
          margin: 'xs',
          wrap: true,
        });
      }

      if (itemMissing) {
        itemBoxContents.push({
          type: 'text',
          text: `⚠️ 缺少必填: ${item.missing_fields!.join(', ')}`,
          size: 'xxs',
          color: '#A04437',
          margin: 'xs',
          wrap: true,
        });
      }

      eventRowContents.push({
        type: 'box',
        layout: 'vertical',
        margin: idx === 0 ? 'none' : 'md',
        contents: itemBoxContents,
      });
    });

    const liffUrl = `https://liff.line.me/${miniAppChannelId}/drafts/${draft.id}`;

    // Footer actions
    const footerContents: any[] = [];

    // Primary CTA: 確認 N 筆 (or 確認 N 筆紀錄)
    if (!hasMissingFields) {
      footerContents.push({
        type: 'button',
        style: 'primary',
        color: '#466B53',
        height: 'sm',
        action: {
          type: 'postback',
          label: `確認 ${draft.items.length} 筆`,
          data: `action=confirm_draft&draft_id=${draft.id}&expected_version=${draft.lock_version}`,
          displayText: '已確認照護紀錄',
        },
      });
    }

    // Secondary actions row: 查看／修改 + 捨棄
    const secondaryButtons: any[] = [
      {
        type: 'button',
        style: hasMissingFields ? 'primary' : 'link',
        color: hasMissingFields ? '#466B53' : '#56665B',
        height: 'sm',
        action: {
          type: 'uri',
          label: hasMissingFields ? '在 MINI App 補填必填欄位' : '查看／修改',
          uri: liffUrl,
        },
      },
    ];

    if (!hasMissingFields) {
      secondaryButtons.push({
        type: 'button',
        style: 'link',
        color: '#8C968B',
        height: 'sm',
        action: {
          type: 'postback',
          label: '捨棄',
          data: `action=cancel_draft&draft_id=${draft.id}`,
          displayText: '已捨棄草稿',
        },
      });
    }

    footerContents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'xs',
      contents: secondaryButtons,
    });

    return {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: '#FFFFFF',
        contents: [
          // Brand + Status pill header
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
                backgroundColor: statusBadge.bg,
                cornerRadius: 'md',
                paddingStart: 'sm',
                paddingEnd: 'sm',
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
          // Main title + subtitle
          {
            type: 'text',
            text: `${childName}的今日照護`,
            weight: 'bold',
            size: 'lg',
            color: '#293C32',
            margin: 'md',
          },
          {
            type: 'text',
            text: `${dateStr} · ${draft.items.length} 筆待確認`,
            size: 'xs',
            color: '#6D776C',
            margin: 'xs',
          },
          // Divider
          {
            type: 'separator',
            margin: 'md',
            color: '#DFE4D8',
          },
          // Event rows
          ...eventRowContents,
          // Bottom microcopy helper
          {
            type: 'separator',
            margin: 'lg',
            color: '#DFE4D8',
          },
          {
            type: 'text',
            text: 'AI 已整理好，請確認內容。',
            size: 'xxs',
            color: '#6D776C',
            align: 'center',
            margin: 'sm',
          },
        ],
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
}
