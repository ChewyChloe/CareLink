import { PrismaClient } from '@prisma/client';
const url = 'postgresql://neondb_owner:npg_BO4ljSbrzqU5@ep-autumn-mountain-b3n96xau.c-4.ap-southeast-1.aws.neon.tech:443/neondb?sslmode=require';
const p = new PrismaClient({ datasources: { db: { url } } });
try {
  const res = await p.$queryRaw`SELECT 1 as num`;
  console.log('PORT 443 POSTGRES SUCCESS:', res);
} catch (e) {
  console.error('PORT 443 ERROR:', e.message);
} finally {
  await p.$disconnect();
}
