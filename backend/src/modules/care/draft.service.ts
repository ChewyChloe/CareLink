import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConfirmDraftDto {
  draftId: string;
  userId: string;
  expectedVersion?: number;
  idempotencyKey?: string;
  correctedItems?: Array<{
    item_index?: number;
    event_type: string;
    temporal_status?: string;
    occurred_at: string;
    payload: Record<string, any>;
    missing_fields?: string[];
  }>;
}

export interface ConfirmDraftResult {
  status: 'CONFIRMED' | 'ALREADY_CONFIRMED';
  draftBatchId: string;
  eventCount: number;
  careEvents: any[];
}

@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates whether a user has active authorization for a child.
   * Throws ForbiddenException or returns grant.
   */
  async assertChildAccess(userId: string, childId: string, requireWrite = true): Promise<any> {
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: childId,
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
    });

    if (!grant) {
      throw new ForbiddenException('No active authorization for this child');
    }

    if (requireWrite) {
      const hasWrite =
        grant.role === 'PARENT' ||
        grant.role === 'CAREGIVER' ||
        (Array.isArray(grant.scopes) && grant.scopes.includes('CARE_WRITE'));

      if (!hasWrite) {
        throw new ForbiddenException('User lacks CARE_WRITE permission for this child');
      }
    }

    return grant;
  }

  /**
   * Resolves occurred_at raw values into valid Date instances.
   * Supports both full ISO date strings and "HH:mm" time-only strings against draft created_at date in Asia/Taipei.
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
   * Retrieves draft details with child information, guarded against IDOR.
   */
  async getDraft(draftId: string, userId: string) {
    const draft = await this.prisma.draftBatch.findUnique({
      where: { id: draftId },
      include: {
        child: {
          select: {
            id: true,
            display_alias: true,
          },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException('Draft batch not found');
    }

    // IDOR protection: if user is not authorized for the child, return 404
    if (draft.child_id) {
      const hasAccess = await this.prisma.accessGrant.findFirst({
        where: {
          user_id: userId,
          child_id: draft.child_id,
          revoked_at: null,
          OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
        },
      });

      if (!hasAccess && draft.created_by !== userId) {
        throw new NotFoundException('Draft batch not found');
      }
    }

    return draft;
  }

  /**
   * Retrieves pending drafts for a specific child.
   */
  async getPendingDrafts(childId: string, userId: string) {
    await this.assertChildAccess(userId, childId, false);

    return this.prisma.draftBatch.findMany({
      where: {
        child_id: childId,
        status: { in: ['PENDING_CONFIRMATION', 'NEEDS_INPUT'] },
      },
      orderBy: { created_at: 'desc' },
      include: {
        child: {
          select: {
            id: true,
            display_alias: true,
          },
        },
      },
    });
  }

  /**
   * Confirms a DraftBatch and promotes extracted candidate items into official CareEvent records.
   * Atomically generates CareEvents, CareEventRevisions, and AuditLog.
   * Enforces idempotency, optimistic locking, and strict validation.
   */
  async confirmDraft(dto: ConfirmDraftDto): Promise<ConfirmDraftResult> {
    const draft = await this.prisma.draftBatch.findUnique({
      where: { id: dto.draftId },
    });

    if (!draft) {
      throw new NotFoundException('Draft batch not found');
    }

    // 1. Authorization check
    if (!draft.child_id) {
      throw new BadRequestException('Draft is missing assigned child_id');
    }
    await this.assertChildAccess(dto.userId, draft.child_id, true);

    // 2. Expiration check
    const now = new Date();
    if (draft.expires_at < now) {
      throw new BadRequestException('Draft batch has expired and cannot be confirmed');
    }

    // 3. Idempotency Check: if already CONFIRMED, return existing records
    if (draft.status === 'CONFIRMED') {
      const existingEvents = await this.prisma.careEvent.findMany({
        where: { draft_batch_id: draft.id },
        include: { revisions: true },
        orderBy: { source_item_index: 'asc' },
      });

      return {
        status: 'ALREADY_CONFIRMED',
        draftBatchId: draft.id,
        eventCount: existingEvents.length,
        careEvents: existingEvents,
      };
    }

    // 4. Draft status check
    if (draft.status !== 'PENDING_CONFIRMATION' && draft.status !== 'NEEDS_INPUT') {
      throw new BadRequestException(`Draft is not in confirmable state: ${draft.status}`);
    }

    // 5. Optimistic Concurrency Control (OCC)
    if (dto.expectedVersion !== undefined && draft.lock_version !== dto.expectedVersion) {
      throw new ConflictException(
        `Draft version conflict. Expected version ${dto.expectedVersion}, but current is ${draft.lock_version}.`,
      );
    }

    // 6. Item Validation
    const candidateItems = (dto.correctedItems || draft.items) as any[];
    if (!Array.isArray(candidateItems) || candidateItems.length === 0) {
      throw new BadRequestException('Draft batch contains no items to confirm');
    }

    const ALLOWED_TYPES = [
      'FEED',
      'SLEEP_START',
      'SLEEP_END',
      'CHECK_IN',
      'CHECK_OUT',
      'MEAL',
      'NIGHT_STAY',
      'PLANNED_PICKUP',
    ];

    for (let i = 0; i < candidateItems.length; i++) {
      const item = candidateItems[i];
      if (!item.event_type || !ALLOWED_TYPES.includes(item.event_type)) {
        throw new BadRequestException(`Item ${i}: Invalid or unsupported event_type "${item.event_type}"`);
      }

      // Stage 5.1 Temporal status validation:
      // ACTUAL: Allowed for all valid event types
      // PLANNED: Allowed ONLY for event_type === 'PLANNED_PICKUP'
      // NEGATED: Cannot be confirmed into official events
      // UNCERTAIN: Must be clarified/corrected before confirming
      const temporalStatus = item.temporal_status || 'ACTUAL';

      if (temporalStatus === 'NEGATED') {
        throw new BadRequestException(
          `Item ${i}: NEGATED events cannot be confirmed into official CareEvents.`,
        );
      }

      if (temporalStatus === 'UNCERTAIN') {
        throw new BadRequestException(
          `Item ${i}: UNCERTAIN events cannot be directly confirmed. Please clarify or correct the event details before confirming.`,
        );
      }

      if (temporalStatus === 'PLANNED') {
        if (item.event_type !== 'PLANNED_PICKUP') {
          throw new BadRequestException(
            `Item ${i}: PLANNED temporal status is only permitted for PLANNED_PICKUP events. PLANNED ${item.event_type} cannot be confirmed as an official event.`,
          );
        }
      } else if (temporalStatus !== 'ACTUAL') {
        throw new BadRequestException(
          `Item ${i}: Unsupported temporal status "${temporalStatus}". Only ACTUAL or PLANNED (for PLANNED_PICKUP) can be confirmed.`,
        );
      }

      // Missing fields check
      if (item.missing_fields && Array.isArray(item.missing_fields) && item.missing_fields.length > 0) {
        throw new BadRequestException(
          `Item ${i} (${item.event_type}) has unfulfilled missing fields: ${item.missing_fields.join(', ')}. Please supply values before confirming.`,
        );
      }

      // Timestamp validity
      const occurredDate = this.resolveOccurredAt(item.occurred_at, draft.created_at);
      if (isNaN(occurredDate.getTime())) {
        throw new BadRequestException(`Item ${i}: Invalid or missing occurred_at timestamp`);
      }

      // Amount non-negativity
      if (item.payload && typeof item.payload.amount_ml === 'number' && item.payload.amount_ml < 0) {
        throw new BadRequestException(`Item ${i}: amount_ml cannot be negative`);
      }
    }

    // 7. Atomic Transaction: Draft -> CONFIRMED, insert CareEvents + Revisions + AttendanceSession + AuditLog
    const createdEvents = await this.prisma.$transaction(async (tx) => {
      // Step A: Update DraftBatch status
      await tx.draftBatch.update({
        where: { id: draft.id },
        data: {
          status: 'CONFIRMED',
          lock_version: { increment: 1 },
          items: candidateItems,
        },
      });

      // Resolve relationship_id if not directly on draft
      let resolvedRelationshipId = draft.relationship_id;
      if (!resolvedRelationshipId && draft.child_id) {
        const rel = await tx.careRelationship.findFirst({
          where: {
            child_id: draft.child_id,
            caregiver_user_id: dto.userId,
            status: 'ACTIVE',
          },
        });
        if (rel) {
          resolvedRelationshipId = rel.id;
        } else {
          const anyRel = await tx.careRelationship.findFirst({
            where: {
              child_id: draft.child_id,
              status: 'ACTIVE',
            },
          });
          if (anyRel) {
            resolvedRelationshipId = anyRel.id;
          }
        }
      }

      if (!resolvedRelationshipId) {
        throw new BadRequestException('Cannot confirm draft: no active CareRelationship found for this child');
      }

      const events: any[] = [];

      // Step B: Insert CareEvent and CareEventRevision for each item
      for (let i = 0; i < candidateItems.length; i++) {
        const item = candidateItems[i];
        const itemIndex = item.item_index !== undefined ? item.item_index : i;
        const occurredAt = this.resolveOccurredAt(item.occurred_at, draft.created_at);
        const itemTemporalStatus = item.temporal_status || 'ACTUAL';

        // Create canonical CareEvent
        const careEvent = await tx.careEvent.create({
          data: {
            child_id: draft.child_id!,
            relationship_id: resolvedRelationshipId,
            draft_batch_id: draft.id,
            source_item_index: itemIndex,
            event_type: item.event_type,
            source_type: 'LINE_AI',
            source_message_id: draft.source_message_id,
            created_by: dto.userId,
          },
        });

        // Create canonical CareEventRevision (revision 1)
        const itemPayload = { ...(item.payload || {}) };
        const amountVal = itemPayload.amount !== undefined ? itemPayload.amount : itemPayload.amount_ml;
        if (amountVal !== undefined) {
          itemPayload.amount = amountVal;
          itemPayload.amount_ml = amountVal;
          if (!itemPayload.amount_unit) {
            itemPayload.amount_unit = 'ml';
          }
        }

        const revision = await tx.careEventRevision.create({
          data: {
            care_event_id: careEvent.id,
            revision_no: 1,
            occurred_at: occurredAt,
            payload: {
              ...itemPayload,
              temporal_status: itemTemporalStatus,
            },
            action: 'RECORD',
            confirmed_by: dto.userId,
            confirmed_at: now,
          },
        });

        // Link current revision
        await tx.careEvent.update({
          where: { id: careEvent.id },
          data: { current_revision_id: revision.id },
        });

        // Attendance session lifecycle management
        if (item.event_type === 'CHECK_IN') {
          const openSession = await tx.attendanceSession.findFirst({
            where: {
              relationship_id: draft.relationship_id!,
              status: 'OPEN',
            },
          });
          if (!openSession) {
            const newSession = await tx.attendanceSession.create({
              data: {
                relationship_id: draft.relationship_id!,
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
        } else if (item.event_type === 'CHECK_OUT') {
          const openSession = await tx.attendanceSession.findFirst({
            where: {
              relationship_id: draft.relationship_id!,
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

        events.push({
          ...careEvent,
          current_revision: revision,
        });
      }

      // Step C: AuditLog
      await tx.auditLog.create({
        data: {
          actor_user_id: dto.userId,
          action: 'CONFIRM_DRAFT',
          resource_type: 'draft_batches',
          resource_id: draft.id,
          resource_version: draft.lock_version + 1,
          metadata_minimal: {
            eventCount: candidateItems.length,
            idempotencyKey: dto.idempotencyKey || null,
          },
        },
      });

      return events;
    });

    this.logger.log(`Confirmed DraftBatch ${draft.id}: created ${createdEvents.length} CareEvents`);

    return {
      status: 'CONFIRMED',
      draftBatchId: draft.id,
      eventCount: createdEvents.length,
      careEvents: createdEvents,
    };
  }

  /**
   * Cancels/discards a DraftBatch.
   */
  async cancelDraft(draftId: string, userId: string) {
    const draft = await this.prisma.draftBatch.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new NotFoundException('Draft batch not found');
    }

    if (draft.child_id) {
      await this.assertChildAccess(userId, draft.child_id, true);
    }

    if (draft.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot cancel an already confirmed draft');
    }

    await this.prisma.draftBatch.update({
      where: { id: draftId },
      data: {
        status: 'CANCELLED',
        lock_version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action: 'CANCEL_DRAFT',
        resource_type: 'draft_batches',
        resource_id: draft.id,
        resource_version: draft.lock_version + 1,
      },
    });

    return { status: 'CANCELLED', draftBatchId: draftId };
  }
}
