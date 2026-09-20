export class OvertimeSnapshotDto {
  scheduled_end!: string;
  actual_checkout!: string;
  overtime_minutes!: number;
  chargeable_units!: number;
  unit_minutes!: number;
  rate_per_unit!: number;
  formula!: string;
  engine!: string;
  ai_involved!: boolean;
  source_type?: string; // 'LINE_AI' | 'MANUAL' | 'SYSTEM'
}

export class SettlementLineDto {
  id!: string;
  item_type!: string; // 'BASE' | 'OVERTIME' | 'MEAL' | 'NIGHT'
  item_name!: string;
  quantity!: number;
  unit!: string;
  unit_rate!: number;
  amount!: number;
  calculation_snapshot!: Record<string, any>;
  line_key!: string;
  sources!: Array<{
    event_id?: string;
    event_revision_id: string;
    occurred_at: string;
    event_type: string;
    action: string;
    source_type?: string;
  }>;
}

export class SettlementSummaryDto {
  id!: string;
  child_id!: string;
  child_name!: string;
  contract_id!: string;
  contract_version_id!: string;
  billing_rule_id!: string;
  period!: string; // e.g. "2026-09"
  status!: string; // 'PENDING_GUARDIAN' | 'LOCKED' | 'DRAFT' | 'BLOCKED'
  currency!: string;
  total_amount!: number;
  base_amount!: number;
  overtime_amount!: number;
  engine_version!: string;
  input_hash!: string;
  content_hash!: string;
  blocking_reasons?: Array<{ code: string; reason: string }> | null;
  lines!: SettlementLineDto[];
  evidence_summary!: {
    scheduled_end: string;
    actual_checkout: string;
    overtime_minutes: number;
    units: number;
    unit_rate: number;
    overtime_fee: number;
    deterministic_formula: string;
    contract_version_hash: string;
    checkout_event_revision_id: string;
    source_type?: string; // 'LINE_AI' | 'MANUAL' | 'SYSTEM'
    date_display?: string;
  };
}
