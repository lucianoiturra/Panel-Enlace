import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarSalud, type FilaSalud, type HechoSalud } from "../lib/salud/evaluar.ts";

const AHORA = new Date("2026-08-11T15:00:00Z").getTime();
const RECIEN = new Date(AHORA - 60_000).toISOString();

const hecho = (clave: string, valor = "", numero: number | null = null, medidoAt = RECIEN): HechoSalud =>
  ({ clave, valor, numero, medidoAt });

// Los 7 contenedores esperados, todos arriba.
const contenedoresSanos = (): HechoSalud[] => [
  hecho("docker.vaultwarden", "running/healthy"),
  hecho("docker.netalertx", "running/healthy"),
  hecho("docker.adguard", "running"),
  hecho("docker.panel-enlace", "running"),
  hecho("docker.panel-db", "running"),
  hecho("docker.panel-backup", "running"),
  hecho("docker.panel-mon-export", "running"),
];

const stackSano = (): HechoSalud[] => [
  ...contenedoresSanos(),
  hecho("host.ram_disponible_mb", "", 2000),
  hecho("host.disco_uso_pct", "", 8),
  hecho("host.disco_libre_gb", "", 190),
  hecho("backup.pgdump_edad_seg", "panel-20260811.sql.gz", 3600),
  hecho("backup.pgdump_bytes", "", 512000),
  hecho("backup.usb_montado", "true"),
  hecho("backup.usb_edad_seg", "", 7200),
  hecho("backup.usb_copias", "", 3),
  hecho("backup.timer_estado", "active"),
  hecho("backup.servicio_fallido", "inactive"),
  hecho("servicio.adguard_dns", "ok"),
  hecho("servicio.netalertx", "ok"),
  hecho("servicio.vaultwarden", "ok"),
  hecho("servicio.tailscale", "ok"),
];

const fila = (salud: ReturnType<typeof evaluarSalud>, clave: string): FilaSalud => {
  const encontrada = salud.bloques.flatMap((b) => b.filas).find((f) => f.clave === clave);
  assert.ok(encontrada, `falta la fila ${clave}`);
  return encontrada;
};

test("todo sano da ok y cuatro bloques", () => {
  const salud = evaluarSalud(stackSano(), RECIEN, 21, AHORA);
  assert.equal(salud.peor, "ok");
  assert.deepEqual(salud.bloques.map((b) => b.id), ["monitoreo", "servidor", "respaldos", "servicios"]);
});

test("un contenedor ausente es falla", () => {
  const hechos = stackSano().map((h) =>
    h.clave === "docker.panel-mon-export" ? { ...h, valor: "ausente" } : h);
  const salud = evaluarSalud(hechos, RECIEN, 21, AHORA);
  assert.equal(fila(salud, "docker.panel-mon-export").estado, "falla");
  assert.equal(salud.peor, "falla");
});

test("un contenedor unhealthy es falla aunque este running", () => {
  const hechos = stackSano().map((h) =>
    h.clave === "docker.netalertx" ? { ...h, valor: "running/unhealthy" } : h);
  assert.equal(fila(evaluarSalud(hechos, RECIEN, 21, AHORA), "docker.netalertx").estado, "falla");
});

test("RAM: 400 MB es atencion, 150 MB es falla", () => {
  const conRam = (mb: number) => stackSano().map((h) =>
    h.clave === "host.ram_disponible_mb" ? { ...h, numero: mb } : h);
  assert.equal(fila(evaluarSalud(conRam(400), RECIEN, 21, AHORA), "host.ram_disponible_mb").estado, "atencion");
  assert.equal(fila(evaluarSalud(conRam(150), RECIEN, 21, AHORA), "host.ram_disponible_mb").estado, "falla");
  assert.equal(fila(evaluarSalud(conRam(2000), RECIEN, 21, AHORA), "host.ram_disponible_mb").estado, "ok");
});

test("disco: 90% es atencion, 97% es falla", () => {
  const conDisco = (pct: number) => stackSano().map((h) =>
    h.clave === "host.disco_uso_pct" ? { ...h, numero: pct } : h);
  assert.equal(fila(evaluarSalud(conDisco(90), RECIEN, 21, AHORA), "host.disco_uso_pct").estado, "atencion");
  assert.equal(fila(evaluarSalud(conDisco(97), RECIEN, 21, AHORA), "host.disco_uso_pct").estado, "falla");
});

