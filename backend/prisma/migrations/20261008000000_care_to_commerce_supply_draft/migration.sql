-- CreateTable supply_drafts
CREATE TABLE IF NOT EXISTS "supply_drafts" (
    "id" UUID NOT NULL,
    "relationship_id" UUID,
    "child_id" UUID,
    "source_message_id" UUID,
    "created_by" UUID NOT NULL,
    "assigned_to" UUID,
    "item_name" TEXT NOT NULL,
    "size" TEXT,
    "quantity" TEXT,
    "remaining_quantity" TEXT,
    "due_at" TIMESTAMPTZ,
    "urgency" TEXT NOT NULL DEFAULT 'NORMAL',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "temporal_status" TEXT NOT NULL DEFAULT 'ACTUAL',
    "source_span" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_drafts_pkey" PRIMARY KEY ("id")
);

-- AlterTable supply_tasks
ALTER TABLE "supply_tasks" ADD COLUMN IF NOT EXISTS "size" TEXT;
ALTER TABLE "supply_tasks" ADD COLUMN IF NOT EXISTS "quantity" TEXT;
ALTER TABLE "supply_tasks" ADD COLUMN IF NOT EXISTS "remaining_quantity" TEXT;
ALTER TABLE "supply_tasks" ADD COLUMN IF NOT EXISTS "draft_id" UUID;

-- AddForeignKeys for supply_drafts and supply_tasks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_drafts_relationship_id_fkey') THEN
        ALTER TABLE "supply_drafts" ADD CONSTRAINT "supply_drafts_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_drafts_child_id_fkey') THEN
        ALTER TABLE "supply_drafts" ADD CONSTRAINT "supply_drafts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_drafts_source_message_id_fkey') THEN
        ALTER TABLE "supply_drafts" ADD CONSTRAINT "supply_drafts_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "source_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_drafts_created_by_fkey') THEN
        ALTER TABLE "supply_drafts" ADD CONSTRAINT "supply_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_drafts_assigned_to_fkey') THEN
        ALTER TABLE "supply_drafts" ADD CONSTRAINT "supply_drafts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_tasks_draft_id_fkey') THEN
        ALTER TABLE "supply_tasks" ADD CONSTRAINT "supply_tasks_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "supply_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
