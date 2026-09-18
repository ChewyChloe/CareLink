-- AlterTable
ALTER TABLE "children" ADD COLUMN "birth_date" DATE;

-- CreateTable
CREATE TABLE "daily_log_views" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "care_date" DATE NOT NULL,
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_log_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_event_attachments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_event_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_log_views_child_id_care_date_idx" ON "daily_log_views"("child_id", "care_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_views_user_id_child_id_care_date_key" ON "daily_log_views"("user_id", "child_id", "care_date");

-- CreateIndex
CREATE INDEX "care_event_attachments_event_id_idx" ON "care_event_attachments"("event_id");

-- AddForeignKey
ALTER TABLE "daily_log_views" ADD CONSTRAINT "daily_log_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_views" ADD CONSTRAINT "daily_log_views_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_event_attachments" ADD CONSTRAINT "care_event_attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "care_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
