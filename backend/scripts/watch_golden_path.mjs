import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkState() {
  const sessions = await prisma.authSession.findMany({
    where: { expires_at: { gt: new Date() } },
    include: { user: true },
    orderBy: { created_at: 'desc' },
    take: 5,
  });

  const latestSource = await prisma.sourceMessage.findFirst({
    orderBy: { received_at: 'desc' },
  });

  const latestDraft = await prisma.draftBatch.findFirst({
    include: { child: true },
    orderBy: { created_at: 'desc' },
  });

  const latestEvents = await prisma.careEvent.findMany({
    include: {
      child: true,
      revisions: { orderBy: { revision_no: 'desc' }, take: 1 },
    },
    orderBy: { created_at: 'desc' },
    take: 5,
  });

  console.log(JSON.stringify({
    activeSessions: sessions.length,
    latestSessionUser: sessions[0]?.user_id ? `${sessions[0].user_id.slice(0, 4)}...${sessions[0].user_id.slice(-4)}` : null,
    latestSourceMsg: latestSource ? {
      id: `${latestSource.id.slice(0, 6)}...`,
      lineMsgId: latestSource.line_message_id,
      receivedAt: latestSource.received_at,
      hasAuthor: Boolean(latestSource.author_user_id),
    } : null,
    latestDraft: latestDraft ? {
      id: `${latestDraft.id.slice(0, 6)}...`,
      status: latestDraft.status,
      child: latestDraft.child?.display_alias,
      itemCount: Array.isArray(latestDraft.items) ? latestDraft.items.length : 0,
    } : null,
    recentEvents: latestEvents.map((e) => ({
      id: `${e.id.slice(0, 6)}...`,
      type: e.event_type,
      child: e.child?.display_alias,
      occurredAt: e.revisions[0]?.occurred_at,
      payload: e.revisions[0]?.payload,
    })),
  }, null, 2));
}

checkState()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
