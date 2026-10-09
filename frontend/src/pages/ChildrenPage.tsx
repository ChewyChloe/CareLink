import { useAuth } from '../auth/AuthContext';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface ChildOverviewItem {
  id: string;
  nickname: string;
  ageText: string;
  role: string;
  scopes: string[];
  todayCareStatus: string;
  latestEventText?: string | null;
  todayRecordCount: number;
  pendingHandoffCount: number;
  avatarUrl?: string | null;
}

interface RemindersData {
  supplyTasks: Array<{
    id: string;
    childId: string;
    childName: string;
    itemName: string;
    quantity?: string | null;
    dueAt?: string | null;
    status: string;
  }>;
  plannedPickups: Array<{
    id: string;
    childId: string;
    childName: string;
    occurredAt: string;
    pickupTime?: string | null;
    person?: string | null;
    note?: string | null;
  }>;
}

export const ChildrenPage: React.FC = () => {
  const navigate = useNavigate();
  const [children, setChildren] = useState<ChildOverviewItem[]>([]);
  const [reminders, setReminders] = useState<RemindersData>({ supplyTasks: [], plannedPickups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'name' | 'records'>('records');

  const todayStr = new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
  }).format(new Date());

  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isPreview = !user && typeof window !== 'undefined' && (
    searchParams.get('preview') === 'true' ||
    searchParams.get('demo') === 'true'
  );

  useEffect(() => {
    if (isPreview) {
      setChildren([
        {
          id: 'demo_ty',
          nickname: '湯圓',
          ageText: '1歲3個月',
          role: 'CAREGIVER',
          scopes: ['CARE_WRITE', 'CARE_READ'],
          todayCareStatus: '今日照護中',
          latestEventText: '13:10 開始午睡',
          todayRecordCount: 4,
          pendingHandoffCount: 0,
          avatarUrl: null,
        },
        {
          id: 'demo_xc',
          nickname: '張忱恩',
          ageText: '1歲3個月',
          role: 'CAREGIVER',
          scopes: ['CARE_WRITE', 'CARE_READ'],
          todayCareStatus: '今日照護中',
          latestEventText: '12:30 吃完副食品',
          todayRecordCount: 5,
          pendingHandoffCount: 1,
          avatarUrl: null,
        },
      ]);
      setReminders({
        supplyTasks: [
          {
            id: 'task_1',
            childId: 'demo_ty',
            childName: '湯圓',
            itemName: '尿布 NB 號',
            quantity: '1包',
            status: 'PENDING',
          },
        ],
        plannedPickups: [
          {
            id: 'pickup_1',
            childId: 'demo_ty',
            childName: '湯圓',
            occurredAt: '2026-09-17T18:00:00.000Z',
            pickupTime: '18:00',
            person: '媽媽',
          },
        ],
      });
      setLoading(false);
      return;
    }
    fetchOverview();
  }, [isPreview]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/children/overview', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(res.status === 401 ? '請重新登入' : `載入幼兒列表失敗 (${res.status})`);
      }
      const data = await res.json();
      setChildren(data.children || []);
      setReminders(data.reminders || { supplyTasks: [], plannedPickups: [] });
    } catch (err: any) {
      console.error(err);
      setError(err.message || '無法取得幼兒清單');
    } finally {
      setLoading(false);
    }
  };

  const sortedChildren = [...children].sort((a, b) => {
    if (sortMode === 'name') {
      return a.nickname.localeCompare(b.nickname);
    }
    return b.todayRecordCount - a.todayRecordCount;
  });

  if (loading) return <main role="status" className="p-8 pt-24">載入中…</main>;
  if (error) return <main role="alert" className="p-8 pt-24">{error}</main>;
  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-body-md text-on-surface flex flex-col pb-28">
      {/* Top Header */}
      <header className="sticky top-0 w-full z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        <div className="h-16 px-space-lg max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <div className="w-9 h-9 rounded-full bg-primary-container/20 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">child_care</span>
            </div>
            <div>
              <p className="font-label-sm text-label-sm text-primary tracking-wide uppercase font-semibold">
                CareLink 托育管理
              </p>
              <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight leading-tight">
                寶寶首頁
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOverview()}
              aria-label="重新整理"
              className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-xl mx-auto px-space-lg pt-space-md flex flex-col gap-space-md">
        {/* Top Utility Bar */}
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-container/20 text-on-primary-container font-label-md text-label-md font-semibold">
              <span className="w-2 h-2 rounded-full bg-primary mr-1.5 animate-pulse"></span>
              托育中 {children.length} 位寶貝
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">
              今日 {todayStr}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSortMode((prev) => (prev === 'records' ? 'name' : 'records'))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-all shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">sort</span>
              <span>{sortMode === 'records' ? '依紀錄數' : '依姓名'}</span>
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
            <span className="font-label-md">載入寶寶名冊中...</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-error-container text-error font-body-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Child Cards List */}
        {!loading && sortedChildren.length === 0 && (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant flex flex-col items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-4xl text-outline-variant">sentiment_dissatisfied</span>
            <p className="font-label-lg text-on-surface">目前尚無關聯幼兒</p>
            <p className="font-body-sm">請確認是否已接受家長邀請或建立托育關係。</p>
          </div>
        )}

        {!loading &&
          sortedChildren.map((child) => (
            <article
              key={child.id}
              className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-surface-container/60 hover:shadow-md transition-shadow flex flex-col gap-space-sm relative"
            >
              {/* Header Info */}
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex items-center gap-space-md min-w-0">
                  {/* Pastel Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-fixed to-secondary-fixed flex items-center justify-center text-primary font-bold text-headline-sm shadow-inner overflow-hidden">
                      {child.nickname ? child.nickname.charAt(0) : '寶'}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-surface-container-lowest ${
                        child.todayCareStatus.includes('照護中')
                          ? 'bg-emerald-500'
                          : child.todayCareStatus.includes('已完成')
                          ? 'bg-blue-500'
                          : 'bg-stone-300'
                      }`}
                    ></span>
                  </div>

                  {/* Name & Age */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-headline-md text-headline-md text-on-surface truncate">
                        {child.nickname}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm shrink-0">
                        {child.ageText}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                      <span className="font-medium text-on-surface">{child.todayCareStatus}</span>
                      {child.latestEventText && (
                        <span className="text-on-surface-variant truncate">
                          · {child.latestEventText}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Quick Context Tag: today record count */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-semibold">
                    今日紀錄 {child.todayRecordCount}
                  </span>
                  {child.pendingHandoffCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold animate-pulse">
                      待處理交班 {child.pendingHandoffCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-4 gap-2 pt-space-xs border-t border-surface-container/50">
                <button
                  onClick={() => navigate(`/timeline?child_id=${child.id}`)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low hover:bg-primary-container/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-primary group-hover:scale-105 transition-transform mb-1">
                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">今日紀錄</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">生活歷程</span>
                </button>

                <button
                  onClick={() => navigate(`/entry?child_id=${child.id}`)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low hover:bg-primary-container/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-secondary group-hover:scale-105 transition-transform mb-1">
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">新增紀錄</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">手動補登</span>
                </button>

                <button
                  onClick={() => navigate(`/calendar?child_id=${child.id}`)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low hover:bg-primary-container/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-tertiary group-hover:scale-105 transition-transform mb-1">
                    <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">月曆</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">出勤檢視</span>
                </button>

                <button
                  onClick={() => navigate(`/reports?child_id=${child.id}`)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low hover:bg-primary-container/20 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:scale-105 transition-transform mb-1">
                    <span className="material-symbols-outlined text-[18px]">monitoring</span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">本月報表</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">數據摘要</span>
                </button>
              </div>
            </article>
          ))}

        {/* Reminders & Handoff Panel (Phase 19: real SupplyTasks & PlannedPickups only) */}
        <section className="w-full bg-gradient-to-br from-surface-container-low to-primary-fixed/30 rounded-2xl p-space-md flex flex-col gap-space-sm shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <div className="w-7 h-7 rounded-full bg-primary-container/40 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[16px]">campaign</span>
              </div>
              <h3 className="font-label-lg text-label-lg text-on-surface font-semibold">
                今日托育提醒與叮嚀
              </h3>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              真實備品與接送委託
            </span>
          </div>

          {reminders.supplyTasks.length === 0 && reminders.plannedPickups.length === 0 ? (
            <div className="bg-surface-container-lowest/90 rounded-xl p-4 text-center text-on-surface-variant font-body-sm">
              <p className="font-label-md text-on-surface">今日無待處理交班或提醒</p>
              <p className="text-xs text-outline">備品充足，無預約特殊接送。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              {reminders.supplyTasks.map((t) => (
                <div key={t.id} className="bg-surface-container-lowest/90 rounded-xl p-3 flex flex-col gap-1 shadow-xs">
                  <div className="flex items-center gap-1 text-tertiary">
                    <span className="material-symbols-outlined text-[16px]">local_mall</span>
                    <span className="font-label-md text-label-md font-bold">備品補充委託</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface">
                    <strong className="text-primary">{t.childName}</strong>：{t.itemName}
                    {t.quantity ? ` (${t.quantity})` : ''}
                  </p>
                </div>
              ))}

              {reminders.plannedPickups.map((p) => (
                <div key={p.id} className="bg-surface-container-lowest/90 rounded-xl p-3 flex flex-col gap-1 shadow-xs">
                  <div className="flex items-center gap-1 text-secondary">
                    <span className="material-symbols-outlined text-[16px]">departure_board</span>
                    <span className="font-label-md text-label-md font-bold">預計接送提醒</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface">
                    <strong className="text-primary">{p.childName}</strong>：{p.pickupTime || '今日預計接送'}
                    {p.person ? ` 由 ${p.person} 接送` : ''}
                    {p.note ? ` (${p.note})` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
