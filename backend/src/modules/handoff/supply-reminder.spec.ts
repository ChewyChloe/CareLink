/**
 * Tests for Care-to-Commerce Supply Reminder feature.
 * Covers: authorization, status transitions, LINE push idempotency,
 * commerce link resolution, and postback handling.
 */
import { SupplyReminderService } from './supply-reminder.service';
import { CommerceLinkResolver } from './commerce-link.resolver';
import { SupplyReminderWorker } from '../jobs/supply-reminder.worker';
import { FlexMessageBuilder } from '../line/flex/flex-message.builder';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

// ── Mock Factories ──────────────────────────────────────────────────────────

function makeMockPrisma(overrides: any = {}) {
  return {
    accessGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...overrides.accessGrant,
    },
    careRelationship: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.careRelationship,
    },
    supplyTask: {
      create: jest.fn().mockResolvedValue({ id: 'task-1', item_name: '尿布', status: 'PENDING' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      ...overrides.supplyTask,
    },
    job: {
      create: jest.fn().mockResolvedValue({ id: 'job-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
      ...overrides.job,
    },
    $transaction: jest.fn().mockImplementation(async (cb) => cb({
      supplyTask: {
        create: overrides.supplyTask?.create || jest.fn().mockResolvedValue({
          id: 'task-1',
          item_name: '尿布',
          status: 'PENDING',
          assigned_to: 'guardian-1',
          relationship_id: 'rel-1',
          due_at: new Date(),
        }),
      },
      job: {
        create: overrides.job?.create || jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
    })),
    ...overrides._root,
  } as any;
}

function makeMockConfigService(config: Record<string, string> = {}) {
  return {
    get: jest.fn().mockImplementation((key: string) => config[key] || undefined),
  } as any;
}

function makeMockLineMessaging() {
  return {
    pushFlexMessage: jest.fn().mockResolvedValue(true),
  } as any;
}

// ── 1. Authorized Caregiver Creates Reminder ────────────────────────────────

describe('SupplyReminderService', () => {
  it('1. authorized caregiver creates reminder', async () => {
    const prisma = makeMockPrisma({
      accessGrant: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ // caregiver grant
            id: 'grant-1',
            user_id: 'caregiver-1',
            child_id: 'child-1',
            role: 'CAREGIVER',
            scopes: ['CARE_READ', 'CARE_WRITE', 'HANDOFF_WRITE'],
          })
          .mockResolvedValueOnce({ // guardian grant
            id: 'grant-2',
            user_id: 'guardian-1',
            child_id: 'child-1',
            role: 'GUARDIAN',
            scopes: ['CARE_READ'],
            user: { id: 'guardian-1', line_sub: 'U1234', status: 'ACTIVE' },
          }),
      },
      careRelationship: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rel-1', child_id: 'child-1' }),
      },
    });

    const service = new SupplyReminderService(prisma);
    const result = await service.createReminder('caregiver-1', 'child-1', {
      item_name: '尿布',
      due_at: new Date(Date.now() + 60000).toISOString(),
      guardian_user_id: 'guardian-1',
    });

    expect(result).toBeDefined();
    expect(result.item_name).toBe('尿布');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // ── 2. Unauthorized Caregiver Rejected ──────────────────────────────────

  it('2. unauthorized caregiver (no grant) rejected', async () => {
    const prisma = makeMockPrisma({
      accessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    const service = new SupplyReminderService(prisma);
    await expect(
      service.createReminder('bad-user', 'child-1', {
        item_name: '尿布',
        due_at: new Date().toISOString(),
        guardian_user_id: 'guardian-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 3. Assigned Guardian Can Read Reminders ─────────────────────────────

  it('3. assigned guardian can read reminders', async () => {
    const prisma = makeMockPrisma({
      accessGrant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'grant-1',
          user_id: 'guardian-1',
          child_id: 'child-1',
          role: 'GUARDIAN',
        }),
      },
      careRelationship: {
        findMany: jest.fn().mockResolvedValue([{ id: 'rel-1' }]),
      },
      supplyTask: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'task-1', item_name: '尿布', status: 'PENDING' },
        ]),
      },
      job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const service = new SupplyReminderService(prisma);
    const result = await service.listByChild('guardian-1', 'child-1');
    expect(result).toHaveLength(1);
    expect(result[0].item_name).toBe('尿布');
    expect(result[0].reminder_sent).toBe(false);
  });

  // ── 12. Forged Postback / Wrong Guardian Rejected ──────────────────────

  it('12. forged postback - wrong guardian rejected', async () => {
    const prisma = makeMockPrisma({
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          assigned_to: 'guardian-1',
          status: 'PENDING',
          relationship: { child_id: 'child-1' },
        }),
      },
    });

    const service = new SupplyReminderService(prisma);
    await expect(
      service.markPacked('wrong-user', 'task-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── 13. Authorized Guardian PENDING → PACKED ──────────────────────────

  it('13. authorized guardian PENDING → PACKED', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({
      id: 'task-1',
      status: 'PACKED',
      packed_at: new Date(),
    });

    const prisma = makeMockPrisma({
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          assigned_to: 'guardian-1',
          status: 'PENDING',
          relationship: { child_id: 'child-1' },
        }),
        update: mockUpdate,
      },
      accessGrant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'grant-1',
          user_id: 'guardian-1',
          child_id: 'child-1',
          role: 'GUARDIAN',
        }),
      },
    });

    const service = new SupplyReminderService(prisma);
    const result = await service.markPacked('guardian-1', 'task-1');

    expect(result.status).toBe('PACKED');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'PACKED', packed_at: expect.any(Date) },
    });
  });

  // ── 14. PACKED → RECEIVED Compatible ──────────────────────────────────

  it('14. existing PACKED → RECEIVED behavior remains compatible', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({
      id: 'task-1',
      status: 'RECEIVED',
      received_at: new Date(),
    });

    const prisma = makeMockPrisma({
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          assigned_to: 'guardian-1',
          status: 'PACKED',
          relationship: { child_id: 'child-1' },
        }),
        update: mockUpdate,
      },
      accessGrant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'grant-1',
          user_id: 'caregiver-1',
          child_id: 'child-1',
          role: 'CAREGIVER',
        }),
      },
    });

    const service = new SupplyReminderService(prisma);
    const result = await service.markReceived('caregiver-1', 'task-1');
    expect(result.status).toBe('RECEIVED');
  });
});

