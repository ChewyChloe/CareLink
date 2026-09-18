import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const session = await prisma.authSession.findFirst({
    where: { expires_at: { gt: new Date() } },
    orderBy: { created_at: 'desc' },
    include: {
      user: {
        include: {
          access_grants: { include: { child: true } },
          care_relationships: { include: { child: true } }
        }
      }
    }
  });

  if (!session) {
    console.log('No session found');
    return;
  }

  const u = session.user;
  const maskedId = u.id.slice(0, 4) + '...' + u.id.slice(-4);
  const maskedSub = u.line_sub.slice(0, 4) + '...' + u.line_sub.slice(-4);
  console.log('=== USER & LIFF AUTH VERIFICATION ===');
  console.log('User status:', u.status);
  console.log('Provider ID:', u.line_provider_id);
  console.log('User ID (masked):', maskedId);
  console.log('LINE sub (masked):', maskedSub);
  console.log('Session expires at:', session.expires_at.toISOString());
  console.log('AccessGrants count:', u.access_grants.length);
  for (const g of u.access_grants) {
    console.log(`  - Child: "${g.child?.display_alias}" | Role: ${g.role} | Scopes: [${g.scopes.join(', ')}] | Active: ${!g.revoked_at}`);
  }
  console.log('CareRelationships count:', u.care_relationships.length);
  for (const r of u.care_relationships) {
    console.log(`  - Child: "${r.child?.display_alias}" | Status: ${r.status}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
