import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface CreateInvitationDto {
  childId: string;
  targetRole: 'CAREGIVER' | 'CO_PARENT';
  sharedVia?: 'SHARE_TARGET_PICKER' | 'COPY_LINK' | 'DIRECT';
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hashes a raw invitation token with SHA-256 for secure database storage.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Guardian creates a single-use, high-entropy invitation token.
   * Only token_hash is persisted in DB.
   */
  async createInvitation(guardianUserId: string, dto: CreateInvitationDto) {
    const now = new Date();

    // Verify user has an active GUARDIAN grant for this child
    const guardianGrant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: guardianUserId,
        child_id: dto.childId,
        role: 'GUARDIAN',
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
    });

    if (!guardianGrant) {
      throw new NotFoundException('Child not found or guardian access required');
    }

    // Generate 256-bit cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour expiration

    const invitation = await this.prisma.invitation.create({
      data: {
        child_id: dto.childId,
        inviter_id: guardianUserId,
        token_hash: tokenHash,
        target_role: dto.targetRole || 'CAREGIVER',
        shared_via: dto.sharedVia || 'COPY_LINK',
        expires_at: expiresAt,
        status: 'PENDING',
      },
    });

    return {
      invitationId: invitation.id,
      token: rawToken,
      inviteUrl: `/accept-invite?token=${rawToken}`,
      expiresAt: invitation.expires_at,
      targetRole: invitation.target_role,
    };
  }

  /**
   * Authenticated invitee accepts the invitation via token.
   * NOTE: Acceptance does NOT grant child data access.
   */
  async acceptInvitation(inviteeUserId: string, rawToken: string) {
    if (!rawToken) {
      throw new BadRequestException('Invitation token is required');
    }

    const tokenHash = this.hashToken(rawToken);
    const invitation = await this.prisma.invitation.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Invitation is already ${invitation.status.toLowerCase()}`);
    }

    if (new Date() > invitation.expires_at) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired');
    }

    // Inviter cannot accept their own invitation
    if (invitation.inviter_id === inviteeUserId) {
      throw new BadRequestException('Cannot accept your own invitation');
    }

    // Mark as ACCEPTED and record accepted_by; NO ACCESS GRANTED YET
    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        accepted_by: inviteeUserId,
      },
    });

    return {
      status: 'accepted',
      invitationId: updated.id,
      childId: updated.child_id,
      targetRole: updated.target_role,
      message: 'Invitation accepted. Awaiting guardian activation to grant access.',
    };
  }

  /**
   * Guardian verifies accepted invitation and activates relationship & access grant.
   */
  async activateInvitation(guardianUserId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        child: true,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Ensure the user activating is the guardian of the child
    const now = new Date();
    const isGuardian = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: guardianUserId,
        child_id: invitation.child_id,
        role: 'GUARDIAN',
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
      },
    });

    if (!isGuardian) {
      throw new ForbiddenException('Only child guardian can activate invitations');
    }

    // Invitee cannot activate their own invitation
    if (invitation.accepted_by === guardianUserId) {
      throw new ForbiddenException('Invitee cannot activate their own invitation');
    }

    if (invitation.status !== 'ACCEPTED' || !invitation.accepted_by) {
      throw new BadRequestException(`Cannot activate invitation with status '${invitation.status}'`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark invitation ACTIVE and consumed
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACTIVE',
          approved_by: guardianUserId,
          consumed_at: new Date(),
        },
      });

      // 2. Create CareRelationship
      const careRelationship = await tx.careRelationship.create({
        data: {
          child_id: invitation.child_id,
          caregiver_user_id: invitation.accepted_by!,
          starts_at: new Date(),
          status: 'ACTIVE',
        },
      });

      // 3. Create AccessGrant for invitee scoped to relationship
      const grant = await tx.accessGrant.create({
        data: {
          user_id: invitation.accepted_by!,
          child_id: invitation.child_id,
          relationship_id: careRelationship.id,
          role: invitation.target_role,
          scopes: ['CARE_READ', 'CARE_WRITE', 'HANDOFF_WRITE', 'CONTRACT_READ', 'BILLING_READ'],
          starts_at: new Date(),
        },
      });

      return {
        status: 'activated',
        relationshipId: careRelationship.id,
        grantId: grant.id,
        role: grant.role,
      };
    });
  }
}
