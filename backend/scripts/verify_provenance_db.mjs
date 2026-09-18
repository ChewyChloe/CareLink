import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const evs = await prisma.careEvent.findMany({
    select: {
      id: true,
      event_type: true,
      source_type: true,
      source_message_id: true,
      draft_batch_id: true,
    }
  });
  console.log('CARE EVENTS PROVENANCE:');
  console.log(evs);
  await prisma.$disconnect();
}

main().catch(console.error);
