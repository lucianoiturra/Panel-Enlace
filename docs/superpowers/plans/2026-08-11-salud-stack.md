# Salud del stack — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Goal:** Una pestaña `/salud` en Panel-Enlace que responde "¿está sano el stack ahora?" — monitoreo, contenedores, recursos, respaldos y servicios vecinos — con un punto de color en la nav visible desde toda la app.

**Architecture:** Un script en el host (timer systemd, cada 5 min) junta hechos crudos del sistema y los escribe a la tabla `mon_salud` de Postgres con `docker exec -i panel-db psql`. La app solo lee esa tabla; el juicio (qué es "ok" o "falla") vive en una función pura con test. Ningún contenedor recibe `docker.sock`.

**Tech Stack:** POSIX sh + systemd en el host; Next.js 16 (App Router), Drizzle ORM, Postgres 17, `node:test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-11-salud-stack-design.md`

## Global Constraints

- **Rama de trabajo:** `feat/salud-stack`. Ya existe y ya tiene el spec commiteado.
- **Repo:** `/srv/apps/panel-enlace` en cabserver. No hay clon local: todo se edita por SSH.
- **El host no tiene Node.** Los tests corren en un contenedor descartable:
  `docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim node --experimental-strip-types --test tests/ARCHIVO.test.ts`
  Verificado funcionando: no necesita `node_modules` porque las funciones puras no importan dependencias.
- **Imports con extensión `.ts`** en todo lo que toque `lib/` (lo exige `--experimental-strip-types`). Los archivos de `app/` importan sin extensión, como ya hacen hoy.
- **Idioma:** identificadores, comentarios y textos de interfaz en español, como el resto del repo.
- **El script del host nunca escribe juicios.** Escribe `2013265920`, jamás `"ok"`. Única excepción: los estados que el sistema ya da como texto (`running`, `failed`), que son hechos, no juicios.
- **`psql` sin contraseña:** `docker exec -i panel-db psql -U panel -d panel` entra por el socket local del contenedor y no pide credenciales. El script no lee el `.env`.
- **Contenedores esperados (7):** `vaultwarden`, `netalertx`, `adguard`, `panel-enlace`, `panel-db`, `panel-backup`, `panel-mon-export`. `n8n` NO va: está detenido a pedido e incluirlo dejaría `/salud` en rojo permanente.
- **Umbrales, valores exactos del spec:** monitoreo atención > 6 min / falla > 15 min; colector muerto > 15 min; RAM atención < 500 MB / falla < 200 MB; disco atención > 85 % / falla > 95 %; respaldos atención > 26 h / falla > 50 h.
- **El color nunca va solo:** todo punto de color lleva su palabra al lado.

---

### Task 1: Colector en el host

Deja `mon_salud` poblada con hechos reales cada 5 minutos. No toca la app: al terminar, la tabla se puede consultar con `psql` y eso es la prueba.

**Files:**
- Create: `/usr/local/sbin/salud-cabserver.sh` (host, fuera del repo)
- Create: `/etc/systemd/system/salud-cabserver.service` (host)
- Create: `/etc/systemd/system/salud-cabserver.timer` (host)

**Interfaces:**
- Consumes: nada.
- Produces: tabla `mon_salud (clave TEXT PK, valor TEXT, numero DOUBLE PRECISION, medido_at TIMESTAMPTZ)` con estas claves exactas, que la Task 2 consume:
  `docker.vaultwarden`, `docker.netalertx`, `docker.adguard`, `docker.panel-enlace`, `docker.panel-db`, `docker.panel-backup`, `docker.panel-mon-export`, `host.ram_disponible_mb`, `host.disco_uso_pct`, `host.disco_libre_gb`, `backup.pgdump_edad_seg`, `backup.pgdump_bytes`, `backup.usb_montado`, `backup.usb_edad_seg`, `backup.usb_copias`, `backup.timer_estado`, `backup.servicio_fallido`, `servicio.adguard_dns`, `servicio.netalertx`, `servicio.vaultwarden`, `servicio.tailscale`.

- [ ] **Step 1: Escribir el script**

Este paso necesita `sudo` con contraseña. Si la sesión no es interactiva, entrégale el bloque al humano para que lo pegue.

