import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ChildrenService } from './children.service';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Stage 3: Relationships, Child Authorization & Invitation Tests', () => {
  let childrenService: ChildrenService;
  let invitationsService: InvitationsService;

  // Mock in-memory tables
  let childrenTable: Map<string, any>;
  let accessGrantsTable: Map<string, any>;
  let invitationsTable: Map<string, any>;
  let careRelationshipsTable: Map<string, any>;

  const createMockPrisma = () => ({
    $transaction: jest.fn().mockImplementation(async (callback) => {
      const tx = {
        child: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            const id = `child_${Date.now()}_${Math.random()}`;
            const record = { id, ...data, created_at: new Date() };
            childrenTable.set(id, record);
            return record;
          }),
        },
        accessGrant: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            const id = `grant_${Date.now()}_${Math.random()}`;
            const record = { id, ...data, revoked_at: null, created_at: new Date() };
            accessGrantsTable.set(id, record);
            return record;
          }),
        },
        invitation: {
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            const inv = invitationsTable.get(where.id);
            if (!inv || inv.status !== where.status || inv.expires_at <= where.expires_at.gt) return { count: 0 };
            invitationsTable.set(where.id, { ...inv, ...data }); return { count: 1 };
          }),
          update: jest.fn().mockImplementation(async ({ where, data }) => {
            const inv = invitationsTable.get(where.id);
            if (!inv) throw new Error('Not found');
            const updated = { ...inv, ...data };
            invitationsTable.set(where.id, updated);
            return updated;
          }),
        },
        careRelationship: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            const id = `rel_${Date.now()}_${Math.random()}`;
            const record = { id, ...data, created_at: new Date() };
            careRelationshipsTable.set(id, record);
            return record;
          }),
        },
      };
      return await callback(tx);
    }),
    child: {
      findUnique: jest.fn().mockImplementation(async ({ where }) => childrenTable.get(where.id) || null),
    },
    accessGrant: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        for (const grant of accessGrantsTable.values()) {
          const matchUser = grant.user_id === where.user_id;
          const matchChild = grant.child_id === where.child_id;
          const matchRole = !where.role || grant.role === where.role;
          const matchRevoked = where.revoked_at === null ? grant.revoked_at === null : true;
          if (matchUser && matchChild && matchRole && matchRevoked) {
            const child = childrenTable.get(grant.child_id);
            return { ...grant, child };
          }
        }
        return null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        const results = [];
        for (const grant of accessGrantsTable.values()) {
          if (grant.user_id === where.user_id && grant.revoked_at === null) {
            const child = childrenTable.get(grant.child_id);
            results.push({ ...grant, child });
          }
        }
        return results;
      }),
    },
    invitation: {
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            const inv = invitationsTable.get(where.id);
            if (!inv || inv.status !== where.status || inv.expires_at <= where.expires_at.gt) return { count: 0 };
            invitationsTable.set(where.id, { ...inv, ...data }); return { count: 1 };
          }),
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = `inv_${Date.now()}_${Math.random()}`;
        const record = { id, ...data, created_at: new Date() };
        invitationsTable.set(id, record);
        return record;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) return invitationsTable.get(where.id) || null;
        if (where.token_hash) {
          for (const inv of invitationsTable.values()) {
            if (inv.token_hash === where.token_hash) return inv;
          }
        }
        return null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const inv = invitationsTable.get(where.id);
        if (!inv) throw new Error('Not found');
        const updated = { ...inv, ...data };
        invitationsTable.set(where.id, updated);
        return updated;
      }),
    },
  });

  beforeEach(async () => {
    childrenTable = new Map();
    accessGrantsTable = new Map();
    invitationsTable = new Map();
    careRelationshipsTable = new Map();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChildrenService,
        InvitationsService,
        {
          provide: PrismaService,
          useValue: createMockPrisma(),
        },
      ],
    }).compile();

    childrenService = module.get<ChildrenService>(ChildrenService);
    invitationsService = module.get<InvitationsService>(InvitationsService);
  });

  describe('1. Child Creation & Access Grant', () => {
    it('should create child and automatically grant GUARDIAN role', async () => {
      const child = await childrenService.createChild('user_guardian_A', '小寶');
      expect(child.displayAlias).toBe('小寶');
      expect(child.role).toBe('GUARDIAN');

      expect(childrenTable.size).toBe(1);
      expect(accessGrantsTable.size).toBe(1);
      const grant = Array.from(accessGrantsTable.values())[0];
      expect(grant.user_id).toBe('user_guardian_A');
      expect(grant.child_id).toBe(child.id);
      expect(grant.scopes).toContain('CARE_READ');
    });
  });

  describe('2. Cross-Family IDOR Protection', () => {
    it('User A accessing Child A is allowed', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const retrieved = await childrenService.getChildById('user_guardian_A', childA.id);
      expect(retrieved.id).toBe(childA.id);
    });

    it('User B accessing Child A returns 404 (IDOR Protection)', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      // User B has NO AccessGrant on Child A -> must throw 404, NOT 403
      await expect(childrenService.getChildById('user_guardian_B', childA.id)).rejects.toThrow(NotFoundException);
    });

    it('Revoked grant returns 404', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const grant = Array.from(accessGrantsTable.values())[0];
      grant.revoked_at = new Date(); // revoke grant

      await expect(childrenService.getChildById('user_guardian_A', childA.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Invitation Lifecycle Flow', () => {
    it('Guardian creates invite -> token is hashed -> raw token NOT stored in DB', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');

      const invite = await invitationsService.createInvitation('user_guardian_A', {
        childId: childA.id,
        targetRole: 'CAREGIVER',
      });

      expect(invite.token).toBeDefined();
      expect(invite.inviteUrl).toContain(invite.token);

      // Verify DB stores hash, not raw token
      const stored = Array.from(invitationsTable.values())[0];
      expect(stored.token_hash).not.toBe(invite.token);
      expect(stored.token_hash).toBe(invitationsService.hashToken(invite.token));
      expect(stored.status).toBe('PENDING');
    });

    it('Invitee accepts invite -> status ACCEPTED, but NO child access granted yet', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const invite = await invitationsService.createInvitation('user_guardian_A', {
        childId: childA.id,
        targetRole: 'CAREGIVER',
      });

      // Caregiver logs in and accepts
      const acceptRes = await invitationsService.acceptInvitation('user_caregiver_B', invite.token);
      expect(acceptRes.status).toBe('accepted');

      const stored = Array.from(invitationsTable.values())[0];
      expect(stored.status).toBe('ACCEPTED');
      expect(stored.accepted_by).toBe('user_caregiver_B');

      // CRITICAL CHECK: Caregiver STILL does NOT have access to Child A!
      await expect(childrenService.getChildById('user_caregiver_B', childA.id)).rejects.toThrow(NotFoundException);
    });

    it('Invitee attempts to activate own invitation -> 403 Forbidden', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const invite = await invitationsService.createInvitation('user_guardian_A', {
        childId: childA.id,
        targetRole: 'CAREGIVER',
      });

      await invitationsService.acceptInvitation('user_caregiver_B', invite.token);

      // Invitee B tries to call activate
      await expect(
        invitationsService.activateInvitation('user_caregiver_B', invite.invitationId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Guardian activates invitation -> CareRelationship & AccessGrant created', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const invite = await invitationsService.createInvitation('user_guardian_A', {
        childId: childA.id,
        targetRole: 'CAREGIVER',
      });

      await invitationsService.acceptInvitation('user_caregiver_B', invite.token);

      // Guardian A activates
      const activateRes = await invitationsService.activateInvitation('user_guardian_A', invite.invitationId);
      expect(activateRes.status).toBe('activated');
      expect(activateRes.relationshipId).toBeDefined();

      // Now Caregiver B HAS access to Child A!
      const caregiverView = await childrenService.getChildById('user_caregiver_B', childA.id);
      expect(caregiverView.id).toBe(childA.id);
      expect(caregiverView.role).toBe('CAREGIVER');
    });

    it('Expired invitation cannot be accepted', async () => {
      const childA = await childrenService.createChild('user_guardian_A', '寶寶A');
      const invite = await invitationsService.createInvitation('user_guardian_A', {
        childId: childA.id,
        targetRole: 'CAREGIVER',
      });

      // Manually set expiration in past
      const stored = Array.from(invitationsTable.values())[0];
      stored.expires_at = new Date(Date.now() - 10000);

      await expect(invitationsService.acceptInvitation('user_caregiver_B', invite.token)).rejects.toThrow(
        'Invitation has expired',
      );
    });
  });
});
