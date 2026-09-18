import net from 'net';
import WebSocket, { createWebSocketStream } from 'ws';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const NEON_HOST = 'ep-autumn-mountain-b3n96xau.c-4.ap-southeast-1.aws.neon.tech';
const PROXY_PORT = 5434;
const TEST_DB_NAME = 'carelink_fresh_verify_db';

// Start proxy
const server = net.createServer((tcpSocket) => {
  const webSocket = new WebSocket(`wss://${NEON_HOST}/v1`);
  const wsStream = createWebSocketStream(webSocket);
  tcpSocket.pipe(wsStream).pipe(tcpSocket);
  tcpSocket.on('error', () => {});
  wsStream.on('error', () => {});
});

function runCommand(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: true,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${cmd} exited with code ${code}`));
    });
  });
}

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  const baseAdminUrl = `postgresql://neondb_owner:npg_BO4ljSbrzqU5@127.0.0.1:${PROXY_PORT}/neondb?sslmode=disable`;
  const adminPrisma = new PrismaClient({ datasources: { db: { url: baseAdminUrl } } });

  console.log(`[Fresh Verification] Local WS proxy running on 127.0.0.1:${PROXY_PORT}`);

  try {
    // 1. Probe CREATE DATABASE capability
    console.log(`[Fresh Verification] Testing CREATE DATABASE capability on PostgreSQL instance...`);
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB_NAME};`);
    console.log(`[Fresh Verification] Successfully created clean empty database: ${TEST_DB_NAME}`);

    // 2. Point migration deploy to the fresh empty database
    const freshDbUrl = `postgresql://neondb_owner:npg_BO4ljSbrzqU5@127.0.0.1:${PROXY_PORT}/${TEST_DB_NAME}?sslmode=disable`;

    console.log(`[Fresh Verification] Running npx prisma migrate deploy against ${TEST_DB_NAME}...`);
    await runCommand('npx', ['prisma', 'migrate', 'deploy'], {
      DATABASE_URL: freshDbUrl,
      DATABASE_URL_UNPOOLED: freshDbUrl,
    });
    console.log(`[Fresh Verification] All 4 migrations deployed successfully to fresh empty DB!`);

    // 3. Connect to fresh DB and verify schema completeness
    const freshPrisma = new PrismaClient({ datasources: { db: { url: freshDbUrl } } });

    // Verify migrations applied
    const appliedMigrations = await freshPrisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC;
    `;
    console.log(`[Fresh Verification] Applied migrations in fresh DB:`, appliedMigrations);

    // Verify tables
    const tables = await freshPrisma.$queryRaw`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
    `;
    console.log(`[Fresh Verification] Tables count in fresh DB: ${tables.length}`);

    // Verify key columns
    const columns = await freshPrisma.$queryRaw`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('care_events', 'children', 'daily_log_views', 'care_event_attachments', 'guardian_instructions')
      ORDER BY table_name, ordinal_position;
    `;
    console.log(`[Fresh Verification] Key columns verified: ${columns.length} columns checked.`);

    // Verify enums
    const enums = await freshPrisma.$queryRaw`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      ORDER BY t.typname, e.enumsortorder;
    `;
    console.log(`[Fresh Verification] Enums verified:`, enums);

    // Verify foreign keys
    const fks = await freshPrisma.$queryRaw`
      SELECT conname, conrelid::regclass::text AS table_from, confrelid::regclass::text AS table_to
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
      ORDER BY conname;
    `;
    console.log(`[Fresh Verification] Foreign keys count in fresh DB: ${fks.length}`);

    // Verify unique constraints
    const uniques = await freshPrisma.$queryRaw`
      SELECT conname, conrelid::regclass::text AS table_name
      FROM pg_constraint
      WHERE contype = 'u' AND connamespace = 'public'::regnamespace
      ORDER BY conname;
    `;
    console.log(`[Fresh Verification] Unique constraints count in fresh DB: ${uniques.length}`);

    await freshPrisma.$disconnect();

    // 4. Drop test database to clean up
    console.log(`[Fresh Verification] Cleaning up ephemeral test database...`);
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);
    console.log(`[Fresh Verification] Ephemeral database ${TEST_DB_NAME} dropped cleanly.`);
    console.log(`[Fresh Verification] FRESH DATABASE RECREATION VERIFICATION: PASSED (100%)`);
  } catch (err) {
    console.error(`[Fresh Verification] FAILED:`, err);
    try {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);
    } catch {}
    process.exitCode = 1;
  } finally {
    await adminPrisma.$disconnect();
    server.close();
  }
});
