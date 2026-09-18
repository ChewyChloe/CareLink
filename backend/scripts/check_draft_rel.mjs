import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const drafts = await prisma.draftBatch.findMany({
    where: { id: { in: ['2c9a51cd-382b-44bb-a157-e4a67cde8212', '72d2a84d-9a05-4038-b13d-b7055e54750d'] } },
    include: { source_message: true, child: true }
  });
  console.log(drafts.map(d => ({
    draft_id: d.id,
    child_id: d.child_id,
    child_alias: d.child?.display_alias,
    msg_id: d.source_message_id,
    author: d.source_message?.author_user_id
  })));
  await prisma.$disconnect();
}
main().catch(console.error);
