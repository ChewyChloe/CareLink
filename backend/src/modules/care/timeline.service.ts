import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TimelineQueryDto,
  TimelineItemDto,
  TimelineResponseDto,
  EventRevisionHistoryDto,
  CreateEventCorrectionDto,
  DailySummaryMetricsDto,
  GrowthReportsDto,
  CalendarDaySummaryDto,
} from './timeline.dto';
import { CreateManualEventDto, RecordDailyLogViewDto } from './manual-entry.dto';
import {
  CreateGuardianInstructionDto,
  GuardianInstructionResponseDto,
} from './guardian-instruction.dto';
import { validateEventPayload } from './event-payload.schemas';
import { CareEventSourceType } from '@prisma/client';

/**
 * Formats user-facing provenance text based on source type and instruction.
 */
export function formatProvenanceText(
  sourceType?: string | null,
  instruction?: { content?: string } | null,
): string {
  if (sourceType === 'LINE_AI') {
    return '建立方式：LINE 訊息 AI 整理後經人員確認';
  }
  if (sourceType === 'MANUAL') {
    if (instruction?.content) {
      return `建立方式：手動紀錄（家長委託：${instruction.content}）`;
    }
    return '建立方式：手動紀錄';
  }
  if (sourceType === 'SYSTEM') {
    return '建立方式：系統排程或自動紀錄';
  }
  return `建立方式：${sourceType || '手動紀錄'}`;
}

/**
 * Splits a sleep interval across Asia/Taipei midnight boundaries.
 * Taiwan Standard Time is fixed at UTC+8 without daylight saving time.
 */
