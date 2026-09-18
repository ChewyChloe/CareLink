import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const events = await prisma.careEvent.findMany({
    take: 2,
    orderBy: { created_at: 'desc' },
    include: { revisions: true }
  });
  for (const e of events) {
    console.log('Event:', e.id.slice(0, 8), e.event_type, 'child_id:', e.child_id);
    for (const r of e.revisions) {
      console.log('  Rev:', r.revision_no, 'occurred_at:', r.occurred_at.toISOString(), 'payload:', JSON.stringify(r.payload));
      const taipeiTime = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(r.occurred_at);
      console.log('  Taipei Time:', taipeiTime);
    }
  }
  await prisma.$disconnect();
}

main().catch(console.error);
