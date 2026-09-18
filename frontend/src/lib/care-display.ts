export interface CareRecord {
  event_id: string;
  revision_no: number;
  event_type: string;
  temporal_status: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  status: string;
  action?: string;
  reason?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  duration_text?: string;
  source_type?: string;
  source_message_id?: string | null;
  guardian_instruction_id?: string | null;
  provenance_text?: string;
}

export const dayKey = (date: string | Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));

export function displayTime(date: string) {
  if (!date) return '時間待補';
  if (/^\d{1,2}:\d{2}$/.test(date.trim())) return date.trim().padStart(5, '0');
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '時間待補';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function eventTitle(type: string): string {
  const titles: Record<string, string> = {
    TEMPERATURE: '體溫量測',
    FEED: '喝奶紀錄',
    SLEEP_START: '開始午睡',
    SLEEP_END: '午睡醒來',
    MEAL: '飲食副食',
    DIAPER: '更換尿布',
    BOWEL_MOVEMENT: '排便紀錄',
    MEDICATION: '用藥紀錄',
    ACTIVITY: '活動探索',
    HYGIENE: '清潔衛生',
    GROWTH_MEASUREMENT: '生長測量',
    NOTE: '生活叮嚀',
    CHECK_IN: '今日到園簽到',
    CHECK_OUT: '離園接回家',
    PLANNED_PICKUP: '預約接送提醒',
    NIGHT_STAY: '今晚留宿',
  };
  return titles[type] || '生活紀錄';
}

export function eventIcon(type: string): string {
  const icons: Record<string, string> = {
    TEMPERATURE: 'device_thermostat',
    FEED: 'baby_changing_station',
    SLEEP_START: 'bedtime',
    SLEEP_END: 'wb_sunny',
    MEAL: 'restaurant',
    DIAPER: 'water_drop',
    BOWEL_MOVEMENT: 'baby_changing_station',
    MEDICATION: 'medication',
    ACTIVITY: 'smart_toy',
    HYGIENE: 'bathtub',
    GROWTH_MEASUREMENT: 'straighten',
    NOTE: 'format_quote',
    CHECK_IN: 'login',
    CHECK_OUT: 'logout',
    PLANNED_PICKUP: 'departure_board',
    NIGHT_STAY: 'night_shelter',
  };
  return icons[type] || 'edit_note';
}

export function eventBadgeColor(type: string): { bg: string; text: string; ring: string } {
  switch (type) {
    case 'TEMPERATURE':
      return { bg: 'bg-rose-100', text: 'text-rose-800', ring: 'ring-rose-200' };
    case 'FEED':
      return { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-200' };
    case 'SLEEP_START':
    case 'SLEEP_END':
      return { bg: 'bg-sky-100', text: 'text-sky-800', ring: 'ring-sky-200' };
    case 'MEAL':
      return { bg: 'bg-orange-100', text: 'text-orange-800', ring: 'ring-orange-200' };
    case 'DIAPER':
    case 'BOWEL_MOVEMENT':
      return { bg: 'bg-teal-100', text: 'text-teal-800', ring: 'ring-teal-200' };
    case 'MEDICATION':
      return { bg: 'bg-purple-100', text: 'text-purple-800', ring: 'ring-purple-200' };
    case 'ACTIVITY':
      return { bg: 'bg-indigo-100', text: 'text-indigo-800', ring: 'ring-indigo-200' };
    case 'HYGIENE':
      return { bg: 'bg-emerald-100', text: 'text-emerald-800', ring: 'ring-emerald-200' };
    case 'GROWTH_MEASUREMENT':
      return { bg: 'bg-lime-100', text: 'text-lime-800', ring: 'ring-lime-200' };
    case 'NOTE':
      return { bg: 'bg-pink-100', text: 'text-pink-800', ring: 'ring-pink-200' };
    default:
      return { bg: 'bg-stone-100', text: 'text-stone-800', ring: 'ring-stone-200' };
  }
}

export function eventDetail(type: string, payload: Record<string, any>, durationText?: string): string {
  if (!payload) return '';
  switch (type) {
    case 'TEMPERATURE': {
      const deg = payload.value_celsius !== undefined ? `${payload.value_celsius}°C` : '';
      const site = payload.measurement_site ? ` · ${payload.measurement_site}` : '';
      return `${deg}${site}`;
    }
    case 'FEED': {
      const amt = payload.amount !== undefined ? payload.amount : payload.amount_ml;
      const unit = payload.unit || 'ml';
      const milk =
        payload.milk_type === 'FORMULA'
          ? '配方奶'
          : payload.milk_type === 'BREAST_MILK'
          ? '母乳'
          : payload.milk_type === 'OTHER'
          ? '其他'
          : '';
      return `${amt ? amt + ' ' + unit : ''}${milk ? ' · ' + milk : ''}`;
    }
    case 'SLEEP_START':
      return '入睡休息中';
    case 'SLEEP_END':
      return durationText || '午睡結束';
    case 'MEAL': {
      const desc = payload.description || payload.meal_type || '';
      const amt = payload.amount ? ` · ${payload.amount}${payload.amount_unit || 'ml'}` : '';
      const comp =
        payload.completion === 'FULL'
          ? ' · 全部完食'
          : payload.completion === 'PARTIAL'
          ? ' · 吃約部分'
          : payload.completion === 'REFUSED'
          ? ' · 拒食'
          : '';
      return `${desc}${amt}${comp}`;
    }
    case 'DIAPER': {
      const cond =
        payload.condition === 'WET'
          ? '尿濕'
          : payload.condition === 'DRY'
          ? '乾淨'
          : payload.condition === 'SOILED'
          ? '弄髒'
          : payload.condition === 'MIXED'
          ? '混合'
          : '';
      return cond ? `狀態：${cond}` : '已換上乾淨尿布';
    }
    case 'BOWEL_MOVEMENT': {
      const cons = payload.consistency ? `${payload.consistency}` : '軟便';
      const col = payload.color ? ` · ${payload.color}` : '';
      return `${cons}${col}`;
    }
    case 'MEDICATION': {
      const med = payload.medication_name || '處方用藥';
      const dos = payload.dosage_text ? ` · ${payload.dosage_text}` : '';
      return `${med}${dos}`;
    }
    case 'ACTIVITY': {
      const tit = payload.title || payload.activity_type || '互動探索';
      const dur = payload.duration_minutes ? ` · ${payload.duration_minutes} 分鐘` : '';
      return `${tit}${dur}`;
    }
    case 'HYGIENE': {
      const hy =
        payload.hygiene_type === 'CLOTHING_CHANGE'
          ? '更換衣物'
          : payload.hygiene_type === 'BATH'
          ? '洗澡沐浴'
          : payload.hygiene_type === 'HAND_WASH'
          ? '洗手消毒'
          : payload.hygiene_type === 'ORAL_CARE'
          ? '口腔潔牙'
          : '清潔衛生';
      return hy;
    }
    case 'GROWTH_MEASUREMENT': {
      const parts: string[] = [];
      if (payload.height_cm) parts.push(`身高 ${payload.height_cm} cm`);
      if (payload.weight_kg) parts.push(`體重 ${payload.weight_kg} kg`);
      if (payload.head_circumference_cm) parts.push(`頭圍 ${payload.head_circumference_cm} cm`);
      return parts.join(' · ');
    }
    case 'NOTE':
      return String(payload.content || '');
    case 'CHECK_IN':
      return '抵達托育中心 · 體溫正常';
    case 'CHECK_OUT':
      return payload.person ? `由 ${payload.person} 接回家` : '離園簽退';
    case 'PLANNED_PICKUP':
      return `預計接送時間 ${payload.pickup_time || ''}${payload.person ? ' 由 ' + payload.person : ''}`;
    default:
      return String(payload.notes || payload.note || '');
  }
}

export function summarize(items: CareRecord[]) {
  const actual = items.filter(
    (item) => item.status !== 'VOID' && item.temporal_status !== 'PLANNED' && item.event_type !== 'PLANNED_PICKUP',
  );
  const feeds = actual.filter((item) => item.event_type === 'FEED').length;
  const sleeps = actual.filter((item) => item.event_type === 'SLEEP_START').length;
  const pickups = actual
    .filter((item) => item.event_type === 'CHECK_OUT')
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  return {
    count: actual.length,
    feeds,
    sleeps,
    pickup: pickups[0] ? displayTime(pickups[0].occurred_at) : '—',
  };
}
