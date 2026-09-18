const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const b = fs.readFileSync('.env', 'utf8');

function getVal(text, key) {
  const match = text.match(new RegExp(key + '=(.*)'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

async function test(url, name) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const res = await p.$queryRaw`SELECT 1 as num`;
    console.log(name, 'SUCCESS:', res);
  } catch (err) {
    console.log(name, 'FAILED:', err.message);
  } finally {
    await p.$disconnect();
  }
}

(async () => {
  const pooled = getVal(b, 'DATABASE_URL');
  const unpooled = getVal(b, 'DATABASE_URL_UNPOOLED');
  const pooledNoCb = pooled.replace('channel_binding=require&', '').replace('&channel_binding=require', '');

  await test(pooled, 'POOLED');
  await test(pooledNoCb, 'POOLED_NO_CHANNEL_BINDING');
  await test(unpooled, 'UNPOOLED');
})();
