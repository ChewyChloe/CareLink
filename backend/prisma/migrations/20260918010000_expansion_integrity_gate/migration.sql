-- CreateEnum
CREATE TYPE "CareEventSourceType" AS ENUM ('LINE_AI', 'MANUAL', 'SYSTEM');

-- AlterTable
ALTER TABLE "care_events" ADD COLUMN "source_type" "CareEventSourceType";

-- Deterministic backfill of existing CareEvents before setting NOT NULL
UPDATE "care_events" SET "source_type" = 'LINE_AI' WHERE "draft_batch_id" IS NOT NULL;
UPDATE "care_events" SET "source_type" = 'MANUAL' WHERE "draft_batch_id" IS NULL;

-- Enforce NOT NULL and default
ALTER TABLE "care_events" ALTER COLUMN "source_type" SET NOT NULL;
ALTER TABLE "care_events" ALTER COLUMN "source_type" SET DEFAULT 'MANUAL';

-- Add source_message_id column
ALTER TABLE "care_events" ADD COLUMN "source_message_id" UUID;

-- Backfill source_message_id from draft_batches for LINE_AI events
UPDATE "care_events" ce
SET "source_message_id" = db."source_message_id"
FROM "draft_batches" db
WHERE ce."draft_batch_id" = db."id" AND ce."draft_batch_id" IS NOT NULL;

-- AddForeignKey for source_message_id
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "source_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "guardian_instructions" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "created_by_guardian_user_id" UUID NOT NULL,
    "instruction_type" TEXT NOT NULL DEFAULT 'MEDICATION',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "guardian_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guardian_instructions_child_id_revoked_at_idx" ON "guardian_instructions"("child_id", "revoked_at");

-- AddForeignKey for guardian_instructions
ALTER TABLE "guardian_instructions" ADD CONSTRAINT "guardian_instructions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guardian_instructions" ADD CONSTRAINT "guardian_instructions_created_by_guardian_user_id_fkey" FOREIGN KEY ("created_by_guardian_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add guardian_instruction_id column to care_events
ALTER TABLE "care_events" ADD COLUMN "guardian_instruction_id" UUID;

-- AddForeignKey for guardian_instruction_id
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_guardian_instruction_id_fkey" FOREIGN KEY ("guardian_instruction_id") REFERENCES "guardian_instructions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
