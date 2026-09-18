import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  MonthSummaryData,
  CalendarDay,
  buildMonthGrid,
  formatMonthDisplay,
  shiftMonthKey,
  getCurrentMonthKey,
  getTodayKey,
} from '../lib/calendar-utils';

interface ChildOverviewItem {
  id: string;
  nickname: string;
  ageText: string;
  avatarUrl?: string | null;
}

export function CalendarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayKey = getTodayKey();
  const currentMonthKey = getCurrentMonthKey();

  const [monthKey, setMonthKey] = useState<string>(() => {
    const pDate = searchParams.get('date');
    if (pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate)) {
      return pDate.slice(0, 7);
    }
    return currentMonthKey;
  });

  const selectedDateParam = searchParams.get('date') || todayKey;

  const [children, setChildren] = useState<ChildOverviewItem[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [monthData, setMonthData] = useState<MonthSummaryData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isPreview = !user && typeof window !== 'undefined' && (
    searchParams.get('preview') === 'true' ||
    searchParams.get('demo') === 'true'
  );

  const previewMonthData: MonthSummaryData = {
    '2026-09-14': {
      confirmed_count: 4,
      has_planned_pickup: true,
      pending_handoff_count: 0,
      breakdown: { feed: 2, sleep: 1, other: 1 },
    },
    '2026-09-15': {
      confirmed_count: 3,
      has_planned_pickup: true,
      pending_handoff_count: 0,
      breakdown: { feed: 1, sleep: 1, other: 1 },
    },
    '2026-09-16': {
      confirmed_count: 5,
      has_planned_pickup: true,
      pending_handoff_count: 0,
      breakdown: { feed: 2, sleep: 2, other: 1 },
    },
    '2026-09-17': {
      confirmed_count: 2,
      has_planned_pickup: true,
      pending_handoff_count: 0,
      breakdown: { feed: 1, sleep: 1, other: 0 },
    },
  };

  // Load children list
  useEffect(() => {
    if (isPreview) {
      setChildId('demo_ty');
      setChildren([{ id: 'demo_ty', nickname: '湯圓', ageText: '1歲3個月' }]);
      setMonthData(previewMonthData);
      setLoading(false);
      return;
    }

    fetch('/api/children/overview', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('無法取得幼兒資料');
        return res.json();
      })
      .then(data => {
        const list: ChildOverviewItem[] = (data.children || []).map((c: any) => ({
          id: c.id,
          nickname: c.nickname,
          ageText: c.ageText,
          avatarUrl: c.avatarUrl,
        }));
        setChildren(list);
        const paramChildId = searchParams.get('child_id');
        if (paramChildId && list.some(c => c.id === paramChildId)) {
          setChildId(paramChildId);
        } else if (list.length > 0) {
          setChildId(list[0].id);
        }
      })
      .catch(err => setError(err.message));
  }, [isPreview]);

  // Load month summary
  useEffect(() => {
    if (!childId || isPreview) {
      if (isPreview) setMonthData(previewMonthData);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    fetch(`/api/children/${childId}/calendar?month=${monthKey}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('載入日曆資料失敗');
        return res.json();
      })
      .then((data: { month: string; days: MonthSummaryData }) => {
        setMonthData(data.days || {});
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [childId, monthKey, isPreview]);

  const handlePrevMonth = () => {
    setMonthKey((prev: string) => shiftMonthKey(prev, -1));
  };

  const handleNextMonth = () => {
    setMonthKey((prev: string) => shiftMonthKey(prev, 1));
  };

  const handleSelectDay = (dateStr: string) => {
    const params = new URLSearchParams();
    params.set('date', dateStr);
    if (childId && childId !== 'demo_ty') params.set('child_id', childId);
    if (isPreview) params.set('preview', 'true');
    navigate(`/timeline?${params.toString()}`);
  };

  const [y, m] = monthKey.split('-').map(Number);
  const daysGrid: CalendarDay[] = buildMonthGrid(y, m - 1);

  const selectedChild = children.find(c => c.id === childId) || children[0];

  // Calculate real monthly statistics from monthData
  const daysWithRecords = Object.values(monthData).filter(d => (d.confirmed_count || 0) > 0);
  const realAttendanceDays = daysWithRecords.length;
  const realTotalEvents = Object.values(monthData).reduce((acc, d) => acc + (d.confirmed_count || 0), 0);
  const realTotalFeed = Object.values(monthData).reduce((acc, d) => acc + (d.breakdown?.feed || 0), 0);
  const realTotalSleep = Object.values(monthData).reduce((acc, d) => acc + (d.breakdown?.sleep || 0), 0);

  return (
    <main className="flex flex-col relative w-full px-4 pt-4 pb-24 max-w-[760px] mx-auto min-h-screen font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex flex-col w-full gap-4">
        {/* Top Breadcrumb Nav & Month Selector */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1 text-[#574143] hover:text-[#a93349] transition-colors py-1.5 px-3 rounded-full bg-[#f5f3ef] text-xs font-semibold"
            onClick={() => handleSelectDay(todayKey)}
          >
            <span className="material-symbols-outlined text-[16px]">today</span>
            <span>返回今日</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#ffffff] shadow-sm rounded-full px-2 py-1 border border-[#ffdadc]">
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#efeeea] text-[#574143] font-bold text-sm"
                onClick={handlePrevMonth}
                aria-label="上個月"
              >
                ‹
              </button>
              <span className="text-xs font-bold px-2 text-[#1b1c1a]">
                {formatMonthDisplay(monthKey)}
              </span>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#efeeea] text-[#574143] font-bold text-sm"
                onClick={handleNextMonth}
                aria-label="下個月"
              >
                ›
              </button>
            </div>

            {/* View Full Report Button */}
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-[#ffffff] shadow-sm flex items-center justify-center text-[#574143] hover:text-[#a93349] border border-[#ffdadc] transition-colors"
              title="查看月度分析報表"
              onClick={() => {
                const params = new URLSearchParams();
                if (childId) params.set('child_id', childId);
                navigate(`/reports?${params.toString()}`);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">monitoring</span>
            </button>
          </div>
        </div>

        {/* Baby Spotlight Card */}
        {selectedChild && (
          <section className="w-full bg-[#ffffff] rounded-2xl p-4 shadow-sm flex items-center justify-between relative overflow-hidden border border-[#eae8e4]">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-[#ffdadc] flex items-center justify-center shadow-inner text-[#a93349] font-bold text-base border border-[#debfc1]">
                  {selectedChild.nickname.slice(0, 1)}
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#ffbc76] flex items-center justify-center text-[#79490b] shadow">
                  <span className="material-symbols-outlined text-[12px]">favorite</span>
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-[#1b1c1a] tracking-tight">{selectedChild.nickname}</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#ffdadc] text-[#891933] text-[11px] font-semibold">
                    {selectedChild.ageText}
                  </span>
                </div>
                <p className="text-xs text-[#574143] mt-0.5">
                  ID: #{selectedChild.id.slice(0, 8)} · 托育月曆
                </p>
              </div>
            </div>

            {/* Child Selector if multiple */}
            {children.length > 1 && (
              <select
                value={childId}
                onChange={e => {
                  setChildId(e.target.value);
                  setSearchParams({ child_id: e.target.value });
                }}
                className="text-xs bg-[#ffffff] border border-[#debfc1] rounded-full px-3 py-1 font-medium text-[#1b1c1a] shadow-sm focus:outline-none"
              >
                {children.map(c => (
                  <option key={c.id} value={c.id}>{c.nickname}</option>
                ))}
              </select>
            )}
          </section>
        )}

        {/* Section 1: Monthly Summary Bento Grid (Deterministic Real Aggregates) */}
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#a93349] text-[20px]">auto_stories</span>
              <h2 className="text-sm font-bold text-[#1b1c1a]">本月生活成長摘要</h2>
            </div>
            <span className="text-xs text-[#574143]">累計出勤 {realAttendanceDays} 天</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 w-full">
            <div className="bg-[#ffffff] rounded-2xl p-3 flex flex-col justify-between shadow-sm border border-[#eae8e4]">
              <div className="w-8 h-8 rounded-lg bg-[#fb7185]/15 flex items-center justify-center text-[#a93349] mb-2">
                <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
              </div>
              <div>
                <span className="text-[11px] text-[#574143] block">累積動態</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-bold text-[#1b1c1a]">{realTotalEvents}</span>
                  <span className="text-xs text-[#574143]">筆</span>
                </div>
              </div>
            </div>

            <div className="bg-[#ffffff] rounded-2xl p-3 flex flex-col justify-between shadow-sm border border-[#eae8e4]">
              <div className="w-8 h-8 rounded-lg bg-[#ffbc76]/25 flex items-center justify-center text-[#855316] mb-2">
                <span className="material-symbols-outlined text-[18px]">water_drop</span>
              </div>
              <div>
                <span className="text-[11px] text-[#574143] block">喝奶記錄</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-bold text-[#855316]">{realTotalFeed}</span>
                  <span className="text-xs text-[#574143]">次</span>
                </div>
              </div>
            </div>

            <div className="bg-[#ffffff] rounded-2xl p-3 flex flex-col justify-between shadow-sm border border-[#eae8e4]">
              <div className="w-8 h-8 rounded-lg bg-[#04a9e3]/15 flex items-center justify-center text-[#00668a] mb-2">
                <span className="material-symbols-outlined text-[18px]">bedtime</span>
              </div>
              <div>
                <span className="text-[11px] text-[#574143] block">小憩睡眠</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-bold text-[#00668a]">{realTotalSleep}</span>
                  <span className="text-xs text-[#574143]">次</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: 7-Column Interactive Calendar */}
        <section className="w-full bg-[#ffffff] rounded-2xl p-4 shadow-sm border border-[#eae8e4]">
          {error && <p className="p-3 rounded-lg bg-red-50 text-red-700 text-xs mb-3" role="alert">{error}</p>}
          {loading && !isPreview ? (
            <div className="p-8 text-center text-sm text-[#574143]">正在整理月曆紀錄…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 text-center text-xs text-[#574143] pb-2 border-b border-[#eae8e4] font-semibold">
                <span>週一</span>
                <span>週二</span>
                <span>週三</span>
                <span>週四</span>
                <span>週五</span>
                <span className="text-[#855316]">週六</span>
                <span className="text-[#855316]">週日</span>
              </div>

              <div className="grid grid-cols-7 gap-1 pt-2" role="grid">
                {daysGrid.map((day: CalendarDay) => {
                  const summary = monthData[day.dateKey];
                  const confirmedCount = summary?.confirmed_count || 0;
                  const hasPlannedPickup = summary?.has_planned_pickup;
                  const hasPendingHandoff = (summary?.pending_handoff_count || 0) > 0;
                  const breakdown = summary?.breakdown;
                  const isSelected = day.dateKey === selectedDateParam;

                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      className={`min-h-[68px] p-1 flex flex-col items-center justify-start rounded-xl transition-all ${
                        !day.isCurrentMonth
                          ? 'opacity-25'
                          : day.isFuture
                          ? 'opacity-40 text-[#8a7173]'
                          : 'text-[#1b1c1a] hover:bg-[#efeeea]'
                      } ${
                        day.isToday ? 'ring-2 ring-[#fb7185] bg-[#ffdadc]/30' : ''
                      } ${
                        isSelected ? 'bg-[#ffdadc] text-[#891933] font-bold shadow-inner' : ''
                      }`}
                      onClick={() => handleSelectDay(day.dateKey)}
                      aria-label={`${day.dateKey}，已確認 ${confirmedCount} 筆`}
                    >
                      <span className="text-xs font-semibold">{day.dayNumber}</span>

                      {confirmedCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ffdadc] text-[#891933] font-bold mt-1">
                          {confirmedCount} 筆
                        </span>
                      )}

                      {/* Event Type Mini Badges */}
                      {breakdown && (breakdown.feed > 0 || breakdown.sleep > 0) && (
                        <div className="flex items-center gap-1 mt-1">
                          {breakdown.feed > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#855316]" title={`喝奶 ${breakdown.feed} 次`} />
                          )}
                          {breakdown.sleep > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00668a]" title={`睡眠 ${breakdown.sleep} 次`} />
                          )}
                        </div>
                      )}

                      {hasPlannedPickup && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold mt-0.5" title="有預計接回設定">
                          預計
                        </span>
                      )}

                      {hasPendingHandoff && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#a93349] mt-1" title="有待確認交班" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
