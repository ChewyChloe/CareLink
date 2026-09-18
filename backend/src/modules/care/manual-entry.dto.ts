export class CreateManualEventDto {
  event_type!: string;
  occurred_at!: string;
  payload!: Record<string, any>;
  temporal_status?: 'ACTUAL' | 'PLANNED';
  guardian_instruction_id?: string;
}

export class RecordDailyLogViewDto {
  care_date!: string; // YYYY-MM-DD
}
