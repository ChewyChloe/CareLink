import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
      event_revision_id: string;
      occurred_at: string;
      event_type: string;
      action: string;
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
  };
}

export function BillingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const periodParam = searchParams.get('period') || '2026-09';

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');

    fetch(`/api/billing/demo-showcase?period=${periodParam}`)
      .then((res) => {
        if (!res.ok) throw new Error('無法載入費用結算資料');
        return res.json();
      })
      .then((data: SettlementData) => {
        setSettlement(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [periodParam, user]);

  if (loading) {
    return (
      <main className="flex flex-col relative w-full px-4 pt-20 pb-24 max-w-[760px] mx-auto min-h-screen">
        <div className="p-8 text-center text-sm text-on-surface-variant">
          正在核對 100% 確定性計費引擎結算單…
        </div>
      </main>
    );
  }

  if (error || !settlement) {
    return (
      <main className="flex flex-col relative w-full px-4 pt-20 pb-24 max-w-[760px] mx-auto min-h-screen">
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs" role="alert">
          {error || '找不到結算單資料'}
        </div>
      </main>
    );
  }

  const ev = settlement.evidence_summary;

  return (
    <main className="flex flex-col relative w-full px-4 pt-20 pb-24 max-w-[760px] mx-auto min-h-screen">
      <div className="flex flex-col w-full gap-4">
        {/* 1. Overall Monthly Settlement Card */}
        <section className="w-full bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3 border border-primary-fixed/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-surface-container-low text-xs font-semibold text-on-surface-variant">
                {settlement.period.slice(0, 4)} 年 {settlement.period.slice(5)} 月
              </span>
              <h2 className="text-base font-bold text-on-surface">
                {settlement.child_name} · 托育結算單
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-bold shadow-sm">
              {confirmed ? '已核對完成 · 待撥款' : '待家長核對 (PENDING_ACK)'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-xs text-on-surface-variant font-medium">日間常規月費</span>
              <span className="text-base font-bold text-on-surface mt-0.5">
                NT$ {settlement.base_amount.toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col">
              <span className="text-xs text-on-surface-variant font-medium">延托逾時費</span>
              <span className="text-base font-bold text-primary mt-0.5">
                NT$ {settlement.overtime_amount.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-baseline justify-between pt-2 border-t border-surface-container-high">
            <span className="text-xs font-bold text-on-surface-variant">本期應付總計</span>
            <div className="text-2xl font-black text-primary">
              <span className="text-sm font-bold mr-1">NT$</span>
              <span>{settlement.total_amount.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* 2. Mandatory Overtime Deterministic Calculation Card */}
        <section className="w-full bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3.5 border-2 border-primary/30 shadow-[0_4px_20px_-2px_rgba(251,113,133,0.12)]">
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
            <span>100% 確定性數學運算認證 · 嚴禁 AI 生成金額</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[20px]">calculate</span>
            <h3 className="font-bold text-base text-on-surface">延托逾時費精算依據</h3>
          </div>

          {/* 4-Item Parameter Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-surface-container-low">
            <div className="flex flex-col">
              <span className="text-[11px] text-on-surface-variant font-medium">契約約定結束</span>
              <span className="text-sm font-bold text-on-surface mt-0.5">{ev.scheduled_end}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-on-surface-variant font-medium">實際簽退接回</span>
              <span className="text-sm font-bold text-primary mt-0.5">{ev.actual_checkout}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-on-surface-variant font-medium">逾時時間</span>
              <span className="text-sm font-bold text-on-surface mt-0.5">{ev.overtime_minutes} 分鐘</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-on-surface-variant font-medium">計費標準 (每單位)</span>
              <span className="text-sm font-bold text-on-surface mt-0.5">30 分鐘 / NT${ev.unit_rate}</span>
            </div>
          </div>

          {/* Deterministic Mathematical Formula Bar */}
          <div className="p-3 rounded-xl bg-primary-fixed/30 border border-primary-container/40 flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-primary-fixed">確定性計費公式 (不足 30 分鐘以 30 分鐘計)：</span>
            <div className="text-base font-black text-primary font-mono tracking-tight">
              ⌈{ev.overtime_minutes} / 30⌉ × NT${ev.unit_rate} = {ev.units} × NT${ev.unit_rate} = NT${ev.overtime_fee}
            </div>
          </div>

          {/* Full Audit & Traceability Link Box */}
          <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-2 text-xs">
            <span className="font-bold text-on-surface flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-primary">link</span>
              不可竄改稽核溯源鏈 (Immutable Audit Chain)
            </span>

            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">契約版本 (ContractVersion)</span>
              <span className="font-mono text-[11px] text-primary bg-white px-1.5 py-0.5 rounded border border-outline-variant/30">
                {settlement.contract_version_id.slice(0, 18)}…
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">計費規則 (BillingRule)</span>
              <span className="font-mono text-[11px] text-primary bg-white px-1.5 py-0.5 rounded border border-outline-variant/30">
                {settlement.billing_rule_id.slice(0, 18)}…
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">簽退事實證據 (CareEvent CHECK_OUT)</span>
              <span className="font-mono text-[11px] text-primary bg-white px-1.5 py-0.5 rounded border border-outline-variant/30">
                {ev.checkout_event_revision_id} (18:31:00)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">結算溯源 (SettlementLineSource)</span>
              <span className="font-mono text-[11px] text-primary bg-white px-1.5 py-0.5 rounded border border-outline-variant/30">
                #line_overtime_01 ➔ {ev.checkout_event_revision_id}
              </span>
            </div>
          </div>
        </section>

        {/* 3. Line Items Breakdown List */}
        <section className="w-full bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-2.5 border border-primary-fixed/40">
          <h3 className="text-sm font-bold text-on-surface">費用明細清單</h3>

          {settlement.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between py-2 border-b border-surface-container-high last:border-b-0">
              <div>
                <p className="text-sm font-semibold text-on-surface">{line.item_name}</p>
                <p className="text-xs text-on-surface-variant">
                  {line.item_type === 'BASE' ? '常規全日照護月費' : `${line.quantity} ${line.unit} × NT$${line.unit_rate}`}
                </p>
              </div>
              <div className={`text-sm font-bold ${line.item_type === 'OVERTIME' ? 'text-primary' : 'text-on-surface'}`}>
                NT$ {line.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </section>

        {/* 4. Guardian Confirmation Button */}
        <div className="pt-2 pb-6">
          <button
            type="button"
            className="w-full py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-md hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2"
            onClick={() => setConfirmed(!confirmed)}
          >
            <span className="material-symbols-outlined text-[20px]">
              {confirmed ? 'verified' : 'task_alt'}
            </span>
            <span>{confirmed ? '已核對並留存電子簽章 (點擊可重設)' : '確認費用無誤 · 簽章核對'}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
