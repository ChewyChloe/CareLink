import { SupplyReminderService } from './supply-reminder.service';
import { StaticCommerceProvider } from './commerce/static-commerce.provider';
import { BadRequestException } from '@nestjs/common';

function makeMockPrisma(overrides: any = {}) {
  const store = {
    tasks: new Map<string, any>(),
    drafts: new Map<string, any>(),
  };

  const mockPrisma: any = {
    _store: store,
    accessGrant: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        const userId = where.user_id || (where.role === 'GUARDIAN' ? 'guardian-1' : 'caregiver-1');
        return {
          id: 'grant-1',
          user_id: userId,
          child_id: where.child_id || 'child-1',
          role: where.role || (userId === 'guardian-1' ? 'GUARDIAN' : 'CAREGIVER'),
          scopes: ['HANDOFF_READ', 'HANDOFF_WRITE'],
          status: 'ACTIVE',
          user: {
            id: userId,
            line_sub: 'U_line_mock_' + userId,
            status: 'ACTIVE',
          },
        };
      }),
    },
    careRelationship: {
      findFirst: jest.fn().mockImplementation(async ({ where }) => {
        return {
          id: 'rel-1',
          caregiver_user_id: 'caregiver-1',
          guardian_user_id: 'guardian-1',
          child_id: where.child_id || 'child-1',
          status: 'ACTIVE',
        };
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'rel-1',
          caregiver_user_id: 'caregiver-1',
          guardian_user_id: 'guardian-1',
          child_id: 'child-1',
          status: 'ACTIVE',
        },
      ]),
    },
    supplyDraft: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = 'draft-' + Math.random().toString(36).substr(2, 6);
        const record = { id, ...data, created_at: new Date(), updated_at: new Date() };
        store.drafts.set(id, record);
        return record;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        return store.drafts.get(where.id) || null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        return Array.from(store.drafts.values()).filter((d) => !where?.child_id || d.child_id === where.child_id);
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = store.drafts.get(where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data, updated_at: new Date() };
        store.drafts.set(where.id, updated);
        return updated;
      }),
    },
    supplyTask: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const id = 'task-' + Math.random().toString(36).substr(2, 6);
        const record = {
          id,
          ...data,
          relationship: { child_id: 'child-1' },
          created_at: new Date(),
          updated_at: new Date(),
        };
        store.tasks.set(id, record);
        return record;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        const t = store.tasks.get(where.id);
        if (!t) return null;
        return { ...t, relationship: { child_id: 'child-1' } };
      }),
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        return Array.from(store.tasks.values()).filter((t) => !where?.child_id || t.child_id === where.child_id);
      }),
      update: jest.fn().mockImplementation(async ({ where, data }) => {
        const existing = store.tasks.get(where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data, updated_at: new Date() };
        store.tasks.set(where.id, updated);
        return updated;
      }),
    },
    job: {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (cb) => {
      return cb({
        supplyTask: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            const id = 'task-tx-' + Math.random().toString(36).substr(2, 6);
            const record = {
              id,
              ...data,
              relationship: { child_id: 'child-1' },
              created_at: new Date(),
              updated_at: new Date(),
            };
            store.tasks.set(id, record);
            return record;
          }),
        },
        job: {
          create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        },
      });
    }),
  };

  return mockPrisma;
}

describe('Supply Workflow & State Transition Specification', () => {
  let service: SupplyReminderService;
  let prisma: any;
  let commerceProvider: StaticCommerceProvider;

  beforeEach(() => {
    prisma = makeMockPrisma();
    commerceProvider = new StaticCommerceProvider();
    service = new SupplyReminderService(prisma, commerceProvider);
  });

  describe('1. Supply Draft Gate Lifecycle', () => {
    it('should create a SupplyDraft with PENDING_CONFIRMATION state and NEVER write production SupplyTask directly', async () => {
      const draft = await service.createDraft('caregiver-1', 'child-1', {
        item_name: '尿布',
        size: 'M',
        quantity: '1包',
        remaining_quantity: '5片',
        due_at: new Date(Date.now() + 86400000).toISOString(),
        urgency: 'NORMAL',
      });

      expect(draft.id).toBeDefined();
      expect(draft.status).toBe('PENDING_CONFIRMATION');
      expect(draft.item_name).toBe('尿布');
      expect(draft.size).toBe('M');

      // Crucial requirement: AI draft must NOT directly write production SupplyTask
      expect(prisma._store.tasks.size).toBe(0);
    });

    it('should convert Draft into formal SupplyTask ONLY when human user confirms draft', async () => {
      const draft = await service.createDraft('caregiver-1', 'child-1', {
        item_name: '尿布',
        size: 'M',
        quantity: '1包',
        remaining_quantity: '5片',
        due_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const { task: confirmedTask } = await service.confirmDraft('caregiver-1', draft.id);

      expect(confirmedTask).toBeDefined();
      expect(confirmedTask.status).toBe('PENDING');
      expect(confirmedTask.item_name).toBe('尿布');

      // Verify draft status transitioned to CONFIRMED
      const updatedDraft = await prisma.supplyDraft.findUnique({ where: { id: draft.id } });
      expect(updatedDraft.status).toBe('CONFIRMED');
    });

    it('should allow user to cancel a Draft without creating any SupplyTask', async () => {
      const draft = await service.createDraft('caregiver-1', 'child-1', {
        item_name: '濕紙巾',
        quantity: '2包',
      });

      const cancelledDraft = await service.cancelDraft('caregiver-1', draft.id);
      expect(cancelledDraft.status).toBe('CANCELLED');
      expect(prisma._store.tasks.size).toBe(0);
    });

    it('should reject confirming an already CANCELLED or CONFIRMED draft', async () => {
      const draft = await service.createDraft('caregiver-1', 'child-1', {
        item_name: '尿布',
      });

      await service.cancelDraft('caregiver-1', draft.id);

      await expect(service.confirmDraft('caregiver-1', draft.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. State Machine Transitions: PENDING -> PACKED -> RECEIVED', () => {
    let taskId: string;

    beforeEach(async () => {
      const draft = await service.createDraft('caregiver-1', 'child-1', {
        item_name: '尿布',
        size: 'M',
        quantity: '1包',
        due_at: new Date(Date.now() + 86400000).toISOString(),
      });
      const { task } = await service.confirmDraft('caregiver-1', draft.id);
      taskId = task.id;
    });

    it('should allow valid transition: PENDING -> PACKED (Guardian packs item)', async () => {
      const packedTask = await service.markPacked('guardian-1', taskId);
      expect(packedTask.status).toBe('PACKED');
      expect(packedTask.packed_at).toBeDefined();
    });

    it('should allow valid transition: PACKED -> RECEIVED (Caregiver receives item)', async () => {
      await service.markPacked('guardian-1', taskId);
      const receivedTask = await service.markReceived('caregiver-1', taskId);

      expect(receivedTask.status).toBe('RECEIVED');
      expect(receivedTask.received_at).toBeDefined();
    });

    it('should forbid illegal transition: PENDING -> RECEIVED (cannot skip PACKED)', async () => {
      await expect(service.markReceived('caregiver-1', taskId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should forbid illegal transition: RECEIVED -> PACKED (cannot pack after received)', async () => {
      await service.markPacked('guardian-1', taskId);
      await service.markReceived('caregiver-1', taskId);

      await expect(service.markPacked('guardian-1', taskId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
