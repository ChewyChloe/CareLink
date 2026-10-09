import { randomUUID } from 'crypto';
import { PrismaService } from './prisma/prisma.service';
import { InvitationsService } from './modules/relationships/invitations.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { TimelineService } from './modules/care/timeline.service';

// Opt-in test. Creates only UUID-scoped synthetic rows, no jobs or external messages.
const live = process.env.RUN_SCOPED_LIVE_CORE === 'true' ? describe : describe.skip;
live('Scoped live PostgreSQL invitation lifecycle (not LINE device E2E)', () => {
  jest.setTimeout(60000);
  const guardian = randomUUID(), caregiver = randomUUID(), childId = randomUUID();
  let database: PrismaService, observer: PrismaService;
  let service: InvitationsService;
  beforeAll(async () => {
    database = new PrismaService(); observer = new PrismaService(); service = new InvitationsService(database);
    await database.user.createMany({ data: [guardian, caregiver].map(id => ({ id, line_provider_id: 'competition_scoped_test', line_sub: `synthetic_${id}`, status: 'ACTIVE' })) });
    await database.child.create({ data: { id: childId, display_alias: '競賽合成測試 B', created_by: guardian } });
    await database.accessGrant.create({ data: { child_id: childId, user_id: guardian, role: 'GUARDIAN', scopes: ['CARE_READ'], starts_at: new Date() } });
  });
  afterAll(async () => {
    // Exact ownership scope; never delete by common substrings or global status.
    if (database) {
      await database.$transaction(async tx => {
        await tx.invitation.deleteMany({ where: { child_id: childId, inviter_id: guardian } });
        await tx.auditLog.deleteMany({ where: { actor_user_id: guardian, resource_type: 'guardian_instructions' } });
        await tx.guardianInstruction.deleteMany({ where: { child_id: childId, created_by_guardian_user_id: guardian } });
        await tx.accessGrant.deleteMany({ where: { child_id: childId, user_id: { in: [guardian, caregiver] } } });
        await tx.careRelationship.deleteMany({ where: { child_id: childId, caregiver_user_id: caregiver } });
        await tx.child.deleteMany({ where: { id: childId, created_by: guardian } });
        await tx.user.deleteMany({ where: { id: { in: [guardian, caregiver] }, line_provider_id: 'competition_scoped_test' } });
      });
      await database.onModuleDestroy();
    }
    if (observer) await observer.onModuleDestroy();
  });
  const create = () => service.createInvitation(guardian, { childId, targetRole: 'CAREGIVER' });
  it('persists hash only, accepts exactly once, and a second connection observes ACCEPTED before any access grant', async () => {
    const invitation = await create();
    const stored = await observer.invitation.findUniqueOrThrow({ where: { id: invitation.invitationId } });
    expect(stored.token_hash).toBe(service.hashToken(invitation.token)); expect(Object.values(stored)).not.toContain(invitation.token);
    const attempts = await Promise.allSettled([service.acceptInvitation(caregiver, invitation.token), service.acceptInvitation(caregiver, invitation.token)]);
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const accepted = await observer.invitation.findUniqueOrThrow({ where: { id: invitation.invitationId } }); expect(accepted.status).toBe('ACCEPTED'); expect(accepted.accepted_by).toBe(caregiver);
    expect(await observer.accessGrant.count({ where: { child_id: childId, user_id: caregiver } })).toBe(0);
    await expect(service.activateInvitation(caregiver, invitation.invitationId)).rejects.toThrow(ForbiddenException);
    const activations = await Promise.allSettled([service.activateInvitation(guardian, invitation.invitationId), service.activateInvitation(guardian, invitation.invitationId)]);
    expect(activations.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const grant = await observer.accessGrant.findFirstOrThrow({ where: { child_id: childId, user_id: caregiver } }); expect(grant.scopes).toContain('CARE_READ');
    expect(await observer.accessGrant.count({ where: { child_id: childId, user_id: caregiver } })).toBe(1);
    expect(await observer.careRelationship.count({ where: { id: grant.relationship_id!, child_id: childId, caregiver_user_id: caregiver, status: 'ACTIVE' } })).toBe(1);
    expect((await observer.invitation.findUniqueOrThrow({ where: { id: invitation.invitationId } })).status).toBe('ACTIVE');
  });
  it('rejects self acceptance and expired acceptance', async () => {
    const invitation = await create(); await expect(service.acceptInvitation(guardian, invitation.token)).rejects.toThrow(BadRequestException);
    await database.invitation.update({ where: { id: invitation.invitationId }, data: { expires_at: new Date(0) } });
    await expect(service.acceptInvitation(caregiver, invitation.token)).rejects.toThrow('expired');
  });
  it('respects expiration between acceptance and activation', async () => {
    const invitation = await create(); await service.acceptInvitation(caregiver, invitation.token);
    await database.invitation.update({ where: { id: invitation.invitationId }, data: { expires_at: new Date(0) } });
    await expect(service.activateInvitation(guardian, invitation.invitationId)).rejects.toThrow('expired');
  });
  it('guardian comment persists and a second service/connection reads it as caregiver after reload', async () => {
    const parent = new TimelineService(database);
    const saved = await parent.createGuardianInstruction(childId, guardian, { instruction_type: 'PICKUP_NOTE', content: '合成接送叮嚀：今日由測試家長接回' });
    expect(saved.author_user_id).toBe(guardian); expect(saved.child_id).toBe(childId); expect(saved.created_at).toBeTruthy();
    const secondSession = new TimelineService(observer);
    const reloaded = await secondSession.getGuardianInstructions(childId, caregiver);
    expect(reloaded.find(note => note.id === saved.id)).toMatchObject({ author_user_id: guardian, child_id: childId, content: saved.content, instruction_type: 'PICKUP_NOTE' });
    await expect(secondSession.createGuardianInstruction(childId, caregiver, { instruction_type: 'COMMENT', content: '照護者不可冒用家長' })).rejects.toThrow(ForbiddenException);
    const audit = await observer.auditLog.findFirstOrThrow({ where: { resource_id: saved.id, actor_user_id: guardian } });
    expect(audit.metadata_minimal).not.toHaveProperty('content');
  });
});
