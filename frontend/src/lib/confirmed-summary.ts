import type { CareRecord } from './care-display';

/** Counts confirmed actual records only; never infers health or routine quality. */
export function confirmedSummary(records: CareRecord[], date: string) {
  const actual = records.filter(r => ['RECORDED', 'CORRECTED'].includes(r.status) && r.temporal_status === 'ACTUAL' && r.action !== 'VOID');
  let start: number | null = null;
  let minutes = 0;
  let segments = 0;
  let temperature: number | null = null;
  for (const r of [...actual].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))) {
    if (r.event_type === 'SLEEP_START') start = Date.parse(r.occurred_at);
    if (r.event_type === 'SLEEP_END' && start !== null) {
      minutes += Math.max(0, Math.floor((Date.parse(r.occurred_at) - start) / 60000));
      segments++; start = null;
    }
    if (r.event_type === 'TEMPERATURE' && typeof r.payload.value_celsius === 'number') temperature = r.payload.value_celsius;
  }
  const feeds = actual.filter(r => r.event_type === 'FEED');
  return {
    date, total_records: actual.length, feed_count: feeds.length,
    total_feed_amount_ml: feeds.reduce((n, r) => n + (typeof r.payload.amount_ml === 'number' ? r.payload.amount_ml : 0), 0),
    sleep_segments: segments, total_sleep_minutes: minutes, sleep_duration_text: `${minutes}m`,
    diaper_count: actual.filter(r => r.event_type === 'DIAPER').length,
    bowel_movement_count: actual.filter(r => r.event_type === 'BOWEL_MOVEMENT').length,
    latest_temperature: temperature,
  };
}
