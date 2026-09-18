import { Injectable, Logger, UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CookieOptions } from 'express';
import { SessionStore, InMemorySessionStore, PersistentSessionStore } from './session-store.interface';
import { PrismaService } from '../../prisma/prisma.service';

export interface CareLinkSession {
  sessionId: string;
  userId: string;
  lineSub: string;
  providerId: string;
  createdAt: number;
  expiresAt: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionSecret: string;
  private readonly sessionTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  public static readonly COOKIE_NAME = 'carelink_session';

  /**
   * Session persistence store.
   * Uses PersistentSessionStore backed by live PostgreSQL when Prisma is available;
   * otherwise falls back to InMemorySessionStore (@status DEV_TEST_ONLY) for unit tests.
   */
  private readonly store: SessionStore;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.sessionSecret =
      this.configService.get<string>('SESSION_SECRET') ||
      'carelink_dev_session_secret_1234567890_min_32_characters';

    if (this.prisma && typeof (this.prisma as any).authSession?.create === 'function') {
      this.store = new PersistentSessionStore(this.prisma);
    } else {
      this.store = new InMemorySessionStore();
    }
  }

  /**
   * Creates a new authenticated session for a CareLink User.
   */
  async createSession(userId: string, lineSub: string, providerId: string): Promise<{ token: string; session: CareLinkSession }> {
    const sessionId = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const expiresAt = now + this.sessionTtlMs;

    const session: CareLinkSession = {
      sessionId,
      userId,
      lineSub,
      providerId,
      createdAt: now,
      expiresAt,
    };

    await this.store.create(session);

    const token = this.signToken(sessionId, expiresAt);
    return { token, session };
  }

  /**
   * Validates the session token from cookie/header and returns the active session.
   */
  async validateSession(token: string): Promise<CareLinkSession> {
    if (!token) {
      throw new UnauthorizedException('Session token missing');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed session token');
    }

    const [sessionId, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    // 1. Verify signature
    const expectedSig = this.generateSignature(sessionId, expiresAt);
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid session token signature');
    }

    // 2. Check active session in server store (handles expiration internally)
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session has been revoked or invalidated');
    }

    return session;
  }

  /**
   * Invalidates a session (server-side logout).
   */
  async invalidateSession(token: string): Promise<void> {
    try {
      const parts = token.split('.');
      if (parts.length >= 1) {
        const sessionId = parts[0];
        await this.store.revoke(sessionId);
      }
    } catch {
      // Ignored during logout
    }
  }

  /**
   * Cookie configuration for CareLink session.
   */
  getCookieOptions(): CookieOptions {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const frontendUrl =
      this.configService.get<string>('FRONTEND_ORIGIN') ||
      this.configService.get<string>('FRONTEND_URL') ||
      '';
    const isHttps = isProd || frontendUrl.startsWith('https');
    return {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: this.sessionTtlMs,
    };
  }

  private signToken(sessionId: string, expiresAt: number): string {
    const signature = this.generateSignature(sessionId, expiresAt);
    return `${sessionId}.${expiresAt}.${signature}`;
  }

  private generateSignature(sessionId: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.sessionSecret)
      .update(`${sessionId}:${expiresAt}`)
      .digest('hex');
  }
}