export function splitIntervalIntoDays(
  startDate: Date,
  endDate: Date,
): Array<{ dateKey: string; minutes: number }> {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (startMs >= endMs) return [];

  const results: Array<{ dateKey: string; minutes: number }> = [];
  const OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Taipei is UTC+8

  let currentMs = startMs;
  while (currentMs < endMs) {
    const taipeiMs = currentMs + OFFSET_MS;
    const d = new Date(taipeiMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${day}`;

    // Calculate midnight of the next day in Asia/Taipei
    const nextMidnightTaipeiUtc = Date.UTC(y, d.getUTCMonth(), d.getUTCDate() + 1);
    const nextMidnightRealMs = nextMidnightTaipeiUtc - OFFSET_MS;

    const segmentEndMs = Math.min(endMs, nextMidnightRealMs);
    const diffMinutes = Math.max(0, Math.round((segmentEndMs - currentMs) / 60000));

    if (diffMinutes > 0) {
      results.push({ dateKey, minutes: diffMinutes });
    }

    currentMs = segmentEndMs;
  }

  return results;
}

/**
 * Extracts valid paired SLEEP_START -> SLEEP_END intervals from confirmed events.
 * Ignores VOID and PLANNED events.
 */
export function extractSleepIntervals(
  eventsWithRev: Array<{ event: any; rev: any; occurredAt: Date }>,
): Array<{ start: Date; end: Date; startEventId: string; endEventId: string }> {
  const valid = eventsWithRev
    .filter((x) => {
      if (x.rev.action === 'VOID') return false;
      const payload = (x.rev.payload || {}) as Record<string, any>;
      if (payload.temporal_status === 'PLANNED' || x.event.event_type === 'PLANNED_PICKUP') return false;
      return x.event.event_type === 'SLEEP_START' || x.event.event_type === 'SLEEP_END';
    })
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const intervals: Array<{ start: Date; end: Date; startEventId: string; endEventId: string }> = [];
  let pendingStart: { event: any; rev: any; occurredAt: Date } | null = null;

  for (const item of valid) {
    if (item.event.event_type === 'SLEEP_START') {
      pendingStart = item;
    } else if (item.event.event_type === 'SLEEP_END' && pendingStart) {
      if (item.occurredAt > pendingStart.occurredAt) {
        intervals.push({
          start: pendingStart.occurredAt,
          end: item.occurredAt,
          startEventId: pendingStart.event.id,
          endEventId: item.event.id,
        });
      }
      pendingStart = null;
    }
  }

  return intervals;
}

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves occurred_at raw values into valid Date instances.
   * Supports both full ISO date strings and "HH:mm" time-only strings against reference date in Asia/Taipei.
   */
  public resolveOccurredAt(occurredAtRaw: any, referenceDate?: Date): Date {
    if (!occurredAtRaw) {
      return new Date(NaN);
    }
    if (typeof occurredAtRaw === 'string' && /^\d{1,2}:\d{2}$/.test(occurredAtRaw.trim())) {
      const ref = referenceDate || new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const [year, month, day] = formatter.format(ref).split('-');
      const [hh, mm] = occurredAtRaw.trim().split(':');
      return new Date(`${year}-${month}-${day}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00+08:00`);
    }
    return new Date(occurredAtRaw);
  }

  /**
   * Asserts that user has an active AccessGrant for the child.
   * If unauthorized or child does not exist, returns 404 to avoid leaking existence.
   */
  async assertChildAccess(childId: string, userId: string): Promise<any> {
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: childId,
        revoked_at: null,
        starts_at: { lte: new Date() },
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
      include: {
        relationship: true,
      },
    });

    if (!grant) {
      throw new NotFoundException('Child not found or access denied');
    }

    if (grant.relationship_id && grant.relationship && grant.relationship.status !== 'ACTIVE') {
      throw new NotFoundException('Child not found or access denied');
    }

    return grant;
  }

  /**
   * Retrieves confirmed CareEvents for a child with cursor pagination and sanitized DTOs.
   * Only returns confirmed events with valid revisions.
   * Never returns DraftBatches, cancelled drafts, or raw AI output.
   */
  async getTimeline(
    childId: string,
    userId: string,
    query: TimelineQueryDto,
  ): Promise<TimelineResponseDto> {
    await this.assertChildAccess(childId, userId);

    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    // Date range resolution
    let fromDate: Date | undefined = query.from ? new Date(query.from) : undefined;
    let toDate: Date | undefined = query.to ? new Date(query.to) : undefined;

    let targetDateKey: string;
    if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      targetDateKey = query.date;
      fromDate = new Date(`${query.date}T00:00:00+08:00`);
      toDate = new Date(`${query.date}T23:59:59.999+08:00`);
    } else {
      const now = new Date();
      targetDateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(fromDate || now);
    }

    // Load confirmed CareEvents with their revisions and optional guardian instruction
    const careEvents = await this.prisma.careEvent.findMany({
      where: {
        child_id: childId,
        current_revision_id: { not: null },
        ...(query.event_type ? { event_type: query.event_type } : {}),
      },
      include: {
        revisions: {
          orderBy: { revision_no: 'desc' },
        },
        guardian_instruction: true,
      },
    });

    // Resolve current revision and build initial timeline item candidates
    let items: Array<{
      event: any;
      currentRev: any;
      occurredAt: Date;
    }> = [];

    for (const ev of careEvents) {
      const currentRev =
        ev.revisions.find((r) => r.id === ev.current_revision_id) || ev.revisions[0];
      if (!currentRev) continue;

      const occurredAt = new Date(currentRev.occurred_at);

      if (fromDate && occurredAt < fromDate) continue;
      if (toDate && occurredAt > toDate) continue;

      items.push({
        event: ev,
        currentRev,
        occurredAt,
      });
    }

    // Deterministic sorting: occurred_at DESC, then event.id DESC
    items.sort((a, b) => {
      const timeDiff = b.occurredAt.getTime() - a.occurredAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.event.id.localeCompare(a.event.id);
    });

    // Cursor pagination (cursor encodes ISO timestamp + event id)
    if (query.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf-8'),
        );
        const cursorTime = new Date(decoded.t).getTime();
        const cursorId = decoded.id;

        const cursorIndex = items.findIndex((it) => {
          const itTime = it.occurredAt.getTime();
          if (itTime < cursorTime) return true;
          if (itTime === cursorTime && it.event.id.localeCompare(cursorId) < 0) return true;
          return false;
        });

        if (cursorIndex >= 0) {
          items = items.slice(cursorIndex);
        } else {
          items = [];
        }
      } catch (cursorErr) {
        this.logger.warn(`Invalid timeline cursor: ${query.cursor}`);
      }
    }

    const hasMore = items.length > limit;
    const pageItems = items.slice(0, limit);

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          t: lastItem.occurredAt.toISOString(),
          id: lastItem.event.id,
        }),
      ).toString('base64url');
    }

    // Deterministic calculation of sleep duration for SLEEP_END events
    // All events chronologically sorted asc for duration pairing
    const chronologicalEvents = [...careEvents]
      .map((ev) => {
        const rev = ev.revisions.find((r) => r.id === ev.current_revision_id) || ev.revisions[0];
        return { event: ev, rev, time: rev ? new Date(rev.occurred_at).getTime() : 0 };
      })
      .filter((x) => x.rev && x.rev.action !== 'VOID')
      .sort((a, b) => a.time - b.time);

    // Map to sanitized TimelineItemDto
    const sanitizedItems: TimelineItemDto[] = pageItems.map(({ event, currentRev, occurredAt }) => {
      const payload = (currentRev.payload || {}) as Record<string, any>;
      const temporalStatus =
        payload.temporal_status === 'PLANNED' || event.event_type === 'PLANNED_PICKUP'
          ? 'PLANNED'
          : 'ACTUAL';

      const status: 'RECORDED' | 'CORRECTED' | 'VOID' =
        currentRev.action === 'VOID'
          ? 'VOID'
          : currentRev.revision_no > 1
          ? 'CORRECTED'
          : 'RECORDED';

      let durationText: string | undefined;
      if (event.event_type === 'SLEEP_END') {
        // Find preceding SLEEP_START
        const endTime = occurredAt.getTime();
        const precedingStart = [...chronologicalEvents]
          .reverse()
          .find((x) => x.event.event_type === 'SLEEP_START' && x.time < endTime);

        if (precedingStart) {
          const diffMinutes = Math.max(0, Math.round((endTime - precedingStart.time) / 60000));
          const h = Math.floor(diffMinutes / 60);
          const m = diffMinutes % 60;
          durationText = h > 0 ? `本次午睡 ${h}小時${m > 0 ? m + '分' : ''}` : `本次午睡 ${m}分鐘`;
        }
      }

      return {
        event_id: event.id,
        child_id: event.child_id,
        revision_no: currentRev.revision_no,
        event_type: event.event_type,
        temporal_status: temporalStatus,
        occurred_at: currentRev.occurred_at.toISOString(),
        payload: payload,
        status: status,
        action: currentRev.action as any,
        reason: currentRev.reason,
        supersedes_revision_id: currentRev.supersedes_revision_id,
        confirmed_by: currentRev.confirmed_by,
        confirmed_at: (currentRev.confirmed_at ? new Date(currentRev.confirmed_at) : new Date()).toISOString(),
        attendance_session_id: event.attendance_session_id,
        duration_text: durationText,
        source_type: event.source_type,
        source_message_id: event.source_message_id,
        guardian_instruction_id: event.guardian_instruction_id,
        provenance_text: formatProvenanceText(event.source_type, event.guardian_instruction),
      };
    });

    // Check parent read status from real daily_log_views table
    let parentReadStatus: { viewed: boolean; viewed_at?: string | null } = {
      viewed: false,
      viewed_at: null,
    };

    if (targetDateKey && this.prisma.dailyLogView) {
      const careDateObj = new Date(`${targetDateKey}T00:00:00+08:00`);
      const existingView = await this.prisma.dailyLogView.findFirst({
        where: {
          child_id: childId,
          care_date: careDateObj,
        },
        orderBy: { viewed_at: 'desc' },
      });

      if (existingView) {
        parentReadStatus = {
          viewed: true,
          viewed_at: existingView.viewed_at.toISOString(),
        };
      }
    }

    return {
      items: sanitizedItems,
      next_cursor: nextCursor,
      has_more: hasMore,
      total_returned: sanitizedItems.length,
      parent_read_status: parentReadStatus,
    };
  }

  /**
   * Creates a manual care event. Bypasses DraftBatch.
   * Requires CARE_WRITE permission, discriminated schema validation, and audit trail.
   */
  async createManualEvent(
    childId: string,
    userId: string,
    dto: CreateManualEventDto,
  ): Promise<TimelineItemDto> {
    const grant = await this.assertChildAccess(childId, userId);

    const hasCareWrite =
      grant.role === 'CAREGIVER' ||
      (Array.isArray(grant.scopes) && grant.scopes.includes('CARE_WRITE'));

    if (!hasCareWrite) {
      throw new ForbiddenException('User lacks CARE_WRITE permission to manually record events.');
    }

    if (!dto.event_type) {
      throw new BadRequestException('event_type is required');
    }

    // Validate payload against discriminated schema
    const validatedPayload = validateEventPayload(dto.event_type, dto.payload || {});

    // Ensure amount consistency for FEED
    if (dto.event_type === 'FEED') {
      const amt = validatedPayload.amount !== undefined ? validatedPayload.amount : validatedPayload.amount_ml;
      if (amt !== undefined) {
        validatedPayload.amount = amt;
        validatedPayload.amount_ml = amt;
      }
    }

    const occurredAt = this.resolveOccurredAt(dto.occurred_at);
    if (isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid or missing occurred_at timestamp');
    }

    // Resolve CareRelationship
    let relationshipId = grant.relationship_id;
    if (!relationshipId) {
      const rel = await this.prisma.careRelationship.findFirst({
        where: {
          child_id: childId,
          caregiver_user_id: userId,
          status: 'ACTIVE',
        },
      });
      if (rel) {
        relationshipId = rel.id;
      } else {
        const anyRel = await this.prisma.careRelationship.findFirst({
          where: {
            child_id: childId,
            status: 'ACTIVE',
          },
        });
        if (anyRel) {
          relationshipId = anyRel.id;
        }
      }
    }

    if (!relationshipId) {
      throw new BadRequestException('No active CareRelationship found for this child');
    }

    // If guardian_instruction_id is provided, validate authority lifecycle
    let attachedInstruction: any = null;
    if (dto.guardian_instruction_id) {
      attachedInstruction = await this.prisma.guardianInstruction.findUnique({
        where: { id: dto.guardian_instruction_id },
      });

      if (!attachedInstruction) {
        throw new BadRequestException('Guardian instruction not found');
      }

      if (attachedInstruction.child_id !== childId) {
        throw new BadRequestException('Guardian instruction belongs to a different child');
      }

      if (attachedInstruction.revoked_at) {
        throw new BadRequestException('Cannot attach a revoked guardian instruction');
      }
      if (dto.event_type === 'MEDICATION' && attachedInstruction.instruction_type !== 'MEDICATION') throw new BadRequestException('A comment or pickup note is not medication authorization');
    }

    const now = new Date();
    const temporalStatus =
      dto.temporal_status || (dto.event_type === 'PLANNED_PICKUP' ? 'PLANNED' : 'ACTUAL');

    const result = await this.prisma.$transaction(async (tx) => {
      const careEvent = await tx.careEvent.create({
        data: {
          child_id: childId,
          relationship_id: relationshipId!,
          created_by: userId,
          event_type: dto.event_type,
          source_type: 'MANUAL',
          source_message_id: null,
          guardian_instruction_id: dto.guardian_instruction_id || null,
        },
      });

      const payloadToStore = {
        ...validatedPayload,
        temporal_status: temporalStatus,
      };

      const revision = await tx.careEventRevision.create({
        data: {
          care_event_id: careEvent.id,
          revision_no: 1,
          occurred_at: occurredAt,
          payload: payloadToStore,
          action: 'RECORD',
          confirmed_by: userId,
          confirmed_at: now,
        },
      });

      await tx.careEvent.update({
        where: { id: careEvent.id },
        data: { current_revision_id: revision.id },
      });

      // Attendance session management
      if (dto.event_type === 'CHECK_IN') {
        const openSession = await tx.attendanceSession.findFirst({
          where: {
            relationship_id: relationshipId!,
            status: 'OPEN',
          },
        });
        if (!openSession) {
          const newSession = await tx.attendanceSession.create({
            data: {
              relationship_id: relationshipId!,
              status: 'OPEN',
              check_in_event_id: careEvent.id,
            },
          });
          await tx.careEvent.update({
            where: { id: careEvent.id },
            data: { attendance_session_id: newSession.id },
          });
        } else {
          await tx.careEvent.update({
            where: { id: careEvent.id },
            data: { attendance_session_id: openSession.id },
          });
        }
      } else if (dto.event_type === 'CHECK_OUT') {
        const openSession = await tx.attendanceSession.findFirst({
          where: {
            relationship_id: relationshipId!,
            status: 'OPEN',
          },
          orderBy: { created_at: 'desc' },
        });
        if (openSession) {
          await tx.attendanceSession.update({
            where: { id: openSession.id },
            data: {
              status: 'CLOSED',
              check_out_event_id: careEvent.id,
            },
          });
          await tx.careEvent.update({
            where: { id: careEvent.id },
            data: { attendance_session_id: openSession.id },
          });
        }
      }

      // AuditLog entry
      await tx.auditLog.create({
        data: {
          actor_user_id: userId,
          action: 'MANUAL_CREATE_EVENT',
          resource_type: 'care_events',
          resource_id: careEvent.id,
          resource_version: 1,
          metadata_minimal: {
            event_type: dto.event_type,
            occurred_at: occurredAt.toISOString(),
          },
        },
      });

      return { careEvent, revision };
    });

    this.logger.log(
      `Manual care event created: ${result.careEvent.id} (${dto.event_type}) for child ${childId}`,
    );

    return {
      event_id: result.careEvent.id,
      child_id: result.careEvent.child_id,
      revision_no: result.revision.revision_no,
      event_type: result.careEvent.event_type,
      temporal_status: temporalStatus,
      occurred_at: result.revision.occurred_at.toISOString(),
      payload: (result.revision.payload || {}) as Record<string, any>,
      status: 'RECORDED',
      action: 'RECORD',
      reason: null,
      supersedes_revision_id: null,
      confirmed_by: result.revision.confirmed_by,
      confirmed_at: result.revision.confirmed_at.toISOString(),
      attendance_session_id: result.careEvent.attendance_session_id,
      source_type: 'MANUAL',
      source_message_id: null,
      guardian_instruction_id: result.careEvent.guardian_instruction_id,
      provenance_text: formatProvenanceText('MANUAL', attachedInstruction),
    };
  }

  /**
   * Records that a guardian has viewed the Daily Log for a specific date.
   */
  async recordDailyLogView(
    childId: string,
    userId: string,
    dto: RecordDailyLogViewDto,
  ): Promise<{ viewed: boolean; viewed_at: string }> {
    const grant = await this.assertChildAccess(childId, userId);

    if (grant.role !== 'GUARDIAN' && grant.role !== 'PARENT') {
      throw new ForbiddenException('Only active guardians can record daily log read receipts');
    }

    if (!dto.care_date || !/^\d{4}-\d{2}-\d{2}$/.test(dto.care_date)) {
      throw new BadRequestException('care_date must be in YYYY-MM-DD format');
    }

    const careDate = new Date(`${dto.care_date}T00:00:00+08:00`);
    const now = new Date();

    const view = await this.prisma.dailyLogView.upsert({
      where: {
        user_id_child_id_care_date: {
          user_id: userId,
          child_id: childId,
          care_date: careDate,
        },
      },
      update: {
        viewed_at: now,
      },
      create: {
        user_id: userId,
        child_id: childId,
        care_date: careDate,
        viewed_at: now,
      },
    });

    return {
      viewed: true,
      viewed_at: view.viewed_at.toISOString(),
    };
  }

  /**
   * Creates a guardian instruction for a child.
   * Guardian-only lifecycle method.
   */
  async createGuardianInstruction(
    childId: string,
    userId: string,
    dto: CreateGuardianInstructionDto,
  ): Promise<GuardianInstructionResponseDto> {
    const grant = await this.assertChildAccess(childId, userId);

    if (grant.role !== 'GUARDIAN' && grant.role !== 'PARENT') {
      throw new ForbiddenException('Only active guardians can create instructions');
    }

    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('content is required');
    }
    if (dto.content.length > 2000 || (dto.instruction_type && !['MEDICATION', 'COMMENT', 'PICKUP_NOTE'].includes(dto.instruction_type))) throw new BadRequestException('Invalid instruction type or content length');

    const instruction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guardianInstruction.create({
        data: {
          child_id: childId,
          created_by_guardian_user_id: userId,
          instruction_type: dto.instruction_type || 'MEDICATION',
          content: dto.content.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          actor_user_id: userId,
          action: 'CREATE_GUARDIAN_INSTRUCTION',
          resource_type: 'guardian_instructions',
          resource_id: created.id,
          resource_version: 1,
          metadata_minimal: {
            child_id: childId,
            instruction_type: dto.instruction_type || 'MEDICATION',
            content_length: dto.content.trim().length,
          },
        },
      });

      return created;
    });

    return {
      id: instruction.id,
      child_id: instruction.child_id,
      created_by_guardian_user_id: instruction.created_by_guardian_user_id,
      author_user_id: instruction.created_by_guardian_user_id,
      instruction_type: instruction.instruction_type,
      content: instruction.content,
      created_at: instruction.created_at.toISOString(),
      revoked_at: instruction.revoked_at ? instruction.revoked_at.toISOString() : null,
    };
  }

  /**
   * Revokes a guardian instruction for a child.
   * Guardian-only lifecycle method.
   */
  async revokeGuardianInstruction(
    childId: string,
    instructionId: string,
    userId: string,
  ): Promise<GuardianInstructionResponseDto> {
    const grant = await this.assertChildAccess(childId, userId);

    if (grant.role !== 'GUARDIAN' && grant.role !== 'PARENT') {
      throw new ForbiddenException('Only active guardians can revoke instructions');
    }

    const existing = await this.prisma.guardianInstruction.findUnique({
      where: { id: instructionId },
    });

    if (!existing || existing.child_id !== childId) {
      throw new NotFoundException('Guardian instruction not found or belongs to another child');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const rev = await tx.guardianInstruction.update({
        where: { id: instructionId },
        data: { revoked_at: existing.revoked_at || now },
      });

      await tx.auditLog.create({
        data: {
          actor_user_id: userId,
          action: 'REVOKE_GUARDIAN_INSTRUCTION',
          resource_type: 'guardian_instructions',
          resource_id: instructionId,
          metadata_minimal: {
            child_id: childId,
            revoked_at: (existing.revoked_at || now).toISOString(),
          },
        },
      });

      return rev;
    });

    return {
      id: updated.id,
      child_id: updated.child_id,
      created_by_guardian_user_id: updated.created_by_guardian_user_id,
      author_user_id: updated.created_by_guardian_user_id,
      instruction_type: updated.instruction_type,
      content: updated.content,
      created_at: updated.created_at.toISOString(),
      revoked_at: updated.revoked_at ? updated.revoked_at.toISOString() : null,
    };
  }

  /**
   * Retrieves all guardian instructions for a child.
   */
  async getGuardianInstructions(
    childId: string,
    userId: string,
  ): Promise<GuardianInstructionResponseDto[]> {
    await this.assertChildAccess(childId, userId);

    const list = await this.prisma.guardianInstruction.findMany({
      where: { child_id: childId },
      orderBy: { created_at: 'desc' },
    });

    return list.map((item) => ({
      id: item.id,
      child_id: item.child_id,
      created_by_guardian_user_id: item.created_by_guardian_user_id,
      author_user_id: item.created_by_guardian_user_id,
      instruction_type: item.instruction_type,
      content: item.content,
      created_at: item.created_at.toISOString(),
      revoked_at: item.revoked_at ? item.revoked_at.toISOString() : null,
    }));
  }

  /**
   * Deterministic daily summary metrics for a given date in Asia/Taipei.
   * Zero AI generation. Pure mathematical aggregation.
   */
  async getDailySummaryMetrics(
    childId: string,
    userId: string,
    dateQuery?: string,
  ): Promise<DailySummaryMetricsDto> {
    await this.assertChildAccess(childId, userId);

    let dateStr = dateQuery;
    if (!dateStr) {
      dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const fromDate = new Date(`${dateStr}T00:00:00+08:00`);
    const toDate = new Date(`${dateStr}T23:59:59.999+08:00`);

    const careEvents = await this.prisma.careEvent.findMany({
      where: {
        child_id: childId,
        current_revision_id: { not: null },
      },
      include: {
        revisions: true,
      },
    });

    // Extract all confirmed events with their current revision
    const confirmedEvents = careEvents
      .map((ev) => {
        const currentRev = ev.revisions.find((r) => r.id === ev.current_revision_id);
        return {
          event: ev,
          rev: currentRev,
          occurredAt: currentRev ? new Date(currentRev.occurred_at) : new Date(0),
        };
      })
      .filter((x) => x.rev && x.rev.action !== 'VOID');

    // Calculate sleep segments using Asia/Taipei midnight splitting
    const sleepIntervals = extractSleepIntervals(confirmedEvents);
    let totalSleepMinutes = 0;
    let sleepSegments = 0;

    for (const interval of sleepIntervals) {
      const segments = splitIntervalIntoDays(interval.start, interval.end);
      for (const seg of segments) {
        if (seg.dateKey === dateStr) {
          totalSleepMinutes += seg.minutes;
          sleepSegments += 1;
        }
      }
    }

    // Filter non-sleep events for this day
    const dayItems: Array<{ event: any; rev: any; time: number }> = [];
    for (const item of confirmedEvents) {
      if (item.occurredAt >= fromDate && item.occurredAt <= toDate) {
        dayItems.push({
          event: item.event,
          rev: item.rev,
          time: item.occurredAt.getTime(),
        });
      }
    }

    dayItems.sort((a, b) => a.time - b.time);

    let totalRecords = dayItems.length;
    let feedCount = 0;
    let totalFeedAmountMl = 0;
    let diaperCount = 0;
    let bowelMovementCount = 0;
    let latestTemperature: number | null = null;
    let mealCount = 0;
    let activityCount = 0;
    let medicationCount = 0;
    let hygieneCount = 0;
    let growthCount = 0;

    for (let i = 0; i < dayItems.length; i++) {
      const { event, rev } = dayItems[i];
      const payload = (rev.payload || {}) as Record<string, any>;

      // Exclude PLANNED events from ACTUAL metrics
      const isPlanned =
        payload.temporal_status === 'PLANNED' || event.event_type === 'PLANNED_PICKUP';
      if (isPlanned) {
        continue;
      }

      switch (event.event_type) {
        case 'FEED': {
          feedCount += 1;
          const amt = payload.amount !== undefined ? payload.amount : payload.amount_ml;
          if (typeof amt === 'number' && amt > 0) {
            totalFeedAmountMl += amt;
          }
          break;
        }
        case 'DIAPER': {
          diaperCount += 1;
          break;
        }
        case 'BOWEL_MOVEMENT': {
          bowelMovementCount += 1;
          break;
        }
        case 'TEMPERATURE': {
          if (typeof payload.value_celsius === 'number') {
            latestTemperature = payload.value_celsius;
          }
          break;
        }
        case 'MEAL': {
          mealCount += 1;
          break;
        }
        case 'ACTIVITY': {
          activityCount += 1;
          break;
        }
        case 'MEDICATION': {
          medicationCount += 1;
          break;
        }
        case 'HYGIENE': {
          hygieneCount += 1;
          break;
        }
        case 'GROWTH_MEASUREMENT': {
          growthCount += 1;
          break;
        }
      }
    }

    const hours = Math.floor(totalSleepMinutes / 60);
    const mins = totalSleepMinutes % 60;
    const sleepDurationText =
      hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;

    return {
      date: dateStr,
      total_records: totalRecords,
      feed_count: feedCount,
      total_feed_amount_ml: totalFeedAmountMl,
      sleep_segments: sleepSegments,
      total_sleep_minutes: totalSleepMinutes,
      sleep_duration_text: sleepDurationText,
      diaper_count: diaperCount,
      bowel_movement_count: bowelMovementCount,
      latest_temperature: latestTemperature,
      meal_count: mealCount,
      activity_count: activityCount,
      medication_count: medicationCount,
      hygiene_count: hygieneCount,
      growth_count: growthCount,
    };
  }

  /**
   * Deterministic growth reports and monthly analytics.
   * Strictly NO percentiles, NO peer comparisons, NO AI evaluations.
   */
  async getReportsData(
    childId: string,
    userId: string,
    monthQuery?: string,
  ): Promise<GrowthReportsDto> {
    await this.assertChildAccess(childId, userId);

    let month = monthQuery;
    if (!month) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()).split('-');
      month = `${parts[0]}-${parts[1]}`;
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const nextYear = monthNum === 12 ? year + 1 : year;
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextMonthStr = String(nextMonth).padStart(2, '0');

    const fromDate = new Date(`${yearStr}-${monthStr}-01T00:00:00+08:00`);
    const toDate = new Date(`${nextYear}-${nextMonthStr}-01T00:00:00+08:00`);

    const allEvents = await this.prisma.careEvent.findMany({
      where: {
        child_id: childId,
        current_revision_id: { not: null },
      },
      include: {
        revisions: true,
      },
    });

    const confirmedEvents = allEvents
      .map((ev) => {
        const currentRev = ev.revisions.find((r) => r.id === ev.current_revision_id);
        return {
          event: ev,
          rev: currentRev,
          occurredAt: currentRev ? new Date(currentRev.occurred_at) : new Date(0),
        };
      })
      .filter((x) => x.rev && x.rev.action !== 'VOID');

    // Sleep analytics: split across Asia/Taipei midnight boundaries
    const sleepIntervals = extractSleepIntervals(confirmedEvents);
    let totalNapMinutes = 0;
    let totalNapCount = 0;
    const dailySleepMap: Record<string, number> = {};

    for (const interval of sleepIntervals) {
      const segments = splitIntervalIntoDays(interval.start, interval.end);
      for (const seg of segments) {
        if (seg.dateKey.startsWith(month)) {
          dailySleepMap[seg.dateKey] = (dailySleepMap[seg.dateKey] || 0) + seg.minutes;
          totalNapMinutes += seg.minutes;
          totalNapCount += 1;
        }
      }
    }

    const monthItems: Array<{ event: any; rev: any; dateKey: string; time: number }> = [];
    const growthMeasurements: GrowthReportsDto['growth_measurements'] = [];
    const distinctAttendanceDays = new Set<string>();

    let milkTotalCount = 0;
    let milkTotalVolumeMl = 0;
    const dailyMilkMap: Record<string, number> = {};

    for (const item of confirmedEvents) {
      const { event: ev, rev: currentRev, occurredAt } = item;
      const payload = (currentRev.payload || {}) as Record<string, any>;

      // Growth measurements across all time
      if (ev.event_type === 'GROWTH_MEASUREMENT') {
        const dKey = new Intl.DateTimeFormat('zh-TW', {
          timeZone: 'Asia/Taipei',
          month: 'numeric',
          day: 'numeric',
        }).format(occurredAt);
        growthMeasurements.push({
          date: dKey,
          occurred_at: currentRev.occurred_at.toISOString(),
          height_cm: payload.height_cm,
          weight_kg: payload.weight_kg,
          head_circumference_cm: payload.head_circumference_cm,
          note: payload.note,
        });
      }

      // Inside target month
      if (occurredAt >= fromDate && occurredAt < toDate) {
        const dateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(occurredAt);

        distinctAttendanceDays.add(dateKey);
        monthItems.push({
          event: ev,
          rev: currentRev,
          dateKey,
          time: occurredAt.getTime(),
        });

        // Exclude PLANNED events from actual counts/volumes
        const isPlanned =
          payload.temporal_status === 'PLANNED' || ev.event_type === 'PLANNED_PICKUP';
        if (!isPlanned && ev.event_type === 'FEED') {
          milkTotalCount += 1;
          const amt = payload.amount !== undefined ? payload.amount : payload.amount_ml;
          if (typeof amt === 'number' && amt > 0) {
            milkTotalVolumeMl += amt;
            dailyMilkMap[dateKey] = (dailyMilkMap[dateKey] || 0) + amt;
          }
        }
      }
    }

    const napAverageMinutes =
      totalNapCount > 0 ? Math.round(totalNapMinutes / totalNapCount) : 0;

    const milkTrend = Object.keys(dailyMilkMap).sort().map((d) => ({
      date: d,
      label: d.slice(5),
      total_ml: dailyMilkMap[d],
    }));

    const sleepTrend = Object.keys(dailySleepMap).sort().map((d) => {
      const mins = dailySleepMap[d];
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return {
        date: d,
        total_minutes: mins,
        hours_text: h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`,
      };
    });

    growthMeasurements.sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );

    return {
      month,
      attendance_days: distinctAttendanceDays.size,
      total_records: monthItems.length,
      milk_total_count: milkTotalCount,
      milk_total_volume_ml: milkTotalVolumeMl,
      nap_average_minutes: napAverageMinutes,
      milk_trend: milkTrend,
      sleep_trend: sleepTrend,
      growth_measurements: growthMeasurements,
    };
  }

  /**
   * Retrieves complete revision history for a CareEvent.
   * Only accessible by users authorized for the child.
   */
  async getEventHistory(eventId: string, userId: string): Promise<EventRevisionHistoryDto> {
    const careEvent = await this.prisma.careEvent.findUnique({
      where: { id: eventId },
      include: {
        revisions: {
          orderBy: { revision_no: 'asc' },
        },
        guardian_instruction: true,
      },
    });

    if (!careEvent) {
      throw new NotFoundException('Event not found or access denied');
    }

    await this.assertChildAccess(careEvent.child_id, userId);

    return {
      event_id: careEvent.id,
      child_id: careEvent.child_id,
      event_type: careEvent.event_type,
      current_revision_id: careEvent.current_revision_id || '',
      source_type: careEvent.source_type,
      source_message_id: careEvent.source_message_id,
      guardian_instruction_id: careEvent.guardian_instruction_id,
      provenance_text: formatProvenanceText(careEvent.source_type, careEvent.guardian_instruction),
      revisions: careEvent.revisions.map((r) => ({
        id: r.id,
        revision_no: r.revision_no,
        occurred_at: r.occurred_at.toISOString(),
        payload: (r.payload || {}) as Record<string, any>,
        action: r.action,
        reason: r.reason,
        supersedes_revision_id: r.supersedes_revision_id,
        confirmed_by: r.confirmed_by,
        confirmed_at: (r.confirmed_at ? new Date(r.confirmed_at) : new Date()).toISOString(),
      })),
    };
  }

  /**
   * Creates a new CareEventRevision for a CareEvent (CORRECT or VOID).
   * Enforces optimistic concurrency control (OCC), invariant validation, and audit trail preservation.
   * Never overwrites or deletes old revisions.
   */
  async createCorrection(
    eventId: string,
    userId: string,
    dto: CreateEventCorrectionDto,
  ): Promise<TimelineItemDto> {
    const careEvent = await this.prisma.careEvent.findUnique({
      where: { id: eventId },
      include: {
        relationship: true,
        guardian_instruction: true,
        revisions: {
          orderBy: { revision_no: 'desc' },
        },
      },
    });

    if (!careEvent) {
      throw new NotFoundException('Event not found or access denied');
    }

    const grant = await this.assertChildAccess(careEvent.child_id, userId);

    // Resolve current revision
    const currentRev =
      careEvent.revisions.find((r) => r.id === careEvent.current_revision_id) ||
      careEvent.revisions[0];

    if (!currentRev) {
      throw new BadRequestException('CareEvent has no existing revision to correct');
    }

    if (grant.role === 'PARENT') {
      throw new ForbiddenException(
        'Guardians cannot directly overwrite caregiver-confirmed events. Please submit a correction request.',
      );
    }

    const hasCareWrite =
      grant.role === 'CAREGIVER' ||
      (Array.isArray(grant.scopes) && grant.scopes.includes('CARE_WRITE'));

    if (!hasCareWrite) {
      throw new ForbiddenException('User lacks CARE_WRITE permission to modify care events.');
    }

    if (careEvent.relationship) {
      if (careEvent.relationship.caregiver_user_id !== userId) {
        throw new ForbiddenException(
          'Only the assigned caregiver for this relationship can modify this care event.',
        );
      }

      if (
        careEvent.relationship.status !== 'ACTIVE' ||
        (careEvent.relationship.ends_at && careEvent.relationship.ends_at <= new Date())
      ) {
        throw new ForbiddenException(
          'Caregiver relationship is no longer active. Modification denied.',
        );
      }
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A non-empty reason is required for correction or void');
    }

    if (
      dto.expected_revision_no !== undefined &&
      currentRev.revision_no !== dto.expected_revision_no
    ) {
      throw new ConflictException(
        `Revision conflict: Expected revision ${dto.expected_revision_no}, but current is ${currentRev.revision_no}.`,
      );
    }

    if (currentRev.action === 'VOID') {
      throw new BadRequestException('Cannot modify or correct an event that is already VOID.');
    }

    const newOccurredAt = dto.occurred_at ? new Date(dto.occurred_at) : currentRev.occurred_at;
    if (isNaN(newOccurredAt.getTime())) {
      throw new BadRequestException('Invalid occurred_at timestamp');
    }

    if (dto.action === 'CORRECT') {
      if (careEvent.event_type === 'CHECK_IN' && careEvent.attendance_session_id) {
        const session = await this.prisma.attendanceSession.findUnique({
          where: { id: careEvent.attendance_session_id },
        });
        if (session && session.check_out_event_id) {
          const checkOutEv = await this.prisma.careEvent.findUnique({
            where: { id: session.check_out_event_id },
            include: { revisions: true },
          });
          const checkOutRev = checkOutEv?.revisions.find(
            (r) => r.id === checkOutEv.current_revision_id,
          );
          if (checkOutRev && checkOutRev.occurred_at <= newOccurredAt) {
            throw new BadRequestException(
              'Attendance session invariant failed: CHECK_IN time cannot be after or equal to CHECK_OUT time.',
            );
          }
        }
      } else if (careEvent.event_type === 'CHECK_OUT' && careEvent.attendance_session_id) {
        const session = await this.prisma.attendanceSession.findUnique({
          where: { id: careEvent.attendance_session_id },
        });
        if (session && session.check_in_event_id) {
          const checkInEv = await this.prisma.careEvent.findUnique({
            where: { id: session.check_in_event_id },
            include: { revisions: true },
          });
          const checkInRev = checkInEv?.revisions.find(
            (r) => r.id === checkInEv.current_revision_id,
          );
          if (checkInRev && checkInRev.occurred_at >= newOccurredAt) {
            throw new BadRequestException(
              'Attendance session invariant failed: CHECK_OUT time cannot be before or equal to CHECK_IN time.',
            );
          }
        }
      }
    }

    let payloadToStore = (currentRev.payload || {}) as Record<string, any>;
    if (dto.action === 'CORRECT' && dto.payload) {
      payloadToStore = validateEventPayload(careEvent.event_type, {
        ...payloadToStore,
        ...dto.payload,
      });
    }

    const nextRevisionNo = currentRev.revision_no + 1;
    const now = new Date();

    const newRev = await this.prisma.$transaction(async (tx) => {
      const createdRevision = await tx.careEventRevision.create({
        data: {
          care_event_id: careEvent.id,
          revision_no: nextRevisionNo,
          occurred_at: newOccurredAt,
          payload: payloadToStore,
          action: dto.action,
          reason: dto.reason.trim(),
          supersedes_revision_id: currentRev.id,
          confirmed_by: userId,
          confirmed_at: now,
        },
      });

      await tx.careEvent.update({
        where: { id: careEvent.id },
        data: { current_revision_id: createdRevision.id },
      });

      if (dto.action === 'VOID' && careEvent.attendance_session_id) {
        if (careEvent.event_type === 'CHECK_IN' || careEvent.event_type === 'CHECK_OUT') {
          await tx.attendanceSession.update({
            where: { id: careEvent.attendance_session_id },
            data: { status: 'VOID' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actor_user_id: userId,
          action: dto.action === 'VOID' ? 'CARE_EVENT_VOID' : 'CARE_EVENT_CORRECT',
          resource_type: 'care_events',
          resource_id: careEvent.id,
          resource_version: nextRevisionNo,
          metadata_minimal: {
            reason: dto.reason.trim(),
            previousRevisionNo: currentRev.revision_no,
            action: dto.action,
          },
        },
      });

      return createdRevision;
    });

    this.logger.log(
      `Created revision ${newRev.revision_no} (${newRev.action}) for CareEvent ${careEvent.id}`,
    );

    const temporalStatus =
      payloadToStore.temporal_status === 'PLANNED' || careEvent.event_type === 'PLANNED_PICKUP'
        ? 'PLANNED'
        : 'ACTUAL';

    const status = newRev.action === 'VOID' ? 'VOID' : 'CORRECTED';

    return {
      event_id: careEvent.id,
      child_id: careEvent.child_id,
      revision_no: newRev.revision_no,
      event_type: careEvent.event_type,
      temporal_status: temporalStatus,
      occurred_at: newRev.occurred_at.toISOString(),
      payload: (newRev.payload || {}) as Record<string, any>,
      status,
      action: newRev.action as any,
      reason: newRev.reason,
      supersedes_revision_id: newRev.supersedes_revision_id,
      confirmed_by: newRev.confirmed_by,
      confirmed_at: newRev.confirmed_at.toISOString(),
      attendance_session_id: careEvent.attendance_session_id,
      source_type: careEvent.source_type,
      source_message_id: careEvent.source_message_id,
      guardian_instruction_id: careEvent.guardian_instruction_id,
      provenance_text: formatProvenanceText(careEvent.source_type, careEvent.guardian_instruction),
    };
  }

  /**
   * Retrieves month calendar summary for a child.
   * Aggregates event counts, planned pickup flags, pending handoffs per day, and breakdown.
   */
  async getMonthSummary(
    childId: string,
    userId: string,
    monthQuery?: string,
  ): Promise<Record<string, CalendarDaySummaryDto>> {
    await this.assertChildAccess(childId, userId);

    let month = monthQuery;
    if (!month) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()).split('-');
      month = `${parts[0]}-${parts[1]}`;
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('Invalid month specified');
    }

    const nextYear = monthNum === 12 ? year + 1 : year;
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextMonthStr = String(nextMonth).padStart(2, '0');

    const fromDate = new Date(`${yearStr}-${monthStr}-01T00:00:00+08:00`);
    const toDate = new Date(`${nextYear}-${nextMonthStr}-01T00:00:00+08:00`);

    const careEvents = await this.prisma.careEvent.findMany({
      where: {
        child_id: childId,
        current_revision_id: { not: null },
      },
      select: {
        id: true,
        event_type: true,
        current_revision_id: true,
        revisions: {
          select: {
            id: true,
            occurred_at: true,
            action: true,
          },
        },
      },
    });

    const summaryMap: Record<string, CalendarDaySummaryDto> = {};

    for (const ev of careEvents) {
      const currentRev = ev.revisions.find((r) => r.id === ev.current_revision_id);
      if (!currentRev) continue;
      if (currentRev.action === 'VOID') continue;

      const occurredAt = new Date(currentRev.occurred_at);
      if (occurredAt < fromDate || occurredAt >= toDate) continue;

      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(occurredAt);

      if (!summaryMap[dateKey]) {
        summaryMap[dateKey] = {
          confirmed_count: 0,
          has_planned_pickup: false,
          pending_handoff_count: 0,
          breakdown: {
            feed: 0,
            sleep: 0,
            other: 0,
          },
        };
      }

      summaryMap[dateKey].confirmed_count += 1;
      if (ev.event_type === 'PLANNED_PICKUP') {
        summaryMap[dateKey].has_planned_pickup = true;
      }

      if (ev.event_type === 'FEED') {
        summaryMap[dateKey].breakdown.feed += 1;
      } else if (ev.event_type === 'SLEEP_START' || ev.event_type === 'SLEEP_END') {
        summaryMap[dateKey].breakdown.sleep += 1;
      } else {
        summaryMap[dateKey].breakdown.other += 1;
      }
    }

    return summaryMap;
  }
}
