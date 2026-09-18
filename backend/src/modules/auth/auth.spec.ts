import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { LineIdentityVerifier } from './line-identity-verifier.service';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Stage 3: Auth & Identity Verification Tests', () => {
  const miniAppChannelId = '1234567890';
  const providerId = 'provider_001';
  const sessionSecret = 'test_secret_for_carelink_session_123456';

  let verifier: LineIdentityVerifier;
  let sessionService: SessionService;
  let authService: AuthService;

  // In-memory mock database for users and grants
  let usersTable: Map<string, any>;
  let grantsTable: Map<string, any>;

  const createMockPrisma = () => ({
    user: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) {
          return usersTable.get(where.id) || null;
        }
        if (where.line_provider_id_line_sub) {
          const key = `${where.line_provider_id_line_sub.line_provider_id}:${where.line_provider_id_line_sub.line_sub}`;
          for (const user of usersTable.values()) {
            if (`${user.line_provider_id}:${user.line_sub}` === key) {
              return user;
            }
          }
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = `user_${Date.now()}_${Math.random()}`;
        const record = { id, ...data, created_at: new Date() };
        usersTable.set(id, record);
        return record;
      }),
    },
    accessGrant: {
      findMany: jest.fn().mockImplementation(async () => []),
    },
  });

  beforeEach(async () => {
    usersTable = new Map();
    grantsTable = new Map();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineIdentityVerifier,
        SessionService,
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'LINE_MINI_APP_CHANNEL_ID') return miniAppChannelId;
              if (key === 'LINE_PROVIDER_ID') return providerId;
              if (key === 'SESSION_SECRET') return sessionSecret;
              if (key === 'NODE_ENV') return 'test';
              return null;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: createMockPrisma(),
        },
      ],
    }).compile();

    verifier = module.get<LineIdentityVerifier>(LineIdentityVerifier);
    sessionService = module.get<SessionService>(SessionService);
    authService = module.get<AuthService>(AuthService);
  });

  describe('1. LINE ID Token Verification', () => {
    it('should reject missing or empty ID token', async () => {
      await expect(verifier.verifyIdToken('')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject unverified or fake JWT decoded on client', async () => {
      // Fake unverified JWT string
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fake';
      
      // Mock global fetch to simulate LINE rejection
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'invalid id token',
      } as any);

      await expect(verifier.verifyIdToken(fakeToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject token with wrong audience (channel mismatch)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          iss: 'https://access.line.me',
          sub: 'U_trusted_123',
          aud: 'wrong_channel_id_9999',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      } as any);

      await expect(verifier.verifyIdToken('token_wrong_aud')).rejects.toThrow('Token audience does not match');
    });

    it('should reject expired token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          iss: 'https://access.line.me',
          sub: 'U_trusted_123',
          aud: miniAppChannelId,
          exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
        }),
      } as any);

      await expect(verifier.verifyIdToken('token_expired')).rejects.toThrow('Token has expired');
    });

    it('should accept valid verified token and return trusted sub', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          iss: 'https://access.line.me',
          sub: 'U_trusted_999',
          aud: miniAppChannelId,
          exp: Math.floor(Date.now() / 1000) + 3600,
          name: 'Caregiver Alice',
        }),
      } as any);

      const payload = await verifier.verifyIdToken('token_valid');
      expect(payload.sub).toBe('U_trusted_999');
      expect(payload.aud).toBe(miniAppChannelId);
    });
  });

  describe('2. CareLink Server Session Lifecycle', () => {
    it('should create valid signed session and validate successfully', async () => {
      const { token, session } = await sessionService.createSession('user_1', 'line_sub_1', providerId);
      expect(token).toBeDefined();
      expect(session.userId).toBe('user_1');

      const validated = await sessionService.validateSession(token);
      expect(validated.userId).toBe('user_1');
      expect(validated.sessionId).toBe(session.sessionId);
    });

    it('should reject tampered session token signature', async () => {
      const { token } = await sessionService.createSession('user_1', 'line_sub_1', providerId);
      const tampered = token.replace(/a/g, 'b');

      await expect(sessionService.validateSession(tampered)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject session after server-side logout / invalidation', async () => {
      const { token } = await sessionService.createSession('user_1', 'line_sub_1', providerId);
      expect(await sessionService.validateSession(token)).toBeDefined();

      await sessionService.invalidateSession(token);
      await expect(sessionService.validateSession(token)).rejects.toThrow('Session has been revoked or invalidated');
    });
  });

  describe('3. Login Flow & User Creation', () => {
    it('should find-or-create CareLink user and return session cookie options', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          iss: 'https://access.line.me',
          sub: 'U_line_user_001',
          aud: miniAppChannelId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      } as any);

      const result = await authService.loginWithLineIdToken('valid_token_string');
      expect(result.user.status).toBe('ACTIVE');
      expect(result.token).toBeDefined();
      expect(result.cookieOptions.httpOnly).toBe(true);
      expect(result.cookieOptions.sameSite).toBe('lax');

      // User must be recorded in usersTable
      expect(usersTable.size).toBe(1);
      const user = Array.from(usersTable.values())[0];
      expect(user.line_sub).toBe('U_line_user_001');
      expect(user.line_provider_id).toBe(providerId);
    });
  });
});
