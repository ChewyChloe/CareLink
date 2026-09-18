import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const events = await prisma.careEvent.findMany({
    orderBy: { created_at: 'asc' },
    include: {
      draft_batch: true,
      creator: true,
      revisions: { orderBy: { revision_no: 'asc' } },
    }
  });
  console.log(`--- CARE EVENTS (${events.length}) ---`);
  for (const e of events) {
    console.log({
      id: e.id,
      child_id: e.child_id,
      event_type: e.event_type,
      draft_batch_id: e.draft_batch_id,
      has_draft_batch: !!e.draft_batch,
      draft_source_message_id: e.draft_batch?.source_message_id,
      created_by: e.created_by,
      created_at: e.created_at,
      revisions_count: e.revisions.length,
    });
  }

  // Also check audit logs related to care_events
  const auditLogs = await prisma.auditLog.findMany({
    where: { resource_type: 'care_events' }
  });
  console.log(`--- AUDIT LOGS FOR CARE_EVENTS (${auditLogs.length}) ---`);
  for (const a of auditLogs) {
    console.log({
      id: a.id,
      actor_user_id: a.actor_user_id,
      action: a.action,
      resource_id: a.resource_id,
      occurred_at: a.occurred_at,
      metadata: a.metadata_minimal
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
