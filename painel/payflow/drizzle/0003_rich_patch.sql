CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`school_id` text,
	`account_holder` text NOT NULL,
	`bank_name` text NOT NULL,
	`iban` text NOT NULL,
	`currency` text DEFAULT 'AOA' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bank_accounts_scope_status_idx` ON `bank_accounts` (`scope`,`status`,`is_primary`);--> statement-breakpoint
CREATE INDEX `bank_accounts_school_status_idx` ON `bank_accounts` (`school_id`,`status`,`is_primary`);--> statement-breakpoint
CREATE TABLE `bank_transfer_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`transfer_reference` text NOT NULL,
	`expected_amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'AOA' NOT NULL,
	`status` text DEFAULT 'awaiting_transfer' NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	`verified_by` text,
	`verification_source` text,
	`bank_transaction_id` text,
	`statement_booked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_instructions_payment_unique` ON `bank_transfer_instructions` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_instructions_reference_unique` ON `bank_transfer_instructions` (`transfer_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_instructions_transaction_unique` ON `bank_transfer_instructions` (`bank_transaction_id`);--> statement-breakpoint
CREATE INDEX `bank_transfer_instructions_status_idx` ON `bank_transfer_instructions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `bank_transfer_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`instruction_id` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`instruction_id`) REFERENCES `bank_transfer_instructions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_proofs_object_key_unique` ON `bank_transfer_proofs` (`object_key`);--> statement-breakpoint
CREATE INDEX `bank_transfer_proofs_instruction_idx` ON `bank_transfer_proofs` (`instruction_id`,`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_code` text NOT NULL,
	`payment_id` text NOT NULL,
	`school_id` text,
	`student_id` text,
	`invoice_id` text,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_payment_receipts`("id", "receipt_code", "payment_id", "school_id", "student_id", "invoice_id", "issued_at") SELECT "id", "receipt_code", "payment_id", "school_id", "student_id", "invoice_id", "issued_at" FROM `payment_receipts`;--> statement-breakpoint
DROP TABLE `payment_receipts`;--> statement-breakpoint
ALTER TABLE `__new_payment_receipts` RENAME TO `payment_receipts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_receipts_code_unique` ON `payment_receipts` (`receipt_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_receipts_payment_unique` ON `payment_receipts` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payment_receipts_student_idx` ON `payment_receipts` (`school_id`,`student_id`);