export interface DaySummary {
  confirmed_count: number;
  has_planned_pickup: boolean;
  pending_handoff_count: number;
  breakdown?: {
    feed: number;
    sleep: number;
    other: number;
  };
}

export type MonthSummaryData = Record<string, DaySummary>;

export interface CalendarDay {
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function formatMonthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

export function formatMonthDisplay(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

export function getCurrentMonthKey(): string {
  const today = getTodayKey();
  return today.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const nextY = date.getUTCFullYear();
  const nextM = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

export function getTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function buildMonthGrid(year: number, monthIndex: number): CalendarDay[] {
  const todayKey = getTodayKey();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Monday-first: 0 = Mon, 1 = Tue, ..., 6 = Sun
  const startDay = (firstDay.getDay() + 6) % 7;

  // Previous month fill
  const prevMonthDays = new Date(year, monthIndex, 0).getDate();
  const grid: CalendarDay[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const prevMonthNum = monthIndex === 0 ? 12 : monthIndex;
    const prevYear = monthIndex === 0 ? year - 1 : year;
    const dateKey = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.push({
      dateKey,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.push({
      dateKey,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  // Next month fill to complete 7-day rows
  const remaining = (7 - (grid.length % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const nextMonthNum = monthIndex === 11 ? 1 : monthIndex + 2;
    const nextYear = monthIndex === 11 ? year + 1 : year;
    const dateKey = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.push({
      dateKey,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  return grid;
}

const WEEKDAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export function formatTimelineHeaderDate(dateKey: string, todayKey = getTodayKey()): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const month = m;
  const day = d;
  if (dateKey === todayKey) {
    return `${month}月${day}日・今天`;
  }
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];
  return `${month}月${day}日・${weekday}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const nextY = date.getUTCFullYear();
  const nextM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextD = String(date.getUTCDate()).padStart(2, '0');
  return `${nextY}-${nextM}-${nextD}`;
}
