import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function inspectSchema() {
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log('--- TABLES IN PUBLIC SCHEMA ---');
  console.log(tables);

  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('children', 'care_events', 'daily_log_views', 'care_event_attachments', '_prisma_migrations')
    ORDER BY table_name, ordinal_position;
  `;
  console.log('--- COLUMNS IN KEY TABLES ---');
  console.log(columns);

  const migrations = await prisma.$queryRaw`
    SELECT id, migration_name, finished_at, rolled_back_at 
    FROM "_prisma_migrations" 
    ORDER BY started_at;
  `;
  console.log('--- _PRISMA_MIGRATIONS ---');
  console.log(migrations);
}

inspectSchema()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
