import { confirmedSummary } from '../lib/confirmed-summary';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  CareRecord,
  displayTime,
  eventTitle,
  eventIcon,
  eventBadgeColor,
  eventDetail,
} from '../lib/care-display';
import { formatTimelineHeaderDate, shiftDateKey, getTodayKey } from '../lib/calendar-utils';

interface Child {
  id: string;
  displayAlias: string;
  role: string;
  scopes: string[];
}

interface RevisionItem {
  id: string;
  revision_no: number;
  occurred_at: string;
  payload: Record<string, any>;
  action: string;
  reason?: string | null;
  confirmed_by: string;
  confirmed_at: string;
}

interface DailySummaryMetrics {
  date: string;
  total_records: number;
  feed_count: number;
  total_feed_amount_ml: number;
  sleep_segments: number;
  total_sleep_minutes: number;
  sleep_duration_text: string;
  diaper_count: number;
  bowel_movement_count: number;
  latest_temperature?: number | null;
}

export function TimelinePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = getTodayKey();
  const dateParam = searchParams.get('date');

  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState('');
  const activeChild = useRef(childId); activeChild.current = childId;
  const [date, setDate] = useState(() =>
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey,
  );
  const [items, setItems] = useState<CareRecord[]>([]);
  const [summary, setSummary] = useState<DailySummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryPending, setSummaryPending] = useState(false);
  const [childrenPending, setChildrenPending] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Read status from real daily_log_views
  const [isRead, setIsRead] = useState(false);
  const [readAt, setReadAt] = useState<string | null>(null);

  // Correction / Void Modal state
  const [editing, setEditing] = useState<{ item: CareRecord; action: 'CORRECT' | 'VOID' } | null>(null);
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // History Modal state
  const [historyEvent, setHistoryEvent] = useState<{ eventId: string; type: string; revisions: RevisionItem[] } | null>(null);

  // Expanded cards state
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Parent comment state
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('COMMENT');
  const [commentFeedback, setCommentFeedback] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<Array<{ id: string; child_id: string; author_user_id: string; instruction_type: string; content: string; created_at: string; revoked_at?: string | null }>>([]);


  const isPreview =
    !user &&
    typeof window !== 'undefined' &&
    (searchParams.get('preview') === 'true' || searchParams.get('demo') === 'true');

  useEffect(() => {
    const p = searchParams.get('date');
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p) && p !== date) {
      setDate(p);
    }
  }, [searchParams]);

  useEffect(() => {
    const cParam = searchParams.get('child_id');
    if (cParam && cParam !== childId) {
      setChildId(cParam);
    }
  }, [searchParams]);

  const previewChild: Child = {
    id: 'demo_ty',
    displayAlias: '湯圓',
    role: 'CAREGIVER',
    scopes: ['CARE_WRITE'],
  };

  const previewItems: CareRecord[] = [
    {
      event_id: 'ev_1',
      revision_no: 1,
      event_type: 'FEED',
      temporal_status: 'ACTUAL',
      occurred_at: `${date}T11:40:00+08:00`,
      payload: { amount_ml: 150, milk_type: 'FORMULA', note: '吞嚥順暢無溢奶' },
      status: 'RECORDED',
    },
    {
      event_id: 'ev_2',
      revision_no: 1,
      event_type: 'SLEEP_START',
      temporal_status: 'ACTUAL',
      occurred_at: `${date}T13:10:00+08:00`,
      payload: { note: '聽輕音樂入睡' },
      status: 'RECORDED',
    },
    {
      event_id: 'ev_3',
      revision_no: 1,
      event_type: 'SLEEP_END',
      temporal_status: 'ACTUAL',
      occurred_at: `${date}T14:35:00+08:00`,
      payload: {},
      status: 'RECORDED',
      duration_text: '本次午睡 1小時25分',
    },
    {
      event_id: 'ev_4',
      revision_no: 1,
      event_type: 'TEMPERATURE',
      temporal_status: 'ACTUAL',
      occurred_at: `${date}T15:20:00+08:00`,
      payload: { value_celsius: 36.5, measurement_site: '耳溫' },
      status: 'RECORDED',
    },
  ];

  const displaySummary = isPreview ? confirmedSummary(previewItems, date) : summary;
  const child = children.find((c) => c.id === childId) || (isPreview ? previewChild : undefined);
  const displayItems = items.length > 0 ? items : isPreview ? previewItems : items;
  const isToday = date === todayKey;
  const canComment = !isPreview && ['GUARDIAN', 'PARENT'].includes(child?.role || '');

  useEffect(() => {
    setNotes([]); setCommentFeedback(''); setCommentError(''); setCommentText('');
    if (!childId || isPreview) { setNotesLoading(false); return; }
    const controller = new AbortController(); setNotesLoading(true);
    fetch(`/api/children/${childId}/instructions`, { credentials: 'include', signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '留言載入失敗'); return res.json(); })
      .then(data => { if (!controller.signal.aborted) setNotes(data.filter((note: { revoked_at?: string | null }) => !note.revoked_at)); })
      .catch(err => { if (err.name !== 'AbortError') setCommentError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setNotesLoading(false); });
    return () => controller.abort();
  }, [childId, isPreview]);

  async function handleSendComment() {
    if (!canComment || !commentText.trim() || commentSaving) return;
    setCommentSaving(true); setCommentError(''); setCommentFeedback('');
    try {
      const res = await fetch(`/api/children/${childId}/instructions`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction_type: commentType, content: commentText.trim() }) });
      if (!res.ok) throw new Error(res.status === 401 ? '請重新登入；原文已保留' : '留言保存失敗；原文已保留');
      const saved = await res.json();
      if (activeChild.current !== childId) return;
      if (!saved.id || saved.child_id !== childId || !saved.created_at || saved.author_user_id !== user?.id) throw new Error('無法核對保存結果；原文已保留');
      setNotes(old => [saved, ...old.filter(note => note.id !== saved.id)]);
      setCommentText(''); setCommentFeedback('已保存留言；具備孩子權限的照護者可在此頁讀取。');
    } catch (err) { if (activeChild.current === childId) setCommentError((err as Error).message); } finally { setCommentSaving(false); }
  }

  const handlePrevDay = () => {
    const prev = shiftDateKey(date, -1);
    setDate(prev);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', prev);
    setSearchParams(nextParams);
  };

  const handleNextDay = () => {
    if (date >= todayKey) return;
    const next = shiftDateKey(date, 1);
    setDate(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', next);
    setSearchParams(nextParams);
  };

  const handleGoToCalendar = () => {
    const params = new URLSearchParams();
    params.set('date', date);
    if (childId && childId !== 'demo_ty') params.set('child_id', childId);
    if (isPreview) params.set('preview', 'true');
    navigate(`/calendar?${params.toString()}`);
  };



  // Initial load: User info & children
  useEffect(() => {
    if (isPreview) {
      setChildren([previewChild]);
      setChildrenPending(false);
      setChildId('demo_ty');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/me')
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '無法取得使用者資料');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list: Child[] = (data.grants || []).map((c: any) => ({
          id: c.childId,
          displayAlias: c.childAlias || '未命名',
          role: c.role,
          scopes: c.scopes || [],
        }));
        setChildren(list);
        if (list.length > 0) {
          const paramC = searchParams.get('child_id');
          const matched = paramC ? list.find((c) => c.id === paramC) : list[0];
          setChildId(matched ? matched.id : list[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => { if (!cancelled) setChildrenPending(false); });
    return () => {
      cancelled = true;
    };
  }, [isPreview]);

  // Load timeline & summary
  useEffect(() => {
    if (!childId || isPreview) {
      setLoading(false);
      setSummaryPending(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSummaryPending(true);
    setError('');
    setItems([]);
    setSummary(null);

    const params = new URLSearchParams();
    params.set('date', date);
    params.set('limit', '50');

    // Fetch timeline
    fetch(`/api/children/${childId}/timeline?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '載入時間軸失敗');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const records: CareRecord[] = (data.items || []).map((it: any) => ({
          event_id: it.event_id,
          revision_no: it.revision_no,
          event_type: it.event_type,
          temporal_status: it.temporal_status,
          occurred_at: it.occurred_at,
          payload: it.payload || {},
          status: it.status,
          action: it.action,
          reason: it.reason,
          confirmed_by: it.confirmed_by,
          confirmed_at: it.confirmed_at,
          duration_text: it.duration_text,
          source_type: it.source_type,
          source_message_id: it.source_message_id,
          guardian_instruction_id: it.guardian_instruction_id,
          provenance_text: it.provenance_text,
        }));
        setItems(records);

        if (data.parent_read_status?.viewed) {
          setIsRead(true);
          setReadAt(data.parent_read_status.viewed_at);
        } else {
          setIsRead(false);
          setReadAt(null);
        }

        // Only active Guardian on mounted, non-preview timeline records read receipt
        if (!isPreview && (child?.role === 'GUARDIAN' || child?.role === 'PARENT')) {
          fetch(`/api/children/${childId}/daily-log-views`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ care_date: date }),
          }).catch(console.error);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Fetch daily summary
    fetch(`/api/children/${childId}/summary?date=${date}`)
      .then((res) => { if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '摘要載入失敗'); return res.json(); })
      .then((s) => {
        if (!cancelled && s) setSummary(s);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setSummaryPending(false); });
    return () => {
      cancelled = true;
    };
  }, [childId, date, refresh, isPreview]);

  // Open revision history
  const handleOpenHistory = async (eventId: string, type: string) => {
    try {
      const res = await fetch(`/api/care-events/${eventId}/history`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHistoryEvent({ eventId, type, revisions: data.revisions || [] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Correction or Void
  const handleSaveCorrection = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError('');

    try {
      const body: any = {
        action: editing.action,
        expected_revision_no: editing.item.revision_no,
        reason: reason.trim(),
      };

      if (editing.action === 'CORRECT') {
        if (time) body.occurred_at = time;
        if (amount && editing.item.event_type === 'FEED') {
          body.payload = { amount: Number(amount), amount_ml: Number(amount) };
        }
      }

      const res = await fetch(`/api/care-events/${editing.item.event_id}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || `修訂失敗 (${res.status})`);
      }

      setEditing(null);
      setRefresh((r) => r + 1);
    } catch (err: any) {
      setSaveError(err.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading || summaryPending || childrenPending) return <main role="status" className="p-8 pt-24">載入中…</main>;
  if (error) return <main role="alert" className="p-8 pt-24">{error}</main>;
  if (!isPreview && !childId) return <main className="p-8 pt-24">尚無可查看的孩子。</main>;
  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-body-md text-on-surface flex flex-col pb-28">
      {/* Top Header */}
      <header className="sticky top-0 w-full z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        <div className="h-16 px-space-lg max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <button
              onClick={() => navigate('/children')}
              className="w-9 h-9 rounded-full bg-primary-container/20 flex items-center justify-center text-primary hover:bg-primary-container/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div>
              <p className="font-label-sm text-label-sm text-primary tracking-wide uppercase font-semibold">
                CareLink 托育日誌
              </p>
              <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight leading-tight">
                Daily Log
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/entry?child_id=${childId}`)}
              className="px-3 py-1.5 rounded-full bg-primary text-on-primary font-label-md text-label-md flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>記一筆</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-xl mx-auto px-space-lg pt-space-sm flex flex-col gap-space-md">
        {/* Child & Date Profile Card */}
        <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-surface-container/60 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-fixed to-secondary-fixed text-primary font-bold flex items-center justify-center text-headline-sm shadow-inner">
                {child?.displayAlias ? child.displayAlias.charAt(0) : '寶'}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {child?.displayAlias || '寶寶'}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-primary font-label-sm text-label-sm font-semibold">
                    {isToday ? '今日照護' : '歷史檢視'}
                  </span>
                </div>
                {/* Date navigator */}
                <div className="flex items-center gap-1 mt-0.5 text-on-surface-variant font-label-md">
                  <button
                    onClick={handlePrevDay}
                    className="hover:text-primary p-0.5 rounded flex items-center"
                    aria-label="前一天"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <span className="font-semibold text-on-surface">
                    {formatTimelineHeaderDate(date)}
                  </span>
                  <button
                    onClick={handleNextDay}
                    disabled={isToday}
                    className="hover:text-primary p-0.5 rounded flex items-center disabled:opacity-30"
                    aria-label="後一天"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                  <button
                    onClick={handleGoToCalendar}
                    className="ml-1 p-1 hover:text-primary rounded"
                    title="選擇日期"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">calendar_month</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Read Status Pill (Phase 17: real views only) */}
            {isRead ? (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-label-md text-label-md font-semibold shadow-xs">
                <span className="material-symbols-outlined text-[16px] text-emerald-700">mark_chat_read</span>
                <span>家長已閱讀{readAt ? ` (${displayTime(readAt)})` : ''}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                <span>尚未閱讀</span>
              </div>
            )}
          </div>

          {/* Quick Stats Metric Micro Bar (Phase 13: Deterministic Summary) */}
          <div className="grid grid-cols-4 gap-2 pt-space-xs border-t border-surface-container/50">
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low text-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">體溫</span>
              <span className="font-label-lg text-label-lg text-primary font-bold">
                {displaySummary?.latest_temperature ? `${displaySummary.latest_temperature}°C` : '—'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low text-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">喝奶量</span>
              <span className="font-label-lg text-label-lg text-secondary font-bold">
                {displaySummary?.total_feed_amount_ml ? `${displaySummary.total_feed_amount_ml}ml` : '0ml'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low text-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">換尿布</span>
              <span className="font-label-lg text-label-lg text-tertiary font-bold">
                {displaySummary?.diaper_count || 0} 次
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low text-center">
              <span className="font-label-sm text-label-sm text-on-surface-variant">午睡總長</span>
              <span className="font-label-lg text-label-lg text-on-surface font-bold">
                {displaySummary?.sleep_duration_text || '0m'}
              </span>
            </div>
          </div>
        </div>

        {/* Timeline Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              托育生活歷程
            </h3>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            共 {displayItems.length} 筆動態記錄
          </span>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
            <span className="font-label-md">載入生活歷程中...</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-error-container text-error font-body-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && displayItems.length === 0 && (
          <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant flex flex-col items-center gap-3 border border-surface-container/60 shadow-sm">
            <span className="material-symbols-outlined text-4xl text-outline-variant">edit_calendar</span>
            <p className="font-label-lg text-on-surface font-semibold">這一天尚無已確認的紀錄</p>
            <p className="font-body-sm">
              可點擊右上角「記一筆」進行手動補登，或透過 LINE 發送生活動態由系統整理。
            </p>
            <button
              onClick={() => navigate(`/entry?child_id=${childId}`)}
              className="mt-2 px-5 py-2 rounded-full bg-primary text-on-primary font-label-md font-semibold shadow-sm"
            >
              手動新增紀錄
            </button>
          </div>
        )}

        {/* Vertical Activity Stream (Phase 12) */}
        {!loading && displayItems.length > 0 && (
          <div className="flex flex-col gap-space-md relative">
            {/* Continuous Vertical Timeline Stem */}
            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-surface-container-high -z-0"></div>

            {displayItems.map((item) => {
              const badge = eventBadgeColor(item.event_type);
              const icon = eventIcon(item.event_type);
              const title = eventTitle(item.event_type);
              const detailText = eventDetail(item.event_type, item.payload, item.duration_text);
              const isVoid = item.status === 'VOID';
              const isExpanded = expandedCardId === item.event_id;

              return (
                <div key={item.event_id} className="relative flex items-start gap-space-md z-10">
                  {/* Circular Event Icon Badge */}
                  <div
                    className={`w-12 h-12 rounded-full ${badge.bg} ${badge.text} flex items-center justify-center shrink-0 shadow-sm ring-2 ${badge.ring}`}
                  >
                    <span className="material-symbols-outlined text-[24px]">{icon}</span>
                  </div>

                  {/* Card Container */}
                  <div
                    className={`flex-1 bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-surface-container/60 hover:shadow-md transition-all ${
                      isVoid ? 'opacity-60 bg-surface-container-low' : ''
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-space-xs">
                        <span className={`px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} font-label-sm text-label-sm font-semibold`}>
                          {title}
                        </span>
                        <span className="font-label-md text-label-md text-primary font-bold">
                          {displayTime(item.occurred_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {item.revision_no > 1 && !isVoid && (
                          <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                            已更正 (v{item.revision_no})
                          </span>
                        )}
                        {isVoid && (
                          <span className="px-2 py-0.5 rounded-full bg-error-container text-error font-label-sm text-label-sm font-bold">
                            已作廢
                          </span>
                        )}
                        <button
                          onClick={() => setExpandedCardId(isExpanded ? null : item.event_id)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container"
                          aria-label="展開選單"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Main Detail Content */}
                    <p className="font-body-md text-body-md text-on-surface leading-relaxed mt-1">
                      {detailText}
                    </p>

                    {/* Optional Note / Memo in Payload */}
                    {Boolean(item.payload.note) && item.event_type !== 'NOTE' && (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 italic">
                        備註：{String(item.payload.note)}
                      </p>
                    )}

                    {/* Expanded Action Toolbar */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-surface-container flex items-center justify-between gap-2 text-xs">
                        <button
                          onClick={() => handleOpenHistory(item.event_id, item.event_type)}
                          className="flex items-center gap-1 text-tertiary hover:underline font-medium"
                        >
                          <span className="material-symbols-outlined text-[16px]">history</span>
                          <span>歷史版本</span>
                        </button>

                        {!isVoid && child?.scopes?.includes('CARE_WRITE') && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditing({ item, action: 'CORRECT' });
                                setTime(displayTime(item.occurred_at));
                                setAmount(String((item.payload as any).amount || (item.payload as any).amount_ml || ''));
                                setReason('');
                              }}
                              className="px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-medium"
                            >
                              更正
                            </button>
                            <button
                              onClick={() => {
                                setEditing({ item, action: 'VOID' });
                                setReason('');
                              }}
                              className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium"
                            >
                              作廢
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Parent Feedback Block (Phase 16) */}
        <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-sm border border-surface-container/60 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">favorite</span>
              <h4 className="font-label-lg text-label-lg text-on-surface font-semibold">
                家長即時反饋與叮嚀
              </h4>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">雙向溝通橋樑</span>
          </div>

          <textarea
            disabled={!canComment || commentSaving}
            maxLength={2000}
            value={commentText}
            onChange={(e) => { setCommentText(e.target.value); setCommentFeedback(''); }}
            rows={2}
            placeholder="感謝老師細心照顧！今晚預計 18:00 由爸爸接回..."
            className="w-full rounded-xl bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none border border-surface-container/50"
          ></textarea>
          {canComment && <label>留言類型 <select value={commentType} disabled={commentSaving} onChange={e => setCommentType(e.target.value)}><option value="COMMENT">一般留言</option><option value="PICKUP_NOTE">接送叮嚀</option></select></label>}
          {notesLoading ? <p role="status">留言載入中…</p> : commentError ? <p role="alert">{commentError}</p> : !isPreview && !notes.length ? <p>尚無已保存留言。</p> : null}
          {notes.map(note => <article key={note.id}><p>{note.instruction_type} · 作者 {note.author_user_id} · {new Date(note.created_at).toLocaleString('zh-TW')}</p><p>{note.content}</p></article>)}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-outline">
              {isPreview ? '合成預覽不提供留言保存。' : commentFeedback || '保存後才會清空文字；此處不表示 LINE 已送達或保母已閱讀。'}
            </span>
            <button
              disabled={!canComment || commentSaving || !commentText.trim()} onClick={handleSendComment}
              className="px-5 py-2 rounded-full bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-semibold shadow-sm active:scale-95 transition-all"
            >
              {isPreview ? '預覽不可保存' : commentSaving ? '保存中…' : '保存留言'}
            </button>
          </div>
        </div>
      </main>

      {/* Correction & Void Modal Dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-space-md shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-surface-container">
              <h3 className="font-headline-sm text-on-surface font-bold">
                {editing.action === 'CORRECT' ? '更正照護紀錄' : '作廢照護紀錄'}
              </h3>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {saveError && (
              <div className="my-2 p-2.5 rounded-xl bg-error-container text-error text-xs font-semibold">
                {saveError}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-3">
              {editing.action === 'CORRECT' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">時間 (HH:mm)</label>
                    <input
                      type="text"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container text-sm"
                    />
                  </div>
                  {editing.item.event_type === 'FEED' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-on-surface">更正奶量 (ml)</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container text-sm"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">
                  {editing.action === 'CORRECT' ? '更正原因 (必填)' : '作廢原因 (必填)'}
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例：更正實際餵食時間 / 誤植紀錄作廢"
                  className="px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-full bg-surface-container text-on-surface text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving || !reason.trim()}
                  onClick={handleSaveCorrection}
                  className={`px-5 py-2 rounded-full text-white text-sm font-semibold shadow-sm active:scale-95 transition-all ${
                    editing.action === 'CORRECT' ? 'bg-primary' : 'bg-rose-700'
                  } disabled:opacity-50`}
                >
                  {saving ? '處理中...' : editing.action === 'CORRECT' ? '確認修訂' : '確認作廢'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {historyEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-space-md shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">history</span>
                <h3 className="font-headline-sm text-on-surface font-bold">版本修訂歷史歷程</h3>
              </div>
              <button onClick={() => setHistoryEvent(null)} className="w-8 h-8 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              {historyEvent.revisions.map((rev) => (
                <div key={rev.id} className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1 border border-surface-container">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md font-bold text-primary">版本 v{rev.revision_no} ({rev.action})</span>
                    <span className="text-xs text-on-surface-variant">{displayTime(rev.occurred_at)}</span>
                  </div>
                  <p className="text-xs text-on-surface">
                    內容：{eventDetail(historyEvent.type, rev.payload)}
                  </p>
                  {rev.reason && (
                    <p className="text-xs text-secondary italic">理由：{rev.reason}</p>
                  )}
                  <span className="text-[10px] text-outline mt-1">
                    確認時間：{new Date(rev.confirmed_at).toLocaleString('zh-TW')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