```bash
sudo tee /usr/local/sbin/salud-cabserver.sh >/dev/null <<'GUION'
#!/bin/sh
# Colector de salud de cabserver -> tabla mon_salud del Panel-Enlace.
# Escribe HECHOS CRUDOS (bytes, segundos, booleanos). El juicio -- que es "ok"
# o "falla" -- vive en lib/salud/evaluar.ts, no aqui.
set -u

ESPERADOS="vaultwarden netalertx adguard panel-enlace panel-db panel-backup panel-mon-export"
DIR_PG=/srv/apps/backups/panel-enlace
DIR_USB=/mnt/respaldo
AHORA=$(date +%s)
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# clave, valor, numero. \N es NULL en el formato texto de COPY.
emit() { printf '%s\t%s\t%s\n' "$1" "${2:-}" "${3:-\\N}" >> "$TMP"; }

# --- contenedores -----------------------------------------------------------
# Formato: "running", "running/healthy", "restarting", "exited", "ausente".
for nombre in $ESPERADOS; do
  estado=$(docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$nombre" 2>/dev/null)
  emit "docker.$nombre" "${estado:-ausente}"
done

# --- recursos del host ------------------------------------------------------
ram_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
emit host.ram_disponible_mb "" "$((ram_kb / 1024))"
emit host.disco_uso_pct "" "$(df --output=pcent / | tail -1 | tr -dc '0-9')"
emit host.disco_libre_gb "" "$(df --output=avail -BG / | tail -1 | tr -dc '0-9')"

# --- respaldo local (pg_dump del sidecar panel-backup) ----------------------
ultimo_pg=$(ls -1t "$DIR_PG"/panel-*.sql.gz 2>/dev/null | head -1)
if [ -n "$ultimo_pg" ]; then
  emit backup.pgdump_edad_seg "$(basename "$ultimo_pg")" "$((AHORA - $(stat -c %Y "$ultimo_pg")))"
  emit backup.pgdump_bytes "" "$(stat -c %s "$ultimo_pg")"
else
  emit backup.pgdump_edad_seg "sin copias"
fi

# --- respaldo al disco externo ---------------------------------------------
# Se mira la entrada mas nueva de cualquier tipo, sin asumir como nombra sus
# copias el script de respaldo: si cambia de layout, esto sigue sirviendo.
if findmnt -no TARGET "$DIR_USB" >/dev/null 2>&1; then
  emit backup.usb_montado true
  reciente=$(find "$DIR_USB" -maxdepth 1 -mindepth 1 \
    ! -name 'System Volume Information' ! -name '$RECYCLE.BIN' \
    -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1)
  emit backup.usb_copias "" "$(find "$DIR_USB" -maxdepth 1 -mindepth 1 \
    ! -name 'System Volume Information' ! -name '$RECYCLE.BIN' 2>/dev/null | wc -l)"
  if [ -n "$reciente" ]; then
    emit backup.usb_edad_seg "" "$((AHORA - reciente))"
  else
    emit backup.usb_edad_seg "sin copias"
  fi
else
  emit backup.usb_montado false
  emit backup.usb_copias "" 0
  emit backup.usb_edad_seg "sin montaje"
fi

emit backup.timer_estado "$(systemctl is-active respaldo-cabserver.timer 2>/dev/null || true)"
emit backup.servicio_fallido "$(systemctl is-failed respaldo-cabserver.service 2>/dev/null || true)"

# --- servicios vecinos ------------------------------------------------------
# AdGuard se prueba RESOLVIENDO, no respondiendo la web: su panel escucha en la
# IP del tailnet, y una web viva con el DNS muerto deja a la escuela sin navegar.
if dig +short +time=2 +tries=1 @127.0.0.1 example.com >/dev/null 2>&1; then
  emit servicio.adguard_dns ok
else
  emit servicio.adguard_dns falla
fi

sonda_http() {
  if curl -sS -m 3 -o /dev/null "$2" >/dev/null 2>&1; then emit "$1" ok; else emit "$1" falla; fi
}
sonda_http servicio.netalertx http://127.0.0.1:20211/
sonda_http servicio.vaultwarden http://127.0.0.1:8081/alive

if tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; then
  emit servicio.tailscale ok
else
  emit servicio.tailscale falla
fi

# --- escritura --------------------------------------------------------------
# Todo en una transaccion: o queda la foto completa, o queda la anterior
# envejeciendo a la vista. Nunca media foto.
{
  echo "CREATE TABLE IF NOT EXISTS mon_salud (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', numero DOUBLE PRECISION, medido_at TIMESTAMPTZ NOT NULL DEFAULT now());"
  echo "BEGIN;"
  echo "TRUNCATE mon_salud;"
  echo "COPY mon_salud (clave, valor, numero) FROM STDIN;"
  cat "$TMP"
  echo "\\."
  echo "COMMIT;"
} | docker exec -i panel-db psql -U panel -d panel -q -v ON_ERROR_STOP=1
GUION
sudo chmod 700 /usr/local/sbin/salud-cabserver.sh
```

- [ ] **Step 2: Correrlo a mano y verificar que la tabla se llena**

```bash
sudo /usr/local/sbin/salud-cabserver.sh
docker exec panel-db psql -U panel -d panel -c "SELECT clave, valor, numero FROM mon_salud ORDER BY clave"
```

Esperado: 21 filas. `docker.*` en `running` (y `netalertx` en `running/healthy`), `host.ram_disponible_mb` alrededor de 2000, `backup.usb_montado` en `true`, `servicio.adguard_dns` en `ok`.

Si alguna fila sale vacía o falta, arréglala antes de seguir: la Task 2 asume estas claves.

- [ ] **Step 3: Crear el service y el timer**

```bash
sudo tee /etc/systemd/system/salud-cabserver.service >/dev/null <<'UNIDAD'
[Unit]
Description=Colector de salud de cabserver hacia Panel-Enlace
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/salud-cabserver.sh
TimeoutStartSec=60
UNIDAD

sudo tee /etc/systemd/system/salud-cabserver.timer >/dev/null <<'UNIDAD'
[Unit]
Description=Salud de cabserver cada 5 minutos

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
Persistent=false

[Install]
WantedBy=timers.target
UNIDAD

sudo systemctl daemon-reload
sudo systemctl enable --now salud-cabserver.timer
```

`TimeoutStartSec=60` es el seguro contra una sonda colgada: entre `dig` y los dos `curl` hay 9 segundos de timeout como techo, así que 60 es holgado y aun así corta si algo se traba.

- [ ] **Step 4: Verificar que el timer quedó armado**

