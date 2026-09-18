-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "line_provider_id" TEXT NOT NULL,
    "line_sub" TEXT NOT NULL,
    "display_name_ciphertext" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "oa_friendship_status" TEXT,
    "oa_friendship_checked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "display_alias" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "relationship_id" UUID,
    "role" TEXT NOT NULL,
    "scopes" TEXT[],
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_relationships" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "caregiver_user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "care_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "target_role" TEXT NOT NULL,
    "shared_via" TEXT NOT NULL,
    "accepted_by" UUID,
    "approved_by" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "child_id" UUID,
    "purpose" TEXT NOT NULL,
    "notice_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" UUID NOT NULL,
    "channel_id" TEXT NOT NULL,
    "webhook_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_timestamp" BIGINT NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_messages" (
    "id" UUID NOT NULL,
    "receipt_id" UUID,
    "channel_id" TEXT NOT NULL,
    "line_message_id" TEXT NOT NULL,
    "author_user_id" UUID,
    "body_ciphertext" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "source_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload_refs" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ,
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_batches" (
    "id" UUID NOT NULL,
    "source_message_id" UUID,
    "child_id" UUID,
    "relationship_id" UUID,
    "created_by" UUID,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "prompt_version" TEXT,
    "schema_version" TEXT,
    "model_id" TEXT,
    "correction_target_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "draft_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "check_in_event_id" UUID,
    "check_out_event_id" UUID,
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_events" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "draft_batch_id" UUID,
    "source_item_index" INTEGER,
    "attendance_session_id" UUID,
    "event_type" TEXT NOT NULL,
    "current_revision_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "care_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_event_revisions" (
    "id" UUID NOT NULL,
    "care_event_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "supersedes_revision_id" UUID,
    "confirmed_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_event_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_tasks" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "source_message_id" UUID,
    "created_by" UUID NOT NULL,
    "assigned_to" UUID NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" TEXT,
    "due_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acknowledged_at" TIMESTAMPTZ,
    "packed_at" TIMESTAMPTZ,
    "received_at" TIMESTAMPTZ,
    "lock_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "supply_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "designated_guardian_id" UUID NOT NULL,
    "caregiver_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_versions" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "effective_to" TIMESTAMPTZ,
    "schedule_json" JSONB NOT NULL,
    "terms_json" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "guardian_ack_hash" TEXT,
    "guardian_ack_at" TIMESTAMPTZ,
    "caregiver_ack_hash" TEXT,
    "caregiver_ack_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_rules" (
    "id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "billing_mode" TEXT NOT NULL,
    "base_monthly_amount" DECIMAL(12,2),
    "late_unit_minutes" INTEGER,
    "late_unit_rate" DECIMAL(12,2),
    "weekday_hourly_rate" DECIMAL(12,2),
    "holiday_hourly_rate" DECIMAL(12,2),
    "night_rate" DECIMAL(12,2),
    "food_mode" TEXT,
    "food_monthly_amount" DECIMAL(12,2),
    "food_per_meal_rate" DECIMAL(12,2),
    "rounding_policy" TEXT,
    "night_policy" TEXT,
    "partial_month_policy" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "policy_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_calendar_dates" (
    "id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "local_date" DATE NOT NULL,
    "day_type" TEXT NOT NULL,
    "source_note" TEXT,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_calendar_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_settlements" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "delta_from_previous" DECIMAL(12,2),
    "engine_version" TEXT NOT NULL DEFAULT '1.0.0',
    "input_hash" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "blocking_reasons" JSONB,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ,
    "guardian_ack_hash" TEXT,
    "guardian_ack_at" TIMESTAMPTZ,
    "locked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "monthly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "calculation_snapshot" JSONB NOT NULL,
    "line_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_line_sources" (
    "line_id" UUID NOT NULL,
    "event_revision_id" UUID NOT NULL,

    CONSTRAINT "settlement_line_sources_pkey" PRIMARY KEY ("line_id","event_revision_id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "line_id" UUID,
    "created_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "resource_version" INTEGER,
    "request_id" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_minimal" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_line_provider_id_line_sub_key" ON "users"("line_provider_id", "line_sub");

-- CreateIndex
CREATE INDEX "access_grants_user_id_child_id_revoked_at_idx" ON "access_grants"("user_id", "child_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_receipts_channel_id_webhook_event_id_key" ON "webhook_receipts"("channel_id", "webhook_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_messages_channel_id_line_message_id_key" ON "source_messages"("channel_id", "line_message_id");

-- CreateIndex
CREATE INDEX "jobs_status_next_run_at_idx" ON "jobs"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_kind_dedupe_key_key" ON "jobs"("kind", "dedupe_key");

-- CreateIndex
CREATE INDEX "care_events_child_id_relationship_id_idx" ON "care_events"("child_id", "relationship_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_events_draft_batch_id_source_item_index_key" ON "care_events"("draft_batch_id", "source_item_index");

-- CreateIndex
CREATE INDEX "care_event_revisions_occurred_at_care_event_id_idx" ON "care_event_revisions"("occurred_at", "care_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_event_revisions_care_event_id_revision_no_key" ON "care_event_revisions"("care_event_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contract_id_version_no_key" ON "contract_versions"("contract_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "billing_rules_contract_version_id_key" ON "billing_rules"("contract_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_calendar_dates_contract_version_id_local_date_key" ON "rate_calendar_dates"("contract_version_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_settlements_contract_id_period_start_revision_no_key" ON "monthly_settlements"("contract_id", "period_start", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_lines_settlement_id_line_key_key" ON "settlement_lines"("settlement_id", "line_key");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_caregiver_user_id_fkey" FOREIGN KEY ("caregiver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "webhook_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_batches" ADD CONSTRAINT "draft_batches_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "source_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_batches" ADD CONSTRAINT "draft_batches_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_batches" ADD CONSTRAINT "draft_batches_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_draft_batch_id_fkey" FOREIGN KEY ("draft_batch_id") REFERENCES "draft_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_event_revisions" ADD CONSTRAINT "care_event_revisions_care_event_id_fkey" FOREIGN KEY ("care_event_id") REFERENCES "care_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_event_revisions" ADD CONSTRAINT "care_event_revisions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_tasks" ADD CONSTRAINT "supply_tasks_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_tasks" ADD CONSTRAINT "supply_tasks_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "source_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_tasks" ADD CONSTRAINT "supply_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_tasks" ADD CONSTRAINT "supply_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "care_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_designated_guardian_id_fkey" FOREIGN KEY ("designated_guardian_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_caregiver_user_id_fkey" FOREIGN KEY ("caregiver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_rules" ADD CONSTRAINT "billing_rules_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_calendar_dates" ADD CONSTRAINT "rate_calendar_dates_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_calendar_dates" ADD CONSTRAINT "rate_calendar_dates_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_settlements" ADD CONSTRAINT "monthly_settlements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_settlements" ADD CONSTRAINT "monthly_settlements_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "monthly_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_line_sources" ADD CONSTRAINT "settlement_line_sources_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "settlement_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_line_sources" ADD CONSTRAINT "settlement_line_sources_event_revision_id_fkey" FOREIGN KEY ("event_revision_id") REFERENCES "care_event_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "monthly_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom Business Constraints (from 03_ERD.md)
-- 1. Ensure care_relationships ends_at > starts_at if ends_at is provided
ALTER TABLE "care_relationships" ADD CONSTRAINT "chk_care_relationships_dates" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- 2. Ensure contract_versions effective_to > effective_from if effective_to is provided
ALTER TABLE "contract_versions" ADD CONSTRAINT "chk_contract_versions_dates" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

-- 3. Ensure access_grants ends_at > starts_at if ends_at is provided
ALTER TABLE "access_grants" ADD CONSTRAINT "chk_access_grants_dates" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

