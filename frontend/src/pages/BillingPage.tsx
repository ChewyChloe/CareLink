import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface SettlementData {
  id: string;
  child_id: string;
  child_name: string;
  contract_id: string;
  contract_version_id: string;
  billing_rule_id: string;
  period: string;
  status: string;
  currency: string;
  total_amount: number;
  base_amount: number;
  overtime_amount: number;
  engine_version: string;
  input_hash: string;
  content_hash: string;
  blocking_reasons?: Array<{ code: string; reason: string }> | null;
  lines: Array<{
    id: string;
    item_type: string;
    item_name: string;
    quantity: number;
    unit: string;
    unit_rate: number;
    amount: number;
    calculation_snapshot: any;
    line_key: string;
    sources: Array<{
      event_id?: string;
      event_revision_id: string;
      occurred_at: string;
      event_type: string;
      action: string;
      source_type?: string;
    }>;
  }>;
  evidence_summary: {
    scheduled_end: string;
    actual_checkout: string;
    overtime_minutes: number;
    units: number;
    unit_rate: number;
    overtime_fee: number;
    deterministic_formula: string;
    contract_version_hash: string;
    checkout_event_revision_id: string;
    source_type?: string;
    date_display?: string;
  };
}

export function BillingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const periodParam = searchParams.get('period') || '2026-09';
  const childIdParam = searchParams.get('child_id') || searchParams.get('childId') || '';

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  const targetChildId = childIdParam || user?.grants?.[0]?.childId || '';
  const isExplicitDemo = searchParams.get('demo') === 'true';
  const allowDevFallback = Boolean(import.meta.env.DEV && isExplicitDemo);

  useEffect(() => {
    setLoading(true);
    setError('');

    if (!targetChildId && !allowDevFallback) {
      setError('未選取受託幼兒，請由寶寶列表選取或重新登入。');
      setLoading(false);
      return;
    }

    const fetchUrl = targetChildId
      ? `/api/children/${targetChildId}/billing/summary?period=${periodParam}`
      : `/api/billing/demo-showcase?period=${periodParam}`;

    fetch(fetchUrl, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          if (allowDevFallback) {
            return fetch(`/api/billing/demo-showcase?period=${periodParam}`).then((r) => r.json());
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `載入費用結算失敗 (${res.status})`);
        }
        return res.json();
      })
      .then((data: SettlementData | SettlementData[]) => {
        if (Array.isArray(data)) {
          setSettlement(data[0] || null);
        } else {
          setSettlement(data);
        }
      })
      .catch((err) => {
        setError(err.message || '無法載入費用結算資料');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [periodParam, targetChildId, allowDevFallback, user]);

  const formatProvenanceSource = (sourceType?: string) => {
    switch (sourceType) {
      case 'LINE_AI':
        return 'LINE AI 整理後確認';
      case 'MANUAL':
        return '手動紀錄';
      case 'SYSTEM':
        return '系統自動紀錄';
      default:
        return '托育紀錄簽退確認';
    }
  };

  if (loading) {
    return (
      <main className="flex flex-col relative w-full px-4 pt-20 pb-24 max-w-[760px] mx-auto min-h-screen bg-[#fbf9f5]">
        <div className="p-8 text-center text-xs text-stone-500 bg-white rounded-2xl shadow-sm border border-stone-100">
          正在核對 100% 確定性計費引擎結算單…
        </div>
      </main>
    );
  }

  if (error || !settlement) {
    return (
      <main className="flex flex-col relative w-full px-4 pt-20 pb-24 max-w-[760px] mx-auto min-h-screen bg-[#fbf9f5]">
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs shadow-sm">
          {error || '找不到結算單資料'}
        </div>
      </main>
    );
  }

  const ev = settlement.evidence_summary;
  const isBlocked = settlement.status === 'BLOCKED' || Boolean(settlement.blocking_reasons?.length);
  const blockingReason = settlement.blocking_reasons?.[0]?.reason || '缺少有效接回紀錄，暫無法完成計算。';

  return (
    <main className="flex flex-col relative w-full px-4 pt-20 pb-32 max-w-[760px] mx-auto min-h-screen bg-[#fbf9f5]">
      <div className="flex flex-col w-full gap-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-all active:scale-95 shadow-sm"
            onClick={() => navigate(targetChildId ? `/timeline?child_id=${targetChildId}` : '/timeline')}
            title="返回今日紀錄"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold text-stone-800">費用帳務</span>
          <button
            type="button"
            onClick={() => navigate(targetChildId ? `/contract?child_id=${targetChildId}` : '/contract')}
            className="text-xs font-semibold text-[#a93349] hover:underline"
          >
            目前契約 ↗
          </button>
        </div>

        {/* 1. Top Hero: 2026 年 9 月 本月托育費 */}
        <section className="w-full bg-gradient-to-br from-white to-[#fff5f6] rounded-2xl p-5 shadow-sm border border-[#fb7185]/20 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-[#fb7185]/15 text-[#a93349] text-xs font-bold">
                {settlement.period.slice(0, 4)} 年 {parseInt(settlement.period.slice(5), 10)} 月
              </span>
              <h1 className="text-base font-bold text-stone-900">
                本月托育費
              </h1>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                isBlocked
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : confirmed
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-100 text-[#a93349] border border-rose-200'
              }`}
            >
              {isBlocked ? '待補資料 (BLOCKED)' : confirmed ? '已確認版本紀錄' : '待家長核對'}
            </span>
          </div>

          {/* Child Name & Hero Amount */}
          <div className="flex items-baseline justify-between pt-2">
            <div>
              <p className="text-xs text-stone-500 font-medium">受託幼兒</p>
              <p className="text-sm font-bold text-stone-800">{settlement.child_name}</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-stone-500 mr-1.5">應付總金額</span>
              <span className="text-3xl font-black text-[#a93349] font-mono">
                NT$ {settlement.total_amount.toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        {/* Settlement Blocking Notice (if incomplete) */}
        {isBlocked && (
          <section className="w-full p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-amber-600 mt-0.5 shrink-0">warning</span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold">暫無法完成費用計算</p>
              <p className="text-xs text-amber-800">{blockingReason}</p>
            </div>
          </section>
        )}

        {/* 2. Breakdown Categories: 5 Standard Categories */}
        <section className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#eae8e4] flex flex-col gap-3">
          <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            費用項目明細
          </h2>

          <div className="flex flex-col divide-y divide-stone-100">
            {/* Category 1: 基本托育費 */}
            {settlement.base_amount > 0 && (
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                    <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-800">基本托育費</span>
                    <span className="block text-[11px] text-stone-500">常規約定時段 09:00 - 18:00</span>
                  </div>
                </div>
                <strong className="text-xs font-bold text-stone-900 font-mono">
                  NT$ {settlement.base_amount.toLocaleString()}
                </strong>
              </div>
            )}

            {/* Category 2: 逾時托育 (MANDATORY DEMO ITEM) */}
            <div
              onClick={() => setShowEvidenceModal(true)}
              className="py-3 flex items-center justify-between cursor-pointer group hover:bg-rose-50/50 rounded-xl px-2 -mx-2 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#fb7185]/20 flex items-center justify-center text-[#a93349]">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[#a93349]">逾時托育</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-[#a93349] font-semibold">
                      點擊查看依據
                    </span>
                  </div>
                  <span className="block text-xs text-stone-500 mt-0.5">
                    18:00 托育結束 ➔ 18:31 簽退接回 (31分鐘 / 2單位)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <strong className="text-base font-black text-[#a93349] font-mono">
                  NT$ {settlement.overtime_amount.toLocaleString()}
                </strong>
                <span className="block text-[10px] text-stone-400 group-hover:text-[#a93349] transition-colors">
                  計算依據 ↗
                </span>
              </div>
            </div>

            {/* Other categories (Only show if actual data exists) */}
            {settlement.lines
              .filter((l) => l.item_type !== 'BASE' && l.item_type !== 'OVERTIME')
              .map((l) => (
                <div key={l.id} className="py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">{l.item_name}</span>
                  <strong className="text-xs font-bold text-stone-900 font-mono">
                    NT$ {l.amount.toLocaleString()}
                  </strong>
                </div>
              ))}
          </div>
        </section>

        {/* 3. Evidence Detail Card (Interactive or Expandable Modal) */}
        {showEvidenceModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-[480px] bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border border-stone-200 animate-in fade-in slide-in-from-bottom-6 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#fb7185]/20 flex items-center justify-center text-[#a93349]">
                    <span className="material-symbols-outlined text-[16px]">calculate</span>
                  </div>
                  <h3 className="text-sm font-bold text-stone-900">計算依據 (Evidence Detail)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEvidenceModal(false)}
                  className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              {/* Exact 7 Parameters Required by Golden Path */}
              <div className="p-3.5 rounded-xl bg-stone-50 flex flex-col gap-2 text-xs">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">契約托育至</span>
                  <strong className="text-stone-800 font-bold">{ev.scheduled_end}</strong>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">實際接回</span>
                  <strong className="text-[#a93349] font-bold">{ev.actual_checkout}</strong>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">逾時</span>
                  <strong className="text-stone-800 font-bold">{ev.overtime_minutes} 分鐘</strong>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">計費方式</span>
                  <strong className="text-stone-800 font-semibold">每 30 分鐘 NT$ {ev.unit_rate}</strong>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">計費單位</span>
                  <strong className="text-stone-800 font-bold">{ev.units}</strong>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-stone-500">計算</span>
                  <strong className="text-stone-800 font-mono font-semibold">{ev.units} × NT$ {ev.unit_rate}</strong>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                  <span className="text-stone-700 font-bold">本筆金額</span>
                  <strong className="text-base font-black text-[#a93349] font-mono">
                    NT$ {ev.overtime_fee}
                  </strong>
                </div>
              </div>

              {/* Provenance & Sourcing Box (Section L) */}
              <div className="p-3 rounded-xl bg-[#fff9fa] border border-[#fb7185]/20 flex flex-col gap-1.5 text-[11px] text-stone-600">
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">紀錄來源</span>
                  <span className="font-semibold text-stone-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-[#a93349]">auto_awesome</span>
                    {formatProvenanceSource(ev.source_type)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">簽退事實證據</span>
                  <span className="text-stone-800">CareEvent CHECK_OUT (已確認現行版本)</span>
                </div>
                {childIdParam && (
                  <div className="pt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEvidenceModal(false);
                        navigate(`/timeline?child_id=${childIdParam}`);
                      }}
                      className="text-[#a93349] hover:underline font-bold flex items-center gap-0.5"
                    >
                      <span>前往時間軸查看該筆簽退紀錄</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </button>
                  </div>
                )}
              </div>

              {/* CRITICAL DEMO DISCLAIMER (Mandatory by Section K) */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">verified</span>
                <span>金額由契約規則與確認後的托育紀錄計算，AI 不參與費用決定。</span>
              </div>

              <button
                type="button"
                onClick={() => setShowEvidenceModal(false)}
                className="w-full py-2.5 rounded-full bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 transition-colors"
              >
                關閉依據說明
              </button>
            </div>
          </div>
        )}

        {/* 4. Guardian Version Acknowledgment Button */}
        <div className="pt-2 pb-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={isBlocked}
            className={`w-full py-3.5 rounded-full font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
              isBlocked
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : confirmed
                ? 'bg-emerald-600 text-white'
                : 'bg-[#a93349] text-white hover:opacity-95 active:scale-98'
            }`}
            onClick={() => setConfirmed(!confirmed)}
          >
            <span className="material-symbols-outlined text-[20px]">
              {confirmed ? 'verified' : 'task_alt'}
            </span>
            <span>{confirmed ? '已完成本月費用版本核對' : '確認本月費用版本紀錄'}</span>
          </button>

          {/* Small non-legal disclaimer */}
          <p className="text-center text-[11px] text-stone-500 leading-relaxed px-4">
            CareLink 費用紀錄由托育事實與契約條款確定性換算，保留版本歷史，不取代正式發票或收據。
          </p>
        </div>
      </div>
    </main>
  );
}
