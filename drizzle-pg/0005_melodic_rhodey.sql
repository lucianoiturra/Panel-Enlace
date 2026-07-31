CREATE TABLE "net_categorias" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"fija" boolean DEFAULT false NOT NULL
);
