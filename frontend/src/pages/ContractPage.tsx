import { useNavigate } from 'react-router-dom';

export function ContractPage() {
  const navigate = useNavigate();

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
          <span className="text-sm font-bold text-on-surface">托育服務契約</span>
          <div className="w-8" />
        </div>

        {/* Contract Card */}
        <section className="cl-billing-header-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="cl-billing-period-chip">2026 年度</span>
              <h2 className="text-base font-bold text-on-surface">日間托育服務契約書</h2>
            </div>
            <span className="cl-settlement-status-badge">有效契約 (ACTIVE)</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low text-xs text-on-surface-variant flex flex-col gap-2">
            <div className="flex justify-between">
              <span>受託幼兒</span>
              <strong className="text-on-surface">湯圓 (張忱恩)</strong>
            </div>
            <div className="flex justify-between">
              <span>托育機構</span>
              <strong className="text-on-surface">愛苗托育中心</strong>
            </div>
            <div className="flex justify-between">
              <span>約定常規時段</span>
              <strong className="text-on-surface">週一至週五 08:00 - 18:00</strong>
            </div>
            <div className="flex justify-between">
              <span>常規月費</span>
              <strong className="text-on-surface">NT$ 18,000 / 月</strong>
            </div>
            <div className="flex justify-between">
              <span>逾時延托標準</span>
              <strong className="text-primary">每 30 分鐘 NT$ 98 (不足30分以30分計)</strong>
            </div>
          </div>

          <div className="cl-trace-box">
            <span className="cl-trace-title">
              <span className="material-symbols-outlined text-[16px]">verified</span>
              契約不可竄改雜湊與版本資訊
            </span>
            <div className="cl-trace-row">
              <span className="cl-trace-label">版本序號</span>
              <span className="cl-trace-id">ContractVersion v1.0</span>
            </div>
            <div className="cl-trace-row">
              <span className="cl-trace-label">內容指紋 (Hash)</span>
              <span className="cl-trace-id">cv_hash_202609_immutable</span>
            </div>
            <div className="cl-trace-row">
              <span className="cl-trace-label">生效日期</span>
              <span className="cl-trace-id">2026-09-01 至 2027-08-31</span>
            </div>
          </div>
        </section>

        {/* Action button */}
        <button
          type="button"
          className="w-full py-3 rounded-full bg-surface-container-low hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-all"
          onClick={() => alert('此合約版本已由雙方數位簽章核可，具完整法律效力。')}
        >
          查看雙方數位憑證與條款細則 ↗
        </button>
      </div>
    </main>
  );
}