test("pg_dump: 30 h es atencion, 60 h es falla, 0 bytes es falla", () => {
  const conDump = (seg: number, bytes = 512000) => stackSano().map((h) => {
    if (h.clave === "backup.pgdump_edad_seg") return { ...h, numero: seg };
    if (h.clave === "backup.pgdump_bytes") return { ...h, numero: bytes };
    return h;
  });
  assert.equal(fila(evaluarSalud(conDump(30 * 3600), RECIEN, 21, AHORA), "backup.pgdump_edad_seg").estado, "atencion");
  assert.equal(fila(evaluarSalud(conDump(60 * 3600), RECIEN, 21, AHORA), "backup.pgdump_edad_seg").estado, "falla");
  assert.equal(fila(evaluarSalud(conDump(3600, 0), RECIEN, 21, AHORA), "backup.pgdump_edad_seg").estado, "falla");
});

test("el disco externo desmontado es falla", () => {
  const hechos = stackSano().map((h) =>
    h.clave === "backup.usb_montado" ? { ...h, valor: "false" } : h);
  const salud = evaluarSalud(hechos, RECIEN, 21, AHORA);
  assert.equal(fila(salud, "backup.usb_montado").estado, "falla");
});

// Estado real del 2026-08-11: disco recien montado, timer nunca ejecutado.
test("disco montado pero sin copias es atencion, no falla", () => {
  const hechos = stackSano().map((h) => {
    if (h.clave === "backup.usb_copias") return { ...h, numero: 0 };
    if (h.clave === "backup.usb_edad_seg") return { ...h, valor: "sin copias", numero: null };
    return h;
  });
  assert.equal(fila(evaluarSalud(hechos, RECIEN, 21, AHORA), "backup.usb_edad_seg").estado, "atencion");
});

test("el timer de respaldo en failed es falla", () => {
  const hechos = stackSano().map((h) =>
    h.clave === "backup.servicio_fallido" ? { ...h, valor: "failed" } : h);
  assert.equal(fila(evaluarSalud(hechos, RECIEN, 21, AHORA), "backup.servicio_fallido").estado, "falla");
});

test("AdGuard que no resuelve es falla", () => {
  const hechos = stackSano().map((h) =>
    h.clave === "servicio.adguard_dns" ? { ...h, valor: "falla" } : h);
  assert.equal(fila(evaluarSalud(hechos, RECIEN, 21, AHORA), "servicio.adguard_dns").estado, "falla");
});

test("frescura del monitoreo: 8 min es atencion, 20 min es falla", () => {
  const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
  assert.equal(fila(evaluarSalud(stackSano(), hace(8), 21, AHORA), "monitoreo.frescura").estado, "atencion");
  assert.equal(fila(evaluarSalud(stackSano(), hace(20), 21, AHORA), "monitoreo.frescura").estado, "falla");
  assert.equal(fila(evaluarSalud(stackSano(), hace(2), 21, AHORA), "monitoreo.frescura").estado, "ok");
});

test("sin datos de monitoreo la fila es sin-datos, no falla", () => {
  assert.equal(fila(evaluarSalud(stackSano(), null, 21, AHORA), "monitoreo.frescura").estado, "sin-datos");
});

// El guardia central: si el colector muere, no inventamos verde NI rojo.
test("colector muerto: todo el host queda en sin-datos, no en ok", () => {
  const viejo = new Date(AHORA - 40 * 60_000).toISOString();
  const hechos = stackSano().map((h) => ({ ...h, medidoAt: viejo }));
  const salud = evaluarSalud(hechos, RECIEN, 21, AHORA);
  assert.equal(fila(salud, "host.ram_disponible_mb").estado, "sin-datos");
  assert.equal(fila(salud, "docker.panel-db").estado, "sin-datos");
  assert.equal(fila(salud, "backup.usb_montado").estado, "sin-datos");
  // El monitoreo NO viene del colector: sigue evaluandose.
  assert.equal(fila(salud, "monitoreo.frescura").estado, "ok");
});

test("colector muerto pesa como atencion en el punto de la nav, no como falla", () => {
  const viejo = new Date(AHORA - 40 * 60_000).toISOString();
  const hechos = stackSano().map((h) => ({ ...h, medidoAt: viejo }));
  assert.equal(evaluarSalud(hechos, RECIEN, 21, AHORA).peor, "atencion");
});

test("sin ningun hecho no revienta: el host queda sin-datos", () => {
  const salud = evaluarSalud([], null, 0, AHORA);
  assert.equal(salud.medidoAt, null);
  assert.equal(fila(salud, "host.ram_disponible_mb").estado, "sin-datos");
});

test("con falla y atencion juntas, peor es falla", () => {
  const hechos = stackSano().map((h) => {
    if (h.clave === "host.ram_disponible_mb") return { ...h, numero: 400 };
    if (h.clave === "servicio.tailscale") return { ...h, valor: "falla" };
    return h;
  });
  assert.equal(evaluarSalud(hechos, RECIEN, 21, AHORA).peor, "falla");
});
