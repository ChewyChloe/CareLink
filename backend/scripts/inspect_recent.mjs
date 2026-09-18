import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function inspect() {
  const msgs = await prisma.sourceMessage.findMany({ orderBy: { received_at: 'desc' }, take: 10 });
  console.log(`=== Recent SourceMessages (${msgs.length}) ===`);
  for (const m of msgs) {
    const maskedUser = m.author_user_id ? (m.author_user_id.slice(0, 4) + '...' + m.author_user_id.slice(-4)) : 'null';
    console.log(`- msgId: ${m.line_message_id} user: [${maskedUser}] at: ${m.received_at.toISOString()}`);
  }

  const events = await prisma.careEvent.findMany({ 
    include: { revisions: true },
    orderBy: { created_at: 'desc' }, 
    take: 10 
  });
  console.log(`=== Recent CareEvents (${events.length}) ===`);
  for (const e of events) {
    console.log(`- eventId: ${e.id.slice(0, 8)} type: ${e.event_type} start: ${e.start_time?.toISOString()} revisions: ${e.revisions.length}`);
  }

  const jobs = await prisma.job.findMany({ orderBy: { created_at: 'desc' }, take: 10 });
  console.log(`=== Recent Jobs (${jobs.length}) ===`);
  for (const j of jobs) {
    console.log(`- jobId: ${j.id.slice(0, 8)} kind: ${j.kind} status: ${j.status} at: ${j.created_at.toISOString()}`);
  }
}

inspect()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
