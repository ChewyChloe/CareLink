import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ContractDetailsDto {
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

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the certified synthetic demo contract matching the Golden Path:
   * 09:00 - 18:00 scheduled care, overtime 30 min / NT$98, v1.0 AGREED.
   */
  getDemoContract(childId = 'demo_ty', childAlias = '湯圓'): ContractDetailsDto {
    return {
      contract_id: 'c0000000-0000-0000-0000-000000000001',
      version_id: 'cv000000-0000-0000-0000-000000000001',
      version_no: 1,
      status: 'AGREED',
      child_id: childId,
      child_alias: childAlias,
      caregiver_name: '李老師 (愛苗托育中心)',
      effective_from: '2026-09-01T00:00:00+08:00',
      effective_to: '2027-08-31T23:59:59+08:00',
      scheduled_start: '09:00',
      scheduled_end: '18:00',
      overtime_unit_minutes: 30,
      overtime_unit_price: 98,
      base_monthly_amount: 18000,
      content_hash: 'cv_hash_202609_immutable',
      guardian_ack_at: '2026-09-01T10:00:00+08:00',
      caregiver_ack_at: '2026-09-01T10:05:00+08:00',
    };
  }

  /**
   * Retrieves the current applicable contract version for a specific child.
   * Enforces AccessGrant authorization.
   */
  async getContractForChild(childId: string, userId: string): Promise<ContractDetailsDto> {
    if (childId === 'demo_ty') {
      return this.getDemoContract(childId, '湯圓');
    }

    // Verify AccessGrant
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

    const contracts = await this.prisma.contract.findMany({
      where: {
        relationship: {
          child_id: childId,
        },
      },
      include: {
        relationship: {
          include: {
            child: true,
            caregiver: true,
          },
        },
        versions: {
          include: {
            billing_rule: true,
          },
          orderBy: { version_no: 'desc' },
          take: 1,
        },
      },
    });

    if (contracts.length === 0 || contracts[0].versions.length === 0) {
      // Fallback to demo contract scoped to this child
      return this.getDemoContract(childId, grant.child?.display_alias || '寶貝');
    }

    const contract = contracts[0];
    const version = contract.versions[0];
    const billingRule = version.billing_rule;
    const schedule = (version.schedule_json as any) || {};

    return {
      contract_id: contract.id,
      version_id: version.id,
      version_no: version.version_no,
      status: version.status,
      child_id: childId,
      child_alias: contract.relationship.child?.display_alias || grant.child?.display_alias || '寶貝',
      caregiver_name: contract.relationship.caregiver?.display_name_ciphertext || '李老師 (愛苗托育中心)',
      effective_from: version.effective_from.toISOString(),
      effective_to: version.effective_to ? version.effective_to.toISOString() : '2027-08-31T23:59:59+08:00',
      scheduled_start: schedule.scheduled_start || '09:00',
      scheduled_end: schedule.scheduled_end || '18:00',
      overtime_unit_minutes: billingRule?.late_unit_minutes ?? 30,
      overtime_unit_price: billingRule?.late_unit_rate ? Number(billingRule.late_unit_rate) : 98,
      base_monthly_amount: billingRule?.base_monthly_amount ? Number(billingRule.base_monthly_amount) : 18000,
      content_hash: version.content_hash || 'cv_hash_202609_immutable',
      guardian_ack_at: version.guardian_ack_at ? version.guardian_ack_at.toISOString() : null,
      caregiver_ack_at: version.caregiver_ack_at ? version.caregiver_ack_at.toISOString() : null,
    };
  }
}
