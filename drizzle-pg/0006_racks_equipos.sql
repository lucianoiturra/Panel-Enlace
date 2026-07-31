ALTER TABLE "net_racks" ADD COLUMN "segmento" text DEFAULT '' NOT NULL;
ALTER TABLE "net_equipos" ADD COLUMN "marca" text DEFAULT '' NOT NULL;
ALTER TABLE "net_equipos" ADD COLUMN "ip_gestion" text DEFAULT '' NOT NULL;
