CREATE TABLE "app_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"cubicle_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"checked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cubicles" (
	"id" integer PRIMARY KEY NOT NULL,
	"brand_model" text DEFAULT '' NOT NULL,
	"serial_number" text DEFAULT '' NOT NULL,
	"inventory_code" text DEFAULT '' NOT NULL,
	"admin_pin_status" text DEFAULT 'unreviewed' NOT NULL,
	"student_pin_status" text DEFAULT 'unreviewed' NOT NULL,
	"admin_pin_encrypted" text DEFAULT '' NOT NULL,
	"student_pin_encrypted" text DEFAULT '' NOT NULL,
	"internet_type" text DEFAULT 'unreviewed' NOT NULL,
	"outlet_status" text DEFAULT 'unreviewed' NOT NULL,
	"keyboard" text DEFAULT 'Sin registrar' NOT NULL,
	"mouse" text DEFAULT 'Sin registrar' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"mac" text DEFAULT '' NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"cubicle_id" integer NOT NULL,
	"description" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "result_cubicle_item_idx" ON "checklist_results" USING btree ("cubicle_id","item_id");--> statement-breakpoint
CREATE INDEX "task_cubicle_idx" ON "station_tasks" USING btree ("cubicle_id");