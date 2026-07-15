ALTER TABLE `cubicles` ADD `admin_pin_status` text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `cubicles` ADD `student_pin_status` text DEFAULT 'unreviewed' NOT NULL;