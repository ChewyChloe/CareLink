import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: {
      access_grants: {
        include: { child: true }
      },
      care_relationships: true
    }
  });
  console.log('--- USERS COUNT: ' + users.length + ' ---');
  for (const u of users) {
    // Note: mask user IDs to adhere to "禁止輸出實際 userId、sub、ID token、session cookie"
    const maskedId = u.id.slice(0, 4) + '...' + u.id.slice(-4);
    const maskedSub = u.line_sub ? (u.line_sub.slice(0, 4) + '...' + u.line_sub.slice(-4)) : 'none';
    console.log(`User [${maskedId}] status=${u.status} sub=[${maskedSub}] provider=${u.line_provider_id}`);
    console.log('  grants:', (u.access_grants || []).map(g => ({ role: g.role, child: g.child?.nickname })));
    console.log('  relationships:', (u.care_relationships || []).map(r => ({ role: r.role, status: r.status })));
  }

  const children = await prisma.child.findMany();
  console.log('--- CHILDREN COUNT: ' + children.length + ' ---');
  for (const c of children) {
    console.log(`Child: ${c.display_alias} (id: ${c.id.slice(0, 4)}...${c.id.slice(-4)})`);
  }

  const sourceMsgs = await prisma.sourceMessage.count();
  const careEvents = await prisma.careEvent.count();
  console.log('SourceMessages count:', sourceMsgs);
  console.log('CareEvents count:', careEvents);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
