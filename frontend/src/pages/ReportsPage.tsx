import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface GrowthReportData {
  month: string;
  attendance_days: number;
  total_records: number;
  milk_total_count: number;
  milk_total_volume_ml: number;
  nap_average_minutes: number;
  milk_trend: Array<{
    date: string;
    label: string;
    total_ml: number;
  }>;
  sleep_trend: Array<{
    date: string;
    total_minutes: number;
    hours_text: string;
  }>;
  growth_measurements: Array<{
    date: string;
    occurred_at: string;
    height_cm?: number;
    weight_kg?: number;
    head_circumference_cm?: number;
    note?: string;
  }>;
}

interface ChildItem {
  id: string;
  nickname: string;
  ageText: string;
  avatarUrl?: string | null;
}

export const ReportsPage: React.FC = () => {
  const [childrenPending, setChildrenPending] = useState(true);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [children, setChildren] = useState<ChildItem[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [report, setReport] = useState<GrowthReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const isPreview = !user && typeof window !== 'undefined' && (
    searchParams.get('preview') === 'true' ||
    searchParams.get('demo') === 'true'
  );

  const previewReportData: GrowthReportData = {
    month: currentMonth,
    attendance_days: 11,
    total_records: 54,
    milk_total_count: 8,
    milk_total_volume_ml: 1250,
    nap_average_minutes: 85,
    milk_trend: [
      { date: '2026-09-14', label: '9/14', total_ml: 680 },
      { date: '2026-09-15', label: '9/15', total_ml: 710 },
      { date: '2026-09-16', label: '9/16', total_ml: 550 },
      { date: '2026-09-17', label: '9/17', total_ml: 460 },
    ],
    sleep_trend: [
      { date: '2026-09-14', total_minutes: 90, hours_text: '1 小時 30 分' },
      { date: '2026-09-15', total_minutes: 80, hours_text: '1 小時 20 分' },
      { date: '2026-09-16', total_minutes: 100, hours_text: '1 小時 40 分' },
      { date: '2026-09-17', total_minutes: 70, hours_text: '1 小時 10 分' },
    ],
    growth_measurements: [
      {
        date: '2026-09-15',
        occurred_at: '2026-09-15T09:30:00.000Z',
        height_cm: 78.5,
        weight_kg: 10.2,
        head_circumference_cm: 45.5,
        note: '量測配合良好，活動力佳',
      },
      {
        date: '2026-08-15',
        occurred_at: '2026-08-15T09:30:00.000Z',
        height_cm: 77.0,
        weight_kg: 9.8,
        head_circumference_cm: 45.0,
        note: '常規生理記錄',
      },
    ],
  };

  // Initialize child list
  useEffect(() => {
    if (isPreview) {
      setChildrenPending(false);
      setChildren([
        { id: 'demo_ty', nickname: '湯圓', ageText: '1歲3個月' },
        { id: 'demo_xc', nickname: '張忱恩', ageText: '1歲3個月' },
      ]);
      setSelectedChildId('demo_ty');
      setReport(previewReportData);
      setLoading(false);
      return;
    }

    const fetchChildren = async () => {
      try {
        const res = await fetch('/api/children/overview', { credentials: 'include' });
        if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '幼兒資料載入失敗');
        if (res.ok) {
          const data = await res.json();
          const items: ChildItem[] = (data.children || []).map((c: any) => ({
            id: c.id,
            nickname: c.nickname,
            ageText: c.ageText,
            avatarUrl: c.avatarUrl,
          }));
          setChildren(items);

          const paramChildId = searchParams.get('child_id');
          if (paramChildId && items.some(c => c.id === paramChildId)) {
            setSelectedChildId(paramChildId);
          } else if (items.length > 0) {
            setSelectedChildId(items[0].id);
          }
        }
      } catch (err) {
        setError((err as Error).message); setLoading(false);
      } finally { setChildrenPending(false); }
    };
    fetchChildren();
  }, [searchParams, isPreview]);

  // Fetch report data when child or month changes
  useEffect(() => {
    if (isPreview) {
      setReport(previewReportData);
      setLoading(false);
      return;
    }
    if (!selectedChildId) { setLoading(false); return; }

    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null); setReport(null);
        const res = await fetch(
          `/api/children/${selectedChildId}/reports?month=${currentMonth}`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          throw new Error(res.status === 401 ? '請重新登入' : `無法取得報表資料 (${res.status})`);
        }
        const data: GrowthReportData = await res.json();
        setReport(data);
      } catch (err: any) {
        setError(err.message || '讀取報表失敗');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [selectedChildId, currentMonth, isPreview]);

  const selectedChild = children.find(c => c.id === selectedChildId);

  const changeMonth = (delta: number) => {
    const [yStr, mStr] = currentMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    const newMonth = `${y}-${String(m).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
  };

  const formattedMonthLabel = (() => {
    const [y, m] = currentMonth.split('-');
    return `${y} 年 ${parseInt(m, 10)} 月`;
  })();

  // Max milk in trend for scaling
  const maxMilk = Math.max(800, ...(report?.milk_trend?.map(t => t.total_ml) || [600]));

  if (loading || childrenPending) return <main role="status" className="p-8 pt-24">載入中…</main>;
  if (error) return <main role="alert" className="p-8 pt-24">{error}</main>;
  if (!isPreview && !selectedChildId) return <main className="p-8 pt-24">尚無可查看的孩子。</main>;
  return (
    <div className="min-h-screen bg-[#fbf9f5] font-['Plus_Jakarta_Sans',sans-serif] text-[#1b1c1a] antialiased pb-24">
      {/* Top Fixed Header */}
      <header className="sticky top-0 z-40 bg-[#fbf9f5]/85 backdrop-blur-xl border-b border-[#eae8e4] px-4 py-3 shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
        <div className="max-w-[760px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#574143] hover:bg-[#eae8e4] active:scale-95 transition-all"
              title="返回"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
            </button>
            <div>
              <p className="text-[11px] font-semibold tracking-wider text-[#a93349] uppercase">
                CareLink 成長報表
              </p>
              <h1 className="text-[18px] font-bold text-[#1b1c1a] leading-tight">
                {selectedChild?.nickname || '寶寶'} 月度摘要
              </h1>
            </div>
          </div>

          {/* Child Picker if multiple */}
          {children.length > 1 && (
            <select
              value={selectedChildId}
              onChange={e => {
                setSelectedChildId(e.target.value);
                setSearchParams({ child_id: e.target.value });
              }}
              className="text-xs bg-[#ffffff] border border-[#debfc1] rounded-full px-3 py-1 font-medium text-[#1b1c1a] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#a93349]"
            >
              {children.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nickname}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[760px] mx-auto px-4 pt-4 flex flex-col gap-4">
        {/* Month Selector Bar */}
        <div className="flex items-center justify-between bg-[#ffffff] rounded-2xl p-2.5 shadow-sm border border-[#eae8e4]">
          <button
            onClick={() => changeMonth(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#574143] hover:bg-[#efeeea] active:scale-95 transition-all"
            title="上個月"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-1.5 font-bold text-[#1b1c1a] text-sm tracking-wide">
            <span className="material-symbols-outlined text-[#a93349] text-[18px]">calendar_month</span>
            <span>{formattedMonthLabel}</span>
          </div>
          <button
            onClick={() => changeMonth(1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#574143] hover:bg-[#efeeea] active:scale-95 transition-all"
            title="下個月"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        {/* Baby Spotlight Card */}
        {selectedChild && (
          <div className="bg-[#ffffff] rounded-2xl p-4 shadow-sm border border-[#eae8e4] flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-13 h-13 rounded-full bg-[#ffdadc] text-[#a93349] font-bold text-lg flex items-center justify-center shadow-inner border border-[#debfc1]">
                  {selectedChild.nickname.slice(0, 1)}
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#ffbc76] flex items-center justify-center text-[#79490b] shadow">
                  <span className="material-symbols-outlined text-[12px]">favorite</span>
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-[#1b1c1a]">{selectedChild.nickname}</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#ffdadc] text-[#891933] text-[11px] font-medium">
                    {selectedChild.ageText}
                  </span>
                </div>
                <p className="text-xs text-[#574143] mt-0.5">
                  ID: #{selectedChild.id.slice(0, 8)} · 托育身分
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-[#a93349] tracking-wider uppercase block">
                累計出勤
              </span>
              <div className="flex items-baseline justify-end gap-1 mt-0.5">
                <span className="text-lg font-bold text-[#1b1c1a]">{report?.attendance_days ?? 0}</span>
                <span className="text-xs text-[#574143]">天</span>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-3 border-[#a93349] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-[#574143]">載入月度數據中...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            {error}
          </div>
        ) : report ? (
          <>
            {/* Section 1: Monthly Summary Bento Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-[#ffffff] rounded-2xl p-3 shadow-sm border border-[#eae8e4] flex flex-col justify-between">
                <div className="w-8 h-8 rounded-lg bg-[#fb7185]/15 flex items-center justify-center text-[#a93349] mb-2">
                  <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#574143] block">累積日誌紀錄</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-bold text-[#1b1c1a]">{report.total_records}</span>
                    <span className="text-xs text-[#574143]">筆</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#ffffff] rounded-2xl p-3 shadow-sm border border-[#eae8e4] flex flex-col justify-between">
                <div className="w-8 h-8 rounded-lg bg-[#ffbc76]/25 flex items-center justify-center text-[#855316] mb-2">
                  <span className="material-symbols-outlined text-[18px]">water_drop</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#574143] block">累計喝奶量</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-bold text-[#855316]">{report.milk_total_volume_ml}</span>
                    <span className="text-xs text-[#574143]">ml</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#ffffff] rounded-2xl p-3 shadow-sm border border-[#eae8e4] flex flex-col justify-between">
                <div className="w-8 h-8 rounded-lg bg-[#04a9e3]/15 flex items-center justify-center text-[#00668a] mb-2">
                  <span className="material-symbols-outlined text-[18px]">bedtime</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#574143] block">平均小憩時間</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-bold text-[#00668a]">{report.nap_average_minutes}</span>
                    <span className="text-xs text-[#574143]">分</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Milk Volume Trend */}
            <div className="bg-[#ffffff] rounded-2xl p-4 shadow-sm border border-[#eae8e4] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#ffdcbd] flex items-center justify-center text-[#855316]">
                    <span className="material-symbols-outlined text-[18px]">local_cafe</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1b1c1a]">喝奶與營養攝取趨勢</h2>
                    <p className="text-[11px] text-[#574143]">
                      本月記錄 {report.milk_total_count} 次餵食
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-[#574143]">總量</span>
                  <p className="text-sm font-bold text-[#a93349]">
                    {report.milk_total_volume_ml} <span className="text-xs font-normal text-[#574143]">ml</span>
                  </p>
                </div>
              </div>

              {/* Milk Bar Chart */}
              {report.milk_trend.length > 0 ? (
                <div className="bg-[#f5f3ef] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-end justify-between gap-2 h-36 pt-4 px-2">
                    {report.milk_trend.map((point, idx) => {
                      const heightPercent = Math.min(100, Math.round((point.total_ml / maxMilk) * 100));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                          <span className="text-[10px] font-bold text-[#00668a] mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {point.total_ml}
                          </span>
                          <div className="w-full max-w-[28px] bg-gradient-to-t from-[#00668a] to-[#04a9e3] rounded-t-md transition-all duration-300"
                               style={{ height: `${Math.max(8, heightPercent)}%` }} />
                          <span className="text-[10px] text-[#574143] font-medium mt-1 truncate w-full text-center">
                            {point.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 pt-1 border-t border-[#eae8e4] text-[11px] text-[#574143]">
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm bg-[#00668a]" />
                      <span>每日奶量 (ml)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#574143] bg-[#f5f3ef] rounded-xl">
                  本月尚無喝奶紀錄
                </div>
              )}
            </div>

            {/* Section 3: Sleep Rhythm Trend */}
            <div className="bg-[#ffffff] rounded-2xl p-4 shadow-sm border border-[#eae8e4] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#c4e7ff] flex items-center justify-center text-[#00668a]">
                    <span className="material-symbols-outlined text-[18px]">bedtime</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1b1c1a]">日間小憩作息記錄</h2>
                    <p className="text-[11px] text-[#574143]">
                      平均小憩時長約 {Math.floor(report.nap_average_minutes / 60)} 時 {report.nap_average_minutes % 60} 分
                    </p>
                  </div>
                </div>
              </div>

              {report.sleep_trend.length > 0 ? (
                <div className="space-y-2">
                  {report.sleep_trend.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-[#f5f3ef] rounded-xl text-xs">
                      <div className="flex items-center gap-2 font-medium text-[#1b1c1a]">
                        <span className="material-symbols-outlined text-[#00668a] text-[16px]">schedule</span>
                        <span>{s.date}</span>
                      </div>
                      <span className="font-bold text-[#00668a]">{s.hours_text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#574143] bg-[#f5f3ef] rounded-xl">
                  本月尚無睡眠紀錄
                </div>
              )}
            </div>

            {/* Section 4: Growth Measurements Table (Fact-Only) */}
            <div className="bg-[#ffffff] rounded-2xl p-4 shadow-sm border border-[#eae8e4] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#ffdadc] flex items-center justify-center text-[#a93349]">
                    <span className="material-symbols-outlined text-[18px]">straighten</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1b1c1a]">生理測量客觀紀錄</h2>
                    <p className="text-[11px] text-[#574143]">保母與照護人員現場實測紀錄</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/entry?child_id=${selectedChildId}&tab=growth`)}
                  className="text-xs font-semibold text-[#a93349] hover:underline flex items-center gap-0.5"
                >
                  <span>新增測量</span>
                  <span className="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>

              {report.growth_measurements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#f5f3ef] text-[#574143] rounded-lg">
                      <tr>
                        <th className="p-2 font-semibold rounded-l-lg">日期</th>
                        <th className="p-2 font-semibold">身高</th>
                        <th className="p-2 font-semibold">體重</th>
                        <th className="p-2 font-semibold">頭圍</th>
                        <th className="p-2 font-semibold rounded-r-lg">備註</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eae8e4]">
                      {report.growth_measurements.map((g, idx) => (
                        <tr key={idx} className="hover:bg-[#fbf9f5]">
                          <td className="p-2 font-medium text-[#1b1c1a] whitespace-nowrap">{g.date}</td>
                          <td className="p-2 text-[#1b1c1a] whitespace-nowrap">
                            {g.height_cm != null ? `${g.height_cm} cm` : '—'}
                          </td>
                          <td className="p-2 text-[#1b1c1a] whitespace-nowrap">
                            {g.weight_kg != null ? `${g.weight_kg} kg` : '—'}
                          </td>
                          <td className="p-2 text-[#1b1c1a] whitespace-nowrap">
                            {g.head_circumference_cm != null ? `${g.head_circumference_cm} cm` : '—'}
                          </td>
                          <td className="p-2 text-[#574143] text-[11px]">
                            {g.note || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#574143] bg-[#f5f3ef] rounded-xl flex flex-col items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#8a7173] text-[24px]">straighten</span>
                  <span>本月尚無生理測量紀錄</span>
                  <span className="text-[10px] text-[#8a7173]">可在新增紀錄中輸入體重、身高或頭圍</span>
                </div>
              )}

              {/* Fact-Only Transparency Notice */}
              <div className="p-3 bg-[#efeeea] rounded-xl flex items-start gap-2 text-[11px] text-[#574143]">
                <span className="material-symbols-outlined text-[#a93349] text-[16px] mt-0.5">info</span>
                <span>
                  本平台嚴格遵守客觀數據呈現原則。所有生理數值均為托育現場照護者之手動記錄，不包含生長曲線推算或醫療診斷建議。
                </span>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
};