// ── CommerceLinkResolver Tests ──────────────────────────────────────────────

describe('CommerceLinkResolver', () => {
  // ── 9. DIAPER Gets Commerce URI When Configured ───────────────────────

  it('9. DIAPER gets commerce URI when configured', () => {
    const config = makeMockConfigService({
      COMMERCE_DIAPER_URL: 'https://shop.example.com/diaper',
    });
    const resolver = new CommerceLinkResolver(config);
    expect(resolver.resolve('尿布')).toBe('https://shop.example.com/diaper');
  });

  // ── 10. Missing Commerce Config Hides CTA ────────────────────────────

  it('10. missing commerce config hides CTA', () => {
    const config = makeMockConfigService({});
    const resolver = new CommerceLinkResolver(config);
    expect(resolver.resolve('尿布')).toBeNull();
  });

  // ── 11. Non-HTTPS Commerce URL Rejected ───────────────────────────────

  it('11. only HTTPS commerce URL accepted', () => {
    const config = makeMockConfigService({
      COMMERCE_DIAPER_URL: 'http://insecure.example.com/diaper',
    });
    const resolver = new CommerceLinkResolver(config);
    expect(resolver.resolve('尿布')).toBeNull();
  });

  it('11b. unknown item returns null', () => {
    const config = makeMockConfigService({
      COMMERCE_DIAPER_URL: 'https://shop.example.com/diaper',
    });
    const resolver = new CommerceLinkResolver(config);
    expect(resolver.resolve('未知品項')).toBeNull();
  });
});

// ── SupplyReminderWorker Tests ──────────────────────────────────────────────

