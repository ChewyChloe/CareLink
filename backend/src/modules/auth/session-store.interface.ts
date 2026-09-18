import { CareLinkSession } from './session.service';

/**
 * Interface for CareLink session persistence storage.
 * All operations return Promises to allow seamless transition to asynchronous database/cache backends.
 */
export interface SessionStore {
  create(session: CareLinkSession): Promise<void>;
  get(sessionId: string): Promise<CareLinkSession | null>;
  revoke(sessionId: string): Promise<void>;
  purgeExpired(): Promise<number>;
  isActive(sessionId: string): Promise<boolean>;
}

/**
 * In-memory implementation of SessionStore.
 *
 * @status DEV_TEST_ONLY
 * @warning Ephemeral storage. Sessions are lost upon process restart.
 *          Suitable only for unit tests and offline single-instance execution.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly store = new Map<string, CareLinkSession>();

  async create(session: CareLinkSession): Promise<void> {
    this.store.set(session.sessionId, session);
  }

  async get(sessionId: string): Promise<CareLinkSession | null> {
    const session = this.store.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async purgeExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of this.store.entries()) {
      if (now > session.expiresAt) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  async isActive(sessionId: string): Promise<boolean> {
    return (await this.get(sessionId)) !== null;
  }
}

/**
 * Production PersistentSessionStore
 *
 * Persists authenticated sessions into the live PostgreSQL `auth_sessions` table via Prisma.
 * Survives process restarts, supports instant revocation (logout), and enforces TTL expiration.
 */
export class PersistentSessionStore implements SessionStore {
  constructor(private readonly prisma: any) {}

  async create(session: CareLinkSession): Promise<void> {
    await this.prisma.authSession.create({
      data: {
        session_id: session.sessionId,
        user_id: session.userId,
        line_sub: session.lineSub,
        provider_id: session.providerId,
        created_at: new Date(session.createdAt),
        expires_at: new Date(session.expiresAt),
      },
    });
  }

  async get(sessionId: string): Promise<CareLinkSession | null> {
    const row = await this.prisma.authSession.findUnique({
      where: { session_id: sessionId },
    });

    if (!row) return null;
    if (row.revoked_at !== null) return null;
    if (row.expires_at.getTime() < Date.now()) return null;

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      lineSub: row.line_sub,
      providerId: row.provider_id,
      createdAt: row.created_at.getTime(),
      expiresAt: row.expires_at.getTime(),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { session_id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  async purgeExpired(): Promise<number> {
    const res = await this.prisma.authSession.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: new Date() } },
          { revoked_at: { not: null } },
        ],
      },
    });
    return res.count;
  }

  async isActive(sessionId: string): Promise<boolean> {
    const s = await this.get(sessionId);
    return s !== null;
  }
}
