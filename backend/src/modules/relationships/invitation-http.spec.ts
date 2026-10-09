import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HTTP_PREFIX_OPTIONS } from '../../http-prefix';

describe('Invitation HTTP → real auth guard → service (synthetic in-memory DB boundary)', () => {
  let app: INestApplication; let base: string;
  const invitations = new Map<string, any>(); const grants: any[] = [];
  let serial = 0;
  const conditional = async ({ where, data }: any) => { const row = invitations.get(where.id); if (!row || row.status !== where.status || row.expires_at <= where.expires_at.gt) return { count: 0 }; Object.assign(row, data); return { count: 1 }; };
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => ({ id: where.id, status: 'ACTIVE' }) },
    accessGrant: {
      findFirst: async ({ where }: any) => grants.find(g => g.user_id === where.user_id && g.child_id === where.child_id && (!where.role || g.role === where.role)) || null,
      create: async ({ data }: any) => { const g = { id: `grant-${++serial}`, ...data }; grants.push(g); return g; },
    },
    invitation: {
      create: async ({ data }: any) => { const row = { id: `inv-${++serial}`, ...data, child: { display_alias: '合成寶寶 B' } }; invitations.set(row.id, row); return row; },
      findUnique: async ({ where }: any) => [...invitations.values()].find(i => where.id ? i.id === where.id : i.token_hash === where.token_hash) || null,
      updateMany: conditional,
      update: async ({ where, data }: any) => Object.assign(invitations.get(where.id), data),
      findMany: async () => [...invitations.values()].map(({ token_hash, child, ...rest }) => rest),
    },
    careRelationship: { create: async ({ data }: any) => ({ id: `rel-${++serial}`, ...data }) },
  };
  prisma.$transaction = async (callback: any) => callback(prisma);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [InvitationsController], providers: [InvitationsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { get: () => undefined } },
      { provide: SessionService, useValue: { validateSession: async (token: string) => { if (!['G','C','X'].includes(token)) throw new UnauthorizedException(); return { userId: token }; } } },
    ] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api', HTTP_PREFIX_OPTIONS); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { invitations.clear(); grants.length = 0; grants.push({ user_id: 'G', child_id: 'B', role: 'GUARDIAN' }); });
  const request = (path: string, actor?: string, body?: any) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(actor ? { Authorization: `Bearer ${actor}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function create() { const r = await request('/api/invitations', 'G', { childId: 'B', targetRole: 'CAREGIVER' }); expect(r.status).toBe(201); return r.json(); }
  it('requires authentication, exposes no raw token hash, accepts once, requires guardian activation and grants access', async () => {
    expect((await request('/api/invitations/invalid')).status).toBe(401);
    const invitation = await create();
    const preview = await request(`/api/invitations/${invitation.token}`, 'C'); expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ childAlias: '合成寶寶 B', targetRole: 'CAREGIVER' });
    expect((await request(`/api/invitations/${invitation.token}/accept`, 'C', {})).status).toBe(200);
    expect(grants.some(g => g.user_id === 'C')).toBe(false);
    expect((await request(`/api/invitations/${invitation.token}/accept`, 'X', {})).status).toBe(400);
    expect((await request(`/api/invitations/${invitation.invitationId}/activate`, 'X', {})).status).toBe(403);
    const pending = await (await request('/api/children/B/invitations', 'G')).json(); expect(pending[0].status).toBe('ACCEPTED'); expect(pending[0].token_hash).toBeUndefined();
    expect((await request(`/api/invitations/${invitation.invitationId}/activate`, 'G', {})).status).toBe(200);
    expect(grants.some(g => g.user_id === 'C' && g.child_id === 'B' && g.scopes.includes('CARE_READ'))).toBe(true);
    expect((await request(`/api/invitations/${invitation.invitationId}/activate`, 'G', {})).status).toBe(400);
  });
  it('rejects self acceptance and expired acceptance/activation', async () => {
    const i = await create(); expect((await request(`/api/invitations/${i.token}/accept`, 'G', {})).status).toBe(400);
    invitations.get(i.invitationId).expires_at = new Date(0);
    expect((await request(`/api/invitations/${i.token}/accept`, 'C', {})).status).toBe(400);
    const next = await create(); await request(`/api/invitations/${next.token}/accept`, 'C', {});
    invitations.get(next.invitationId).expires_at = new Date(0);
    expect((await request(`/api/invitations/${next.invitationId}/activate`, 'G', {})).status).toBe(400);
  });
});
