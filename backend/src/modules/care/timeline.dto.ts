export interface TimelineQueryDto {
  from?: string;
  to?: string;
  date?: string;
  cursor?: string;
  limit?: number;
  event_type?: string;
}

export interface TimelineItemDto {
  event_id: string;
  child_id: string;
  revision_no: number;
  event_type: string;
  temporal_status: 'ACTUAL' | 'PLANNED';
  source_type?: 'LINE_AI' | 'MANUAL' | 'SYSTEM';
  source_message_id?: string | null;
  guardian_instruction_id?: string | null;
  provenance_text?: string;
  occurred_at: string;
  payload: Record<string, any>;
  status: 'RECORDED' | 'CORRECTED' | 'VOID';
  action: 'RECORD' | 'CORRECT' | 'VOID';
  reason?: string | null;
  supersedes_revision_id?: string | null;
  confirmed_by: string;
  confirmed_at: string;
  attendance_session_id?: string | null;
  duration_text?: string;
}

export interface ParentReadStatusDto {
  viewed: boolean;
  viewed_at?: string | null;
}

export interface TimelineResponseDto {
  items: TimelineItemDto[];
  next_cursor: string | null;
  has_more: boolean;
  total_returned: number;
  parent_read_status?: ParentReadStatusDto;
}

export interface EventRevisionHistoryDto {
  event_id: string;
  child_id: string;
  event_type: string;
  source_type?: 'LINE_AI' | 'MANUAL' | 'SYSTEM';
  source_message_id?: string | null;
  guardian_instruction_id?: string | null;
  provenance_text?: string;
  current_revision_id: string;
  revisions: Array<{
    id: string;
    revision_no: number;
    occurred_at: string;
    payload: Record<string, any>;
    action: string;
    reason?: string | null;
    supersedes_revision_id?: string | null;
    confirmed_by: string;
    confirmed_at: string;
  }>;
}

export class CreateEventCorrectionDto {
  action!: 'CORRECT' | 'VOID';
  payload?: Record<string, any>;
  occurred_at?: string;
  reason!: string;
  expected_revision_no!: number;
}

export interface DailySummaryMetricsDto {
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

export interface GrowthReportsDto {
  month: string;
  attendance_days: number;
  total_records: number;
  milk_total_count: number;
  milk_total_volume_ml: number;
  nap_average_minutes: number;
  milk_trend: Array<{
    date: string;
    label: string;
    total_ml: number;
  }>;
  sleep_trend: Array<{
    date: string;
    total_minutes: number;
    hours_text: string;
  }>;
  growth_measurements: Array<{
    date: string;
    occurred_at: string;
    height_cm?: number;
    weight_kg?: number;
    head_circumference_cm?: number;
    note?: string;
  }>;
}

export interface CalendarDaySummaryDto {
  confirmed_count: number;
  has_planned_pickup: boolean;
  pending_handoff_count: number;
  breakdown: {
    feed: number;
    sleep: number;
    other: number;
  };
}
