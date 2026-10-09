import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface ChildInfo {
  id: string;
  displayAlias: string;
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
  meal_count: number;
  activity_count: number;
  medication_count: number;
  hygiene_count: number;
  growth_count: number;
}

type ModalCategory =
  | 'FEED'
  | 'SLEEP'
  | 'MEAL'
  | 'DIAPER'
  | 'BOWEL_MOVEMENT'
  | 'TEMPERATURE'
  | 'HYGIENE'
  | 'ACTIVITY'
  | 'MEDICATION'
  | 'GROWTH_MEASUREMENT'
  | 'NOTE'
  | 'PICKUP'
  | null;

export const NewEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [selectedChildName, setSelectedChildName] = useState<string>('寶貝');
  const [loadError, setLoadError] = useState('');
  const [loadPending, setLoadPending] = useState(true);
  const [summary, setSummary] = useState<DailySummaryMetrics | null>(null);
  const [activeModal, setActiveModal] = useState<ModalCategory>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form states
  const [formTime, setFormTime] = useState<string>('12:00');
  const [formNote, setFormNote] = useState<string>('');

  // Feed
  const [milkType, setMilkType] = useState<'FORMULA' | 'BREAST_MILK' | 'OTHER'>('FORMULA');
  const [feedAmount, setFeedAmount] = useState<number>(150);

  // Sleep
  const [sleepAction, setSleepAction] = useState<'SLEEP_START' | 'SLEEP_END'>('SLEEP_START');

  // Meal
  const [mealType, setMealType] = useState<string>('午餐');
  const [mealDesc, setMealDesc] = useState<string>('南瓜泥副食品');
  const [mealCompletion, setMealCompletion] = useState<'FULL' | 'PARTIAL' | 'REFUSED' | 'UNKNOWN'>('FULL');
  const [mealAmount, setMealAmount] = useState<string>('200');

  // Diaper
  const [diaperCondition, setDiaperCondition] = useState<'WET' | 'DRY' | 'SOILED' | 'MIXED'>('WET');

  // Bowel Movement
  const [bowelConsistency, setBowelConsistency] = useState<string>('軟便');
  const [bowelColor, setBowelColor] = useState<string>('金黃色');

  // Temperature
  const [tempCelsius, setTempCelsius] = useState<number>(36.5);
  const [tempSite, setTempSite] = useState<string>('耳溫');

  // Hygiene
  const [hygieneType, setHygieneType] = useState<'BATH' | 'CLOTHING_CHANGE' | 'HAND_WASH' | 'ORAL_CARE' | 'OTHER'>('CLOTHING_CHANGE');

  // Activity
  const [activityType, setActivityType] = useState<string>('認知共讀');
  const [activityTitle, setActivityTitle] = useState<string>('繪本共讀');
  const [activityDuration, setActivityDuration] = useState<number>(20);

  // Medication
  const [medName, setMedName] = useState<string>('感冒咳嗽糖漿');
  const [medDosage, setMedDosage] = useState<string>('5ml');

  // Growth
  const [growthHeight, setGrowthHeight] = useState<string>('77.0');
  const [growthWeight, setGrowthWeight] = useState<string>('10.0');
  const [growthHead, setGrowthHead] = useState<string>('45.0');

  // Note
  const [noteType, setNoteType] = useState<'TEACHER_REMARK' | 'PARENT_COMMENT'>('TEACHER_REMARK');
  const [noteContent, setNoteContent] = useState<string>('');

  // Pickup
  const [pickupType, setPickupType] = useState<'CHECK_IN' | 'CHECK_OUT' | 'PLANNED_PICKUP'>('CHECK_IN');
  const [pickupPerson, setPickupPerson] = useState<string>('媽媽');

  const todayStr = new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  useEffect(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setFormTime(`${hh}:${mm}`);
  }, [activeModal]);

  useEffect(() => {
    fetchInitialChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      fetchSummary(selectedChildId);
    }
  }, [selectedChildId]);

  const fetchInitialChildren = async () => {
    try {
      const res = await fetch('/api/children', { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '資料載入失敗');
      if (res.ok) {
        const data = await res.json();
        setChildren(data || []);
        const paramId = searchParams.get('child_id');
        const defaultChild = paramId ? data.find((c: any) => c.id === paramId) || data[0] : data[0];
        if (defaultChild) {
          setSelectedChildId(defaultChild.id);
          setSelectedChildName(defaultChild.displayAlias);
        }
      }
    } catch (err) {
      setLoadError((err as Error).message);
    } finally { setLoadPending(false); }
  };

  const fetchSummary = async (childId: string) => {
    setSummary(null); setLoadPending(true); setLoadError('');
    try {
      const res = await fetch(`/api/children/${childId}/summary`, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 401 ? '請重新登入' : '摘要載入失敗');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      setLoadError((err as Error).message);
    } finally { setLoadPending(false); }
  };

  const handleOpenModal = (category: ModalCategory) => {
    setFormError(null);
    setFormNote('');
    setActiveModal(category);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChildId || !activeModal) return;

    setSubmitting(true);
    setFormError(null);

    let event_type = '';
    let payload: Record<string, any> = {};

    switch (activeModal) {
      case 'FEED':
        event_type = 'FEED';
        payload = {
          milk_type: milkType,
          amount: Number(feedAmount),
          unit: 'ml',
          note: formNote.trim() || undefined,
        };
        break;

      case 'SLEEP':
        event_type = sleepAction;
        payload = {
          note: formNote.trim() || undefined,
        };
        break;

      case 'MEAL':
        event_type = 'MEAL';
        payload = {
          meal_type: mealType,
          description: mealDesc,
          amount: mealAmount ? Number(mealAmount) : undefined,
          amount_unit: 'ml',
          completion: mealCompletion,
          note: formNote.trim() || undefined,
        };
        break;

      case 'DIAPER':
        event_type = 'DIAPER';
        payload = {
          condition: diaperCondition,
          note: formNote.trim() || undefined,
        };
        break;

      case 'BOWEL_MOVEMENT':
        event_type = 'BOWEL_MOVEMENT';
        payload = {
          consistency: bowelConsistency,
          color: bowelColor,
          note: formNote.trim() || undefined,
        };
        break;

      case 'TEMPERATURE':
        event_type = 'TEMPERATURE';
        payload = {
          value_celsius: Number(tempCelsius),
          measurement_site: tempSite,
          note: formNote.trim() || undefined,
        };
        break;

      case 'HYGIENE':
        event_type = 'HYGIENE';
        payload = {
          hygiene_type: hygieneType,
          note: formNote.trim() || undefined,
        };
        break;

      case 'ACTIVITY':
        event_type = 'ACTIVITY';
        payload = {
          activity_type: activityType,
          title: activityTitle,
          duration_minutes: Number(activityDuration) || undefined,
          note: formNote.trim() || undefined,
        };
        break;

      case 'MEDICATION':
        event_type = 'MEDICATION';
        payload = {
          medication_name: medName,
          dosage_text: medDosage,
          administered_at: formTime,
          note: formNote.trim() || undefined,
        };
        break;

      case 'GROWTH_MEASUREMENT':
        event_type = 'GROWTH_MEASUREMENT';
        payload = {
          height_cm: growthHeight ? Number(growthHeight) : undefined,
          weight_kg: growthWeight ? Number(growthWeight) : undefined,
          head_circumference_cm: growthHead ? Number(growthHead) : undefined,
          note: formNote.trim() || undefined,
        };
        break;

      case 'NOTE':
        event_type = 'NOTE';
        payload = {
          note_type: noteType,
          content: noteContent.trim(),
        };
        break;

      case 'PICKUP':
        event_type = pickupType;
        payload = {
          person: pickupPerson,
          pickup_time: formTime,
          note: formNote.trim() || undefined,
        };
        break;
    }

    try {
      const res = await fetch(`/api/children/${selectedChildId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          event_type,
          occurred_at: formTime,
          payload,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || `建立失敗 (${res.status})`);
      }

      // Success
      setActiveModal(null);
      setSuccessToast(`已成功手動登記「${selectedChildName}」生活紀錄！`);
      setTimeout(() => setSuccessToast(null), 3000);
      fetchSummary(selectedChildId);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || '儲存失敗，請檢查填寫資料');
    } finally {
      setSubmitting(false);
    }
  };

  const totalRecordedCount = summary?.total_records || 0;
  const targetRecords = 10;
  const progressPercent = Math.min(100, Math.round((totalRecordedCount / targetRecords) * 100));

  if (loadPending) return <main role="status" className="p-8 pt-24">載入中…</main>;
  if (loadError) return <main role="alert" className="p-8 pt-24">{loadError}</main>;
  if (!selectedChildId) return <main className="p-8 pt-24">尚無可記錄的孩子。</main>;
  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-body-md text-on-surface flex flex-col pb-28">
      {/* Header */}
      <header className="sticky top-0 w-full z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        <div className="h-16 px-space-md max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <button
              onClick={() => navigate('/children')}
              aria-label="返回"
              className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back_ios_new</span>
            </button>
            <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">
              新增照護紀錄
            </h1>
          </div>

          {/* Child Switcher */}
          {children.length > 1 && (
            <select
              value={selectedChildId}
              onChange={(e) => {
                const found = children.find((c) => c.id === e.target.value);
                if (found) {
                  setSelectedChildId(found.id);
                  setSelectedChildName(found.displayAlias);
                }
              }}
              className="bg-surface-container-low text-on-surface font-label-md px-3 py-1.5 rounded-full border-none focus:ring-2 focus:ring-primary/40"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayAlias}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="w-full max-w-xl mx-auto px-space-lg pt-space-sm flex flex-col gap-space-md">
        {/* Child & Date Sub-header */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded-full shadow-xs">
            <div className="w-7 h-7 rounded-full bg-primary-fixed text-primary font-bold flex items-center justify-center text-xs">
              {selectedChildName.charAt(0)}
            </div>
            <span className="font-label-lg text-label-lg text-on-surface font-bold">
              {selectedChildName}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-surface-container-lowest px-3 py-1.5 rounded-full shadow-xs text-on-surface-variant font-label-md">
            <span className="material-symbols-outlined text-[16px] text-primary">calendar_today</span>
            <span>{todayStr}</span>
          </div>
        </div>

        {/* Progress Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-fixed/40 via-surface-container-lowest to-secondary-fixed/30 p-space-md shadow-sm border border-surface-container/60">
          <div className="flex items-center justify-between relative z-10">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                  今日托育作息紀錄
                </span>
              </div>
              <p className="font-headline-sm text-headline-sm text-on-surface mt-0.5 font-bold">
                已記錄 <span className="text-primary">{totalRecordedCount}</span> 項 · 剩餘{' '}
                <span className="text-secondary">{Math.max(0, targetRecords - totalRecordedCount)}</span> 項
              </p>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-surface-container-high"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                ></path>
                <path
                  className="text-primary"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={`${progressPercent}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3.5"
                ></path>
              </svg>
              <span className="absolute font-label-md text-label-md font-bold text-primary">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Categories Grid Header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5 font-bold">
            <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
            項目分類快速填報
          </h2>
          <span className="font-label-sm text-label-sm text-outline">點選卡片開啟表單</span>
        </div>

        {/* Category Cards (11 Cards) */}
        <div className="flex flex-col gap-2.5">
          {/* 1. 喝奶 (FEED) */}
          <div
            onClick={() => handleOpenModal('FEED')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-secondary-fixed text-on-secondary-fixed-variant flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">baby_changing_station</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">喝奶狀況</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">配方奶、母乳哺育紀錄</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-semibold">
                {summary?.feed_count || 0} 筆 · 共 {summary?.total_feed_amount_ml || 0} ml
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 2. 睡覺 (SLEEP) */}
          <div
            onClick={() => handleOpenModal('SLEEP')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">bedtime</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">睡覺狀況</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">早晨小睡、午睡深度與醒來時間</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-semibold">
                {summary?.sleep_segments || 0} 段 · 共 {summary?.sleep_duration_text || '0m'}
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 3. 飲食 (MEAL) */}
          <div
            onClick={() => handleOpenModal('MEAL')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-surface-container-high text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">restaurant</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">飲食副食</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">正餐泥粥、幼兒點心完食情形</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold">
                {summary?.meal_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 4. 排便 (BOWEL_MOVEMENT) */}
          <div
            onClick={() => handleOpenModal('BOWEL_MOVEMENT')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">water_drop</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">排便狀況</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">色澤、形狀軟硬客觀紀錄</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.bowel_movement_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 5. 尿布 (DIAPER) */}
          <div
            onClick={() => handleOpenModal('DIAPER')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">dry_cleaning</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">尿布更換</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">尿濕、乾淨與護臀紀錄</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.diaper_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 6. 體溫 (TEMPERATURE) */}
          <div
            onClick={() => handleOpenModal('TEMPERATURE')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">device_thermostat</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">體溫狀況</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">入園晨檢、午後定時客觀量測</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-primary-fixed text-primary font-bold">
                {summary?.latest_temperature ? `${summary.latest_temperature}°C` : '尚未量測'}
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 7. 清潔 (HYGIENE) */}
          <div
            onClick={() => handleOpenModal('HYGIENE')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">bathtub</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">清潔衛生</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">洗澡、更衣、洗手、口腔潔牙</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.hygiene_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 8. 活動 (ACTIVITY) */}
          <div
            onClick={() => handleOpenModal('ACTIVITY')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">smart_toy</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">活動探索</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">繪本共讀、大肌肉肢體鍛鍊</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.activity_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 9. 用藥 (MEDICATION) */}
          <div
            onClick={() => handleOpenModal('MEDICATION')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">medication</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">用藥紀錄</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">如需用藥，請核對家長醫囑</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.medication_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 10. 生長測量 (GROWTH_MEASUREMENT) */}
          <div
            onClick={() => handleOpenModal('GROWTH_MEASUREMENT')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">straighten</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">生長測量</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">客觀記錄身高、體重、頭圍</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                {summary?.growth_count || 0} 筆
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 11. 生活叮嚀 (NOTE) */}
          <div
            onClick={() => handleOpenModal('NOTE')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">format_quote</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">生活叮嚀</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">老師溫馨叮嚀與作息說明</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                登記留言
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>

          {/* 12. 接送 (CHECK_IN / CHECK_OUT) */}
          <div
            onClick={() => handleOpenModal('PICKUP')}
            className="category-card bg-surface-container-lowest hover:bg-surface-container-low transition-all rounded-xl p-3.5 shadow-sm border border-surface-container/50 flex items-center justify-between cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">departure_board</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">入園與接送</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">到園簽到、簽退或預約接送</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-md text-label-md px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-semibold">
                簽到退
              </span>
              <span className="material-symbols-outlined text-outline-variant text-[20px]">chevron_right</span>
            </div>
          </div>
        </div>

        {/* View Full Timeline Button */}
        <div className="mt-4 pt-2">
          <button
            onClick={() => navigate(`/timeline?child_id=${selectedChildId}`)}
            className="w-full py-3.5 px-6 rounded-full bg-primary hover:bg-primary/90 text-on-primary font-label-lg text-label-lg shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">menu_book</span>
            <span>查看今日完整生活歷程</span>
          </button>
        </div>
      </main>

      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-5 py-2.5 rounded-full shadow-xl text-body-sm font-label-md flex items-center gap-2 z-50 animate-bounce">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
          <span>{successToast}</span>
        </div>
      )}

      {/* Modal Overlay & Forms */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-space-md shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-surface-container">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {activeModal === 'FEED' && '喝奶紀錄'}
                  {activeModal === 'SLEEP' && '睡眠作息'}
                  {activeModal === 'MEAL' && '飲食副食'}
                  {activeModal === 'DIAPER' && '更換尿布'}
                  {activeModal === 'BOWEL_MOVEMENT' && '排便紀錄'}
                  {activeModal === 'TEMPERATURE' && '體溫量測'}
                  {activeModal === 'HYGIENE' && '清潔衛生'}
                  {activeModal === 'ACTIVITY' && '活動探索'}
                  {activeModal === 'MEDICATION' && '用藥紀錄'}
                  {activeModal === 'GROWTH_MEASUREMENT' && '生長測量'}
                  {activeModal === 'NOTE' && '生活叮嚀'}
                  {activeModal === 'PICKUP' && '入園接送'}
                </span>
                <span className="font-label-sm px-2 py-0.5 rounded-full bg-primary-fixed text-primary font-semibold">
                  {selectedChildName}
                </span>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {formError && (
              <div className="my-3 p-3 rounded-xl bg-error-container text-error text-body-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{formError}</span>
              </div>
            )}

            {/* Modal Body Form */}
            <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 pt-4">
              {/* Common Time Field */}
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-on-surface font-semibold">紀錄時間 (Asia/Taipei)</label>
                <input
                  type="time"
                  required
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container font-label-lg"
                />
              </div>

              {/* Feed Form */}
              {activeModal === 'FEED' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">奶類</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 'FORMULA', label: '配方奶' },
                        { val: 'BREAST_MILK', label: '母乳' },
                        { val: 'OTHER', label: '其他' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setMilkType(item.val as any)}
                          className={`py-2 rounded-xl text-center font-label-md border transition-all ${
                            milkType === item.val
                              ? 'bg-primary text-on-primary border-primary font-bold'
                              : 'bg-surface-container-low text-on-surface border-surface-container'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">奶量 (ml)</label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={500}
                      value={feedAmount}
                      onChange={(e) => setFeedAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container font-label-lg"
                    />
                  </div>
                </>
              )}

              {/* Sleep Form */}
              {activeModal === 'SLEEP' && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-on-surface font-semibold">作息狀態</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSleepAction('SLEEP_START')}
                      className={`py-2.5 rounded-xl text-center font-label-md border transition-all ${
                        sleepAction === 'SLEEP_START'
                          ? 'bg-primary text-on-primary border-primary font-bold'
                          : 'bg-surface-container-low text-on-surface border-surface-container'
                      }`}
                    >
                      開始入睡 🛌
                    </button>
                    <button
                      type="button"
                      onClick={() => setSleepAction('SLEEP_END')}
                      className={`py-2.5 rounded-xl text-center font-label-md border transition-all ${
                        sleepAction === 'SLEEP_END'
                          ? 'bg-primary text-on-primary border-primary font-bold'
                          : 'bg-surface-container-low text-on-surface border-surface-container'
                      }`}
                    >
                      醒來 ☀️
                    </button>
                  </div>
                </div>
              )}

              {/* Meal Form */}
              {activeModal === 'MEAL' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">餐別</label>
                      <input
                        type="text"
                        required
                        value={mealType}
                        onChange={(e) => setMealType(e.target.value)}
                        placeholder="午餐 / 點心"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">份量 (ml/g)</label>
                      <input
                        type="number"
                        value={mealAmount}
                        onChange={(e) => setMealAmount(e.target.value)}
                        placeholder="200"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">餐點內容說明</label>
                    <input
                      type="text"
                      required
                      value={mealDesc}
                      onChange={(e) => setMealDesc(e.target.value)}
                      placeholder="例：南瓜蔬菜雞肉粥"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">進食完成度</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { val: 'FULL', label: '全部完食' },
                        { val: 'PARTIAL', label: '吃約大半' },
                        { val: 'REFUSED', label: '拒食' },
                        { val: 'UNKNOWN', label: '未詳' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setMealCompletion(item.val as any)}
                          className={`py-1.5 rounded-lg text-xs font-semibold border ${
                            mealCompletion === item.val
                              ? 'bg-secondary text-on-secondary border-secondary'
                              : 'bg-surface-container-low text-on-surface border-surface-container'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Diaper Form */}
              {activeModal === 'DIAPER' && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-on-surface font-semibold">尿布狀態</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { val: 'WET', label: '尿濕 💧' },
                      { val: 'DRY', label: '乾淨 ✨' },
                      { val: 'SOILED', label: '弄髒 💩' },
                      { val: 'MIXED', label: '混合 🔀' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setDiaperCondition(item.val as any)}
                        className={`py-2 rounded-xl text-center font-label-md border ${
                          diaperCondition === item.val
                            ? 'bg-tertiary text-on-tertiary border-tertiary font-bold'
                            : 'bg-surface-container-low text-on-surface border-surface-container'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bowel Movement Form */}
              {activeModal === 'BOWEL_MOVEMENT' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">便便形狀質地</label>
                    <div className="grid grid-cols-5 gap-1">
                      {['軟便', '糊便', '條狀', '硬便', '水便'].map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setBowelConsistency(item)}
                          className={`py-1.5 rounded-lg text-xs font-semibold border ${
                            bowelConsistency === item
                              ? 'bg-amber-700 text-white border-amber-700'
                              : 'bg-surface-container-low text-on-surface border-surface-container'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">色澤</label>
                    <input
                      type="text"
                      value={bowelColor}
                      onChange={(e) => setBowelColor(e.target.value)}
                      placeholder="例：金黃色 / 棕褐色"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                </>
              )}

              {/* Temperature Form */}
              {activeModal === 'TEMPERATURE' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">客觀體溫 (°C)</label>
                    <input
                      type="number"
                      required
                      step="0.1"
                      min={33.0}
                      max={43.0}
                      value={tempCelsius}
                      onChange={(e) => setTempCelsius(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container font-headline-sm font-bold text-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">測量部位</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['耳溫', '額溫', '腋溫'].map((site) => (
                        <button
                          key={site}
                          type="button"
                          onClick={() => setTempSite(site)}
                          className={`py-2 rounded-xl text-center font-label-md border ${
                            tempSite === site
                              ? 'bg-primary text-on-primary border-primary font-bold'
                              : 'bg-surface-container-low text-on-surface border-surface-container'
                          }`}
                        >
                          {site}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Hygiene Form */}
              {activeModal === 'HYGIENE' && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-on-surface font-semibold">清潔項目</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { val: 'CLOTHING_CHANGE', label: '更換衣物 👕' },
                      { val: 'BATH', label: '洗澡沐浴 🛁' },
                      { val: 'HAND_WASH', label: '洗手消毒 🧼' },
                      { val: 'ORAL_CARE', label: '口腔潔牙 🪥' },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setHygieneType(item.val as any)}
                        className={`py-2 rounded-xl text-center font-label-md border ${
                          hygieneType === item.val
                            ? 'bg-secondary text-on-secondary border-secondary font-bold'
                            : 'bg-surface-container-low text-on-surface border-surface-container'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Form */}
              {activeModal === 'ACTIVITY' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">活動類別</label>
                      <input
                        type="text"
                        required
                        value={activityType}
                        onChange={(e) => setActivityType(e.target.value)}
                        placeholder="閱讀 / 探索 / 大肌肉"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">持續分鐘</label>
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={activityDuration}
                        onChange={(e) => setActivityDuration(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">活動名稱 / 內容</label>
                    <input
                      type="text"
                      required
                      value={activityTitle}
                      onChange={(e) => setActivityTitle(e.target.value)}
                      placeholder="例：繪本動物辨認共讀"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                </>
              )}

              {/* Medication Form */}
              {activeModal === 'MEDICATION' && (
                <>
                  <div className="p-2.5 rounded-xl bg-purple-50 text-purple-900 text-xs font-semibold flex items-center gap-1.5 border border-purple-200">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    <span>客觀用藥紀錄 · CareLink 不提供任何藥物劑量推測或臨床建議</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">藥品名稱</label>
                      <input
                        type="text"
                        required
                        value={medName}
                        onChange={(e) => setMedName(e.target.value)}
                        placeholder="例：感冒止咳藥水"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-label-md text-on-surface font-semibold">已服劑量</label>
                      <input
                        type="text"
                        required
                        value={medDosage}
                        onChange={(e) => setMedDosage(e.target.value)}
                        placeholder="例：5ml"
                        className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Growth Measurement Form */}
              {activeModal === 'GROWTH_MEASUREMENT' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">身高 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={growthHeight}
                      onChange={(e) => setGrowthHeight(e.target.value)}
                      placeholder="77.0"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">體重 (kg)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={growthWeight}
                      onChange={(e) => setGrowthWeight(e.target.value)}
                      placeholder="10.0"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">頭圍 (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={growthHead}
                      onChange={(e) => setGrowthHead(e.target.value)}
                      placeholder="45.0"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                </div>
              )}

              {/* Note Form */}
              {activeModal === 'NOTE' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">叮嚀身分</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNoteType('TEACHER_REMARK')}
                        className={`py-2 rounded-xl text-center font-label-md border ${
                          noteType === 'TEACHER_REMARK'
                            ? 'bg-primary text-on-primary border-primary font-bold'
                            : 'bg-surface-container-low text-on-surface border-surface-container'
                        }`}
                      >
                        老師溫馨簽核 ✍️
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteType('PARENT_COMMENT')}
                        className={`py-2 rounded-xl text-center font-label-md border ${
                          noteType === 'PARENT_COMMENT'
                            ? 'bg-secondary text-on-secondary border-secondary font-bold'
                            : 'bg-surface-container-low text-on-surface border-surface-container'
                        }`}
                      >
                        家長叮嚀留言 💬
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">內容</label>
                    <textarea
                      required
                      rows={3}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="輸入生活絮語或叮嚀事項..."
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container resize-none"
                    ></textarea>
                  </div>
                </>
              )}

              {/* Pickup Form */}
              {activeModal === 'PICKUP' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">接送動作</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { val: 'CHECK_IN', label: '到園簽到' },
                        { val: 'CHECK_OUT', label: '離園簽退' },
                        { val: 'PLANNED_PICKUP', label: '預約接送' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setPickupType(item.val as any)}
                          className={`py-2 rounded-xl text-xs font-bold border ${
                            pickupType === item.val
                              ? 'bg-primary text-on-primary border-primary'
                              : 'bg-surface-container-low text-on-surface border-surface-container'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-label-md text-on-surface font-semibold">接送人 / 陪同者</label>
                    <input
                      type="text"
                      value={pickupPerson}
                      onChange={(e) => setPickupPerson(e.target.value)}
                      placeholder="媽媽 / 爸爸 / 阿嬤"
                      className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container"
                    />
                  </div>
                </>
              )}

              {/* Optional Memo Field for all modals except Note */}
              {activeModal !== 'NOTE' && (
                <div className="flex flex-col gap-1">
                  <label className="font-label-sm text-on-surface-variant font-medium">備註說明 (選填)</label>
                  <input
                    type="text"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    placeholder="補充備註客觀事實..."
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface border border-surface-container text-body-sm"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-5 py-2.5 rounded-full bg-surface-container-high text-on-surface font-label-md"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-md font-semibold shadow-md active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && (
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  )}
                  <span>儲存紀錄</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
