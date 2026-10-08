import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface SupplyReminder {
  id: string;
  item_name: string;
  quantity?: string | null;
  status: string;
  due_at: string | null;
  assigned_to: string;
  created_by: string;
  packed_at?: string | null;
  received_at?: string | null;
  reminder_sent: boolean;
  commerce_url?: string | null;
}

const ITEM_OPTIONS = [
  { value: '尿布', label: '尿布' },
  { value: '濕紙巾', label: '濕紙巾' },
  { value: '奶粉', label: '奶粉' },
  { value: '其他', label: '其他' },
];

function getStatusBadge(status: string, reminderSent: boolean) {
  switch (status) {
    case 'PENDING':
      return {
        label: reminderSent ? '已提醒' : '待提醒',
        bg: 'var(--cl-warning-soft)',
        color: 'var(--cl-warning)',
      };
    case 'PACKED':
      return {
        label: '已準備',
        bg: '#E8F5E9',
        color: '#2E7D32',
      };
    case 'RECEIVED':
      return {
        label: '已交接',
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
  if (!due_at) return '';
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
    return '';
  }
}

export function HandoffPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reminders, setReminders] = useState<SupplyReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const isGuardian = userRole === 'GUARDIAN';

  // Load reminders
  const fetchReminders = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/supply-reminders?child_id=${childId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setReminders(data);
      }
    } catch {
      // Silently fail — page still works without data
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

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

    // Need to find a guardian to assign to
    // For the MVP, look at all grants for the child and find a guardian
    // The backend needs a guardian_user_id
    setSubmitting(true);
    setError(null);

    try {
      // First, get all grants for the child to find a guardian
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
      await fetchReminders();
    } catch (err: any) {
      setError(err.message || '建立提醒失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePack = async (reminderId: string) => {
    try {
      const res = await fetch(`/api/supply-reminders/${reminderId}/pack`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        await fetchReminders();
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
        await fetchReminders();
      }
    } catch {
      // Silently fail
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

        {/* ── 用品狀態 Section ── */}
        <section className="cl-baby-profile-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--cl-warning-soft)', color: 'var(--cl-warning)' }}>
                <span className="material-symbols-outlined text-[22px]">inventory_2</span>
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--cl-text)' }}>用品狀態</h2>
                <p className="text-xs" style={{ color: 'var(--cl-text-muted)' }}>Care-to-Commerce 用品補給</p>
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
                {showForm ? '取消' : '新增提醒'}
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
                  備註 (選填)
                </label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`請補充${itemName}`}
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
                {submitting ? '建立中...' : '建立提醒'}
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
              目前沒有用品提醒
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {reminders.map((r) => {
                const badge = getStatusBadge(r.status, r.reminder_sent);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-xl flex flex-col gap-2"
                    style={{ background: 'var(--cl-surface-soft)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: 'var(--cl-text)' }}>
                        {r.item_name}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {r.quantity && (
                      <p className="text-xs" style={{ color: 'var(--cl-text-secondary)' }}>
                        {r.quantity}
                      </p>
                    )}

                    {r.due_at && (
                      <p className="text-[11px]" style={{ color: 'var(--cl-text-muted)' }}>
                        提醒時間：{formatDueTime(r.due_at)}
                      </p>
                    )}

                    {/* Guardian actions */}
                    {isGuardian && r.status === 'PENDING' && r.assigned_to === user?.id && (
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handlePack(r.id)}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: 'var(--cl-primary)',
                            color: 'var(--cl-on-primary)',
                          }}
                        >
                          已經準備好了
                        </button>
                        {r.commerce_url && (
                          <a
                            href={r.commerce_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-center transition-all"
                            style={{
                              background: 'var(--cl-surface)',
                              color: 'var(--cl-text-secondary)',
                              border: '1px solid var(--cl-border)',
                            }}
                          >
                            前往購買
                          </a>
                        )}
                      </div>
                    )}

                    {/* Caregiver receive action */}
                    {isCaregiver && r.status === 'PACKED' && (
                      <button
                        type="button"
                        onClick={() => handleReceive(r.id)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold transition-all mt-1"
                        style={{
                          background: '#E8F5E9',
                          color: '#2E7D32',
                          border: '1px solid #C8E6C9',
                        }}
                      >
                        確認收到用品
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
            並銜接 LINE 電商入口，讓家長從「收到補貨需求」直接進入採買，
            最後回到 CareLink 完成用品交班。
          </p>
        </div>
      </div>
    </main>
  );
}
