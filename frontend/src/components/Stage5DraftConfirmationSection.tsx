import React, { useState, useEffect } from 'react';

interface DraftItem {
  item_index: number;
  event_type: string;
  temporal_status?: string;
  occurred_at: string;
  payload: Record<string, any>;
  missing_fields?: string[];
  source_span?: string;
}

interface DraftBatch {
  id: string;
  child_id?: string;
  child?: { id: string; display_alias: string };
  status: string;
  lock_version: number;
  items: DraftItem[];
  created_at: string;
  expires_at: string;
}

interface Stage5Props {
  selectedChildId?: string;
  childrenList: Array<{ id: string; displayAlias: string }>;
}

export const Stage5DraftConfirmationSection: React.FC<Stage5Props> = ({
  selectedChildId,
  childrenList,
}) => {
  const [drafts, setDrafts] = useState<DraftBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftBatch | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showFlexJson, setShowFlexJson] = useState(false);
  const [flexPayload, setFlexPayload] = useState<any>(null);
  const [missingInputValues, setMissingInputValues] = useState<Record<string, any>>({});

  const childId = selectedChildId || (childrenList.length > 0 ? childrenList[0].id : undefined);

  const loadPendingDrafts = async () => {
    if (!childId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/drafts/pending?child_id=${childId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
        if (data.length > 0) {
          setActiveDraft(data[0]);
        } else {
          setActiveDraft(null);
        }
      }
    } catch {
      // Degraded / mock fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingDrafts();
  }, [childId]);

  // Load Flex preview JSON when active draft changes
  useEffect(() => {
    if (!activeDraft) {
      setFlexPayload(null);
      return;
    }
    fetch(`/api/drafts/${activeDraft.id}/flex-preview`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFlexPayload(data?.flexMessage || null))
      .catch(() => {});
  }, [activeDraft?.id]);

  const handleCreateSampleDraft = () => {
    const sample: DraftBatch = {
      id: `draft_sample_${Date.now()}`,
      child_id: childId || 'c_demo_child',
      child: {
        id: childId || 'c_demo_child',
        display_alias: childrenList.find((c) => c.id === childId)?.displayAlias || '小安',
      },
      status: 'PENDING_CONFIRMATION',
      lock_version: 1,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          item_index: 0,
          event_type: 'FEED',
          temporal_status: 'ACTUAL',
          occurred_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          payload: { amount_ml: 150, feed_type: 'FORMULA' },
          missing_fields: [],
          source_span: '11:40 喝150',
        },
        {
          item_index: 1,
          event_type: 'SLEEP_START',
          temporal_status: 'ACTUAL',
          occurred_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          payload: {},
          missing_fields: [],
          source_span: '13:10 睡著',
        },
      ],
    };
    setActiveDraft(sample);
    setConfirmResult(null);
    setErrorMsg(null);
  };

  const handleCreateMissingFieldDraft = () => {
    const sample: DraftBatch = {
      id: `draft_missing_${Date.now()}`,
      child_id: childId || 'c_demo_child',
      child: {
        id: childId || 'c_demo_child',
        display_alias: childrenList.find((c) => c.id === childId)?.displayAlias || '小安',
      },
      status: 'NEEDS_INPUT',
      lock_version: 1,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          item_index: 0,
          event_type: 'FEED',
          temporal_status: 'ACTUAL',
          occurred_at: new Date().toISOString(),
          payload: { feed_type: 'FORMULA' },
          missing_fields: ['amount_ml'],
          source_span: '剛剛喝奶',
        },
      ],
    };
    setActiveDraft(sample);
    setConfirmResult(null);
    setErrorMsg(null);
  };

  const handleConfirm = async () => {
    if (!activeDraft) return;
    setConfirming(true);
    setErrorMsg(null);

    // Prepare corrected items if missing fields were filled
    let correctedItems = [...activeDraft.items];
    if (Object.keys(missingInputValues).length > 0) {
      correctedItems = correctedItems.map((it) => {
        if (it.missing_fields && it.missing_fields.length > 0) {
          const newPayload = { ...it.payload };
          for (const f of it.missing_fields) {
            if (missingInputValues[f] !== undefined) {
              newPayload[f] = Number(missingInputValues[f]) || missingInputValues[f];
            }
          }
          return {
            ...it,
            payload: newPayload,
            missing_fields: [],
          };
        }
        return it;
      });
    }

    try {
      const res = await fetch(`/api/drafts/${activeDraft.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          expected_version: activeDraft.lock_version,
          items: correctedItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '草稿確認失敗');
      }

      const result = await res.json();
      setConfirmResult(result);
      setActiveDraft((prev) => (prev ? { ...prev, status: 'CONFIRMED' } : null));
    } catch (err: any) {
      setErrorMsg(err.message || '連線錯誤');
    } finally {
      setConfirming(false);
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'FEED':
        return { label: '🍼 喝奶', color: '#2e7d32', bg: '#e8f5e9' };
      case 'SLEEP_START':
        return { label: '😴 小睡入睡', color: '#1565c0', bg: '#e3f2fd' };
      case 'SLEEP_END':
        return { label: '⏰ 小睡醒來', color: '#1565c0', bg: '#e3f2fd' };
      case 'CHECK_IN':
        return { label: '📍 抵達簽到', color: '#e65100', bg: '#fff3e0' };
      case 'CHECK_OUT':
        return { label: '🚪 接回簽退', color: '#e65100', bg: '#fff3e0' };
      default:
        return { label: `📝 ${type}`, color: '#455a64', bg: '#eceff1' };
    }
  };

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Action Header */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={loadPendingDrafts}
          disabled={loading || !childId}
          style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
        >
          {loading ? '載入中...' : '重新整理待確認草稿'}
        </button>

        <button
          onClick={handleCreateSampleDraft}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: '#06C755',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          + 載入標準雙事件草稿 (喝奶 + 入睡)
        </button>

        <button
          onClick={handleCreateMissingFieldDraft}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            background: '#fa8c16',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + 載入缺欄位草稿 (需補填奶量)
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', padding: '8px 12px', borderRadius: '4px', marginBottom: '12px', color: '#cf1322', fontSize: '13px' }}>
          <strong>操作阻擋：</strong> {errorMsg}
        </div>
      )}

      {/* Draft Selection tabs if multiple */}
      {drafts.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto' }}>
          {drafts.map((d, i) => (
            <button
              key={d.id}
              onClick={() => {
                setActiveDraft(d);
                setConfirmResult(null);
                setErrorMsg(null);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: activeDraft?.id === d.id ? '2px solid #06C755' : '1px solid #d9d9d9',
                background: activeDraft?.id === d.id ? '#f6ffed' : '#fff',
                cursor: 'pointer',
              }}
            >
              草稿 #{i + 1} ({d.items.length} 筆) - {d.status}
            </button>
          ))}
        </div>
      )}

      {/* LINE Flex Message Preview Card Container */}
      {activeDraft ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            background: '#ffffff',
            maxWidth: '480px',
            margin: '0 auto 16px auto',
          }}
        >
          {/* Card Header */}
          <div style={{ background: '#0F172A', color: '#fff', padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 'bold' }}>
                CareLink 照護草稿待確認
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: activeDraft.status === 'CONFIRMED' ? '#10b981' : activeDraft.status === 'NEEDS_INPUT' ? '#ef4444' : '#0ea5e9',
                  color: '#fff',
                }}
              >
                {activeDraft.status === 'CONFIRMED' ? '已確認入帳' : activeDraft.status === 'NEEDS_INPUT' ? '需補填資訊' : '待人工確認'}
              </span>
            </div>
            <h3 style={{ margin: '6px 0 2px 0', fontSize: '18px' }}>
              {activeDraft.child?.display_alias || '小安'} · {new Date(activeDraft.created_at).toLocaleDateString('zh-TW')}
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
              AI 已抽取 {activeDraft.items.length} 筆事件，請核對後完成確認
            </p>
          </div>

          {/* Card Body */}
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
              抽取內容明細 (Extracted Items)
            </div>

            {activeDraft.items.map((item, idx) => {
              const badge = getEventBadge(item.event_type);
              const hasMissing = item.missing_fields && item.missing_fields.length > 0;

              return (
                <div
                  key={idx}
                  style={{
                    background: idx % 2 === 0 ? '#f8fafc' : '#ffffff',
                    border: '1px solid #f1f5f9',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: badge.color,
                        background: badge.bg,
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      {badge.label}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(item.occurred_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155' }}>
                    {item.event_type === 'FEED' && (
                      <span>
                        {item.payload.amount_ml ? `${item.payload.amount_ml} ml` : ''}{' '}
                        {item.payload.feed_type === 'FORMULA' ? '配方奶' : item.payload.feed_type || ''}
                      </span>
                    )}
                    {item.event_type === 'SLEEP_START' && (
                      <span style={{ color: '#475569' }}>開始入睡（不先猜測睡多久）</span>
                    )}
                    {item.event_type === 'CHECK_IN' && <span>抵達托育場所</span>}
                    {item.event_type === 'CHECK_OUT' && <span>接回簽退</span>}
                    {item.source_span && (
                      <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                        來源文字: "{item.source_span}"
                      </span>
                    )}
                  </div>

                  {/* Missing field inline editor */}
                  {hasMissing && (
                    <div style={{ marginTop: '8px', padding: '8px', background: '#fef2f2', border: '1px dashed #f87171', borderRadius: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 'bold' }}>
                        ⚠️ 缺少必填欄位: {item.missing_fields?.join(', ')}
                      </span>
                      {item.missing_fields?.map((field) => (
                        <div key={field} style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: '#333' }}>補填 {field}:</label>
                          <input
                            type="number"
                            placeholder="例如: 150"
                            value={missingInputValues[field] || ''}
                            onChange={(e) => setMissingInputValues({ ...missingInputValues, [field]: e.target.value })}
                            style={{ padding: '4px', width: '100px', fontSize: '12px' }}
                          />
                          <span style={{ fontSize: '12px', color: '#666' }}>ml</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '12px' }}>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                ⚖️ 依據照護合約規範：未經人工確認前不得作為正式照護紀錄或計費依據。
              </p>
            </div>
          </div>

          {/* Card Footer Actions */}
          <div style={{ background: '#f8fafc', padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleConfirm}
              disabled={confirming || activeDraft.status === 'CONFIRMED'}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#ffffff',
                background: activeDraft.status === 'CONFIRMED' ? '#94a3b8' : '#10b981',
                border: 'none',
                borderRadius: '6px',
                cursor: activeDraft.status === 'CONFIRMED' ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? '確認交易執行中...' : activeDraft.status === 'CONFIRMED' ? '✓ 本草稿已確認儲存' : '確認並存入時間軸 (Confirm to Timeline)'}
            </button>

            {/* Test Idempotency Button */}
            {activeDraft.status === 'CONFIRMED' && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '12px',
                  color: '#0f172a',
                  background: '#e2e8f0',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                🔁 再次點擊確認（測試冪等防護 Idempotency）
              </button>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <button
                onClick={() => setShowFlexJson(!showFlexJson)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showFlexJson ? '隱藏 LINE Flex JSON' : '查看完整 LINE Flex Message JSON'}
              </button>

              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                版本: v{activeDraft.lock_version}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px', background: '#fff', borderRadius: '8px', border: '1px dashed #d9d9d9', color: '#888' }}>
          目前無待確認草稿。點擊上方按鈕載入範例草稿或由 LINE OA 傳送訊息自動擷取。
        </div>
      )}

      {/* Confirmation Success Banner */}
      {confirmResult && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: 'bold' }}>
            <span>✓ 狀態：{confirmResult.status === 'ALREADY_CONFIRMED' ? '已確認（冪等回傳現有紀錄，未重複建立）' : '已成功建立正式照護紀錄！'}</span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#047857' }}>
            共入帳 {confirmResult.eventCount} 筆事件，已產生 CareEvent 與 Revision 紀錄，並同步至雙方時間軸。
          </p>
        </div>
      )}

      {/* LINE Flex Message JSON Viewer */}
      {showFlexJson && flexPayload && (
        <div style={{ background: '#1e293b', color: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '6px' }}>
            LINE Messaging API Flex Message Container (Bubble):
          </div>
          <pre style={{ margin: 0 }}>{JSON.stringify(flexPayload, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
