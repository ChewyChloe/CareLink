import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import crypto from 'crypto';

neonConfig.webSocketConstructor = ws;

async function seedRealityData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('--- Seeding Reality Data for Neon DB ---');

  const childId = '34bb5f75-155c-47ad-8c3d-f54d9f06dd1c';
  const caregiverUserId = '3d2474d4-4fda-440a-a725-c5cd0f2e1b81';
  const relationshipId = '31a37167-ab31-4b7c-bba7-0857eec58883';

  // 1. Ensure User has active grants as GUARDIAN as well so guardian views work seamlessly
  const guardianGrant = await prisma.accessGrant.findFirst({
    where: {
      user_id: caregiverUserId,
      child_id: childId,
      role: 'GUARDIAN',
    },
  });

  if (!guardianGrant) {
    await prisma.accessGrant.create({
      data: {
        user_id: caregiverUserId,
        child_id: childId,
        relationship_id: relationshipId,
        role: 'GUARDIAN',
        scopes: ['CARE_READ', 'HANDOFF_READ', 'CONTRACT_VIEW', 'SETTLEMENT_ACK'],
        starts_at: new Date('2026-09-01T00:00:00+08:00'),
      },
    });
    console.log('Created GUARDIAN AccessGrant for user');
  }

  // 2. Ensure an active Contract exists
  let contract = await prisma.contract.findFirst({
    where: {
      relationship_id: relationshipId,
      status: 'ACTIVE',
    },
    include: {
      versions: {
        include: { billing_rule: true },
      },
    },
  });

  if (!contract) {
    contract = await prisma.contract.create({
      data: {
        relationship_id: relationshipId,
        designated_guardian_id: caregiverUserId,
        caregiver_user_id: caregiverUserId,
        status: 'ACTIVE',
      },
      include: {
        versions: {
          include: { billing_rule: true },
        },
      },
    });
    console.log('Created Contract:', contract.id);
  } else {
    console.log('Found existing Contract:', contract.id);
  }

  // 3. Ensure ContractVersion v1 exists (09:00 - 18:00, late 30m / NT$98, agreed)
  let version1 = contract.versions.find((v) => v.version_no === 1);
  if (!version1) {
    const v1Id = crypto.randomUUID();
    const contentHash = crypto
      .createHash('sha256')
      .update(`CONTRACT_V1:${contract.id}:09:00-18:00:30m:98TWD:18000`)
      .digest('hex');

    version1 = await prisma.contractVersion.create({
      data: {
        id: v1Id,
        contract_id: contract.id,
        version_no: 1,
        status: 'AGREED',
        effective_from: new Date('2026-09-01T00:00:00+08:00'),
        effective_to: new Date('2027-08-31T23:59:59+08:00'),
        schedule_json: {
          scheduled_start: '09:00',
          scheduled_end: '18:00',
          days_of_week: [1, 2, 3, 4, 5],
        },
        terms_json: {
          base_monthly_amount: 18000,
          overtime_policy: 'CEIL_30_MIN',
        },
        content_hash: contentHash,
        guardian_ack_at: new Date('2026-09-01T10:00:00+08:00'),
        caregiver_ack_at: new Date('2026-09-01T10:05:00+08:00'),
        billing_rule: {
          create: {
            billing_mode: 'FIXED',
            base_monthly_amount: 18000,
            late_unit_minutes: 30,
            late_unit_rate: 98,
            timezone: 'Asia/Taipei',
            policy_status: 'ACTIVE',
          },
        },
      },
      include: { billing_rule: true },
    });
    console.log('Created ContractVersion v1:', version1.id);
  } else {
    console.log('Found existing ContractVersion v1:', version1.id);
    if (!version1.billing_rule) {
      await prisma.billingRule.create({
        data: {
          contract_version_id: version1.id,
          billing_mode: 'FIXED',
          base_monthly_amount: 18000,
          late_unit_minutes: 30,
          late_unit_rate: 98,
          timezone: 'Asia/Taipei',
          policy_status: 'ACTIVE',
        },
      });
      console.log('Created BillingRule for v1');
    }
  }

  // 4. Ensure CareEvent CHECK_OUT at 2026-09-17 18:31 Asia/Taipei exists with valid revision
  const existingCheckout = await prisma.careEvent.findFirst({
    where: {
      child_id: childId,
      event_type: 'CHECK_OUT',
    },
    include: { revisions: true },
  });

  const checkoutOccurredAt = new Date('2026-09-17T18:31:00+08:00'); // 10:31:00 UTC

  if (!existingCheckout) {
    const careEventId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    const createdEvent = await prisma.careEvent.create({
      data: {
        id: careEventId,
        child_id: childId,
        relationship_id: relationshipId,
        event_type: 'CHECK_OUT',
        source_type: 'LINE_AI',
        created_by: caregiverUserId,
        revisions: {
          create: {
            id: revisionId,
            revision_no: 1,
            action: 'RECORD',
            occurred_at: checkoutOccurredAt,
            payload: {
              temporal_status: 'ACTUAL',
              pickup_person: '媽媽',
              source: 'LINE_AI',
            },
            confirmed_by: caregiverUserId,
            confirmed_at: new Date('2026-09-17T18:32:00+08:00'),
          },
        },
      },
    });

    await prisma.careEvent.update({
      where: { id: careEventId },
      data: { current_revision_id: revisionId },
    });

    console.log('Created real CareEvent CHECK_OUT:', careEventId, 'revision:', revisionId);
  } else {
    console.log('Found existing CareEvent CHECK_OUT:', existingCheckout.id);
  }

  // 5. Ensure an active session exists for user 3d2474d4-4fda-440a-a725-c5cd0f2e1b81
  const sessionSecret = process.env.SESSION_SECRET || 'carelink_dev_session_secret_1234567890_min_32_characters';
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
  const sessionId = crypto.randomBytes(24).toString('hex');

  await prisma.authSession.create({
    data: {
      session_id: sessionId,
      user_id: caregiverUserId,
      line_sub: 'sub_demo_caregiver_2005545389',
      provider_id: '2005545389',
      expires_at: new Date(expiresAt),
    },
  });

  const payload = `${sessionId}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
  const token = `${payload}.${sig}`;

  console.log('Created valid active session for user 3d2474d4-4fda-440a-a725-c5cd0f2e1b81:');
  console.log('Token:', token);

  await prisma.$disconnect();
  await pool.end();
  console.log('--- Reality data seeded successfully! ---');
}

seedRealityData().catch((err) => {
  console.error('Failed to seed reality data:', err);
  process.exit(1);
});
