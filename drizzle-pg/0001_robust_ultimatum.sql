CREATE TABLE "net_bitacora" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"tipo" text NOT NULL,
	"objetivo" text DEFAULT '' NOT NULL,
	"antes" text DEFAULT '' NOT NULL,
	"despues" text DEFAULT '' NOT NULL,
	"nota" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_enlaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"a" text NOT NULL,
	"b" text NOT NULL,
	"tipo" text DEFAULT 'patch' NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_equipos" (
	"id" text PRIMARY KEY NOT NULL,
	"rack" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT 'switch' NOT NULL,
	"etiqueta" text DEFAULT '' NOT NULL,
	"modelo" text DEFAULT '' NOT NULL,
	"puertos" integer DEFAULT 0 NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"nota" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_espacios" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"categoria" text DEFAULT 'sala' NOT NULL,
	"estado" text DEFAULT 'sin-verificar' NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"nota" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_puertos" (
	"id" text PRIMARY KEY NOT NULL,
	"equipo" text NOT NULL,
	"n" integer NOT NULL,
	"estado" text DEFAULT 'libre' NOT NULL,
	"nota" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_racks" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"ubicacion" text DEFAULT '' NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"w" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"notas" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "net_bitacora_objetivo_idx" ON "net_bitacora" USING btree ("objetivo");--> statement-breakpoint
CREATE UNIQUE INDEX "net_enlace_par_idx" ON "net_enlaces" USING btree ("a","b");--> statement-breakpoint
CREATE INDEX "net_enlace_a_idx" ON "net_enlaces" USING btree ("a");--> statement-breakpoint
CREATE INDEX "net_enlace_b_idx" ON "net_enlaces" USING btree ("b");--> statement-breakpoint
CREATE INDEX "net_puerto_equipo_idx" ON "net_puertos" USING btree ("equipo");