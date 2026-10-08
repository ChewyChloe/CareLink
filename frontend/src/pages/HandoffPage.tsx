import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface SupplyReminder {
  id: string;
  item_name: string;
  size?: string | null;
  quantity?: string | null;
  remaining_quantity?: string | null;
  status: string;
  due_at: string | null;
  assigned_to: string;
  created_by: string;
  packed_at?: string | null;
  received_at?: string | null;
  reminder_sent: boolean;
  commerce_url?: string | null;
}

interface SupplyDraft {
  id: string;
  item_name: string;
  size?: string | null;
  quantity?: string | null;
  remaining_quantity?: string | null;
  status: string;
  due_at?: string | null;
  urgency: string;
  missing_fields?: string[];
  created_at: string;
}

interface RecommendedOption {
  type: 'FASTEST' | 'CHEAPEST_UNIT_PRICE' | 'PREFERRED_BRAND' | string;
  title: string;
  badge: string;
  reason: string;
  product: {
    id: string;
    itemCategory: string;
    brand: string;
    productName: string;
    size?: string | null;
    packQuantity: number;
    price: number;
    unitPrice: number;
    unitPriceUnit: string;
    estimatedDelivery: string;
    merchant: string;
    url: string;
    lastUpdatedAt: string;
  };
}

interface CommerceRecommendationResult {
  itemCategory: string;
  size: string | null;
  options: RecommendedOption[];
  disclaimer: string;
}

const ITEM_OPTIONS = [
  { value: '尿布', label: '尿布' },
  { value: '濕紙巾', label: '濕紙巾' },
  { value: '奶粉', label: '奶粉' },
  { value: '換洗衣物', label: '換洗衣物' },
  { value: '其他', label: '其他' },
];

function getStatusBadge(status: string, reminderSent: boolean) {
  switch (status) {
    case 'PENDING':
      return {
        label: reminderSent ? '已提醒 (待準備)' : '待提醒',
        bg: 'var(--cl-warning-soft)',
        color: 'var(--cl-warning)',
      };
    case 'PACKED':
      return {
        label: '已準備 (待送達)',
        bg: '#E8F5E9',
        color: '#2E7D32',
      };
    case 'RECEIVED':
      return {
        label: '已交接 (已收到)',
        bg: 'var(--cl-surface-container)',
        color: 'var(--cl-text-muted)',
      };
    default:
      return {
        label: status,
        bg: 'var(--cl-surface-container)',
        color: 'var(--cl-text-muted)',
      };
  }
}

function formatDueTime(due_at: string | null): string {
  if (!due_at) return '未指定';
  try {
    const d = new Date(due_at);
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return due_at;
  }
}