```bash
systemctl list-timers salud-cabserver.timer --no-pager
docker exec panel-db psql -U panel -d panel -c "SELECT max(medido_at) FROM mon_salud"
```

Esperado: el timer aparece con su próximo disparo a menos de 5 minutos, y `medido_at` es reciente.

- [ ] **Step 5: Commit**

El script vive fuera del repo, así que este commit solo deja constancia. Copia el script al repo como referencia versionada:

```bash
cd /srv/apps/panel-enlace
mkdir -p ops
sudo cat /usr/local/sbin/salud-cabserver.sh > ops/salud-cabserver.sh
sudo cat /etc/systemd/system/salud-cabserver.service > ops/salud-cabserver.service
sudo cat /etc/systemd/system/salud-cabserver.timer > ops/salud-cabserver.timer
git add ops/
git commit -m "feat(salud): colector de salud del host hacia mon_salud

El script corre como timer systemd cada 5 min y escribe hechos crudos.
Copia versionada en ops/ porque el original vive en /usr/local/sbin y
si no queda en el repo, desaparece con el servidor."
```

---

### Task 2: La regla — `evaluarSalud`

Función pura con test. Es el corazón: convierte hechos crudos en estados, y es lo único que sabe de umbrales.

**Files:**
- Create: `lib/salud/evaluar.ts`
- Test: `tests/salud.test.ts`

**Interfaces:**
- Consumes: las claves de `mon_salud` que produce la Task 1.
- Produces, para las Tasks 3, 4 y 5:

```ts
export type EstadoSalud = "ok" | "atencion" | "falla" | "sin-datos";
export type HechoSalud = { clave: string; valor: string; numero: number | null; medidoAt: string };
export type FilaSalud = { clave: string; etiqueta: string; estado: EstadoSalud; detalle: string };
export type BloqueSalud = { id: string; titulo: string; estado: EstadoSalud; filas: FilaSalud[] };
export type Salud = { peor: EstadoSalud; medidoAt: string | null; bloques: BloqueSalud[] };

export function evaluarSalud(
  hechos: HechoSalud[],
  refrescadoMonitoreo: string | null,
  espaciosConTestigo: number,
  ahora: number,
): Salud;
```

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/salud.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y ver que falla**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim \
  node --experimental-strip-types --test tests/salud.test.ts
```

Esperado: FALLA con `Cannot find module '/app/lib/salud/evaluar.ts'`.

- [ ] **Step 3: Escribir `lib/salud/evaluar.ts`**

```ts
// Convierte los hechos crudos que escribe salud-cabserver.sh en estados
// legibles. Es pura: sin Date.now() adentro, sin red, sin base de datos. Los
// umbrales viven aca arriba para que se discutan leyendo una tabla, no
// arqueologia en un script de shell.

export type EstadoSalud = "ok" | "atencion" | "falla" | "sin-datos";

export type HechoSalud = { clave: string; valor: string; numero: number | null; medidoAt: string };
export type FilaSalud = { clave: string; etiqueta: string; estado: EstadoSalud; detalle: string };
export type BloqueSalud = { id: string; titulo: string; estado: EstadoSalud; filas: FilaSalud[] };
export type Salud = { peor: EstadoSalud; medidoAt: string | null; bloques: BloqueSalud[] };

export const UMBRALES = {
  monitoreoAtencionMin: 6,
  monitoreoFallaMin: 15,
  colectorMuertoMin: 15,
  ramAtencionMb: 500,
  ramFallaMb: 200,
  discoAtencionPct: 85,
  discoFallaPct: 95,
  respaldoAtencionH: 26,
  respaldoFallaH: 50,
} as const;

export const CONTENEDORES_ESPERADOS = [
  "vaultwarden", "netalertx", "adguard",
  "panel-enlace", "panel-db", "panel-backup", "panel-mon-export",
] as const;

// sin-datos empata con atencion: que muera el mensajero importa, pero no es lo
// mismo que perder un respaldo. En empate gana "atencion" por el orden de esta
// lista, para que el resultado sea determinista.
const RANGO: Record<EstadoSalud, number> = { ok: 0, "sin-datos": 1, atencion: 1, falla: 2 };
const ORDEN: EstadoSalud[] = ["falla", "atencion", "sin-datos", "ok"];

function peorDe(estados: EstadoSalud[]): EstadoSalud {
  if (!estados.length) return "sin-datos";
  const alto = Math.max(...estados.map((e) => RANGO[e]));
  return ORDEN.find((e) => RANGO[e] === alto && estados.includes(e)) ?? "ok";
}

