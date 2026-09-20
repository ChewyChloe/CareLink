import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateOvertimeFee } from './billing.engine';
import { SettlementSummaryDto, SettlementLineDto } from './billing.dto';
import * as crypto from 'crypto';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates the deterministic demo showcase settlement.
   * Golden Path demo:
   * Contract scheduled end: 18:00, Actual checkout: 18:31
   * -> Overtime 31 min, unit 30 min, ceil(31/30) = 2 units, rate NT$98, amount NT$196.
   * AI strictly uninvolved.
   */
  getDemoShowcase(period = '2026-09'): SettlementSummaryDto {
    const calc = calculateOvertimeFee({
      scheduledEndTime: '18:00',
      actualCheckoutTime: '18:31',
      unitMinutes: 30,
      ratePerUnit: 98,
      roundingPolicy: 'CEIL',
    });

    const contractId = 'c0000000-0000-0000-0000-000000000001';
    const contractVersionId = 'cv000000-0000-0000-0000-000000000001';
    const billingRuleId = 'br000000-0000-0000-0000-000000000001';
    const checkoutEventRevisionId = 'ev_rev_20260917_checkout_01';

    const baseLine: SettlementLineDto = {
      id: 'line_base_01',
      item_type: 'BASE',
      item_name: '日間托育常規月費 (09:00 - 18:00)',
      quantity: 1,
      unit: 'MONTH',
      unit_rate: 18000,
      amount: 18000,
      calculation_snapshot: {
        billing_mode: 'FIXED',
        base_monthly_amount: 18000,
        standard_schedule: '週一至週五 09:00 - 18:00',
        engine: 'DETERMINISTIC_ENGINE_V1',
        ai_involved: false,
      },
      line_key: `${period}_BASE`,
      sources: [],
    };

    const overtimeLine: SettlementLineDto = {
      id: 'line_overtime_01',
      item_type: 'OVERTIME',
      item_name: '延托/逾時照護費 (2026/09/17 接回)',
      quantity: calc.chargeableUnits,
      unit: '30分鐘單位',
      unit_rate: calc.ratePerUnit,
      amount: calc.overtimeAmount,
      calculation_snapshot: {
        scheduled_end: calc.scheduledEnd,
        actual_checkout: calc.actualCheckout,
        overtime_minutes: calc.overtimeMinutes,
        unit_minutes: calc.unitMinutes,
        chargeable_units: calc.chargeableUnits,
        rate_per_unit: calc.ratePerUnit,
        amount: calc.overtimeAmount,
        formula: calc.formula,
        rounding_policy: 'CEIL',
        engine: calc.engine,
        ai_involved: false,
        source_type: 'LINE_AI',
        checkout_date: '2026-09-17',
      },
      line_key: `${period}_OVERTIME_20260917`,
      sources: [
        {
          event_id: 'ev_20260917_checkout_01',
          event_revision_id: checkoutEventRevisionId,
          occurred_at: '2026-09-17T18:31:00+08:00',
          event_type: 'CHECK_OUT',
          action: 'RECORD',
          source_type: 'LINE_AI',
        },
      ],
    };

    return {
      id: 'settlement_202609_demo',
      child_id: 'demo_ty',
      child_name: '湯圓',
      contract_id: contractId,
      contract_version_id: contractVersionId,
      billing_rule_id: billingRuleId,
      period,
      status: 'PENDING_GUARDIAN',
      currency: 'TWD',
      total_amount: baseLine.amount + overtimeLine.amount,
      base_amount: baseLine.amount,
      overtime_amount: overtimeLine.amount,
      engine_version: '1.0.0',
      input_hash: 'sha256_in_demo_20260917_1831_ty',
      content_hash: 'sha256_out_demo_18196_twd',
      blocking_reasons: null,
      lines: [baseLine, overtimeLine],
      evidence_summary: {
        scheduled_end: calc.scheduledEnd,
        actual_checkout: calc.actualCheckout,
        overtime_minutes: calc.overtimeMinutes,
        units: calc.chargeableUnits,
        unit_rate: calc.ratePerUnit,
        overtime_fee: calc.overtimeAmount,
        deterministic_formula: calc.formula,
        contract_version_hash: 'cv_hash_202609_immutable',
        checkout_event_revision_id: checkoutEventRevisionId,
        source_type: 'LINE_AI',
        date_display: '2026/09/17',
      },
    };
  }

  /**
   * Helper to construct a deterministic blocked settlement when policy gaps occur.
   */
  private createBlockedSettlement(params: {
    childId: string;
    childName: string;
    period: string;
    contractId?: string;
    contractVersionId?: string;
    code: string;
    reason: string;
  }): SettlementSummaryDto {
    return {
      id: `settlement_${params.period}_blocked_${params.code}`,
      child_id: params.childId,
      child_name: params.childName,
      contract_id: params.contractId || '',
      contract_version_id: params.contractVersionId || '',
      billing_rule_id: '',
      period: params.period,
      status: 'BLOCKED',
      currency: 'TWD',
      total_amount: 0,
      base_amount: 0,
      overtime_amount: 0,
      engine_version: '1.0.0',
      input_hash: `input_blocked_${params.code}`,
      content_hash: `hash_blocked_${params.code}`,
      blocking_reasons: [{ code: params.code, reason: params.reason }],
      lines: [],
      evidence_summary: {
        scheduled_end: '18:00',
        actual_checkout: '--:--',
        overtime_minutes: 0,
        units: 0,
        unit_rate: 0,
        overtime_fee: 0,
        deterministic_formula: params.reason,
        contract_version_hash: '',
        checkout_event_revision_id: '',
      },
    };
  }

  /**
   * Computes or retrieves monthly settlements for a specific child.
   * Gathers actual checkout evidence from confirmed current revisions of CareEvent.
   * Adheres to all settlement invariants:
   * - VOID revisions excluded
   * - PLANNED temporal status excluded
   * - Corrected revisions evaluated at current_revision
   * - Same-day duplicate checkouts consolidated (no double billing)
   * - Contract versioning preserved (historical immutability)
   */
  async getSettlementsForChild(
    childId: string,
    userId: string,
    period = '2026-09',
  ): Promise<SettlementSummaryDto[]> {
    if (childId === 'demo_ty') {
      return [this.getDemoShowcase(period)];
    }

    // 1. Verify AccessGrant for user and child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: childId,
        revoked_at: null,
      },
      include: {
        child: true,
      },
    });

    if (!grant) {
      throw new NotFoundException('Child not found or access denied');
    }

    const childName = grant.child?.display_alias || '寶貝';

    // 2. Query active contract and its applicable agreed version
    const contract = await this.prisma.contract.findFirst({
      where: {
        relationship: {
          child_id: childId,
        },
        status: 'ACTIVE',
      },
      include: {
        relationship: {
          include: {
            child: true,
            caregiver: true,
          },
        },
        versions: {
          where: {
            status: { in: ['AGREED', 'ACTIVE'] },
          },
          orderBy: { version_no: 'desc' },
          take: 1,
          include: {
            billing_rule: true,
          },
        },
      },
    });

    // SETTLEMENT BLOCKING: D02 - Missing active applicable contract
    if (!contract || contract.versions.length === 0) {
      return [
        this.createBlockedSettlement({
          childId,
          childName,
          period,
          code: 'D02',
          reason: '缺少有效照護契約版本，暫無法完成計算。',
        }),
      ];
    }

    const version = contract.versions[0];
    const billingRule = version.billing_rule;
    const schedule = (version.schedule_json as any) || {};
    const scheduledEndTime = schedule.scheduled_end || '18:00';
    const unitMinutes = billingRule?.late_unit_minutes ?? 30;
    const unitRate = billingRule?.late_unit_rate ? Number(billingRule.late_unit_rate) : null;
    const baseMonthlyAmount = billingRule?.base_monthly_amount ? Number(billingRule.base_monthly_amount) : 18000;

    // SETTLEMENT BLOCKING: D03 - Missing overtime unit rate in contract
    if (unitRate === null || unitMinutes <= 0) {
      return [
        this.createBlockedSettlement({
          childId,
          childName,
          period,
          contractId: contract.id,
          contractVersionId: version.id,
          code: 'D03',
          reason: '契約計費規則未設定逾時費率，暫無法完成計算。',
        }),
      ];
    }

    // 3. Compute Month Boundary in Asia/Taipei (UTC+8)
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const monthStartIso = `${yearStr}-${monthStr.padStart(2, '0')}-01T00:00:00+08:00`;
    // Last day of month
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEndIso = `${yearStr}-${monthStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999+08:00`;
    const periodStart = new Date(monthStartIso);
    const periodEnd = new Date(monthEndIso);

    // 4. Query CareEvents for CHECK_OUT in this child
    const checkoutEvents = await this.prisma.careEvent.findMany({
      where: {
        child_id: childId,
        event_type: 'CHECK_OUT',
        current_revision_id: { not: null },
      },
      include: {
        revisions: true,
      },
    });

    // 5. Filter for valid current revisions in target month
    interface ValidCheckoutEvidence {
      event: any;
      revision: any;
      occurredAt: Date;
      localDateStr: string;
    }

    const validCheckouts: ValidCheckoutEvidence[] = [];

    for (const ev of checkoutEvents) {
      const currentRev = ev.revisions.find((r) => r.id === ev.current_revision_id);
      if (!currentRev) continue;

      // Invariant: VOID revisions excluded
      if (currentRev.action === 'VOID') continue;

      // Invariant: PLANNED temporal status excluded
      const payload = (currentRev.payload as any) || {};
      if (payload.temporal_status === 'PLANNED') continue;

      // Check within month range
      if (currentRev.occurred_at < periodStart || currentRev.occurred_at > periodEnd) continue;

      // Format date in Asia/Taipei
      const localDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(currentRev.occurred_at);

      validCheckouts.push({
        event: ev,
        revision: currentRev,
        occurredAt: currentRev.occurred_at,
        localDateStr,
      });
    }

    // SETTLEMENT BLOCKING: D01 - Missing valid checkout evidence
    if (validCheckouts.length === 0) {
      return [
        this.createBlockedSettlement({
          childId,
          childName,
          period,
          contractId: contract.id,
          contractVersionId: version.id,
          code: 'D01',
          reason: '缺少有效接回紀錄，暫無法完成計算。',
        }),
      ];
    }

    // 6. Deduplicate checkouts by local calendar date (pick latest on same date)
    const dailyCheckoutMap = new Map<string, ValidCheckoutEvidence>();
    for (const item of validCheckouts) {
      const existing = dailyCheckoutMap.get(item.localDateStr);
      if (!existing || item.occurredAt.getTime() > existing.occurredAt.getTime()) {
        dailyCheckoutMap.set(item.localDateStr, item);
      }
    }

    // 7. Calculate Overtime Line Items deterministically
    const overtimeLines: SettlementLineDto[] = [];
    let totalOvertimeAmount = 0;
    let latestOvertimeEvidence: any = null;

    const sortedDates = Array.from(dailyCheckoutMap.keys()).sort();

    for (const dateKey of sortedDates) {
      const { event, revision, occurredAt } = dailyCheckoutMap.get(dateKey)!;

      const calc = calculateOvertimeFee({
        scheduledEndTime,
        actualCheckoutTime: occurredAt.toISOString(),
        unitMinutes,
        ratePerUnit: unitRate,
        roundingPolicy: 'CEIL',
      });

      if (calc.overtimeMinutes > 0) {
        const lineId = `line_overtime_${dateKey.replace(/-/g, '')}_${event.id.slice(0, 4)}`;
        const lineDto: SettlementLineDto = {
          id: lineId,
          item_type: 'OVERTIME',
          item_name: `延托/逾時照護費 (${dateKey.replace(/-/g, '/')} 接回)`,
          quantity: calc.chargeableUnits,
          unit: `${unitMinutes}分鐘單位`,
          unit_rate: calc.ratePerUnit,
          amount: calc.overtimeAmount,
          calculation_snapshot: {
            scheduled_end: calc.scheduledEnd,
            actual_checkout: calc.actualCheckout,
            overtime_minutes: calc.overtimeMinutes,
            unit_minutes: calc.unitMinutes,
            chargeable_units: calc.chargeableUnits,
            rate_per_unit: calc.ratePerUnit,
            amount: calc.overtimeAmount,
            formula: calc.formula,
            rounding_policy: 'CEIL',
            engine: calc.engine,
            ai_involved: false,
            contract_version_id: version.id,
            source_type: event.source_type,
            checkout_date: dateKey,
            event_id: event.id,
            event_revision_id: revision.id,
          },
          line_key: `${period}_OVERTIME_${dateKey.replace(/-/g, '')}`,
          sources: [
            {
              event_id: event.id,
              event_revision_id: revision.id,
              occurred_at: occurredAt.toISOString(),
              event_type: 'CHECK_OUT',
              action: revision.action,
              source_type: event.source_type,
            },
          ],
        };

        overtimeLines.push(lineDto);
        totalOvertimeAmount += calc.overtimeAmount;

        latestOvertimeEvidence = {
          scheduled_end: calc.scheduledEnd,
          actual_checkout: calc.actualCheckout,
          overtime_minutes: calc.overtimeMinutes,
          units: calc.chargeableUnits,
          unit_rate: calc.ratePerUnit,
          overtime_fee: calc.overtimeAmount,
          deterministic_formula: calc.formula,
          contract_version_hash: version.content_hash,
          checkout_event_revision_id: revision.id,
          source_type: event.source_type,
          date_display: dateKey.replace(/-/g, '/'),
        };
      }
    }

    // Base Monthly Fee Line Item
    const baseLine: SettlementLineDto = {
      id: `line_base_${period.replace('-', '')}`,
      item_type: 'BASE',
      item_name: `日間托育常規月費 (${schedule.scheduled_start || '09:00'} - ${scheduledEndTime})`,
      quantity: 1,
      unit: 'MONTH',
      unit_rate: baseMonthlyAmount,
      amount: baseMonthlyAmount,
      calculation_snapshot: {
        billing_mode: 'FIXED',
        base_monthly_amount: baseMonthlyAmount,
        standard_schedule: `週一至週五 ${schedule.scheduled_start || '09:00'} - ${scheduledEndTime}`,
        engine: 'DETERMINISTIC_ENGINE_V1',
        ai_involved: false,
      },
      line_key: `${period}_BASE`,
      sources: [],
    };

    const allLines = [baseLine, ...overtimeLines];
    const totalAmount = baseMonthlyAmount + totalOvertimeAmount;

    const inputHash = crypto
      .createHash('sha256')
      .update(`${childId}:${version.id}:${period}:${overtimeLines.map((l) => l.line_key).join(',')}`)
      .digest('hex');

    const contentHash = crypto
      .createHash('sha256')
      .update(`${totalAmount}:${allLines.length}:${inputHash}`)
      .digest('hex');

    const defaultEvidence = latestOvertimeEvidence || {
      scheduled_end: scheduledEndTime,
      actual_checkout: '18:00',
      overtime_minutes: 0,
      units: 0,
      unit_rate: unitRate,
      overtime_fee: 0,
      deterministic_formula: '0 分鐘無逾時 = NT$ 0',
      contract_version_hash: version.content_hash,
      checkout_event_revision_id: '',
      source_type: 'SYSTEM',
    };

    return [
      {
        id: `settlement_${childId.slice(0, 8)}_${period.replace('-', '')}`,
        child_id: childId,
        child_name: childName,
        contract_id: contract.id,
        contract_version_id: version.id,
        billing_rule_id: billingRule?.id || '',
        period,
        status: 'PENDING_GUARDIAN',
        currency: 'TWD',
        total_amount: totalAmount,
        base_amount: baseMonthlyAmount,
        overtime_amount: totalOvertimeAmount,
        engine_version: '1.0.0',
        input_hash: inputHash,
        content_hash: contentHash,
        blocking_reasons: null,
        lines: allLines,
        evidence_summary: defaultEvidence,
      },
    ];
  }
}
