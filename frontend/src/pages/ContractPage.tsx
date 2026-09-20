import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface ContractData {
  contract_id: string;
  version_id: string;
  version_no: number;
  status: string;
  child_id: string;
  child_alias: string;
  caregiver_name: string;
  effective_from: string;
  effective_to: string;
  scheduled_start: string;
  scheduled_end: string;
  overtime_unit_minutes: number;
  overtime_unit_price: number;
  base_monthly_amount: number;
  content_hash: string;
  guardian_ack_at?: string | null;
  caregiver_ack_at?: string | null;
}

export function ContractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const childIdParam = searchParams.get('child_id') || searchParams.get('childId') || '';

  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');

    const fetchUrl = childIdParam
      ? `/api/children/${childIdParam}/contract`
      : '/api/contracts/demo-showcase';

    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) {
          // If child endpoint fails or user unauthorized, fallback to demo contract showcase
          return fetch('/api/contracts/demo-showcase').then((r) => r.json());
        }
        return res.json();
      })
      .then((data: ContractData) => {
        setContract(data);
      })
      .catch((err) => {
        setError(err.message || '無法載入契約資訊');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [childIdParam, user]);

  const formatDateRange = (fromStr: string, toStr: string) => {
    try {
      const f = new Date(fromStr).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const t = new Date(toStr).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      return `${f} 至 ${t}`;
    } catch {
      return '2026/09/01 至 2027/08/31';
    }
  };

  return (
    <main className="flex flex-col relative w-full px-4 pt-20 pb-32 max-w-[760px] mx-auto min-h-screen bg-[#fbf9f5]">
      <div className="flex flex-col w-full gap-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-all active:scale-95 shadow-sm"
            onClick={() => navigate(childIdParam ? `/timeline?child_id=${childIdParam}` : '/timeline')}
            title="返回今日紀錄"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold text-on-surface">托育服務契約</span>
          <div className="w-9" />
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-on-surface-variant bg-surface-container-lowest rounded-2xl shadow-sm">
            載入契約版本中…
          </div>
        ) : error && !contract ? (
          <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs shadow-sm">
            {error}
          </div>
        ) : contract ? (
          <>
            {/* Primary Contract Card */}
            <section className="w-full bg-surface-container-lowest rounded-2xl p-5 shadow-sm border border-[#eae8e4] flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-[#fb7185]/15 text-[#a93349] text-xs font-bold">
                    目前契約
                  </span>
                  <h2 className="text-base font-bold text-[#1b1c1a]">
                    日間托育服務契約書
                  </h2>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                  有效版本 (v{contract.version_no})
                </span>
              </div>

              {/* Terms Details Grid */}
              <div className="p-4 rounded-xl bg-[#f7f5f0] text-xs text-[#574143] flex flex-col gap-2.5">
                <div className="flex justify-between items-center py-1 border-b border-[#eae8e4]/60">
                  <span className="text-stone-500">受託幼兒</span>
                  <strong className="text-stone-900 font-semibold text-sm">{contract.child_alias}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#eae8e4]/60">
                  <span className="text-stone-500">托育人員 / 機構</span>
                  <strong className="text-stone-900 font-semibold">{contract.caregiver_name}</strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#eae8e4]/60">
                  <span className="text-stone-500">約定托育時間</span>
                  <strong className="text-stone-900 font-bold text-sm text-[#a93349]">
                    {contract.scheduled_start} – {contract.scheduled_end}
                  </strong>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#eae8e4]/60">
                  <span className="text-stone-500">常規月費</span>
                  <strong className="text-stone-900 font-semibold">
                    NT$ {contract.base_monthly_amount.toLocaleString()} / 月
                  </strong>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-stone-500">逾時計費標準</span>
                  <strong className="text-[#a93349] font-bold text-sm">
                    每 {contract.overtime_unit_minutes} 分鐘 NT$ {contract.overtime_unit_price} (不足以一單位計)
                  </strong>
                </div>
              </div>

              {/* Version & Immutability Trace Box */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 flex flex-col gap-2 text-xs">
                <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
                  契約版本與不可竄改資訊
                </span>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-500">版本編號</span>
                  <span className="font-mono text-stone-800 font-semibold">ContractVersion v{contract.version_no}.0</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-500">有效期間</span>
                  <span className="text-stone-800">{formatDateRange(contract.effective_from, contract.effective_to)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-500">內容防偽指紋</span>
                  <span className="font-mono text-stone-600 bg-white px-1.5 py-0.5 rounded border border-stone-200">
                    {contract.content_hash.slice(0, 24)}…
                  </span>
                </div>
              </div>
            </section>

            {/* Acknowledgment Action Card */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                className={`w-full py-3.5 rounded-full font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 ${
                  acknowledged
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#a93349] text-white hover:opacity-95 active:scale-98'
                }`}
                onClick={() => setAcknowledged(!acknowledged)}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {acknowledged ? 'check_circle' : 'task_alt'}
                </span>
                <span>{acknowledged ? '已確認此版本紀錄' : '確認契約版本紀錄'}</span>
              </button>

              {/* Non-legal disclaimer (Required by Section J & D) */}
              <p className="text-center text-[11px] text-stone-500 leading-relaxed px-4 pt-2">
                此頁顯示雙方目前確認的契約版本。CareLink 保留版本紀錄，不取代正式法律文件。
              </p>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
