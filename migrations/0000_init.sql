CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`field_id` text NOT NULL,
	`zone` text NOT NULL,
	`channel` text,
	`value_json` text NOT NULL,
	`base_revision` text,
	`observed_value_json` text,
	`submitter` text,
	`trust` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text,
	`request_id` text,
	`origin` text NOT NULL,
	`client_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text,
	`decision_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_idempotency_key_idx` ON `proposals` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `proposals_product_status_idx` ON `proposals` (`product`,`status`);
--> statement-breakpoint
CREATE INDEX `proposals_field_idx` ON `proposals` (`product`,`field_id`);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail_json` text,
	`request_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_proposal_idx` ON `audit_events` (`proposal_id`);
--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`key` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`response_code` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`proposal_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`target_revision` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publish_tasks_operation_key_idx` ON `publish_tasks` (`operation_key`);
--> statement-breakpoint
CREATE INDEX `publish_tasks_status_idx` ON `publish_tasks` (`status`);
