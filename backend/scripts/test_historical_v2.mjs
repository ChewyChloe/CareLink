import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { BillingService } from '../dist/modules/billing/billing.service.js';

neonConfig.webSocketConstructor = ws;

async function testHistoricalVersioning() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  const prisma = new PrismaClient({ adapter });

  const billingService = new BillingService(prisma);

  const childId = '34bb5f75-155c-47ad-8c3d-f54d9f06dd1c';
  const userId = '3d2474d4-4fda-440a-a725-c5cd0f2e1b81';
  const contractId = '712a7aa2-3234-44b4-99aa-cf1da8b4577e';

  // Check if v2 already exists or create it
  let v2 = await prisma.contractVersion.findFirst({
    where: { contract_id: contractId, version_no: 2 },
    include: { billing_rule: true },
  });

  if (!v2) {
    v2 = await prisma.contractVersion.create({
      data: {
        contract_id: contractId,
        version_no: 2,
        status: 'AGREED',
        effective_from: new Date('2026-10-01T00:00:00+08:00'),
        effective_to: new Date('2027-08-31T23:59:59+08:00'),
        schedule_json: { scheduled_start: '09:00', scheduled_end: '18:00' },
        terms_json: { base_monthly_amount: 18000, rate: 120 },
        content_hash: 'cv_hash_202610_v2_120_immutable',
        billing_rule: {
          create: {
            billing_mode: 'FIXED',
            base_monthly_amount: 18000,
            late_unit_minutes: 30,
            late_unit_rate: 120, // increased rate
            timezone: 'Asia/Taipei',
            policy_status: 'ACTIVE',
          },
        },
      },
      include: { billing_rule: true },
    });
    console.log('Created ContractVersion v2 in DB with rate 120 TWD:', v2.id);
  } else {
    console.log('Found existing ContractVersion v2:', v2.id);
  }

  // Query September 2026
  const sepSettlement = await billingService.getSettlementsForChild(childId, userId, '2026-09');
  console.log('September settlement with v2 in DB:');
  console.log('Contract Version ID:', sepSettlement[0].contract_version_id);
  console.log('Overtime fee:', sepSettlement[0].overtime_amount);
  console.log(
    'Overtime unit rate:',
    sepSettlement[0].lines.find((l) => l.item_type === 'OVERTIME')?.unit_rate,
  );

  if (
    sepSettlement[0].overtime_amount === 196 &&
    sepSettlement[0].contract_version_id === '45ff3aaf-e61b-43d4-84e7-7e9e03a2af0e'
  ) {
    console.log('PASS: Historical v1 immutability verified! (Still NT$196 with v1, NOT retroactively changed to 240)');
  } else {
    console.error('FAIL: Historical immutability violated!');
  }

  await prisma.$disconnect();
  await pool.end();
}

testHistoricalVersioning().catch((err) => {
  console.error(err);
  process.exit(1);
});
