import { useNavigate } from 'react-router-dom';

export function HandoffPage() {
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
              <p className="text-xs text-on-surface-variant">湯圓 · 2026年9月17日</p>
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

        {/* Notice Card */}
        <div className="p-4 rounded-xl bg-primary-soft/50 border border-primary/20 text-xs text-on-surface-variant flex items-start gap-2.5">
          <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">info</span>
          <p>
            雙向數位交班聯絡簿即將支援語音轉文字與即時照片附件，讓家長與老師接送溝通更安心！
          </p>
        </div>
      </div>
    </main>
  );
}
