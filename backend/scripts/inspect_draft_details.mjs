import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function inspectDraft() {
  const draft = await prisma.draftBatch.findFirst({
    where: { child: { display_alias: '湯圓' } },
    include: { child: true },
    orderBy: { created_at: 'desc' },
  });

  if (!draft) {
    console.log('No draft found');
    return;
  }

  console.log('Draft ID (masked):', draft.id.slice(0, 6) + '...');
  console.log('Draft Status:', draft.status);
  console.log('Draft CreatedAt:', draft.created_at.toISOString());
  console.log('Draft Items:', JSON.stringify(draft.items, null, 2));

  const events = await prisma.careEvent.findMany({
    where: { draft_batch_id: draft.id },
    include: { revisions: true },
  });
  console.log('CareEvents for draft:', events.length);
  for (const e of events) {
    console.log(`- Event [${e.event_type}]:`);
    for (const r of e.revisions) {
      console.log(`  Revision #${r.revision_no}: occurred_at=${r.occurred_at.toISOString()}, payload=${JSON.stringify(r.payload)}`);
    }
  }
}

inspectDraft()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
