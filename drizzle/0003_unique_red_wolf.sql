ALTER TABLE `cubicles` ADD `admin_pin_encrypted` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cubicles` ADD `student_pin_encrypted` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cubicles` ADD `internet_type` text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `cubicles` ADD `outlet_status` text DEFAULT 'unreviewed' NOT NULL;