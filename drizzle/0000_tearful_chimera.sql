CREATE TABLE `checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checklist_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cubicle_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`checked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `result_cubicle_item_idx` ON `checklist_results` (`cubicle_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `cubicles` (
	`id` integer PRIMARY KEY NOT NULL,
	`brand_model` text DEFAULT '' NOT NULL,
	`serial_number` text DEFAULT '' NOT NULL,
	`keyboard` text DEFAULT 'Sin registrar' NOT NULL,
	`mouse` text DEFAULT 'Sin registrar' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`observations` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` text NOT NULL
);
