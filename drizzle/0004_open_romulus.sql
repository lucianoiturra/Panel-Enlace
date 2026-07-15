CREATE TABLE `station_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cubicle_id` integer NOT NULL,
	`description` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_cubicle_idx` ON `station_tasks` (`cubicle_id`);