export function HandoffPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reminders, setReminders] = useState<SupplyReminder[]>([]);
  const [drafts, setDrafts] = useState<SupplyDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recommendations modal state
  const [selectedTaskForRec, setSelectedTaskForRec] = useState<SupplyReminder | null>(null);
  const [recommendations, setRecommendations] = useState<CommerceRecommendationResult | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Form state
  const [itemName, setItemName] = useState('尿布');
  const [quantity, setQuantity] = useState('');
  const [dueAt, setDueAt] = useState('');

  // Determine child and role from grants
  const grant = user?.grants?.[0];
  const childId = grant?.childId;
  const childAlias = grant?.childAlias || '幼兒';
  const userRole = grant?.role;
  const isCaregiver = userRole === 'CAREGIVER';

  // Load reminders and drafts
  const fetchRemindersAndDrafts = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const [remindersRes, draftsRes] = await Promise.all([
        fetch(`/api/supply-reminders?child_id=${childId}`, { credentials: 'include' }),
        fetch(`/api/supply-reminders/drafts?child_id=${childId}`, { credentials: 'include' }),
      ]);

      if (remindersRes.ok) {
        const data = await remindersRes.json();
        setReminders(data);
      }
      if (draftsRes.ok) {
        const draftsData = await draftsRes.json();
        setDrafts(draftsData);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    fetchRemindersAndDrafts();
  }, [fetchRemindersAndDrafts]);

  // Set default due time to 2 minutes from now (demo friendly)
  useEffect(() => {
    const now = new Date(Date.now() + 2 * 60 * 1000);
    const offset = 8 * 60; // Asia/Taipei UTC+8
    const local = new Date(now.getTime() + offset * 60 * 1000);
    const iso = local.toISOString().slice(0, 16);
    setDueAt(iso);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childId || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/supply-reminders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: childId,
          item_name: itemName,
          quantity: quantity || undefined,
          due_at: new Date(dueAt).toISOString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `建立失敗 (HTTP ${res.status})`);
      }

      setShowForm(false);
      setQuantity('');
      await fetchRemindersAndDrafts();
    } catch (err: any) {
      setError(err.message || '建立提醒失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/supply-reminders/drafts/${draftId}/confirm`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchRemindersAndDrafts();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || '確認失敗');
      }
    } catch {
      alert('網路錯誤');
    }
  };

  const handleCancelDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/supply-reminders/drafts/${draftId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchRemindersAndDrafts();
      }
    } catch {
      // Silently fail
    }
  };

  const handlePack = async (reminderId: string) => {
    try {
      const res = await fetch(`/api/supply-reminders/${reminderId}/pack`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchRemindersAndDrafts();
      }
    } catch {
      // Silently fail
    }
  };

  const handleReceive = async (reminderId: string) => {
    try {
      const res = await fetch(`/api/supply-reminders/${reminderId}/receive`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchRemindersAndDrafts();
      }
    } catch {
      // Silently fail
    }
  };

  const handleOpenRecommendations = async (reminder: SupplyReminder) => {
    setSelectedTaskForRec(reminder);
    setLoadingRecs(true);
    setRecommendations(null);

    try {
      const res = await fetch(`/api/supply-reminders/${reminder.id}/recommendations`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingRecs(false);
    }
  };

  return (
    <main className="cl-main cl-container">
      <div className="flex flex-col gap-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="cl-date-nav-btn"
            onClick={() => navigate('/timeline')}
            title="返回今日"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold text-on-surface">每日交班聯絡簿</span>
          <div className="w-8" />
        </div>

        {/* Handoff Status Card */}
        <section className="cl-baby-profile-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary-fixed text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">swap_horiz</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">今日交班狀態</h2>
              <p className="text-xs text-on-surface-variant">{childAlias} · {new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span>晨間交班 (家長 ➔ 老師)</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">已完成</span>
            </div>
            <p className="text-[11px] text-on-surface">早餐喝奶 150ml，昨晚睡眠良好無夜驚，體溫 36.5°C 正常。</p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span>傍晚交班 (老師 ➔ 家長)</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">待接回確認</span>
            </div>
            <p className="text-[11px] text-on-surface">精神極佳，午睡約 1 小時 50 分鐘，今日無委託用藥。</p>
          </div>
        </section>

        {/* ── AI 用品提醒草稿 (Draft Confirmation Gate) ── */}
        {drafts.length > 0 && (
          <section className="cl-baby-profile-card border-2 border-amber-300 bg-amber-50/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-amber-900">AI 用品提醒草稿 ({drafts.length})</h2>
                  <p className="text-[11px] text-amber-700">需經照護者人工確認，確認後才排程發送給家長</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 mt-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">
                        {draft.item_name} {draft.size ? `(${draft.size} 號)` : ''}
                      </span>
                      {draft.urgency === 'HIGH' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                          緊急
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      待確認草稿
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded-lg">
                    {draft.quantity && <div><strong>需求：</strong>{draft.quantity}</div>}
                    {draft.remaining_quantity && <div><strong>剩餘：</strong>{draft.remaining_quantity}</div>}
                    <div><strong>期限：</strong>{formatDueTime(draft.due_at || null)}</div>
                    {draft.missing_fields && draft.missing_fields.length > 0 && (
                      <div className="col-span-2 text-amber-700 text-[11px]">
                        ⚠️ 缺少資訊：{draft.missing_fields.join('、')}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmDraft(draft.id)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                    >
                      確認建立提醒
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCancelDraft(draft.id)}
                      className="py-1.5 px-3 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 正式用品狀態 (Supply Tasks) ── */}
        <section className="cl-baby-profile-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--cl-warning-soft)', color: 'var(--cl-warning)' }}>
                <span className="material-symbols-outlined text-[22px]">inventory_2</span>
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--cl-text)' }}>用品任務與採買</h2>
                <p className="text-xs" style={{ color: 'var(--cl-text-muted)' }}>Care-to-Commerce 智慧閉環</p>
              </div>
            </div>
            {isCaregiver && (
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: showForm ? 'var(--cl-surface-container)' : 'var(--cl-primary)',
                  color: showForm ? 'var(--cl-text)' : 'var(--cl-on-primary)',
                }}
              >
                {showForm ? '取消' : '手動新增'}
              </button>
            )}
          </div>

          {/* Create Reminder Form (Caregiver only) */}
          {showForm && isCaregiver && (
            <form onSubmit={handleCreate} className="flex flex-col gap-3 p-3.5 rounded-xl mt-2"
              style={{ background: 'var(--cl-surface-soft)' }}>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--cl-text-secondary)' }}>
                  用品項目
                </label>
                <div className="flex gap-2 flex-wrap">
                  {ITEM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setItemName(opt.value)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: itemName === opt.value ? 'var(--cl-primary)' : 'var(--cl-surface)',
                        color: itemName === opt.value ? 'var(--cl-on-primary)' : 'var(--cl-text-secondary)',
                        border: `1px solid ${itemName === opt.value ? 'var(--cl-primary)' : 'var(--cl-border)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--cl-text-secondary)' }}>
                  數量 / 規格備註 (選填)
                </label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`例：M 號一包`}
                  className="px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{
                    background: 'var(--cl-surface)',
                    borderColor: 'var(--cl-border)',
                    color: 'var(--cl-text)',
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--cl-text-secondary)' }}>
                  提醒時間
                </label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{
                    background: 'var(--cl-surface)',
                    borderColor: 'var(--cl-border)',
                    color: 'var(--cl-text)',
                  }}
                />
              </div>

              {error && (
                <p className="text-xs" style={{ color: 'var(--cl-danger)' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: submitting ? 'var(--cl-surface-dim)' : 'var(--cl-primary)',
                  color: 'var(--cl-on-primary)',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? '建立中...' : '建立提醒任務'}
              </button>
            </form>
          )}

          {/* Reminder List */}
          {loading ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--cl-text-muted)' }}>載入中...</p>
          ) : reminders.length === 0 ? (
            <div className="p-4 rounded-xl text-center text-xs" style={{
              background: 'var(--cl-surface-soft)',
              color: 'var(--cl-text-muted)',
            }}>
              目前沒有進行中的用品任務
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {reminders.map((r) => {
                const badge = getStatusBadge(r.status, r.reminder_sent);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl flex flex-col gap-2.5 border border-gray-100 shadow-sm"
                    style={{ background: 'var(--cl-surface-soft)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--cl-text)' }}>
                          {r.item_name} {r.size ? `(${r.size} 號)` : ''}
                        </span>
                        {r.quantity && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                            {r.quantity}
                          </span>
                        )}
                      </div>
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {r.remaining_quantity && (
                        <div>現有剩餘：<strong>{r.remaining_quantity}</strong></div>
                      )}
                      {r.due_at && (
                        <div>預定時間：<strong>{formatDueTime(r.due_at)}</strong></div>
                      )}
                    </div>

                    {/* Actions based on state */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                      {/* PENDING State: Can pack or view purchase recommendations */}
                      {r.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePack(r.id)}
                            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm"
                            style={{
                              background: 'var(--cl-primary)',
                              color: 'var(--cl-on-primary)',
                            }}
                          >
                            ✓ 我已準備
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRecommendations(r)}
                            className="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-xs font-semibold text-center transition-all flex items-center justify-center gap-1.5 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                          >
                            <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                            查看購買選項
                          </button>
                        </>
                      )}

                      {/* PACKED State: Caregiver confirms receipt */}
                      {r.status === 'PACKED' && (
                        <button
                          type="button"
                          onClick={() => handleReceive(r.id)}
                          className="w-full px-3 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                          style={{
                            background: '#E8F5E9',
                            color: '#2E7D32',
                            border: '1px solid #A5D6A7',
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                          照護者確認收到用品
                        </button>
                      )}

                      {/* RECEIVED State: Closed loop */}
                      {r.status === 'RECEIVED' && (
                        <div className="text-[11px] text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-emerald-600">check_circle</span>
                          已由照護者簽收交接完畢
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Commerce Recommendation Modal ── */}
        {selectedTaskForRec && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="p-4 border-b flex items-center justify-between bg-sky-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">
                      智慧補貨推薦 · {selectedTaskForRec.item_name} {selectedTaskForRec.size ? `(${selectedTaskForRec.size} 號)` : ''}
                    </h3>
                    <p className="text-[11px] text-gray-500">依時效、單價與偏好排序之可信商城選項</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTaskForRec(null)}
                  className="w-7 h-7 rounded-full bg-gray-200/70 hover:bg-gray-300 text-gray-600 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto flex flex-col gap-3">
                {loadingRecs ? (
                  <div className="py-12 text-center text-xs text-gray-500">
                    正在載入精選補貨推薦...
                  </div>
                ) : recommendations && recommendations.options && recommendations.options.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {recommendations.options.map((opt, idx) => (
                        <div
                          key={opt.product.id}
                          className="p-3.5 rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col gap-2.5 hover:border-sky-300 transition"
                        >
                          {/* Badges & Rank */}
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  opt.badge.includes('最快')
                                    ? 'bg-rose-100 text-rose-700'
                                    : opt.badge.includes('最低')
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-indigo-100 text-indigo-700'
                                }`}
                              >
                                {opt.badge}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-gray-400">
                              方案 #{idx + 1}
                            </span>
                          </div>

                          {/* Product Details */}
                          <div>
                            <h4 className="font-bold text-sm text-gray-900">
                              {opt.product.productName}
                            </h4>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {opt.product.brand} · {opt.product.merchant} · {opt.product.estimatedDelivery}
                            </div>
                          </div>

                          {/* Pricing & Units */}
                          <div className="flex items-baseline justify-between bg-gray-50 p-2.5 rounded-lg">
                            <div className="text-base font-extrabold text-rose-600">
                              NT$ {opt.product.price}
                            </div>
                            {opt.product.unitPrice && (
                              <div className="text-xs font-semibold text-emerald-700">
                                每{opt.product.unitPriceUnit} NT$ {opt.product.unitPrice}
                              </div>
                            )}
                          </div>

                          {/* Recommendation Rationale */}
                          <div className="text-xs text-sky-900 bg-sky-50/70 p-2 rounded-lg border border-sky-100 flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-sky-600 shrink-0 mt-0.5">
                              tips_and_updates
                            </span>
                            <span>{opt.reason}</span>
                          </div>

                          {/* External Buy Action */}
                          <a
                            href={opt.product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 px-3 rounded-lg text-xs font-bold text-center bg-sky-600 hover:bg-sky-700 text-white transition flex items-center justify-center gap-1.5"
                          >
                            前往 {opt.product.merchant} 購買
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          </a>
                        </div>
                      ))}
                    </div>

                    {/* Disclaimer & Privacy Protection Banner */}
                    <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center gap-1 font-semibold text-amber-800">
                        <span className="material-symbols-outlined text-[15px]">verified_user</span>
                        {recommendations.disclaimer}
                      </div>
                      <p className="text-[10px] text-gray-600 leading-relaxed">
                        🔒 <strong>隱私保護聲明</strong>：電商層僅使用最少必要之商品規格與時效資訊，絕不向外部商家傳遞幼兒姓名、照護日誌、健檢紀錄或家長身份。CareLink 本身不代收付款或建立商城訂單。
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-xs text-gray-500">
                    暫無相符的商品推薦選項
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 border-t bg-gray-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForRec(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-200 hover:bg-gray-300 text-gray-800 transition"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notice Card */}
        <div className="p-4 rounded-xl text-xs flex items-start gap-2.5"
          style={{
            background: 'rgba(var(--cl-primary-soft), 0.5)',
            border: '1px solid rgba(169, 51, 73, 0.2)',
            color: 'var(--cl-text-muted)',
          }}>
          <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
            style={{ color: 'var(--cl-primary)' }}>info</span>
          <p>
            CareLink 將照護現場發現的用品需求轉成可追蹤的 LINE 提醒，
            並銜接可信電商入口，讓家長從「收到補貨需求」直接進入採買，
            最後回到 CareLink 完成用品交班閉環。
          </p>
        </div>
      </div>
    </main>
  );
}
