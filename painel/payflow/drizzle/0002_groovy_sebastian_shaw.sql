CREATE TABLE `student_access_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL,
	`locked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `student_access_limits_updated_at_idx` ON `student_access_limits` (`updated_at`);