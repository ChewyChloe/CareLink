import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AccessGrantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new NotFoundException('Resource not found');
    }

    // Extract childId from route params or query or body
    const childId = request.params?.id || request.params?.childId || request.body?.childId || request.query?.childId;

    if (!childId) {
      return true; // No specific childId in request, continue
    }

    const now = new Date();

    // Look for an active AccessGrant for this user and child
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: user.id,
        child_id: childId as string,
        revoked_at: null,
        starts_at: { lte: now },
        OR: [
          { ends_at: null },
          { ends_at: { gt: now } },
        ],
      },
      include: {
        relationship: true,
      },
    });

    if (!grant) {
      // Return 404 to prevent IDOR existence probing (per PRD / Threat Model)
      throw new NotFoundException('Resource not found');
    }

    // If grant is scoped to a relationship, ensure relationship is ACTIVE
    if (grant.relationship && grant.relationship.status !== 'ACTIVE') {
      throw new NotFoundException('Resource not found');
    }

    // Attach active grant to request for downstream handlers
    (request as any).accessGrant = grant;
    return true;
  }
}