function hace(segundos: number): string {
  if (segundos < 60) return "hace instantes";
  const min = Math.round(segundos / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  return `hace ${Math.round(h / 24)} días`;
}

function porEdad(segundos: number, atencionH: number, fallaH: number): EstadoSalud {
  if (segundos > fallaH * 3600) return "falla";
  if (segundos > atencionH * 3600) return "atencion";
  return "ok";
}

export function evaluarSalud(
  hechos: HechoSalud[],
  refrescadoMonitoreo: string | null,
  espaciosConTestigo: number,
  ahora: number,
): Salud {
  const porClave = new Map(hechos.map((h) => [h.clave, h]));
  const marcas = hechos
    .map((h) => new Date(h.medidoAt).getTime())
    .filter((t) => !Number.isNaN(t));
  const medidoMs = marcas.length ? Math.max(...marcas) : null;
  const medidoAt = medidoMs === null ? null : new Date(medidoMs).toISOString();

  // Guardia del colector: tres ciclos perdidos y dejamos de creerle a la foto.
  // Sin esto, /salud pintaria verde porque nadie dijo lo contrario.
  const colectorVivo =
    medidoMs !== null && ahora - medidoMs <= UMBRALES.colectorMuertoMin * 60_000;

  const edadColectorMin = medidoMs === null ? null : Math.round((ahora - medidoMs) / 60_000);
  const sinColector = (clave: string, etiqueta: string): FilaSalud => ({
    clave,
    etiqueta,
    estado: "sin-datos",
    detalle: edadColectorMin === null
      ? "el colector nunca ha escrito"
      : `sin noticias del servidor ${hace(edadColectorMin * 60)}`,
  });

  // Fila que depende del colector: si murio, no se evalua.
  const delHost = (
    clave: string,
    etiqueta: string,
    evaluar: (hecho: HechoSalud) => { estado: EstadoSalud; detalle: string },
  ): FilaSalud => {
    const hecho = porClave.get(clave);
    if (!colectorVivo || !hecho) return sinColector(clave, etiqueta);
    const { estado, detalle } = evaluar(hecho);
    return { clave, etiqueta, estado, detalle };
  };

  // --- monitoreo: NO viene del colector, sale de mon_devices ----------------
  const frescura: FilaSalud = (() => {
    const clave = "monitoreo.frescura";
    const etiqueta = "Datos de red";
    if (!refrescadoMonitoreo) {
      return { clave, etiqueta, estado: "sin-datos", detalle: "mon_devices está vacía" };
    }
    const marca = new Date(refrescadoMonitoreo).getTime();
    if (Number.isNaN(marca)) {
      return { clave, etiqueta, estado: "sin-datos", detalle: "fecha ilegible" };
    }
    const min = (ahora - marca) / 60_000;
    const estado: EstadoSalud =
      min > UMBRALES.monitoreoFallaMin ? "falla" : min > UMBRALES.monitoreoAtencionMin ? "atencion" : "ok";
    const cola = estado === "falla" ? " — RED volvió al estado manual" : "";
    return { clave, etiqueta, estado, detalle: `${hace(min * 60)}${cola}` };
  })();

  const monitoreo: FilaSalud[] = [
    frescura,
    {
      clave: "monitoreo.testigos",
      etiqueta: "Espacios con testigo",
      estado: "ok",
      detalle: `${espaciosConTestigo} espacios muestran estado automático; el resto sigue manual`,
    },
  ];

  // --- servidor -------------------------------------------------------------
  const contenedores: FilaSalud[] = CONTENEDORES_ESPERADOS.map((nombre) =>
    delHost(`docker.${nombre}`, nombre, (hecho) => {
      const valor = hecho.valor || "ausente";
      const sano = valor === "running" || valor === "running/healthy";
      return {
        estado: sano ? "ok" : "falla",
        detalle: valor === "ausente" ? "no existe el contenedor" : valor,
      };
    }),
  );

  const servidor: FilaSalud[] = [
    ...contenedores,
    delHost("host.ram_disponible_mb", "RAM disponible", (hecho) => {
      const mb = hecho.numero ?? 0;
      const estado: EstadoSalud =
        mb < UMBRALES.ramFallaMb ? "falla" : mb < UMBRALES.ramAtencionMb ? "atencion" : "ok";
      return { estado, detalle: `${(mb / 1024).toFixed(1)} GB libres` };
    }),
    delHost("host.disco_uso_pct", "Disco del sistema", (hecho) => {
      const pct = hecho.numero ?? 0;
      const estado: EstadoSalud =
        pct > UMBRALES.discoFallaPct ? "falla" : pct > UMBRALES.discoAtencionPct ? "atencion" : "ok";
      const libre = porClave.get("host.disco_libre_gb")?.numero;
      return { estado, detalle: `${pct} % usado${libre ? ` · ${libre} GB libres` : ""}` };
    }),
  ];

  // --- respaldos ------------------------------------------------------------
  const respaldos: FilaSalud[] = [
    delHost("backup.pgdump_edad_seg", "Copia de la base (diaria)", (hecho) => {
      if (hecho.numero === null) {
        return { estado: "falla", detalle: "sin copias todavía" };
      }
      const bytes = porClave.get("backup.pgdump_bytes")?.numero ?? 0;
      if (bytes === 0) return { estado: "falla", detalle: "la última copia está vacía" };
      const estado = porEdad(hecho.numero, UMBRALES.respaldoAtencionH, UMBRALES.respaldoFallaH);
      return { estado, detalle: `${hace(hecho.numero)} · ${(bytes / 1048576).toFixed(1)} MB` };
    }),
    delHost("backup.usb_montado", "Disco externo", (hecho) => (
      hecho.valor === "true"
        ? { estado: "ok", detalle: "montado en /mnt/respaldo" }
        : { estado: "falla", detalle: "desconectado — el respaldo nocturno no va a correr" }
    )),
    delHost("backup.usb_edad_seg", "Copia en el disco externo", (hecho) => {
      if (hecho.numero === null) {
        // Disco recien conectado: no es una falla, es que todavia no toca.
        return { estado: "atencion", detalle: hecho.valor || "sin copias todavía" };
      }
      const estado = porEdad(hecho.numero, UMBRALES.respaldoAtencionH, UMBRALES.respaldoFallaH);
      const copias = porClave.get("backup.usb_copias")?.numero ?? 0;
      return { estado, detalle: `${hace(hecho.numero)} · ${copias} copias` };
    }),
    delHost("backup.servicio_fallido", "Tarea de respaldo", (hecho) => (
      hecho.valor === "failed"
        ? { estado: "falla", detalle: "la última ejecución falló" }
        : { estado: "ok", detalle: porClave.get("backup.timer_estado")?.valor === "active" ? "programada 03:15" : "timer detenido" }
    )),
  ];

  // --- servicios ------------------------------------------------------------
  const sonda = (clave: string, etiqueta: string, okTexto: string, fallaTexto: string): FilaSalud =>
    delHost(clave, etiqueta, (hecho) => (
      hecho.valor === "ok"
        ? { estado: "ok", detalle: okTexto }
        : { estado: "falla", detalle: fallaTexto }
    ));

  const servicios: FilaSalud[] = [
    sonda("servicio.adguard_dns", "AdGuard (DNS)", "resuelve consultas", "no resuelve — los PCs se quedan sin navegar"),
    sonda("servicio.netalertx", "NetAlertX", "responde", "no responde"),
    sonda("servicio.vaultwarden", "Vaultwarden", "responde", "no responde"),
    sonda("servicio.tailscale", "Tailscale", "conectado al tailnet", "desconectado — no hay acceso remoto"),
  ];

  const bloques: BloqueSalud[] = [
    { id: "monitoreo", titulo: "Monitoreo", estado: peorDe(monitoreo.map((f) => f.estado)), filas: monitoreo },
    { id: "servidor", titulo: "Servidor", estado: peorDe(servidor.map((f) => f.estado)), filas: servidor },
    { id: "respaldos", titulo: "Respaldos", estado: peorDe(respaldos.map((f) => f.estado)), filas: respaldos },
    { id: "servicios", titulo: "Servicios", estado: peorDe(servicios.map((f) => f.estado)), filas: servicios },
  ];

  return { peor: peorDe(bloques.map((b) => b.estado)), medidoAt, bloques };
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim \
  node --experimental-strip-types --test tests/salud.test.ts
```

Esperado: `# pass 16`, `# fail 0`. Si algo falla, corrige la implementación, no el test — salvo que el test esté midiendo algo que el spec no pide.

- [ ] **Step 5: Correr toda la suite para no haber roto nada**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim \
  node --experimental-strip-types --test tests/*.test.ts
```

Esperado: todo verde, incluidos los 7 de `estado-efectivo`.

- [ ] **Step 6: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/salud/evaluar.ts tests/salud.test.ts
git commit -m "feat(salud): regla pura que convierte hechos del host en estados

Los umbrales viven aca y no en el script de shell, para que se discutan
leyendo una tabla y se prueben sin un servidor. El guardia del colector
evita el peor error posible: pintar verde por falta de noticias."
```

---

### Task 3: Esquema y ruta `/api/salud`

Conecta la tabla con la regla. Al terminar, `curl` a la ruta devuelve el JSON evaluado.

**Files:**
- Modify: `db/schema.ts` (al final, junto a `monDevices`)
- Modify: `db/index.ts` (agregar el DDL a la lista `statements`)
- Create: `app/api/salud/route.ts`

**Interfaces:**
- Consumes: `evaluarSalud`, `HechoSalud`, `Salud` de `lib/salud/evaluar.ts` (Task 2); tabla `mon_salud` (Task 1).
- Produces: `GET /api/salud` → el objeto `Salud` en JSON, que consumen las Tasks 4 y 5.

- [ ] **Step 1: Agregar la tabla al esquema de Drizzle**

Al final de `db/schema.ts`, siguiendo el estilo de `monDevices`:

```ts
// Foto de la salud del stack, reescrita entera cada 5 min por el timer
// salud-cabserver del host. Hechos crudos: el juicio vive en lib/salud.
export const monSalud = pgTable("mon_salud", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull().default(""),
  numero: doublePrecision("numero"),
  medidoAt: timestamp("medido_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Agrega `doublePrecision` al import de `drizzle-orm/pg-core` que ya está en la primera línea del archivo.

- [ ] **Step 2: Agregar el DDL idempotente**

En `db/index.ts`, dentro del arreglo `statements`, justo después del `CREATE TABLE IF NOT EXISTS mon_devices`:

```ts
    `CREATE TABLE IF NOT EXISTS mon_salud (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL DEFAULT '',
      numero DOUBLE PRECISION,
      medido_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
```

El script del host crea la misma tabla con el mismo DDL. Que los dos la creen no es duplicación por descuido: el script tiene que poder correr aunque la app nunca haya arrancado, y la app tiene que poder arrancar en una base virgen.

- [ ] **Step 3: Escribir la ruta**

Crea `app/api/salud/route.ts`:

```ts
import { desc, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { monDevices, monSalud, netEspacios } from "../../../db/schema";
import { apiErrorResponse, noStoreJson } from "../../../lib/api-response";
import { evaluarSalud, type HechoSalud } from "../../../lib/salud/evaluar";

export async function GET() {
  try {
    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const filas = await db.select().from(monSalud);
    const frescura = await db
      .select({ refrescado: monDevices.refreshedAt })
      .from(monDevices)
      .orderBy(desc(monDevices.refreshedAt))
      .limit(1);
    const conTestigo = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(netEspacios)
      .where(ne(netEspacios.testigoMac, ""));

    const hechos: HechoSalud[] = filas.map((fila) => ({
      clave: fila.clave,
      valor: fila.valor,
      numero: fila.numero,
      medidoAt: fila.medidoAt.toISOString(),
    }));

    const salud = evaluarSalud(
      hechos,
      frescura[0]?.refrescado?.toISOString() ?? null,
      conTestigo[0]?.total ?? 0,
      Date.now(),
    );
    return noStoreJson(salud);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible cargar la salud del sistema.");
  }
}
```

Los nombres están verificados contra `db/schema.ts:96-108`: la tabla se exporta como `netEspacios` y la columna del testigo es `testigoMac` (`testigo_mac` en Postgres).

- [ ] **Step 4: Reconstruir y probar la ruta**

```bash
cd /srv/apps/compose/panel-enlace
docker compose up -d --build panel-web
sleep 20
curl -s http://127.0.0.1:8083/api/salud | head -c 600
```

Esperado: JSON con `peor`, `medidoAt` y los cuatro bloques. Si sale el error genérico, mira `docker logs panel-enlace --tail 40`.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add db/schema.ts db/index.ts app/api/salud/route.ts
git commit -m "feat(salud): tabla mon_salud y ruta /api/salud"
```

---

### Task 4: La página `/salud`

**Files:**
- Create: `app/salud/page.tsx`
- Create: `lib/formato-tiempo.ts`
- Modify: `app/monitoreo/page.tsx` (borrar su `haceCuanto` local e importar el compartido)
- Modify: `app/globals.css` (al final)

**Interfaces:**
- Consumes: `GET /api/salud` (Task 3); tipos `Salud`, `BloqueSalud`, `FilaSalud`, `EstadoSalud` (Task 2).
- Produces: `haceCuanto(iso: string | null): string` exportado desde `lib/formato-tiempo.ts`.

- [ ] **Step 1: Extraer `haceCuanto` a un módulo compartido**

`app/monitoreo/page.tsx` ya tiene esta función y `/salud` la necesita igual. Crea `lib/formato-tiempo.ts` con el cuerpo idéntico al que hoy vive en la página:

```ts
// Fechas en lenguaje humano para los encabezados de MONITOREO y SALUD.
export function haceCuanto(iso: string | null): string {
  if (!iso) return "sin datos";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "hace instantes";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}
```

En `app/monitoreo/page.tsx`, borra la función local y agrega el import:

```ts
import { haceCuanto } from "../../lib/formato-tiempo";
```

- [ ] **Step 2: Escribir la página**

Crea `app/salud/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import NavSecciones from "../nav-secciones";
import { haceCuanto } from "../../lib/formato-tiempo";
import type { EstadoSalud, Salud } from "../../lib/salud/evaluar";

// Las variables CSS custom no encajan en CSSProperties sin un cast explícito.
const dot = (color: string): CSSProperties => ({ ["--dot"]: color } as CSSProperties);

// El color nunca va solo: siempre lleva su palabra al lado, para que se lea
// sin distinguir colores.
const META: Record<EstadoSalud, { etiqueta: string; color: string }> = {
  ok: { etiqueta: "Bien", color: "#1f9d55" },
  atencion: { etiqueta: "Atención", color: "#d08700" },
  falla: { etiqueta: "Falla", color: "#c0392b" },
  "sin-datos": { etiqueta: "Sin datos", color: "#8a8f98" },
};

export default function SaludPagina() {
  const [salud, setSalud] = useState<Salud | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const respuesta = await fetch("/api/salud", { cache: "no-store" });
      if (!respuesta.ok) throw new Error("No se pudo cargar la salud del sistema.");
      setSalud(await respuesta.json() as Salud);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo cargar la salud del sistema.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SE</span>
          <div><strong>Salud</strong><span>Estado del servidor y sus servicios</span></div>
          <NavSecciones activa="salud" />
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => void cargar()} aria-label="Actualizar" disabled={cargando}>{cargando ? "…" : "↻"}</button>
          <div className="date-chip"><span>MEDIDO</span><b>{salud ? haceCuanto(salud.medidoAt) : "—"}</b></div>
        </div>
      </header>

      <section className="shell">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button>
          </div>
        )}

        <div className="workspace-head">
          <div>
            <h1>Estado del sistema</h1>
            <p className="subtitle">Foto de los últimos 5 minutos. Esta página muestra, no avisa: si algo está en rojo, sigue estándolo hasta que alguien lo arregle.</p>
          </div>
        </div>

        {!salud && !error && <p className="mon-empty">Cargando…</p>}

        <div className="salud-bloques">
          {salud?.bloques.map((bloque) => (
            <section className="salud-bloque" key={bloque.id}>
              <h2>
                {bloque.titulo}
                <span className="mon-badge" style={dot(META[bloque.estado].color)}>{META[bloque.estado].etiqueta}</span>
              </h2>
              <div className="mon-scroll">
                <table className="mon-table">
                  <tbody>
                    {bloque.filas.map((fila) => (
                      <tr key={fila.clave}>
                        <td><b>{fila.etiqueta}</b></td>
                        <td><span className="mon-badge" style={dot(META[fila.estado].color)}>{META[fila.estado].etiqueta}</span></td>
                        <td className="mon-muted">{fila.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Agregar el CSS**

Al final de `app/globals.css`, en el mismo estilo compacto del archivo:

```css
.salud-bloques{display:grid;gap:22px;margin-top:20px}
.salud-bloque h2{display:flex;align-items:center;gap:12px;font-size:15px;margin:0 0 9px}
.salud-bloque .mon-table{min-width:520px}
.salud-bloque .mon-table td:first-child{width:34%}
.salud-bloque .mon-table td:nth-child(2){width:22%}
```

- [ ] **Step 4: Reconstruir y mirar la página**

```bash
cd /srv/apps/compose/panel-enlace && docker compose up -d --build panel-web && sleep 20
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8083/salud
```

Esperado: `200`. Después ábrela en <https://cabserver.tail0dd5e7.ts.net:8443/salud> y confirma que los cuatro bloques traen datos reales y que ninguna fila dice `undefined`.

- [ ] **Step 5: Correr la suite (la extracción de `haceCuanto` tocó MONITOREO)**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim \
  node --experimental-strip-types --test tests/*.test.ts
```

Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/salud lib/formato-tiempo.ts app/monitoreo/page.tsx app/globals.css
git commit -m "feat(salud): pagina /salud con los cuatro bloques

haceCuanto sale de la pagina de monitoreo a lib/ porque ahora la usan dos."
```

---

### Task 5: Cuarta pestaña y punto en la nav

Sin esto, `/salud` es una página que nadie abre. El punto es la mitad del valor.

**Files:**
- Create: `app/punto-salud.tsx`
- Modify: `app/nav-secciones.tsx`
- Modify: `app/page.tsx`, `app/red/page.tsx`, `app/monitoreo/page.tsx` (solo si el tipo de `activa` les da error de tipos)
- Modify: `app/globals.css` (al final)

**Interfaces:**
- Consumes: `GET /api/salud` (Task 3).
- Produces: `NavSecciones` acepta `activa: "sala" | "red" | "monitoreo" | "salud"`.

- [ ] **Step 1: Escribir el punto**

Crea `app/punto-salud.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { EstadoSalud, Salud } from "../lib/salud/evaluar";

const COLOR: Record<EstadoSalud, string> = {
  ok: "#1f9d55",
  atencion: "#d08700",
  falla: "#c0392b",
  "sin-datos": "#8a8f98",
};

const TITULO: Record<EstadoSalud, string> = {
  ok: "Todo en orden",
  atencion: "Algo requiere atención",
  falla: "Hay una falla",
  "sin-datos": "Sin noticias del servidor",
};

// Una sola consulta al montar, sin polling: el colector escribe cada 5 minutos
// y no vale la pena una peticion cada 30 segundos en las cuatro paginas.
// Si falla, el punto no se pinta: la nav no se rompe nunca por culpa de /salud.
export default function PuntoSalud() {
  const [peor, setPeor] = useState<EstadoSalud | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch("/api/salud", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<Salud> : null))
      .then((datos) => { if (vigente && datos) setPeor(datos.peor); })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  if (!peor || peor === "ok") return null;
  return <span className="nav-punto" style={{ background: COLOR[peor] }} title={TITULO[peor]} aria-label={TITULO[peor]} role="status" />;
}
```

El punto se esconde cuando todo está bien: un indicador siempre encendido deja de leerse. Verde equivale a ausencia de punto, y la pestaña SALUD sigue ahí para mirar el detalle.

- [ ] **Step 2: Agregar la pestaña y el punto a la nav**

Reemplaza `app/nav-secciones.tsx` entero:

```tsx
import Link from "next/link";
import PuntoSalud from "./punto-salud";

export default function NavSecciones({ activa }: { activa: "sala" | "red" | "monitoreo" | "salud" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
      <Link href="/monitoreo" className={activa === "monitoreo" ? "active" : ""} aria-current={activa === "monitoreo" ? "page" : undefined}>MONITOREO</Link>
      <Link href="/salud" className={activa === "salud" ? "active" : ""} aria-current={activa === "salud" ? "page" : undefined}>SALUD<PuntoSalud /></Link>
    </nav>
  );
}
```

- [ ] **Step 3: Agregar el CSS del punto**

Al final de `app/globals.css`:

```css
.net-tabs a{position:relative}
.nav-punto{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:5px;vertical-align:middle}
```

- [ ] **Step 4: Reconstruir y verificar en las cuatro páginas**

```bash
cd /srv/apps/compose/panel-enlace && docker compose up -d --build panel-web && sleep 20
for ruta in / /red /monitoreo /salud; do
  printf '%s -> %s\n' "$ruta" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8083$ruta)"
done
```

Esperado: `200` en las cuatro. Abre la app en el navegador y confirma que la pestaña SALUD aparece en todas y que el punto sale ámbar mientras el disco externo no tenga copias.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/punto-salud.tsx app/nav-secciones.tsx app/globals.css
git commit -m "feat(salud): pestana SALUD con punto de estado en la nav

El punto se esconde en verde: un indicador siempre encendido no se lee."
```

---

### Task 6: Probar el guardia, documentar y mergear

Lo que no se prueba rompiéndolo, no está probado.

**Files:**
- Modify: `Documents/Ciudadella/HomeLAB/servicios-cabserver.md` (en el PC del humano, no en el repo)
- Modify: `Documents/Ciudadella/HomeLAB/pendientes-cabserver.md` (idem)

- [ ] **Step 1: Romper el colector a propósito y ver que la página no miente**

```bash
sudo systemctl stop salud-cabserver.timer
docker exec panel-db psql -U panel -d panel \
  -c "UPDATE mon_salud SET medido_at = now() - interval '40 minutes'"
curl -s http://127.0.0.1:8083/api/salud | grep -o '"peor":"[a-z-]*"'
```

Esperado: `"peor":"atencion"`. En la página, todo el bloque Servidor debe decir **Sin datos**, no Bien. Si dice Bien, el guardia no está funcionando y hay que volver a la Task 2 antes de seguir.

- [ ] **Step 2: Devolver todo a la normalidad**

```bash
sudo systemctl start salud-cabserver.timer
sudo /usr/local/sbin/salud-cabserver.sh
curl -s http://127.0.0.1:8083/api/salud | grep -o '"peor":"[a-z-]*"'
```

- [ ] **Step 3: Empujar la rama**

```bash
cd /srv/apps/panel-enlace
git push -u origin feat/salud-stack
```

- [ ] **Step 4: Mergear a main**

```bash
cd /srv/apps/panel-enlace
git checkout main
git merge --ff-only feat/salud-stack
git push origin main
```

Si el `--ff-only` falla, alguien commiteó a `main` en el intervalo: haz `git rebase main feat/salud-stack`, corre la suite otra vez y repite.

- [ ] **Step 5: Actualizar la documentación del HomeLAB**

En `servicios-cabserver.md`, sección de Panel-Enlace, agregar:

> ### Salud del stack — HECHO 2026-08-11
>
> Pestaña `/salud` que responde "¿está sano ahora?": frescura del monitoreo,
> los 7 contenedores esperados, RAM y disco, estado de los dos respaldos y
> sondas a AdGuard (DNS real, no la web), NetAlertX, Vaultwarden y Tailscale.
> El punto de color en la nav aparece desde cualquier pestaña y se esconde en verde.
>
> Los datos del host los junta `/usr/local/sbin/salud-cabserver.sh`, un timer
> systemd cada 5 min que escribe a la tabla `mon_salud`. **Vive fuera de
> `docker-compose.yml`**, igual que el timer de respaldo; copia versionada en
> `ops/` del repo. Ningún contenedor recibe `docker.sock`.
>
> Si `mon_salud` no se actualiza en 15 min, la página dice "sin datos" en vez de
> verde. No avisa por ningún canal: hay que entrar a mirarla.

En `pendientes-cabserver.md`, sección Monitoreo / Panel-Enlace, agregar:

> - [ ] **Alertas** — `/salud` muestra pero no avisa. Falta el canal (ntfy, Telegram
>       o revivir n8n) para testigo caído, respaldo fallado, disco lleno o MAC nueva.
> - [ ] **Historia de salud** — hoy solo se guarda la última medición. Sin historia no
>       hay "cuántas veces falló esta semana".

- [ ] **Step 6: Verificar el respaldo nocturno a la mañana siguiente**

El disco externo se reconectó el 2026-08-11 y el timer nunca había corrido. Al día siguiente:

```bash
ssh cabserver "ls -lt /mnt/respaldo | head; systemctl status respaldo-cabserver.service --no-pager | head -12"
curl -s http://127.0.0.1:8083/api/salud | grep -o '"clave":"backup.usb_edad_seg","etiqueta":"[^"]*","estado":"[a-z-]*"'
```

Esperado: copias en el disco y la fila "Copia en el disco externo" en verde. Si sigue en ámbar, el respaldo no corrió y ahora sí hay una página que lo dice.

---

## Notas de autorrevisión

Cobertura del spec, sección por sección:

| Requisito del spec | Tarea |
|---|---|
| Script + timer en el host, sin `docker.sock` | 1 |
| Tabla `mon_salud` con hechos crudos, una transacción | 1, 3 |
| Juicio en función pura con test | 2 |
| Guardia del colector a 15 min | 2 (test), 6 (prueba real) |
| `sin-datos` pesa como `atencion` | 2 |
| 7 contenedores esperados, n8n fuera | 2 |
| AdGuard por DNS, no por web | 1, 2 |
| Umbrales exactos | 2 |
| Cuatro bloques en el orden del spec | 2, 4 |
| Color + palabra siempre | 4, 5 |
| Punto en la nav sin polling, que no rompe la nav | 5 |
| Documentar la pieza del host | 6 |
| Fuera de alcance: alertas e historia | 6 (quedan como pendientes) |

Verificado contra el código real antes de cerrar el plan, para que el implementador no tenga que adivinar:

- `netEspacios` y su columna `testigoMac` existen en `db/schema.ts:96-108`.
- La primera línea de `db/schema.ts` importa `boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex` de `drizzle-orm/pg-core`: **falta `doublePrecision`**, y por eso la Task 3 dice explícitamente que hay que agregarlo.
- Los tests corren en contenedor sin `node_modules`: probado con `tests/estado-efectivo.test.ts`, 7 pasando.
- Puertos de las sondas, comprobados uno por uno: Vaultwarden responde 200 en `127.0.0.1:8081/alive`; NetAlertX responde 302 en `127.0.0.1:20211` **sin publicar puertos en Docker** (usa la red del host); AdGuard **no** escucha en `127.0.0.1:8082` sino en `100.95.88.119:8082`, que es justamente por qué la sonda es `dig`, no `curl`.
