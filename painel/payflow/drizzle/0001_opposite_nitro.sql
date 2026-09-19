CREATE TABLE `emis_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`merchant_reference` text NOT NULL,
	`provider_transaction_id` text NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`response_code` text DEFAULT 'UNCONFIGURED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emis_transactions_payment_unique` ON `emis_transactions` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `emis_transactions_merchant_reference_unique` ON `emis_transactions` (`merchant_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `emis_transactions_provider_id_unique` ON `emis_transactions` (`provider_transaction_id`);--> statement-breakpoint
CREATE INDEX `emis_transactions_status_idx` ON `emis_transactions` (`status`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_code` text NOT NULL,
	`payment_id` text NOT NULL,
	`school_id` text NOT NULL,
	`student_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_receipts_code_unique` ON `payment_receipts` (`receipt_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_receipts_payment_unique` ON `payment_receipts` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_receipts_student_idx` ON `payment_receipts` (`school_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`public_code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_tenant_id_unique` ON `schools` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schools_public_code_unique` ON `schools` (`public_code`);--> statement-breakpoint
CREATE TABLE `student_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`student_id` text NOT NULL,
	`invoice_code` text NOT NULL,
	`description` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'AOA' NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_invoices_school_code_unique` ON `student_invoices` (`school_id`,`invoice_code`);--> statement-breakpoint
CREATE INDEX `student_invoices_student_status_idx` ON `student_invoices` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `student_payment_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`student_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `student_payment_sessions_student_idx` ON `student_payment_sessions` (`school_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `student_payment_sessions_expiry_idx` ON `student_payment_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`student_code` text NOT NULL,
	`full_name` text NOT NULL,
	`class_name` text DEFAULT '' NOT NULL,
	`payment_pin_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_school_code_unique` ON `students` (`school_id`,`student_code`);--> statement-breakpoint
CREATE INDEX `students_school_status_idx` ON `students` (`school_id`,`status`);--> statement-breakpoint
ALTER TABLE `payments` ADD `school_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `student_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `invoice_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `provider_transaction_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `merchant_reference` text;--> statement-breakpoint
CREATE INDEX `payments_school_student_idx` ON `payments` (`school_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `payments_invoice_id_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_merchant_reference_unique` ON `payments` (`merchant_reference`);