describe('SupplyReminderWorker', () => {
  const pastDue = new Date(Date.now() - 60000);
  const futureDue = new Date(Date.now() + 600000);

  // ── 4. Future Reminder Not Sent Early ─────────────────────────────────

  it('4. future reminder does not send early', async () => {
    const mockJobUpdate = jest.fn();
    const prisma = makeMockPrisma({
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          kind: 'SUPPLY_REMINDER',
          status: 'READY',
          attempts: 0,
          payload_refs: { supplyTaskId: 'task-1' },
        }),
        update: mockJobUpdate,
        findMany: jest.fn().mockResolvedValue([]),
      },
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'PENDING',
          item_name: '尿布',
          due_at: futureDue,
          assigned_to: 'guardian-1',
          assignee: { line_sub: 'U1234', status: 'ACTIVE' },
          relationship: { child: { display_alias: '小葵' } },
        }),
      },
    });

    const lineMock = makeMockLineMessaging();
    const worker = new SupplyReminderWorker(prisma, lineMock);
    const result = await worker.processJob('job-1');

    expect(result.status).toBe('SKIPPED');
    expect(lineMock.pushFlexMessage).not.toHaveBeenCalled();
  });

  // ── 5. Due Reminder Sends Push ────────────────────────────────────────

  it('5. due reminder sends once', async () => {
    const prisma = makeMockPrisma({
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          kind: 'SUPPLY_REMINDER',
          status: 'READY',
          attempts: 0,
          payload_refs: { supplyTaskId: 'task-1', guardianLineSub: 'U1234' },
        }),
        update: jest.fn(),
      },
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'PENDING',
          item_name: '尿布',
          quantity: '請補充一包尿布',
          due_at: pastDue,
          assigned_to: 'guardian-1',
          assignee: { line_sub: 'U1234', status: 'ACTIVE' },
          relationship: { child: { display_alias: '小葵' } },
        }),
      },
    });

    const lineMock = makeMockLineMessaging();
    const worker = new SupplyReminderWorker(prisma, lineMock);
    const result = await worker.processJob('job-1');

    expect(result.status).toBe('SUCCEEDED');
    expect(lineMock.pushFlexMessage).toHaveBeenCalledTimes(1);
    expect(lineMock.pushFlexMessage).toHaveBeenCalledWith(
      'U1234',
      expect.stringContaining('小葵'),
      expect.any(Object),
      'job-1', // retryKey = Job.id
    );
  });

  // ── 6. Job Retry Uses Same X-Line-Retry-Key ──────────────────────────

  it('6. job retry uses same X-Line-Retry-Key (job.id)', async () => {
    const prisma = makeMockPrisma({
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-uuid-123',
          kind: 'SUPPLY_REMINDER',
          status: 'RETRY',
          attempts: 1,
          payload_refs: { supplyTaskId: 'task-1', guardianLineSub: 'U1234' },
        }),
        update: jest.fn(),
      },
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'PENDING',
          item_name: '尿布',
          due_at: pastDue,
          assigned_to: 'guardian-1',
          assignee: { line_sub: 'U1234', status: 'ACTIVE' },
          relationship: { child: { display_alias: '小葵' } },
        }),
      },
    });

    const lineMock = makeMockLineMessaging();
    const worker = new SupplyReminderWorker(prisma, lineMock);
    await worker.processJob('job-uuid-123');

    // Retry key must be the same Job ID for idempotent delivery
    expect(lineMock.pushFlexMessage).toHaveBeenCalledWith(
      'U1234',
      expect.any(String),
      expect.any(Object),
      'job-uuid-123',
    );
  });

  // ── 7. No Second Push After Job SUCCEEDED ─────────────────────────────

  it('7. no second logical push after SUCCEEDED', async () => {
    const prisma = makeMockPrisma({
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          kind: 'SUPPLY_REMINDER',
          status: 'SUCCEEDED',
          attempts: 1,
          payload_refs: { supplyTaskId: 'task-1' },
        }),
      },
    });

    const lineMock = makeMockLineMessaging();
    const worker = new SupplyReminderWorker(prisma, lineMock);
    const result = await worker.processJob('job-1');

    expect(result.status).toBe('SKIPPED');
    expect(lineMock.pushFlexMessage).not.toHaveBeenCalled();
  });

  // ── 8. CANCELLED Task Never Sends ─────────────────────────────────────

  it('8. CANCELLED task never sends', async () => {
    const mockJobUpdate = jest.fn();
    const prisma = makeMockPrisma({
      job: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          kind: 'SUPPLY_REMINDER',
          status: 'READY',
          attempts: 0,
          payload_refs: { supplyTaskId: 'task-1' },
        }),
        update: mockJobUpdate,
      },
      supplyTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: 'CANCELLED',
          item_name: '尿布',
          due_at: pastDue,
        }),
      },
    });

    const lineMock = makeMockLineMessaging();
    const worker = new SupplyReminderWorker(prisma, lineMock);
    const result = await worker.processJob('job-1');

    expect(result.status).toBe('DEAD');
    expect(lineMock.pushFlexMessage).not.toHaveBeenCalled();
    // Job should be marked DEAD
    expect(mockJobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DEAD', last_error_code: 'TASK_CANCELLED' }),
    }));
  });
});

// ── FlexMessageBuilder Supply Reminder Tests ────────────────────────────────

describe('FlexMessageBuilder.buildSupplyReminderFlex', () => {
  it('generates valid flex bubble with commerce URL', () => {
    const flex = FlexMessageBuilder.buildSupplyReminderFlex({
      childAlias: '小葵',
      itemName: '尿布',
      note: '請補充一包尿布',
      supplyTaskId: 'task-1',
      commerceUrl: 'https://shop.example.com/diaper',
    });

    expect(flex.type).toBe('bubble');
    expect(flex.body.contents).toBeDefined();
    // Should have commerce button in footer
    expect(flex.footer.contents.length).toBe(2); // packed + commerce
    expect(flex.footer.contents[1].action.uri).toBe('https://shop.example.com/diaper');
  });

  it('hides commerce CTA when URL is null', () => {
    const flex = FlexMessageBuilder.buildSupplyReminderFlex({
      childAlias: '小葵',
      itemName: '尿布',
      note: '請補充尿布',
      supplyTaskId: 'task-1',
      commerceUrl: null,
    });

    // Only packed button, no commerce button
    expect(flex.footer.contents.length).toBe(1);
    expect(flex.footer.contents[0].action.type).toBe('postback');
  });

  it('postback data format is correct', () => {
    const flex = FlexMessageBuilder.buildSupplyReminderFlex({
      childAlias: '小葵',
      itemName: '尿布',
      note: '請補充尿布',
      supplyTaskId: 'task-abc-123',
      commerceUrl: null,
    });

    const postbackData = flex.footer.contents[0].action.data;
    expect(postbackData).toBe('action=supply_packed&id=task-abc-123');
  });
});
