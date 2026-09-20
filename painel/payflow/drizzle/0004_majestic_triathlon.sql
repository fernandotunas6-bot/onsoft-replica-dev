ALTER TABLE `students` ADD `enrollment_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `academic_year_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `class_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `guardian_id` text;--> statement-breakpoint
ALTER TABLE `students` ADD `financial_responsible_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `financial_responsible_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `financial_responsible_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `enrollment_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX `students_enrollment_idx` ON `students` (`school_id`,`enrollment_id`);--> statement-breakpoint
CREATE INDEX `students_guardian_idx` ON `students` (`school_id`,`guardian_id`);