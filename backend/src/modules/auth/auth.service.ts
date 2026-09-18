import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LineIdentityVerifier } from './line-identity-verifier.service';
import { SessionService, CareLinkSession } from './session.service';
import { CookieOptions } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineVerifier: LineIdentityVerifier,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticates a user using raw LINE ID Token.
   * Verifies with LINE -> extracts trusted sub -> find-or-create CareLink user -> issues CareLink session.
   */
  async loginWithLineIdToken(idToken: string): Promise<{
    token: string;
    session: CareLinkSession;
    user: { id: string; line_provider_id: string; status: string };
    cookieOptions: CookieOptions;
  }> {
    const verifiedPayload = await this.lineVerifier.verifyIdToken(idToken);
    const providerId = this.configService.get<string>('LINE_PROVIDER_ID') || 'default_provider';

    // Find or create CareLink user based on trusted provider_id + line_sub
    let user = await this.prisma.user.findUnique({
      where: {
        line_provider_id_line_sub: {
          line_provider_id: providerId,
          line_sub: verifiedPayload.sub,
        },
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          line_provider_id: providerId,
          line_sub: verifiedPayload.sub,
          status: 'ACTIVE',
        },
      });
      this.logger.log(`Created new CareLink user for sub=${verifiedPayload.sub.slice(0, 6)}...`);
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is suspended');
    }

    // Seed test care data (湯圓 / CAREGIVER / CARE_WRITE) in development if none exists
    await this.ensureDevSyntheticSeed(user.id);

    const { token, session } = await this.sessionService.createSession(user.id, user.line_sub, providerId);
    const cookieOptions = this.sessionService.getCookieOptions();

    return {
      token,
      session,
      user: {
        id: user.id,
        line_provider_id: user.line_provider_id,
        status: user.status,
      },
      cookieOptions,
    };
  }

  /**
   * Development-only synthetic seed for Stage 6.5 verification:
   * Ensures active CareLink User has:
   * Child: 湯圓
   * Role: CAREGIVER
   * active CareRelationship
   * CARE_WRITE AccessGrant
   * Only applied to Neon carelink-dev / development mode.
   */
  async ensureDevSyntheticSeed(userId: string): Promise<void> {
    const isDev =
      this.configService.get<string>('NODE_ENV') !== 'production' ||
      this.configService.get<string>('NEON_BRANCH') === 'carelink-dev';
    if (!isDev) return;

    // Check if user already has active access grants
    const existingGrants = await this.prisma.accessGrant.findMany({
      where: {
        user_id: userId,
        revoked_at: null,
        OR: [{ ends_at: null }, { ends_at: { gt: new Date() } }],
      },
      include: { child: true },
    });

    if (existingGrants.length > 0) {
      return;
    }

    if (typeof (this.prisma as any)?.child?.findFirst !== 'function') {
      return;
    }

    // Check or create child "湯圓"
    let child = await this.prisma.child.findFirst({
      where: {
        display_alias: '湯圓',
        created_by: userId,
      },
    });

    if (!child) {
      child = await this.prisma.child.create({
        data: {
          display_alias: '湯圓',
          created_by: userId,
        },
      });
    }

    // Check or create active CareRelationship
    let relationship = await this.prisma.careRelationship.findFirst({
      where: {
        child_id: child.id,
        caregiver_user_id: userId,
        status: 'ACTIVE',
      },
    });

    if (!relationship) {
      relationship = await this.prisma.careRelationship.create({
        data: {
          child_id: child.id,
          caregiver_user_id: userId,
          status: 'ACTIVE',
          starts_at: new Date(),
        },
      });
    }

    // Check or create AccessGrant with CARE_WRITE
    const grant = await this.prisma.accessGrant.findFirst({
      where: {
        user_id: userId,
        child_id: child.id,
        revoked_at: null,
      },
    });

    if (!grant) {
      await this.prisma.accessGrant.create({
        data: {
          user_id: userId,
          child_id: child.id,
          relationship_id: relationship.id,
          role: 'CAREGIVER',
          scopes: ['CARE_READ', 'CARE_WRITE', 'HANDOFF_WRITE'],
          starts_at: new Date(),
        },
      });
      this.logger.log(`Created dev synthetic seed for user ${userId.slice(0, 6)}... (Child: 湯圓, Role: CAREGIVER, active CareRelationship, CARE_WRITE)`);
    }
  }

  /**
   * Returns current user profile with active access grants.
   */
  async getMe(userId: string) {
    await this.ensureDevSyntheticSeed(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        line_provider_id: true,
        status: true,
        oa_friendship_status: true,
        created_at: true,
        access_grants: {
          where: {
            revoked_at: null,
            OR: [
              { ends_at: null },
              { ends_at: { gt: new Date() } },
            ],
          },
          include: {
            child: {
              select: {
                id: true,
                display_alias: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      status: user.status,
      oaFriendshipStatus: user.oa_friendship_status,
      createdAt: user.created_at,
      grants: user.access_grants.map((g) => ({
        id: g.id,
        role: g.role,
        scopes: g.scopes,
        childId: g.child_id,
        childAlias: g.child?.display_alias,
      })),
    };
  }

  /**
   * Logs out user by invalidating server session.
   */
  async logout(sessionToken: string): Promise<CookieOptions> {
    await this.sessionService.invalidateSession(sessionToken);
    const options = this.sessionService.getCookieOptions();
    // Return expired cookie options to clear client cookie
    return {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    };
  }
}
