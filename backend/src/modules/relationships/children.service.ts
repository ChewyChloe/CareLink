import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ChildOverviewDto {
  id: string;
  nickname: string;
  ageText: string;
  role: string;
  scopes: string[];
  todayCareStatus: string;
  latestEventText?: string | null;
  todayRecordCount: number;
  pendingHandoffCount: number;
  avatarUrl?: string | null;
}

export interface RemindersPanelDto {
  supplyTasks: Array<{
    id: string;
    childId: string;
    childName: string;
    itemName: string;
    quantity?: string | null;
    dueAt?: string | null;
    status: string;
  }>;
  plannedPickups: Array<{
    id: string;
    childId: string;
    childName: string;
    occurredAt: string;
    pickupTime?: string | null;
    person?: string | null;
    note?: string | null;
  }>;
}

@Injectable()
export class ChildrenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format a Date into HH:mm in Asia/Taipei.
   */
  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  /**
   * Helper to calculate deterministic age string (e.g. "1歲3個月" or "10個月").
   */
  private calculateAge(birthDate: Date | null | undefined, createdAt: Date): string {
    const ref = birthDate || createdAt;
    const now = new Date();
    let years = now.getFullYear() - ref.getFullYear();
    let months = now.getMonth() - ref.getMonth();
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years <= 0 && months <= 0) {
      const diffDays = Math.max(0, Math.floor((now.getTime() - ref.getTime()) / (1000 * 3600 * 24)));
      return `${diffDays}天`;
    }
    if (years <= 0) {
      return `${months}個月`;
    }
    return months > 0 ? `${years}歲${months}個月` : `${years}歲`;
  }

  /**
   * Creates a Child record and grants the creator full GUARDIAN access rights.
   */
  async createChild(userId: string, displayAlias: string, birthDate?: string) {
    if (!displayAlias || displayAlias.trim().length === 0) {
      throw new BadRequestException('displayAlias is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const parsedBirthDate = birthDate ? new Date(`${birthDate}T00:00:00+08:00`) : undefined;

      const child = await tx.child.create({
        data: {
          display_alias: displayAlias.trim(),
          birth_date: parsedBirthDate,
          created_by: userId,
        },
      });

      const grant = await tx.accessGrant.create({
        data: {
          user_id: userId,
          child_id: child.id,
          role: 'GUARDIAN',
          scopes: ['CARE_READ', 'CARE_WRITE', 'HANDOFF_WRITE', 'CONTRACT_READ', 'BILLING_READ'],
          starts_at: new Date(),
        },
      });

      return {
        id: child.id,
        displayAlias: child.display_alias,
        createdAt: child.created_at,
        grantId: grant.id,
        role: grant.role,
      };
    });
  }

  /**
   * Returns all children accessible to the user via active AccessGrants.
   */
  async getChildren(userId: string) {
    const now = new Date();
    const grants = await this.prisma.accessGrant.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      include: {
        child: true,
      },
    });

    return grants
      .filter((g) => g.child && !g.child.archived_at)
      .map((g) => ({
        id: g.child.id,
        displayAlias: g.child.display_alias,
        role: g.role,
        scopes: g.scopes,
        createdAt: g.child.created_at,
      }));
  }

  /**
   * Returns full Child Overview for Caregiver homepage (/children).
   * Includes today's care status, latest confirmed event, today's record count,
   * pending handoff count, and bottom reminders panel.
   */
  async getChildrenOverview(userId: string): Promise<{
    children: ChildOverviewDto[];
    reminders: RemindersPanelDto;
  }> {
    const now = new Date();

    const grants = await this.prisma.accessGrant.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      include: {
        child: true,
        relationship: true,
      },
    });

    const activeGrants = grants.filter((g) => g.child && !g.child.archived_at);

    // Resolve today's boundary in Asia/Taipei
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const todayStart = new Date(`${todayStr}T00:00:00+08:00`);
    const todayEnd = new Date(`${todayStr}T23:59:59.999+08:00`);

    const childrenOverview: ChildOverviewDto[] = [];
    const supplyTasksList: RemindersPanelDto['supplyTasks'] = [];
    const plannedPickupsList: RemindersPanelDto['plannedPickups'] = [];

    for (const grant of activeGrants) {
      const child = grant.child;

      // Load all confirmed CareEvents for this child today
      const events = await this.prisma.careEvent.findMany({
        where: {
          child_id: child.id,
          current_revision_id: { not: null },
        },
        include: {
          revisions: true,
        },
      });

      const todayEvents: Array<{ event: any; rev: any; time: number }> = [];
      for (const ev of events) {
        const rev = ev.revisions.find((r) => r.id === ev.current_revision_id);
        if (!rev || rev.action === 'VOID') continue;

        const occurredAt = new Date(rev.occurred_at);
        if (occurredAt >= todayStart && occurredAt <= todayEnd) {
          todayEvents.push({
            event: ev,
            rev,
            time: occurredAt.getTime(),
          });
        }
      }

      todayEvents.sort((a, b) => b.time - a.time); // latest first

      const todayRecordCount = todayEvents.length;
      let latestEventText: string | null = null;
      let todayCareStatus = '尚未簽到';

      if (todayEvents.length > 0) {
        const latest = todayEvents[0];
        const timeStr = this.formatTime(new Date(latest.time));
        const p = (latest.rev.payload || {}) as Record<string, any>;

        let label = '生活紀錄';
        switch (latest.event.event_type) {
          case 'FEED':
            label = `喝奶 ${p.amount || p.amount_ml || ''} ${p.unit || 'ml'}`.trim();
            break;
          case 'SLEEP_START':
            label = '開始午睡';
            break;
          case 'SLEEP_END':
            label = '午睡醒來';
            break;
          case 'TEMPERATURE':
            label = `體溫 ${p.value_celsius}°C`;
            break;
          case 'CHECK_IN':
            label = '今日已簽到';
            break;
          case 'CHECK_OUT':
            label = '已簽退離園';
            break;
          case 'MEAL':
            label = `用餐 (${p.meal_type || '副食'})`;
            break;
          case 'DIAPER':
            label = '更換尿布';
            break;
          case 'BOWEL_MOVEMENT':
            label = `排便 ${p.consistency || ''}`.trim();
            break;
          case 'MEDICATION':
            label = `用藥 (${p.medication_name || '處方'})`;
            break;
          case 'ACTIVITY':
            label = `活動 (${p.title || '互動'})`;
            break;
          case 'HYGIENE':
            label = '清潔更衣';
            break;
          case 'GROWTH_MEASUREMENT':
            label = '生長測量';
            break;
          case 'NOTE':
            label = '日誌叮嚀';
            break;
          case 'PLANNED_PICKUP':
            label = `預計接送 ${p.pickup_time || ''}`.trim();
            break;
        }

        latestEventText = `${timeStr} ${label}`;

        if (latest.event.event_type === 'CHECK_OUT') {
          todayCareStatus = '已完成托育';
        } else {
          todayCareStatus = '今日照護中';
        }
      }

      // Check real SupplyTasks for this child's relationships
      const relIds = grant.relationship_id ? [grant.relationship_id] : [];
      if (relIds.length === 0) {
        const rels = await this.prisma.careRelationship.findMany({
          where: { child_id: child.id, status: 'ACTIVE' },
          select: { id: true },
        });
        relIds.push(...rels.map((r) => r.id));
      }

      const pendingTasks = await this.prisma.supplyTask.findMany({
        where: {
          relationship_id: { in: relIds },
          status: 'PENDING',
        },
      });

      for (const t of pendingTasks) {
        supplyTasksList.push({
          id: t.id,
          childId: child.id,
          childName: child.display_alias,
          itemName: t.item_name,
          quantity: t.quantity,
          dueAt: t.due_at?.toISOString(),
          status: t.status,
        });
      }

      // Check today's PLANNED_PICKUP
      const plannedPickups = todayEvents.filter((x) => x.event.event_type === 'PLANNED_PICKUP');
      for (const pp of plannedPickups) {
        const p = (pp.rev.payload || {}) as Record<string, any>;
        plannedPickupsList.push({
          id: pp.event.id,
          childId: child.id,
          childName: child.display_alias,
          occurredAt: pp.rev.occurred_at.toISOString(),
          pickupTime: p.pickup_time,
          person: p.person,
          note: p.note,
        });
      }

      const pendingHandoffCount = pendingTasks.length + plannedPickups.length;

      childrenOverview.push({
        id: child.id,
        nickname: child.display_alias,
        ageText: this.calculateAge(child.birth_date, child.created_at),
        role: grant.role,
        scopes: grant.scopes,
        todayCareStatus,
        latestEventText,
        todayRecordCount,
        pendingHandoffCount,
        avatarUrl: null,
      });
    }

    return {
      children: childrenOverview,
      reminders: {
        supplyTasks: supplyTasksList,
        plannedPickups: plannedPickupsList,
      },
    };
  }

  /**
   * Returns child details if user has active AccessGrant; otherwise 404.
   */
  async getChildById(userId: string, childId: string) {
    const now = new Date();
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: childId,
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
      include: {
        child: true,
      },
    });

    if (!grant || !grant.child || grant.child.archived_at) {
      throw new NotFoundException('Resource not found');
    }

    return {
      id: grant.child.id,
      displayAlias: grant.child.display_alias,
      birthDate: grant.child.birth_date,
      role: grant.role,
      scopes: grant.scopes,
      createdAt: grant.child.created_at,
    };
  }
}
