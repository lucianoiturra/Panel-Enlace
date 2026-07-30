# Pestaña Red — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pestaña Red al Panel Enlace que documente la red del colegio y permita capturar y consultar la asignación puerto ↔ espacio, con los 40 cubículos de la Sala de Enlace como endpoints enlazables.

**Architecture:** Ruta `/red` en el proyecto Next.js existente, seis tablas nuevas `net_*` en la misma base Supabase, detrás de la misma Basic auth. La lógica de grafo (`trazarCadena`, validación de enlaces) vive en módulos puros bajo `lib/red/` y se prueba con el runner de Node; las vistas son componentes cliente bajo `app/red/` que reciben estado por props. Un conversor de un solo uso lee el canvas de Obsidian y emite una semilla JSON commiteada que se siembra una vez, de forma idempotente.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.6, TypeScript 5.9.3, Drizzle ORM 0.45.2 sobre `postgres` 3.4.7 (Supabase, transaction pooler), CSS propio en `app/globals.css`, runner de pruebas nativo de Node 22.

**Spec:** `docs/superpowers/specs/2026-07-29-pestana-red-cab-design.md`
**Rama:** `pestana-red` (ya creada, con el spec commiteado)

## Global Constraints

- **Node ≥ 22.13.0** (`package.json` → `engines`). Las pruebas usan `node --experimental-strip-types`, verificado en 22.14. El runner recibe un **patrón de archivos**, no un directorio: `--test "tests/*.test.ts"`. Pasarle `--test tests` falla con `MODULE_NOT_FOUND` porque Node intenta cargar el directorio como módulo. Node expande el patrón por su cuenta, así que también funciona dentro de un script de npm en Windows.
- **Todo el texto de interfaz va en español**, con el tono de `PRODUCT.md`: claro, directo, sin adornos. Sin emojis en la interfaz.
- **Nunca devolver PINs** en ninguna respuesta de `/api/red*`: la proyección de cubículos es `id`, `status`, `ip`, `mac`, `inventoryCode` y nada más.
- **Las lecturas de base se ejecutan en secuencia**, nunca con `Promise.all`: el cliente `postgres` corre con `max: 1` por el transaction pooler (ver comentario en `app/api/room/route.ts:49`).
- **Sin dependencias nuevas.** Ni de runtime ni de desarrollo.
- **`net_bitacora` es append-only:** nunca `UPDATE` ni `DELETE` sobre esa tabla.
- **Una entrada de bitácora por cambio de datos.** El estado derivado de un puerto (`ocupado` / `libre`) se actualiza junto al enlace que lo causa y **no** genera entrada propia.
- **Sin foreign keys duras** entre tablas, igual que `checklist_results` y `station_tasks` hoy.
- **Ids con prefijo:** `pto:` puertos, `esp:` espacios, `cub:` cubículos. Los ids de rack (`R1`) y equipo (`R2-PP1`) van sin prefijo porque no son endpoints.
- **Estilo de código:** el del repo — líneas densas, `const` con arrow functions para helpers, `type` en vez de `interface`, comillas dobles, punto y coma, sin comentarios decorativos.
- **Vocabularios cerrados** (validar en API y en tipos):
  - `net_equipos.tipo`: `switch` · `patchpanel` · `router` · `firewall` · `ap` · `isp`
  - `net_puertos.estado`: `libre` · `ocupado` · `desconocido` · `dañado`
  - `net_espacios.estado`: `operativo` · `solo-wifi` · `sin-internet` · `sin-verificar`
  - `net_espacios.categoria`: `sala` · `oficina` · `otro`
  - `net_enlaces.tipo`: `patch` · `uplink` · `roseta` · `borde`
  - `net_bitacora.tipo`: `enlace-creado` · `enlace-borrado` · `estado-espacio` · `estado-puerto` · `nota` · `revisar`

---

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `lib/red/modelo.ts` | Tipos del dominio, resolución de prefijos, etiquetas legibles, validación de enlaces. Sin acceso a base ni a React. |
| `lib/red/trazado.ts` | `trazarCadena()`: grafo, BFS hasta el ISP, colapso de saltos. Puro. |
| `lib/red/semilla.json` | Salida commiteada del conversor: estado inicial completo. |
| `lib/red/siembra.ts` | Aplica la semilla una vez, de forma idempotente, marcada en `app_metadata`. |
| `herramientas/convertir-canvas.mjs` | Conversor de un solo uso: canvas → semilla. Falla si un invariante no cuadra. |
| `db/schema.ts` | + las seis tablas `net_*` (modificado). |
| `db/index.ts` | + el DDL de las seis tablas en `ensureSchema()` (modificado). |
| `app/api/red/route.ts` | `GET` estado completo · `PUT` estado y nota de espacio o puerto. |
| `app/api/red/enlaces/route.ts` | `POST` y `DELETE` de enlaces, con bitácora y estado derivado. |
| `app/api/red/cadena/route.ts` | `GET` la cadena de un endpoint, para la línea de red del cajón de la Sala. |
| `app/nav-secciones.tsx` | Las dos pestañas `SALA` · `RED`. |
| `app/red/page.tsx` | Shell de la pestaña: carga, estado, rail, segmentado, cajón, modal. |
| `app/red/vista-espacios.tsx` | Grilla de los 61 espacios. |
| `app/red/vista-racks.tsx` | Tiras de puertos por equipo y formato lista. |
| `app/red/vista-cobertura.tsx` | Avance del levantamiento y últimos cambios. |
| `app/red/diagrama.tsx` | SVG de solo lectura con paneo y zoom. |
| `app/red/ficha.tsx` | Cajón: espacio · puerto · cubículo. |
| `app/red/captura.tsx` | Modal de captura con toggle de sentido. |
| `app/page.tsx` | + pestañas en la barra superior, + línea de red en el cajón (modificado). |
| `app/globals.css` | + clases `net-*` (modificado). |
| `tests/fixture-red.ts` | Estado de red mínimo compartido por las pruebas. |
| `tests/modelo.test.ts` · `tests/trazado.test.ts` · `tests/semilla.test.ts` | Pruebas de las funciones puras y del artefacto commiteado. |

---

### Task 1: Módulo de dominio y arranque de las pruebas

**Files:**
- Create: `lib/red/modelo.ts`
- Create: `tests/fixture-red.ts`
- Create: `tests/modelo.test.ts`
- Modify: `tsconfig.json` (agregar `allowImportingTsExtensions`)
- Modify: `package.json:12` (script `test`)

**Interfaces:**
- Consumes: nada.
- Produces: los tipos `EstadoRed`, `Rack`, `Equipo`, `Puerto`, `Espacio`, `Enlace`, `EntradaBitacora`, `Cubiculo`, `EstadoPuerto`, `EstadoEspacio`, `CategoriaEspacio`, `TipoEquipo`, `TipoEnlace`, `TipoBitacora`; y las funciones `prefijoDe(id: string): "pto" | "esp" | "cub" | null`, `existeEndpoint(estado: EstadoRed, id: string): boolean`, `etiquetaPuerto(estado: EstadoRed, puertoId: string): string`, `etiquetaEndpoint(estado: EstadoRed, id: string): string`, `ordenCanonico(a: string, b: string): [string, string]`, `validarEnlace(estado: EstadoRed, a: string, b: string): { ok: true } | { ok: false, error: string }`, `enlacesDe(estado: EstadoRed, id: string): Enlace[]`.

- [ ] **Step 1: Habilitar el runner de pruebas**

En `tsconfig.json`, agregar la opción dentro de `compilerOptions` (es legal porque `noEmit: true` ya está):

```json
    "allowImportingTsExtensions": true,
```

En `package.json`, reemplazar la línea 12:

```json
    "test": "npm run build && node --experimental-strip-types --test tests/*.test.ts",
```

- [ ] **Step 2: Escribir el fixture de pruebas**

Crear `tests/fixture-red.ts`. Es una red mínima pero completa: un patch panel, un switch con uplink, un switch de borde y la cadena hasta el ISP.

```ts
import type { EstadoRed } from "../lib/red/modelo.ts";

export const fixture = (): EstadoRed => ({
  racks: [
    { id: "R2", nombre: "Rack 2 | Sala Enlace", ubicacion: "Sala Enlace", x: -1440, y: 1240, w: 2640, h: 1560, notas: "" },
    { id: "R3", nombre: "Rack 3 | Sala de Profesores", ubicacion: "Sala de Profesores", x: 2360, y: 920, w: 2880, h: 1480, notas: "" },
  ],
  equipos: [
    { id: "R2-PP1", rack: "R2", tipo: "patchpanel", etiqueta: "Patch Panel 3Z", modelo: "24 puertos UTP Cat6", puertos: 24, color: "", x: -1034, y: 1400, nota: "" },
    { id: "R2-SW1", rack: "R2", tipo: "switch", etiqueta: "Switch 1 | Gigabit 24p Smart", modelo: "TP-Link TL-SG1024S", puertos: 24, color: "3", x: -580, y: 1600, nota: "" },
    { id: "R3-SW1", rack: "R3", tipo: "switch", etiqueta: "Switch 1 | Cisco", modelo: "Cisco", puertos: 28, color: "#c44a4a", x: 2894, y: 1300, nota: "" },
    { id: "MIKROTIK", rack: "R2", tipo: "router", etiqueta: "MikroTik", modelo: "", puertos: 0, color: "4", x: -522, y: 21, nota: "" },
    { id: "ISP", rack: "R2", tipo: "isp", etiqueta: "Proveedores de Servicios de Internet", modelo: "", puertos: 0, color: "4", x: -115, y: -280, nota: "" },
  ],
  puertos: [
    { id: "pto:R2-PP1-p14", equipo: "R2-PP1", n: 14, estado: "ocupado", nota: "" },
    { id: "pto:R2-PP1-p15", equipo: "R2-PP1", n: 15, estado: "libre", nota: "" },
    { id: "pto:R2-PP1-p16", equipo: "R2-PP1", n: 16, estado: "desconocido", nota: "sin etiquetar en el levantamiento" },
    { id: "pto:R2-SW1-p11", equipo: "R2-SW1", n: 11, estado: "ocupado", nota: "" },
    { id: "pto:R2-SW1-p24", equipo: "R2-SW1", n: 24, estado: "ocupado", nota: "" },
    { id: "pto:R3-SW1-p02", equipo: "R3-SW1", n: 2, estado: "ocupado", nota: "" },
    { id: "pto:R3-SW1-p28", equipo: "R3-SW1", n: 28, estado: "ocupado", nota: "" },
    { id: "pto:MIKROTIK-p0", equipo: "MIKROTIK", n: 0, estado: "ocupado", nota: "" },
    { id: "pto:ISP-p0", equipo: "ISP", n: 0, estado: "ocupado", nota: "" },
  ],
  espacios: [
    { id: "esp:3-basico-b", nombre: "3° Básico B", categoria: "sala", estado: "sin-verificar", x: -3560, y: 432, nota: "" },
    { id: "esp:4-basico-a", nombre: "4° Básico A", categoria: "sala", estado: "sin-verificar", x: -3560, y: 300, nota: "" },
    { id: "esp:secretaria", nombre: "Secretaría", categoria: "oficina", estado: "sin-verificar", x: -3560, y: -600, nota: "" },
  ],
  enlaces: [
    { id: 1, a: "esp:3-basico-b", b: "pto:R2-PP1-p14", tipo: "roseta", nota: "" },
    { id: 2, a: "pto:R2-PP1-p14", b: "pto:R2-SW1-p11", tipo: "patch", nota: "" },
    { id: 3, a: "pto:R2-SW1-p24", b: "pto:R3-SW1-p02", tipo: "uplink", nota: "" },
    { id: 4, a: "pto:MIKROTIK-p0", b: "pto:R3-SW1-p28", tipo: "borde", nota: "" },
    { id: 5, a: "pto:ISP-p0", b: "pto:MIKROTIK-p0", tipo: "borde", nota: "" },
  ],
  bitacora: [],
  cubiculos: [
    { id: 12, status: "operational", ip: "192.168.20.112", mac: "1C-83-41-1C-7D-A7", inventoryCode: "AF-2026-012" },
    { id: 13, status: "pending", ip: "", mac: "", inventoryCode: "" },
  ],
});
```

- [ ] **Step 3: Escribir las pruebas que fallan**

Crear `tests/modelo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { etiquetaEndpoint, etiquetaPuerto, existeEndpoint, ordenCanonico, prefijoDe, validarEnlace } from "../lib/red/modelo.ts";

test("prefijoDe reconoce los tres prefijos y rechaza el resto", () => {
  assert.equal(prefijoDe("pto:R2-PP1-p14"), "pto");
  assert.equal(prefijoDe("esp:3-basico-b"), "esp");
  assert.equal(prefijoDe("cub:12"), "cub");
  assert.equal(prefijoDe("R2-PP1"), null);
  assert.equal(prefijoDe(""), null);
});

test("existeEndpoint resuelve puertos, espacios y cubículos", () => {
  const estado = fixture();
  assert.equal(existeEndpoint(estado, "pto:R2-PP1-p14"), true);
  assert.equal(existeEndpoint(estado, "esp:3-basico-b"), true);
  assert.equal(existeEndpoint(estado, "cub:12"), true);
  assert.equal(existeEndpoint(estado, "cub:99"), false);
  assert.equal(existeEndpoint(estado, "pto:R2-PP1-p99"), false);
  assert.equal(existeEndpoint(estado, "esp:inexistente"), false);
});

test("etiquetaPuerto usa el formato R2/PP1 p14 con dos dígitos", () => {
  const estado = fixture();
  assert.equal(etiquetaPuerto(estado, "pto:R2-PP1-p14"), "R2/PP1 p14");
  assert.equal(etiquetaPuerto(estado, "pto:R3-SW1-p02"), "R3/SW1 p02");
});

test("etiquetaEndpoint devuelve el nombre del espacio y del cubículo", () => {
  const estado = fixture();
  assert.equal(etiquetaEndpoint(estado, "esp:3-basico-b"), "3° Básico B");
  assert.equal(etiquetaEndpoint(estado, "cub:12"), "Cubículo 12");
  assert.equal(etiquetaEndpoint(estado, "pto:R2-SW1-p11"), "R2/SW1 p11");
  assert.equal(etiquetaEndpoint(estado, "esp:no-existe"), "esp:no-existe");
});

test("ordenCanonico deja el id menor primero, en los dos sentidos", () => {
  assert.deepEqual(ordenCanonico("pto:R2-PP1-p14", "esp:3-basico-b"), ["esp:3-basico-b", "pto:R2-PP1-p14"]);
  assert.deepEqual(ordenCanonico("esp:3-basico-b", "pto:R2-PP1-p14"), ["esp:3-basico-b", "pto:R2-PP1-p14"]);
});

test("validarEnlace acepta un enlace nuevo entre endpoints existentes", () => {
  const estado = fixture();
  assert.deepEqual(validarEnlace(estado, "esp:4-basico-a", "pto:R2-PP1-p15"), { ok: true });
  assert.deepEqual(validarEnlace(estado, "cub:12", "pto:R2-PP1-p15"), { ok: true });
});

test("validarEnlace rechaza endpoints inexistentes", () => {
  const estado = fixture();
  const sinA = validarEnlace(estado, "esp:no-existe", "pto:R2-PP1-p15");
  assert.equal(sinA.ok, false);
  assert.match(sinA.ok === false ? sinA.error : "", /no existe/);
  const sinB = validarEnlace(estado, "esp:4-basico-a", "pto:R2-PP1-p99");
  assert.equal(sinB.ok, false);
});

test("validarEnlace rechaza un endpoint contra sí mismo", () => {
  const estado = fixture();
  const resultado = validarEnlace(estado, "pto:R2-PP1-p15", "pto:R2-PP1-p15");
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok === false ? resultado.error : "", /sí mismo/);
});

test("validarEnlace rechaza el duplicado en cualquiera de los dos órdenes", () => {
  const estado = fixture();
  const mismoOrden = validarEnlace(estado, "esp:3-basico-b", "pto:R2-PP1-p14");
  assert.equal(mismoOrden.ok, false);
  assert.match(mismoOrden.ok === false ? mismoOrden.error : "", /ya existe/);
  const ordenInverso = validarEnlace(estado, "pto:R2-PP1-p14", "esp:3-basico-b");
  assert.equal(ordenInverso.ok, false);
});
```

- [ ] **Step 4: Correr las pruebas para verificar que fallan**

Run: `node --experimental-strip-types --test "tests/*.test.ts"`
Expected: FAIL — `Cannot find module` para `../lib/red/modelo.ts`.

- [ ] **Step 5: Escribir el módulo**

Crear `lib/red/modelo.ts`:

```ts
export type TipoEquipo = "switch" | "patchpanel" | "router" | "firewall" | "ap" | "isp";
export type EstadoPuerto = "libre" | "ocupado" | "desconocido" | "dañado";
export type EstadoEspacio = "operativo" | "solo-wifi" | "sin-internet" | "sin-verificar";
export type CategoriaEspacio = "sala" | "oficina" | "otro";
export type TipoEnlace = "patch" | "uplink" | "roseta" | "borde";
export type TipoBitacora = "enlace-creado" | "enlace-borrado" | "estado-espacio" | "estado-puerto" | "nota" | "revisar";

export const tiposEquipo: TipoEquipo[] = ["switch", "patchpanel", "router", "firewall", "ap", "isp"];
export const estadosPuerto: EstadoPuerto[] = ["libre", "ocupado", "desconocido", "dañado"];
export const estadosEspacio: EstadoEspacio[] = ["operativo", "solo-wifi", "sin-internet", "sin-verificar"];
export const categoriasEspacio: CategoriaEspacio[] = ["sala", "oficina", "otro"];
export const tiposEnlace: TipoEnlace[] = ["patch", "uplink", "roseta", "borde"];

export type Rack = { id: string; nombre: string; ubicacion: string; x: number; y: number; w: number; h: number; notas: string };
export type Equipo = { id: string; rack: string; tipo: TipoEquipo; etiqueta: string; modelo: string; puertos: number; color: string; x: number; y: number; nota: string };
export type Puerto = { id: string; equipo: string; n: number; estado: EstadoPuerto; nota: string };
export type Espacio = { id: string; nombre: string; categoria: CategoriaEspacio; estado: EstadoEspacio; x: number; y: number; nota: string };
export type Enlace = { id: number; a: string; b: string; tipo: TipoEnlace; nota: string };
export type EntradaBitacora = { id: number; fecha: string; tipo: TipoBitacora; objetivo: string; antes: string; despues: string; nota: string };
export type Cubiculo = { id: number; status: string; ip: string; mac: string; inventoryCode: string };
export type EstadoRed = { racks: Rack[]; equipos: Equipo[]; puertos: Puerto[]; espacios: Espacio[]; enlaces: Enlace[]; bitacora: EntradaBitacora[]; cubiculos: Cubiculo[] };

export const etiquetasEstadoEspacio: Record<EstadoEspacio, string> = {
  operativo: "Operativo",
  "solo-wifi": "Solo Wi‑Fi",
  "sin-internet": "Sin internet",
  "sin-verificar": "Sin verificar",
};

export const etiquetasEstadoPuerto: Record<EstadoPuerto, string> = {
  libre: "Libre",
  ocupado: "Ocupado",
  desconocido: "Desconocido",
  dañado: "Dañado",
};

export const prefijoDe = (id: string): "pto" | "esp" | "cub" | null => {
  const prefijo = id.split(":")[0];
  return prefijo === "pto" || prefijo === "esp" || prefijo === "cub" ? prefijo : null;
};

export const numeroCubiculo = (id: string) => Number(id.slice(4));

export const existeEndpoint = (estado: EstadoRed, id: string) => {
  switch (prefijoDe(id)) {
    case "pto": return estado.puertos.some(puerto => puerto.id === id);
    case "esp": return estado.espacios.some(espacio => espacio.id === id);
    case "cub": return estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(id));
    default: return false;
  }
};

export const etiquetaPuerto = (estado: EstadoRed, puertoId: string) => {
  const puerto = estado.puertos.find(candidato => candidato.id === puertoId);
  if (!puerto) return puertoId;
  const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
  if (equipo && !equipo.puertos) return equipo.etiqueta;
  return `${puerto.equipo.replace("-", "/")} p${String(puerto.n).padStart(2, "0")}`;
};

export const etiquetaEndpoint = (estado: EstadoRed, id: string) => {
  switch (prefijoDe(id)) {
    case "pto": return etiquetaPuerto(estado, id);
    case "esp": return estado.espacios.find(espacio => espacio.id === id)?.nombre ?? id;
    case "cub": return estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(id)) ? `Cubículo ${numeroCubiculo(id)}` : id;
    default: return id;
  }
};

export const ordenCanonico = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const enlacesDe = (estado: EstadoRed, id: string) => estado.enlaces.filter(enlace => enlace.a === id || enlace.b === id);

export const validarEnlace = (estado: EstadoRed, a: string, b: string): { ok: true } | { ok: false; error: string } => {
  if (a === b) return { ok: false, error: "No se puede enlazar un punto consigo mismo." };
  if (!existeEndpoint(estado, a)) return { ok: false, error: `El punto ${a} no existe.` };
  if (!existeEndpoint(estado, b)) return { ok: false, error: `El punto ${b} no existe.` };
  const [primero, segundo] = ordenCanonico(a, b);
  if (estado.enlaces.some(enlace => enlace.a === primero && enlace.b === segundo)) return { ok: false, error: "Ese enlace ya existe." };
  return { ok: true };
};

export const tipoEnlaceSugerido = (estado: EstadoRed, a: string, b: string): TipoEnlace => {
  const equipoDe = (id: string) => estado.equipos.find(equipo => equipo.id === estado.puertos.find(puerto => puerto.id === id)?.equipo);
  if (prefijoDe(a) !== "pto" || prefijoDe(b) !== "pto") return "roseta";
  const primero = equipoDe(a);
  const segundo = equipoDe(b);
  if (!primero || !segundo) return "patch";
  const borde: TipoEquipo[] = ["isp", "firewall", "router"];
  if (borde.includes(primero.tipo) || borde.includes(segundo.tipo)) return "borde";
  if (primero.tipo === "switch" && segundo.tipo === "switch") return "uplink";
  return "patch";
};
```

- [ ] **Step 6: Correr las pruebas para verificar que pasan**

Run: `node --experimental-strip-types --test "tests/*.test.ts"`
Expected: PASS — 9 pruebas.

- [ ] **Step 7: Confirmar que el proyecto sigue compilando**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores. `allowImportingTsExtensions` permite los imports con extensión de las pruebas.

- [ ] **Step 8: Commit**

```bash
git add lib/red/modelo.ts tests/fixture-red.ts tests/modelo.test.ts tsconfig.json package.json
git commit -m "Add network domain model and wire up the test runner"
```

---

### Task 2: Trazado de la cadena hasta el ISP

**Files:**
- Create: `lib/red/trazado.ts`
- Create: `tests/trazado.test.ts`

**Interfaces:**
- Consumes: de Task 1 — `EstadoRed`, `Equipo`, `Puerto`, `prefijoDe`, `etiquetaEndpoint`, `etiquetaPuerto`.
- Produces: `type Salto = { id: string; etiqueta: string; tipo: "espacio" | "cubiculo" | "puerto" | "equipo" }`, `type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string }`, `trazarCadena(estado: EstadoRed, origenId: string): Cadena`, `cadenaComoTexto(cadena: Cadena): string`.

La regla que hace que esto funcione: **en un `switch`, `router`, `firewall`, `ap` o `isp` todos los puertos están conectados entre sí por el chasis; en un `patchpanel` no.** Se modela con un nodo virtual `eq:<idEquipo>` al que se conectan todos los puertos del equipo, y que después se elimina de la presentación.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/trazado.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import { cadenaComoTexto, trazarCadena } from "../lib/red/trazado.ts";

test("traza la cadena completa desde un espacio hasta el ISP", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  assert.deepEqual(cadena.saltos.map(salto => salto.etiqueta), [
    "3° Básico B",
    "R2/PP1 p14",
    "R2/SW1 p11",
    "R3/SW1 p02",
    "MikroTik",
    "Proveedores de Servicios de Internet",
  ]);
});

test("colapsa los saltos internos del chasis a un puerto por equipo", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  const ids = cadena.saltos.map(salto => salto.id);
  assert.equal(ids.includes("pto:R2-SW1-p24"), false);
  assert.equal(ids.includes("pto:R3-SW1-p28"), false);
  assert.equal(ids.some(id => id.startsWith("eq:")), false);
});

test("no cruza un patch panel de un puerto a otro", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 6, a: "esp:secretaria", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  const cadena = trazarCadena(estado, "esp:secretaria");
  assert.equal(cadena.completa, false);
  assert.deepEqual(cadena.saltos.map(salto => salto.etiqueta), ["Secretaría", "R2/PP1 p15"]);
});

test("un puerto sin enlaces reporta cadena incompleta sin lanzar", () => {
  const cadena = trazarCadena(fixture(), "pto:R2-PP1-p16");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.saltos.length, 1);
  assert.match(cadena.motivo ?? "", /no tiene enlaces/);
});

test("un espacio sin roseta reporta cadena incompleta", () => {
  const cadena = trazarCadena(fixture(), "esp:4-basico-a");
  assert.equal(cadena.completa, false);
  assert.match(cadena.motivo ?? "", /[Ss]in puerto asignado/);
});

test("un endpoint inexistente devuelve cadena vacía sin lanzar", () => {
  const cadena = trazarCadena(fixture(), "esp:no-existe");
  assert.equal(cadena.completa, false);
  assert.deepEqual(cadena.saltos, []);
});

test("un ciclo de uplinks no cuelga ni repite nodos", () => {
  const estado = fixture();
  estado.puertos.push({ id: "pto:R3-SW1-p27", equipo: "R3-SW1", n: 27, estado: "ocupado", nota: "" });
  estado.puertos.push({ id: "pto:R2-SW1-p23", equipo: "R2-SW1", n: 23, estado: "ocupado", nota: "" });
  estado.enlaces.push({ id: 7, a: "pto:R2-SW1-p23", b: "pto:R3-SW1-p27", tipo: "uplink", nota: "" });
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  const ids = cadena.saltos.map(salto => salto.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("traza desde un cubículo", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 8, a: "cub:12", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  estado.enlaces.push({ id: 9, a: "pto:R2-PP1-p15", b: "pto:R2-SW1-p11", tipo: "patch", nota: "" });
  const cadena = trazarCadena(estado, "cub:12");
  assert.equal(cadena.completa, true);
  assert.equal(cadena.saltos[0].etiqueta, "Cubículo 12");
  assert.equal(cadena.saltos[0].tipo, "cubiculo");
});

test("cadenaComoTexto une los saltos con flechas", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadenaComoTexto(cadena), "3° Básico B → R2/PP1 p14 → R2/SW1 p11 → R3/SW1 p02 → MikroTik → Proveedores de Servicios de Internet");
});

test("cadenaComoTexto marca la cadena incompleta", () => {
  const cadena = trazarCadena(fixture(), "esp:4-basico-a");
  assert.match(cadenaComoTexto(cadena), /[Ss]in puerto asignado/);
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `node --experimental-strip-types --test tests/trazado.test.ts`
Expected: FAIL — `Cannot find module` para `../lib/red/trazado.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `lib/red/trazado.ts`:

```ts
import { etiquetaEndpoint, numeroCubiculo, prefijoDe, type EstadoRed, type TipoEquipo } from "./modelo.ts";

export type Salto = { id: string; etiqueta: string; tipo: "espacio" | "cubiculo" | "puerto" | "equipo" };
export type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string };

const TOPE_SALTOS = 2000;
const conChasis: TipoEquipo[] = ["switch", "router", "firewall", "ap", "isp"];

const construirAdyacencia = (estado: EstadoRed) => {
  const adyacencia = new Map<string, string[]>();
  const agregar = (desde: string, hasta: string) => {
    const vecinos = adyacencia.get(desde);
    if (vecinos) vecinos.push(hasta);
    else adyacencia.set(desde, [hasta]);
  };
  for (const enlace of estado.enlaces) {
    agregar(enlace.a, enlace.b);
    agregar(enlace.b, enlace.a);
  }
  const equipos = new Map(estado.equipos.map(equipo => [equipo.id, equipo]));
  for (const puerto of estado.puertos) {
    const equipo = equipos.get(puerto.equipo);
    if (!equipo || !conChasis.includes(equipo.tipo)) continue;
    agregar(puerto.id, `eq:${equipo.id}`);
    agregar(`eq:${equipo.id}`, puerto.id);
  }
  for (const vecinos of adyacencia.values()) vecinos.sort();
  return adyacencia;
};

const esDelIsp = (estado: EstadoRed, nodoId: string) => {
  if (!nodoId.startsWith("pto:")) return false;
  const puerto = estado.puertos.find(candidato => candidato.id === nodoId);
  return estado.equipos.some(equipo => equipo.id === puerto?.equipo && equipo.tipo === "isp");
};

const tipoDeSalto = (id: string): Salto["tipo"] => {
  switch (prefijoDe(id)) {
    case "esp": return "espacio";
    case "cub": return "cubiculo";
    default: return "puerto";
  }
};

const presentar = (estado: EstadoRed, camino: string[]): Salto[] => {
  const equipoDe = (id: string) => estado.puertos.find(puerto => puerto.id === id)?.equipo ?? "";
  const saltos: Salto[] = [];
  for (const id of camino) {
    if (id.startsWith("eq:")) continue;
    const anterior = saltos[saltos.length - 1];
    if (anterior && id.startsWith("pto:") && anterior.id.startsWith("pto:") && equipoDe(id) === equipoDe(anterior.id)) continue;
    const equipo = estado.equipos.find(candidato => candidato.id === equipoDe(id));
    saltos.push({ id, etiqueta: etiquetaEndpoint(estado, id), tipo: equipo && !equipo.puertos ? "equipo" : tipoDeSalto(id) });
  }
  return saltos;
};

const motivoIncompleto = (estado: EstadoRed, origenId: string, ultimo: string) => {
  if (origenId === ultimo) {
    if (prefijoDe(origenId) === "pto") return "El puerto no tiene enlaces registrados.";
    return "Sin puerto asignado todavía.";
  }
  return `La cadena termina en ${etiquetaEndpoint(estado, ultimo)} sin llegar al ISP.`;
};

export const trazarCadena = (estado: EstadoRed, origenId: string): Cadena => {
  const existe = prefijoDe(origenId) === "cub"
    ? estado.cubiculos.some(cubiculo => cubiculo.id === numeroCubiculo(origenId))
    : estado.puertos.some(puerto => puerto.id === origenId) || estado.espacios.some(espacio => espacio.id === origenId);
  if (!existe) return { saltos: [], completa: false, motivo: "El punto de origen no existe." };

  const adyacencia = construirAdyacencia(estado);
  const padres = new Map<string, string>([[origenId, ""]]);
  const profundidades = new Map<string, number>([[origenId, 0]]);
  const cola = [origenId];
  let destino = "";
  let expansiones = 0;

  while (cola.length && !destino && expansiones < TOPE_SALTOS) {
    const actual = cola.shift()!;
    expansiones += 1;
    if (esDelIsp(estado, actual)) { destino = actual; break; }
    for (const vecino of adyacencia.get(actual) ?? []) {
      if (padres.has(vecino)) continue;
      padres.set(vecino, actual);
      profundidades.set(vecino, (profundidades.get(actual) ?? 0) + 1);
      cola.push(vecino);
    }
  }

  const masLejano = () => {
    let elegido = origenId;
    let mejor = -1;
    for (const [id, profundidad] of profundidades) {
      if (id.startsWith("eq:")) continue;
      if (profundidad > mejor || (profundidad === mejor && id < elegido)) { elegido = id; mejor = profundidad; }
    }
    return elegido;
  };

  const final = destino || masLejano();
  const camino: string[] = [];
  for (let nodo = final; nodo; nodo = padres.get(nodo) ?? "") camino.unshift(nodo);
  const saltos = presentar(estado, camino);
  if (destino) return { saltos, completa: true };
  return { saltos, completa: false, motivo: motivoIncompleto(estado, origenId, final) };
};

export const cadenaComoTexto = (cadena: Cadena) => {
  const ruta = cadena.saltos.map(salto => salto.etiqueta).join(" → ");
  if (cadena.completa) return ruta;
  return ruta ? `${ruta} · ${cadena.motivo ?? "cadena incompleta"}` : (cadena.motivo ?? "cadena incompleta");
};
```

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `node --experimental-strip-types --test "tests/*.test.ts"`
Expected: PASS — las 9 de Task 1 más 10 de trazado.

- [ ] **Step 5: Commit**

```bash
git add lib/red/trazado.ts tests/trazado.test.ts
git commit -m "Add chain tracing from any endpoint to the ISP"
```

---

### Task 3: Conversor del canvas y semilla commiteada

**Files:**
- Create: `herramientas/convertir-canvas.mjs`
- Create: `lib/red/semilla.json` (generado por el conversor, se commitea)
- Create: `tests/semilla.test.ts`

**Interfaces:**
- Consumes: `Estructura Redes CAB.canvas` en la raíz del repo.
- Produces: `lib/red/semilla.json` con la forma `{ version: string, origen: string, generado: string, racks: Rack[], equipos: Equipo[], puertos: Puerto[], espacios: Espacio[], enlaces: { a, b, tipo, nota }[], revisar: { objetivo, nota }[] }`. `version` es el SHA-256 del `.canvas`. Los enlaces de la semilla **no** llevan `id`: lo asigna Postgres al sembrar.

**Contexto medido del canvas** (validado el 2026-07-29 contra el archivo real, no asumir otros valores): 410 nodos y 111 edges; 20 grupos, 380 nodos de texto, 10 de archivo. Los grupos de equipo se llaman `Patch Panel 3Z\n24 puertos UTP Cat6` y `Switch N | ...`. Los grupos Cisco no declaran su número de puertos en el label: se deduce del número de puerto más alto dibujado dentro (28).

- [ ] **Step 1: Escribir el conversor**

Crear `herramientas/convertir-canvas.mjs`:

```js
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const rutaCanvas = process.argv[2] ?? "Estructura Redes CAB.canvas";
const rutaSalida = process.argv[3] ?? "lib/red/semilla.json";
const crudo = readFileSync(rutaCanvas, "utf8");
const canvas = JSON.parse(crudo);

const grupos = canvas.nodes.filter(nodo => nodo.type === "group");
const textos = canvas.nodes.filter(nodo => nodo.type === "text");
const archivos = canvas.nodes.filter(nodo => nodo.type === "file");
const porId = new Map(canvas.nodes.map(nodo => [nodo.id, nodo]));

const contenido = (nodo, grupo) => nodo.id !== grupo.id
  && nodo.x >= grupo.x && nodo.y >= grupo.y
  && nodo.x + (nodo.width ?? 0) <= grupo.x + grupo.width
  && nodo.y + (nodo.height ?? 0) <= grupo.y + grupo.height;

const contenedor = nodo => grupos
  .filter(grupo => contenido(nodo, grupo))
  .sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;

const slug = texto => texto.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[°º]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const esNumero = nodo => /^\s*\d{1,2}\s*$/.test(nodo.text ?? "");
const tieneEdges = nodoId => canvas.edges.some(edge => edge.fromNode === nodoId || edge.toNode === nodoId);

// --- racks ---
const gruposRack = grupos.filter(grupo => /rack/i.test(grupo.label ?? ""));
const idRack = grupo => `R${(grupo.label.match(/rack\s*(\d)/i) ?? [])[1] ?? "0"}`;
const notasRack = new Map(gruposRack.map(grupo => [idRack(grupo), []]));
const racks = gruposRack.map(grupo => ({
  id: idRack(grupo), nombre: grupo.label.replace(/\n/g, " ").trim(),
  ubicacion: (grupo.label.split(/[-|]/)[1] ?? "").trim(),
  x: grupo.x, y: grupo.y, w: grupo.width, h: grupo.height, notas: "",
}));

// --- equipos con puertos ---
const gruposEquipo = grupos.filter(grupo => /patch panel|switch/i.test(grupo.label ?? ""));
const equipos = [];
const puertos = [];
const puertoDeNodo = new Map();

const contadores = new Map();
const rackContenedor = nodo => gruposRack
  .filter(grupo => contenido(nodo, grupo))
  .sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? { label: "Rack 0" };
const idEquipo = grupo => {
  const rack = idRack(rackContenedor(grupo));
  if (/patch panel/i.test(grupo.label)) {
    const clave = `${rack}-PP`;
    const siguiente = (contadores.get(clave) ?? 0) + 1;
    contadores.set(clave, siguiente);
    return `${rack}-PP${siguiente}`;
  }
  const numero = (grupo.label.match(/switch\s*(\d)/i) ?? [])[1] ?? "1";
  return `${rack}-SW${numero}`;
};

for (const grupo of [...gruposEquipo].sort((a, b) => a.y - b.y)) {
  const id = idEquipo(grupo);
  const numeros = textos.filter(nodo => esNumero(nodo) && contenedor(nodo)?.id === grupo.id);
  const declarados = Number((grupo.label.match(/(\d+)\s*(?:puertos|p\b)/i) ?? [])[1] ?? 0);
  const maximo = numeros.reduce((mayor, nodo) => Math.max(mayor, Number(nodo.text)), 0);
  const total = declarados || maximo;
  const tipo = /patch panel/i.test(grupo.label) ? "patchpanel" : "switch";
  equipos.push({
    id, rack: id.split("-")[0], tipo,
    etiqueta: grupo.label.split("\n")[0].trim(), modelo: (grupo.label.split("\n")[1] ?? "").trim(),
    puertos: total, color: grupo.color ?? "", x: grupo.x, y: grupo.y, nota: "",
  });
  const etiquetados = new Map(numeros.map(nodo => [Number(nodo.text), nodo]));
  for (let n = 1; n <= total; n += 1) {
    const nodo = etiquetados.get(n);
    const idPuerto = `pto:${id}-p${n}`;
    if (nodo) puertoDeNodo.set(nodo.id, idPuerto);
    puertos.push({
      id: idPuerto, equipo: id, n,
      estado: nodo ? (tieneEdges(nodo.id) ? "ocupado" : "libre") : "desconocido",
      nota: nodo ? "" : "sin etiquetar en el levantamiento",
    });
  }
}

// --- equipos de borde y APs, con puerto sintético p0 ---
const bordes = [
  { coincide: /Fortinet/i, id: "FORTINET", tipo: "firewall", etiqueta: "Fortinet FortiGate" },
  { coincide: /MikroTik/i, id: "MIKROTIK", tipo: "router", etiqueta: "MikroTik" },
  { coincide: /Proveedores de Servicios/i, id: "ISP", tipo: "isp", etiqueta: "Proveedores de Servicios de Internet" },
];
for (const borde of bordes) {
  const nodo = archivos.find(archivo => borde.coincide.test(archivo.file));
  if (!nodo) continue;
  equipos.push({ id: borde.id, rack: "", tipo: borde.tipo, etiqueta: borde.etiqueta, modelo: "", puertos: 0, color: nodo.color ?? "", x: nodo.x, y: nodo.y, nota: "" });
  puertos.push({ id: `pto:${borde.id}-p0`, equipo: borde.id, n: 0, estado: tieneEdges(nodo.id) ? "ocupado" : "libre", nota: "" });
  puertoDeNodo.set(nodo.id, `pto:${borde.id}-p0`);
}

for (const nodo of textos.filter(texto => /^##\s*AP/i.test(texto.text ?? ""))) {
  const nombre = (nodo.text.split("\n")[1] ?? "AP").trim();
  const id = `AP-${slug(nombre)}`;
  const rack = rackContenedor(nodo);
  equipos.push({ id, rack: rack.label === "Rack 0" ? "" : idRack(rack), tipo: "ap", etiqueta: nombre, modelo: "", puertos: 0, color: nodo.color ?? "", x: nodo.x, y: nodo.y, nota: "" });
  puertos.push({ id: `pto:${id}-p0`, equipo: id, n: 0, estado: tieneEdges(nodo.id) ? "ocupado" : "libre", nota: "" });
  puertoDeNodo.set(nodo.id, `pto:${id}-p0`);
}

// --- espacios ---
const grupoSalas = grupos.find(grupo => /^Salas de clases/i.test(grupo.label ?? ""));
const grupoOficinas = grupos.find(grupo => /^Oficinas/i.test(grupo.label ?? ""));
const estadoPorColor = { "1": "sin-internet", "3": "solo-wifi", "4": "operativo" };
const espacios = textos
  .filter(nodo => [grupoSalas?.id, grupoOficinas?.id].includes(contenedor(nodo)?.id))
  .map(nodo => ({
    id: `esp:${slug(nodo.text)}`,
    nombre: nodo.text.replace(/\n/g, " ").trim(),
    categoria: contenedor(nodo)?.id === grupoSalas?.id ? "sala" : "oficina",
    estado: estadoPorColor[nodo.color] ?? "sin-verificar",
    x: nodo.x, y: nodo.y, nota: "",
  }));

// --- enlaces y casos a revisar ---
const enlaces = [];
const revisar = [];
const nodoDesconocido = textos.find(nodo => (nodo.text ?? "").trim() === "Desconocido");
const equipoDePuerto = idPuerto => equipos.find(equipo => equipo.id === puertos.find(puerto => puerto.id === idPuerto)?.equipo);
const tipoEntre = (a, b) => {
  const primero = equipoDePuerto(a);
  const segundo = equipoDePuerto(b);
  if (["isp", "firewall", "router"].includes(primero?.tipo) || ["isp", "firewall", "router"].includes(segundo?.tipo)) return "borde";
  // Un AP cuelga de un puerto igual que una roseta de sala: no es cableado interno del rack.
  if (primero?.tipo === "ap" || segundo?.tipo === "ap") return "roseta";
  if (primero?.tipo === "switch" && segundo?.tipo === "switch") return "uplink";
  return "patch";
};

for (const edge of canvas.edges) {
  const desde = porId.get(edge.fromNode);
  const hasta = porId.get(edge.toNode);
  if (!desde || !hasta) continue;

  if (nodoDesconocido && (desde.id === nodoDesconocido.id || hasta.id === nodoDesconocido.id)) {
    const otro = desde.id === nodoDesconocido.id ? hasta : desde;
    const idPuerto = puertoDeNodo.get(otro.id);
    const puerto = puertos.find(candidato => candidato.id === idPuerto);
    if (puerto) { puerto.estado = "desconocido"; puerto.nota = "destino desconocido según canvas"; }
    continue;
  }

  const a = puertoDeNodo.get(desde.id);
  const b = puertoDeNodo.get(hasta.id);
  if (a && b) { enlaces.push({ a, b, tipo: tipoEntre(a, b), nota: "" }); continue; }

  if (desde.type === "group" && b) {
    revisar.push({ objetivo: b, nota: `edge sin significado claro desde el grupo "${desde.label.split("\n")[0]}" en el canvas` });
    continue;
  }
  if (desde.type === "group" || hasta.type === "group") {
    const grupo = desde.type === "group" ? desde : hasta;
    const otro = desde.type === "group" ? hasta : desde;
    const notas = notasRack.get(idRack(grupo));
    const texto = otro.type === "group" ? otro.label : (otro.text ?? otro.file ?? "");
    if (notas) notas.push(`relación dibujada en el canvas hacia: ${texto.split("\n")[0]}`);
  }
}

// --- notas de rack: segmento IP por confirmar ---
for (const nodo of textos.filter(texto => /Segmento IP/i.test(texto.text ?? ""))) {
  const id = (nodo.text.match(/Rack\s*(\d)/i) ?? [])[1];
  const notas = notasRack.get(`R${id}`);
  if (notas) notas.push(nodo.text.replace(/\n+/g, " ").trim());
  revisar.push({ objetivo: `R${id}`, nota: "segmento IP por confirmar (detectados 192.168.20/30/60.x)" });
}
for (const rack of racks) rack.notas = (notasRack.get(rack.id) ?? []).join("\n");

// --- las dos asignaciones documentadas solo como texto ---
const documentadas = [
  { espacio: "esp:utp-e-basica", puerto: "pto:R2-PP1-p19" },
  { espacio: "esp:pie-administrativo", puerto: "pto:R2-PP1-p18" },
];
for (const { espacio, puerto } of documentadas) {
  if (!espacios.some(candidato => candidato.id === espacio) || !puertos.some(candidato => candidato.id === puerto)) {
    throw new Error(`No se pudo enlazar la asignación documentada ${espacio} → ${puerto}: revisa los ids generados.`);
  }
  enlaces.push({ a: espacio, b: puerto, tipo: "roseta", nota: "según el canvas, sin verificar en terreno" });
  revisar.push({ objetivo: espacio, nota: `asignación tomada de la nota del canvas (${puerto}), sin verificar en terreno` });
}

// --- invariantes ---
const cuenta = estado => puertos.filter(puerto => puerto.estado === estado).length;
const espaciosPorEstado = estado => espacios.filter(espacio => espacio.estado === estado).length;
const enlacesPuertoPuerto = enlaces.filter(enlace => enlace.tipo === "patch" || enlace.tipo === "uplink").length;
const invariantes = [
  ["racks", racks.length, 3],
  ["equipos con puertos", equipos.filter(equipo => equipo.puertos > 0).length, 13],
  ["puertos nominales", puertos.filter(puerto => puerto.n > 0).length, 324],
  ["puertos sin etiquetar", puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento").length, 20],
  ["puertos con destino desconocido", puertos.filter(puerto => puerto.nota === "destino desconocido según canvas").length, 8],
  ["enlaces patch y uplink", enlacesPuertoPuerto, 92],
  ["equipos de borde y APs", equipos.filter(equipo => equipo.puertos === 0).length, 7],
  ["enlaces de borde", enlaces.filter(enlace => enlace.tipo === "borde").length, 2],
  ["enlaces roseta", enlaces.filter(enlace => enlace.tipo === "roseta").length, 4],
  ["espacios", espacios.length, 61],
  ["espacios operativo", espaciosPorEstado("operativo"), 20],
  ["espacios solo-wifi", espaciosPorEstado("solo-wifi"), 7],
  ["espacios sin-internet", espaciosPorEstado("sin-internet"), 7],
  ["espacios sin-verificar", espaciosPorEstado("sin-verificar"), 27],
];
const fallas = invariantes.filter(([, real, esperado]) => real !== esperado);
if (fallas.length) {
  for (const [nombre, real, esperado] of fallas) console.error(`invariante "${nombre}": ${real}, se esperaba ${esperado}`);
  process.exit(1);
}

const semilla = {
  version: createHash("sha256").update(crudo).digest("hex"),
  origen: `${rutaCanvas} (2026-06-06)`,
  generado: new Date().toISOString(),
  racks, equipos, puertos, espacios, enlaces, revisar,
};
writeFileSync(rutaSalida, `${JSON.stringify(semilla, null, 2)}\n`);
console.log(`semilla escrita en ${rutaSalida}: ${racks.length} racks, ${equipos.length} equipos, ${puertos.length} puertos, ${espacios.length} espacios, ${enlaces.length} enlaces, ${revisar.length} por revisar`);
console.log(`puertos: ${cuenta("ocupado")} ocupados, ${cuenta("libre")} libres, ${cuenta("desconocido")} desconocidos`);
```

- [ ] **Step 2: Correr el conversor**

Run: `node herramientas/convertir-canvas.mjs`
Expected: escribe `lib/red/semilla.json` y sale con código 0. Si algún invariante falla, imprime cuál y sale con 1 — en ese caso **arreglar el conversor, no el invariante**: los once valores están medidos contra el canvas real.

Nota de depuración: si el conteo de "equipos con puertos" da distinto de 13, el problema está en `idEquipo` — los tres grupos Cisco no declaran puertos en su label y su total se deduce del número más alto dibujado (28). Si "espacios" da distinto de 61, revisar que `contenedor()` esté eligiendo el grupo más pequeño.

- [ ] **Step 3: Escribir la prueba que guarda el artefacto**

Crear `tests/semilla.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };

test("la semilla commiteada cumple los invariantes del levantamiento", () => {
  assert.equal(semilla.racks.length, 3);
  assert.equal(semilla.equipos.filter(equipo => equipo.puertos > 0).length, 13);
  assert.equal(semilla.puertos.filter(puerto => puerto.n > 0).length, 324);
  assert.equal(semilla.espacios.length, 61);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "operativo").length, 20);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "solo-wifi").length, 7);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "sin-internet").length, 7);
  assert.equal(semilla.espacios.filter(espacio => espacio.estado === "sin-verificar").length, 27);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "patch" || enlace.tipo === "uplink").length, 92);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "borde").length, 2);
  assert.equal(semilla.enlaces.filter(enlace => enlace.tipo === "roseta").length, 4);
  assert.equal(semilla.equipos.filter(equipo => equipo.puertos === 0).length, 7);
  assert.match(semilla.version, /^[0-9a-f]{64}$/);
});

test("todos los ids de la semilla son únicos y con el prefijo correcto", () => {
  const ids = [...semilla.puertos.map(puerto => puerto.id), ...semilla.espacios.map(espacio => espacio.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(semilla.puertos.every(puerto => puerto.id.startsWith("pto:")));
  assert.ok(semilla.espacios.every(espacio => espacio.id.startsWith("esp:")));
});

test("cada enlace de la semilla apunta a endpoints que existen", () => {
  const conocidos = new Set([...semilla.puertos.map(puerto => puerto.id), ...semilla.espacios.map(espacio => espacio.id)]);
  for (const enlace of semilla.enlaces) {
    assert.ok(conocidos.has(enlace.a), `extremo desconocido: ${enlace.a}`);
    assert.ok(conocidos.has(enlace.b), `extremo desconocido: ${enlace.b}`);
    assert.notEqual(enlace.a, enlace.b);
  }
});
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test "tests/*.test.ts"`
Expected: PASS — las 19 anteriores más 3 de semilla.

Los cuatro enlaces `roseta` son las 2 asignaciones documentadas más los 2 APs que el canvas sí dejó conectados a un puerto (Sala Multicopiado en el 22 y Sala de Profesores en el 24); los otros 2 APs quedan sin enlace. Si el conteo de `roseta` no da 4, revisar que los slugs `esp:utp-e-basica` y `esp:pie-administrativo` coincidan con los generados — el conversor lanza con un mensaje explícito si no.

- [ ] **Step 5: Commit**

```bash
git add herramientas/convertir-canvas.mjs lib/red/semilla.json tests/semilla.test.ts
git commit -m "Convert the Obsidian canvas into a committed network seed"
```

---

### Task 4: Tablas, DDL local, siembra idempotente y migración

**Files:**
- Modify: `db/schema.ts` (agregar al final, sin tocar lo existente)
- Modify: `db/index.ts:79` (agregar sentencias al arreglo `statements`)
- Create: `lib/red/siembra.ts`
- Create: `drizzle-pg/0001_*.sql` (generado por `npm run db:generate`)
- Modify: `README.md` (sección de despliegue)

**Interfaces:**
- Consumes: de Task 3 — `lib/red/semilla.json`. De Task 1 — `ordenCanonico`.
- Produces: las tablas Drizzle `netRacks`, `netEquipos`, `netPuertos`, `netEspacios`, `netEnlaces`, `netBitacora`; y `sembrarRed(db: Awaited<ReturnType<typeof getDb>>): Promise<void>`.

- [ ] **Step 1: Agregar las tablas al schema**

Al final de `db/schema.ts`. Nota: `boolean` y `serial` ya están importados en la línea 1; agregar nada al import salvo que falte alguno.

```ts
export const netRacks = pgTable("net_racks", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  ubicacion: text("ubicacion").notNull().default(""),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  w: integer("w").notNull().default(0),
  h: integer("h").notNull().default(0),
  notas: text("notas").notNull().default(""),
});

export const netEquipos = pgTable("net_equipos", {
  id: text("id").primaryKey(),
  rack: text("rack").notNull().default(""),
  tipo: text("tipo").notNull().default("switch"),
  etiqueta: text("etiqueta").notNull().default(""),
  modelo: text("modelo").notNull().default(""),
  puertos: integer("puertos").notNull().default(0),
  color: text("color").notNull().default(""),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  nota: text("nota").notNull().default(""),
});

export const netPuertos = pgTable(
  "net_puertos",
  {
    id: text("id").primaryKey(),
    equipo: text("equipo").notNull(),
    n: integer("n").notNull(),
    estado: text("estado").notNull().default("libre"),
    nota: text("nota").notNull().default(""),
  },
  (table) => [index("net_puerto_equipo_idx").on(table.equipo)],
);

export const netEspacios = pgTable("net_espacios", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  categoria: text("categoria").notNull().default("sala"),
  estado: text("estado").notNull().default("sin-verificar"),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  nota: text("nota").notNull().default(""),
});

export const netEnlaces = pgTable(
  "net_enlaces",
  {
    id: serial("id").primaryKey(),
    a: text("a").notNull(),
    b: text("b").notNull(),
    tipo: text("tipo").notNull().default("patch"),
    nota: text("nota").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("net_enlace_par_idx").on(table.a, table.b), index("net_enlace_a_idx").on(table.a), index("net_enlace_b_idx").on(table.b)],
);

export const netBitacora = pgTable(
  "net_bitacora",
  {
    id: serial("id").primaryKey(),
    fecha: text("fecha").notNull(),
    tipo: text("tipo").notNull(),
    objetivo: text("objetivo").notNull().default(""),
    antes: text("antes").notNull().default(""),
    despues: text("despues").notNull().default(""),
    nota: text("nota").notNull().default(""),
  },
  (table) => [index("net_bitacora_objetivo_idx").on(table.objetivo)],
);
```

- [ ] **Step 2: Agregar el DDL local**

En `db/index.ts`, dentro del arreglo `statements` (después de la última sentencia `ALTER TABLE cubicles ...` de la línea 78), agregar. Se usa `INTEGER GENERATED BY DEFAULT AS IDENTITY` para las llaves seriales, igual que las tablas que ya están:

```ts
      `CREATE TABLE IF NOT EXISTS net_racks (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL DEFAULT '',
        ubicacion TEXT NOT NULL DEFAULT '',
        x INTEGER NOT NULL DEFAULT 0,
        y INTEGER NOT NULL DEFAULT 0,
        w INTEGER NOT NULL DEFAULT 0,
        h INTEGER NOT NULL DEFAULT 0,
        notas TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS net_equipos (
        id TEXT PRIMARY KEY,
        rack TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL DEFAULT 'switch',
        etiqueta TEXT NOT NULL DEFAULT '',
        modelo TEXT NOT NULL DEFAULT '',
        puertos INTEGER NOT NULL DEFAULT 0,
        color TEXT NOT NULL DEFAULT '',
        x INTEGER NOT NULL DEFAULT 0,
        y INTEGER NOT NULL DEFAULT 0,
        nota TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS net_puertos (
        id TEXT PRIMARY KEY,
        equipo TEXT NOT NULL,
        n INTEGER NOT NULL,
        estado TEXT NOT NULL DEFAULT 'libre',
        nota TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS net_espacios (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL DEFAULT '',
        categoria TEXT NOT NULL DEFAULT 'sala',
        estado TEXT NOT NULL DEFAULT 'sin-verificar',
        x INTEGER NOT NULL DEFAULT 0,
        y INTEGER NOT NULL DEFAULT 0,
        nota TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS net_enlaces (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        a TEXT NOT NULL,
        b TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'patch',
        nota TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS net_bitacora (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        fecha TEXT NOT NULL,
        tipo TEXT NOT NULL,
        objetivo TEXT NOT NULL DEFAULT '',
        antes TEXT NOT NULL DEFAULT '',
        despues TEXT NOT NULL DEFAULT '',
        nota TEXT NOT NULL DEFAULT ''
      )`,
      "CREATE INDEX IF NOT EXISTS net_puerto_equipo_idx ON net_puertos (equipo)",
      "CREATE UNIQUE INDEX IF NOT EXISTS net_enlace_par_idx ON net_enlaces (a, b)",
      "CREATE INDEX IF NOT EXISTS net_enlace_a_idx ON net_enlaces (a)",
      "CREATE INDEX IF NOT EXISTS net_enlace_b_idx ON net_enlaces (b)",
      "CREATE INDEX IF NOT EXISTS net_bitacora_objetivo_idx ON net_bitacora (objetivo)",
```

- [ ] **Step 3: Escribir la siembra**

Crear `lib/red/siembra.ts`. Los 324 puertos entran en un solo `INSERT` (unas 2.300 vinculaciones, muy por debajo del límite de Postgres), y todo va con `onConflictDoNothing()` para que reimportar no pise nada:

```ts
import { eq, sql } from "drizzle-orm";
import type { getDb } from "../../db";
import { appMetadata, netBitacora, netEnlaces, netEquipos, netEspacios, netPuertos, netRacks } from "../../db/schema";
import semilla from "./semilla.json" with { type: "json" };
import { ordenCanonico } from "./modelo";

type Db = Awaited<ReturnType<typeof getDb>>;
const MARCA = "red_semilla_version";

export async function sembrarRed(db: Db) {
  const [marca] = await db.select().from(appMetadata).where(eq(appMetadata.key, MARCA)).limit(1);
  if (marca?.value === semilla.version) return;

  const ahora = new Date().toISOString();
  await db.insert(netRacks).values(semilla.racks).onConflictDoNothing();
  await db.insert(netEquipos).values(semilla.equipos).onConflictDoNothing();
  await db.insert(netPuertos).values(semilla.puertos).onConflictDoNothing();
  await db.insert(netEspacios).values(semilla.espacios).onConflictDoNothing();

  const enlaces = semilla.enlaces.map(enlace => {
    const [a, b] = ordenCanonico(enlace.a, enlace.b);
    return { a, b, tipo: enlace.tipo, nota: enlace.nota, createdAt: ahora };
  });
  if (enlaces.length) await db.insert(netEnlaces).values(enlaces).onConflictDoNothing();

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(netBitacora);
  if (!total && semilla.revisar.length) {
    await db.insert(netBitacora).values(semilla.revisar.map(caso => ({
      fecha: ahora, tipo: "revisar", objetivo: caso.objetivo, antes: "", despues: "", nota: caso.nota,
    })));
  }

  await db.insert(appMetadata).values({ key: MARCA, value: semilla.version })
    .onConflictDoUpdate({ target: appMetadata.key, set: { value: semilla.version } });
}
```

- [ ] **Step 4: Verificar contra la base local**

Run: `npm run dev` en una terminal, y en otra `curl -s http://localhost:3000/api/room > /dev/null`
Expected: la llamada a `/api/room` dispara `ensureSchema()` y crea las seis tablas nuevas sin error. Revisar en Supabase (o con `psql`) que `net_puertos` tenga 324 filas después de la Task 5, cuando la siembra se ejecute por primera vez. En este paso solo interesa que el DDL no falle.

- [ ] **Step 5: Generar la migración de producción**

Run: `npm run db:generate`
Expected: aparece un archivo nuevo en `drizzle-pg/` con las seis tablas y sus índices, más la entrada correspondiente en `drizzle-pg/meta/_journal.json`. Revisar el SQL generado: **no debe contener ningún `DROP`** ni cambios sobre `cubicles`, `checklist_items`, `checklist_results`, `station_tasks` ni `app_metadata`. Si los contiene, la migración está desalineada con la base y hay que revisar el snapshot antes de seguir.

- [ ] **Step 6: Documentar el paso de despliegue**

En `README.md`, después de la sección de despliegue en Vercel, agregar:

```markdown
### Pestaña Red

Las tablas `net_*` de la pestaña Red no se crean automáticamente en producción: `getDb()`
salta el DDL cuando corre en Vercel. Antes de publicar la pestaña, aplica la migración de
`drizzle-pg/` en Supabase (SQL Editor o `psql`). En desarrollo local se crean solas.

Los datos iniciales vienen de `lib/red/semilla.json`, generado desde el canvas con:

```bash
node herramientas/convertir-canvas.mjs
```

La siembra se aplica una sola vez, marcada en `app_metadata` con la clave
`red_semilla_version`, e inserta solo lo que falta: volver a correrla no pisa asignaciones
capturadas.
```

- [ ] **Step 7: Commit**

```bash
git add db/schema.ts db/index.ts lib/red/siembra.ts drizzle-pg README.md
git commit -m "Add net_* tables, local DDL and idempotent seeding"
```

---

### Task 5: API de lectura

**Files:**
- Create: `app/api/red/route.ts`
- Create: `app/api/red/cadena/route.ts`

**Interfaces:**
- Consumes: de Task 4 — las tablas y `sembrarRed`. De Task 2 — `trazarCadena`.
- Produces: `GET /api/red` → `{ racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos }` con la forma exacta de `EstadoRed`; `GET /api/red/cadena?endpoint=<id>` → `{ saltos, completa, motivo? }`; y la función interna reutilizable `leerEstado(db)` exportada desde `app/api/red/route.ts`.

- [ ] **Step 1: Escribir la ruta de lectura**

Crear `app/api/red/route.ts`. Las lecturas van **en secuencia**, nunca en `Promise.all`:

```ts
import { asc, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { cubicles, netBitacora, netEnlaces, netEquipos, netEspacios, netPuertos, netRacks } from "../../../db/schema";
import { sembrarRed } from "../../../lib/red/siembra";
import type { EstadoRed } from "../../../lib/red/modelo";

type Db = Awaited<ReturnType<typeof getDb>>;

export async function leerEstado(db: Db): Promise<EstadoRed> {
  const racks = await db.select().from(netRacks).orderBy(asc(netRacks.id));
  const equipos = await db.select().from(netEquipos).orderBy(asc(netEquipos.id));
  const puertos = await db.select().from(netPuertos).orderBy(asc(netPuertos.equipo), asc(netPuertos.n));
  const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.nombre));
  const enlaces = await db.select({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota }).from(netEnlaces).orderBy(asc(netEnlaces.id));
  const bitacora = await db.select().from(netBitacora).orderBy(desc(netBitacora.id)).limit(200);
  const cubiculos = await db.select({ id: cubicles.id, status: cubicles.status, ip: cubicles.ip, mac: cubicles.mac, inventoryCode: cubicles.inventoryCode }).from(cubicles).orderBy(asc(cubicles.id));
  return { racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos } as EstadoRed;
}

export async function GET() {
  try {
    const db = await getDb();
    await sembrarRed(db);
    return Response.json(await leerEstado(db));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la red" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Escribir la ruta de cadena**

Crear `app/api/red/cadena/route.ts`. Sirve solo para la línea de red del cajón de la Sala, así que no devuelve el estado completo:

```ts
import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cubicles, netEnlaces, netEquipos, netEspacios, netPuertos } from "../../../../db/schema";
import { trazarCadena } from "../../../../lib/red/trazado";
import type { EstadoRed } from "../../../../lib/red/modelo";

export async function GET(request: Request) {
  try {
    const endpoint = new URL(request.url).searchParams.get("endpoint")?.trim() ?? "";
    if (!/^(pto|esp|cub):[\w:\-.]+$/.test(endpoint)) return Response.json({ error: "Punto de origen inválido" }, { status: 400 });
    const db = await getDb();
    const equipos = await db.select().from(netEquipos).orderBy(asc(netEquipos.id));
    const puertos = await db.select().from(netPuertos).orderBy(asc(netPuertos.id));
    const espacios = await db.select().from(netEspacios).orderBy(asc(netEspacios.id));
    const enlaces = await db.select({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota }).from(netEnlaces);
    const listaCubiculos = await db.select({ id: cubicles.id, status: cubicles.status, ip: cubicles.ip, mac: cubicles.mac, inventoryCode: cubicles.inventoryCode }).from(cubicles);
    const estado = { racks: [], equipos, puertos, espacios, enlaces, bitacora: [], cubiculos: listaCubiculos } as EstadoRed;
    return Response.json(trazarCadena(estado, endpoint));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible trazar la cadena" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar contra la base local**

Con `npm run dev` corriendo:

```bash
curl -s http://localhost:3000/api/red | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const e=JSON.parse(d);console.log({racks:e.racks.length,equipos:e.equipos.length,puertos:e.puertos.length,espacios:e.espacios.length,enlaces:e.enlaces.length,bitacora:e.bitacora.length,cubiculos:e.cubiculos.length});})"
```

Expected: `{ racks: 3, equipos: 20, puertos: 331, espacios: 61, enlaces: 98, bitacora: <n>, cubiculos: 40 }`.
Los 331 puertos son los 324 nominales más 7 sintéticos `p0` (3 equipos de borde y 4 APs); los 20 equipos son 13 con puertos más esos 7; los 98 enlaces son 92 patch/uplink + 2 de borde + 4 roseta. Si `puertos` sale en 0, la siembra no corrió: revisar que `app_metadata` no tenga ya la clave `red_semilla_version` con otro valor.

Verificar además que **no aparecen PINs** en la respuesta:

```bash
curl -s http://localhost:3000/api/red | grep -c -i "pin" || echo "sin PINs: correcto"
```

Expected: `sin PINs: correcto`.

Y la cadena de un espacio con roseta documentada:

```bash
curl -s "http://localhost:3000/api/red/cadena?endpoint=esp:utp-e-basica"
```

Expected: JSON con `saltos` partiendo en `UTP E. Básica` y `completa` en `true` o `false` según cómo esté cableado el panel en la semilla; lo que importa es que responda 200 y no lance.

- [ ] **Step 5: Commit**

```bash
git add app/api/red/route.ts app/api/red/cadena/route.ts
git commit -m "Add read API for the network tab"
```

---

### Task 6: API de mutaciones con bitácora

**Files:**
- Modify: `app/api/red/route.ts` (agregar `PUT`)
- Create: `app/api/red/enlaces/route.ts`

**Interfaces:**
- Consumes: de Task 5 — `leerEstado`. De Task 1 — `validarEnlace`, `ordenCanonico`, `tipoEnlaceSugerido`, `etiquetaEndpoint`, `estadosEspacio`, `estadosPuerto`, `prefijoDe`.
- Produces: `PUT /api/red` con cuerpo `{ tipo: "espacio" | "puerto", id: string, estado?: string, nota?: string }` → `{ ok: true }`; `POST /api/red/enlaces` con cuerpo `{ a: string, b: string, tipo?: string, nota?: string }` → `{ enlace: { id, a, b, tipo, nota } }`; `DELETE /api/red/enlaces?id=<n>` → `{ ok: true }`.

**Reglas que esta tarea implementa y que no se pueden relajar:**
- Una entrada de bitácora **por campo cambiado**: un `PUT` que cambia estado y nota escribe dos entradas (`estado-*` y `nota`); un `PUT` que no cambia nada no escribe ninguna.
- El estado derivado del puerto (`ocupado` al enlazar, `libre` al desenlazar) se actualiza junto al enlace y **no** escribe entrada propia.
- Reemplazar el destino de un puerto no es una operación de esta API: la interfaz manda `DELETE` y después `POST`.

- [ ] **Step 1: Agregar el `PUT` a la ruta de red**

En `app/api/red/route.ts`, agregar los imports que faltan y la función. Los imports quedan así:

```ts
import { and, asc, desc, eq, or } from "drizzle-orm";
import { estadosEspacio, estadosPuerto, prefijoDe, type EstadoRed } from "../../../lib/red/modelo";
```

Y al final del archivo:

```ts
const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { tipo?: string; id?: string; estado?: string; nota?: string };
    const tipo = payload.tipo === "espacio" || payload.tipo === "puerto" ? payload.tipo : "";
    const id = limpiar(payload.id, 120);
    if (!tipo) return Response.json({ error: "Tipo inválido: usa espacio o puerto." }, { status: 400 });
    if (prefijoDe(id) !== (tipo === "espacio" ? "esp" : "pto")) return Response.json({ error: "El identificador no corresponde al tipo." }, { status: 400 });

    const nota = limpiar(payload.nota, 500);
    const permitidos: string[] = tipo === "espacio" ? estadosEspacio : estadosPuerto;
    const estado = typeof payload.estado === "string" ? payload.estado : "";
    if (estado && !permitidos.includes(estado)) return Response.json({ error: "Estado inválido." }, { status: 400 });

    const db = await getDb();
    const tabla = tipo === "espacio" ? netEspacios : netPuertos;
    const [actual] = await db.select().from(tabla).where(eq(tabla.id, id)).limit(1);
    if (!actual) return Response.json({ error: "No existe ese registro." }, { status: 404 });

    const fecha = new Date().toISOString();
    const entradas: { fecha: string; tipo: string; objetivo: string; antes: string; despues: string; nota: string }[] = [];
    if (estado && estado !== actual.estado) entradas.push({ fecha, tipo: tipo === "espacio" ? "estado-espacio" : "estado-puerto", objetivo: id, antes: actual.estado, despues: estado, nota: "" });
    if (payload.nota !== undefined && nota !== actual.nota) entradas.push({ fecha, tipo: "nota", objetivo: id, antes: actual.nota, despues: nota, nota: "" });
    if (!entradas.length) return Response.json({ ok: true });

    await db.update(tabla).set({
      ...(estado ? { estado } : {}),
      ...(payload.nota !== undefined ? { nota } : {}),
    }).where(eq(tabla.id, id));
    await db.insert(netBitacora).values(entradas);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Escribir la ruta de enlaces**

Crear `app/api/red/enlaces/route.ts`:

```ts
import { eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netPuertos } from "../../../../db/schema";
import { leerEstado } from "../route";
import { etiquetaEndpoint, ordenCanonico, prefijoDe, tipoEnlaceSugerido, tiposEnlace, validarEnlace } from "../../../../lib/red/modelo";

const limpiar = (valor: unknown, maximo: number) => typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { a?: string; b?: string; tipo?: string; nota?: string };
    const a = limpiar(payload.a, 120);
    const b = limpiar(payload.b, 120);
    const nota = limpiar(payload.nota, 200);
    const db = await getDb();
    const estado = await leerEstado(db);

    const validacion = validarEnlace(estado, a, b);
    if (!validacion.ok) return Response.json({ error: validacion.error }, { status: 400 });

    const [primero, segundo] = ordenCanonico(a, b);
    const tipo = payload.tipo && tiposEnlace.includes(payload.tipo as never) ? payload.tipo : tipoEnlaceSugerido(estado, primero, segundo);
    const fecha = new Date().toISOString();
    const [enlace] = await db.insert(netEnlaces).values({ a: primero, b: segundo, tipo, nota, createdAt: fecha }).returning({ id: netEnlaces.id, a: netEnlaces.a, b: netEnlaces.b, tipo: netEnlaces.tipo, nota: netEnlaces.nota });

    for (const extremo of [primero, segundo]) {
      if (prefijoDe(extremo) !== "pto") continue;
      const puerto = estado.puertos.find(candidato => candidato.id === extremo);
      if (puerto && puerto.estado !== "ocupado" && puerto.estado !== "dañado") await db.update(netPuertos).set({ estado: "ocupado" }).where(eq(netPuertos.id, extremo));
    }

    await db.insert(netBitacora).values({
      fecha, tipo: "enlace-creado", objetivo: primero,
      antes: "", despues: `${etiquetaEndpoint(estado, primero)} ↔ ${etiquetaEndpoint(estado, segundo)}`, nota,
    });
    return Response.json({ enlace }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible crear el enlace" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Enlace inválido" }, { status: 400 });
    const db = await getDb();
    const estado = await leerEstado(db);
    const enlace = estado.enlaces.find(candidato => candidato.id === id);
    if (!enlace) return Response.json({ error: "Ese enlace ya no existe." }, { status: 404 });

    await db.delete(netEnlaces).where(eq(netEnlaces.id, id));
    const fecha = new Date().toISOString();

    for (const extremo of [enlace.a, enlace.b]) {
      if (prefijoDe(extremo) !== "pto") continue;
      const puerto = estado.puertos.find(candidato => candidato.id === extremo);
      const quedan = estado.enlaces.some(otro => otro.id !== id && (otro.a === extremo || otro.b === extremo));
      if (puerto?.estado === "ocupado" && !quedan) await db.update(netPuertos).set({ estado: "libre" }).where(eq(netPuertos.id, extremo));
    }

    await db.insert(netBitacora).values({
      fecha, tipo: "enlace-borrado", objetivo: enlace.a,
      antes: `${etiquetaEndpoint(estado, enlace.a)} ↔ ${etiquetaEndpoint(estado, enlace.b)}`, despues: "", nota: enlace.nota,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible borrar el enlace" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint && npx tsc --noEmit`
Expected: sin errores. Si `or` queda importado sin usarse en `app/api/red/route.ts`, quitarlo: eslint lo marca.

- [ ] **Step 4: Probar el ciclo completo contra la base local**

Con `npm run dev` corriendo. Asignar un espacio libre a un puerto libre, comprobar la bitácora, y deshacer:

```bash
curl -s -X POST http://localhost:3000/api/red/enlaces -H "Content-Type: application/json" -d '{"a":"esp:3-basico-b","b":"pto:R2-PP1-p15","nota":"prueba"}'
```

Expected: `201` con `{"enlace":{"id":<n>,"a":"esp:3-basico-b","b":"pto:R2-PP1-p15","tipo":"roseta","nota":"prueba"}}`. Si el id de espacio o de puerto no existe en tu semilla, tomar dos reales del `GET /api/red`.

Repetir el mismo `POST`: Expected `400` con `Ese enlace ya existe.`
Invertir `a` y `b` y repetir: Expected `400` con el mismo mensaje — el orden canónico funciona.
Enviar `{"a":"pto:R2-PP1-p15","b":"pto:R2-PP1-p15"}`: Expected `400` con `No se puede enlazar un punto consigo mismo.`
Enviar `{"a":"esp:no-existe","b":"pto:R2-PP1-p15"}`: Expected `400` con `no existe`.

Verificar el estado derivado y la bitácora:

```bash
curl -s http://localhost:3000/api/red | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const e=JSON.parse(d);console.log(e.puertos.find(p=>p.id==='pto:R2-PP1-p15'));console.log(e.bitacora.slice(0,2));})"
```

Expected: el puerto quedó en `ocupado`, y hay **exactamente una** entrada nueva, de tipo `enlace-creado`.

Borrar y comprobar que el puerto vuelve a `libre` con una sola entrada nueva:

```bash
curl -s -X DELETE "http://localhost:3000/api/red/enlaces?id=<n>"
```

Probar el `PUT` de estado y nota:

```bash
curl -s -X PUT http://localhost:3000/api/red -H "Content-Type: application/json" -d '{"tipo":"espacio","id":"esp:3-basico-b","estado":"operativo","nota":"probado con tester"}'
```

Expected: `{"ok":true}` y **dos** entradas nuevas en la bitácora (`estado-espacio` y `nota`). Repetir el mismo `PUT` sin cambios: Expected `{"ok":true}` y **ninguna** entrada nueva.
Enviar `{"tipo":"espacio","id":"esp:3-basico-b","estado":"inventado"}`: Expected `400` con `Estado inválido.`
Enviar `{"tipo":"puerto","id":"esp:3-basico-b"}`: Expected `400` con `El identificador no corresponde al tipo.`

- [ ] **Step 5: Commit**

```bash
git add app/api/red/route.ts app/api/red/enlaces/route.ts
git commit -m "Add mutation API with automatic network log"
```

---

## Nota sobre la verificación de las tareas de interfaz

El repo no tiene framework de pruebas de componentes y `npm test` es `next build` más las pruebas de funciones puras. Las tareas 7 a 13 se verifican con `npm run lint`, `npx tsc --noEmit`, `npm run build` y una comprobación manual con `npm run dev`, descrita paso a paso en cada tarea. No inventar un framework de pruebas de UI: no está en el proyecto y agregarlo no es parte de este plan.

---

### Task 7: Pestañas, shell de la ruta /red y vista Espacios

**Files:**
- Create: `app/nav-secciones.tsx`
- Create: `app/red/page.tsx`
- Create: `app/red/vista-espacios.tsx`
- Modify: `lib/red/modelo.ts` (agregar `ID_SALA_COMPUTACION` y `puertosDeEndpoint`)
- Modify: `app/page.tsx:310` (insertar las pestañas en la barra superior)
- Modify: `app/globals.css` (agregar clases `net-*` al final)

**Interfaces:**
- Consumes: de Task 5 — `GET /api/red`. De Task 1 — tipos y helpers.
- Produces: `NavSecciones({ activa }: { activa: "sala" | "red" })`; `VistaEspacios({ espacios, puertosDe, cubiculos, seleccionado, onAbrir })`; y en `lib/red/modelo.ts` las adiciones `ID_SALA_COMPUTACION` y `puertosDeEndpoint(estado, endpointId): Puerto[]`.

- [ ] **Step 1: Agregar los dos helpers al modelo**

Al final de `lib/red/modelo.ts`:

```ts
export const ID_SALA_COMPUTACION = "esp:sala-computacion";

export const puertosDeEndpoint = (estado: EstadoRed, endpointId: string) => enlacesDe(estado, endpointId)
  .map(enlace => (enlace.a === endpointId ? enlace.b : enlace.a))
  .filter(otro => prefijoDe(otro) === "pto")
  .map(id => estado.puertos.find(puerto => puerto.id === id))
  .filter((puerto): puerto is Puerto => Boolean(puerto));
```

- [ ] **Step 2: Escribir el componente de pestañas**

Crear `app/nav-secciones.tsx`:

```tsx
import Link from "next/link";

export default function NavSecciones({ activa }: { activa: "sala" | "red" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
    </nav>
  );
}
```

- [ ] **Step 3: Insertar las pestañas en la pestaña Sala**

En `app/page.tsx`, agregar el import junto a los que ya están:

```tsx
import NavSecciones from "./nav-secciones";
```

Y en la línea 310, cambiar el `div.brand` para que las pestañas queden a su derecha. El bloque completo queda:

```tsx
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Control de equipamiento</span></div><NavSecciones activa="sala" /></div>
```

- [ ] **Step 4: Escribir la vista de espacios**

Crear `app/red/vista-espacios.tsx`:

```tsx
import { etiquetasEstadoEspacio, ID_SALA_COMPUTACION, type Cubiculo, type Espacio, type Puerto } from "../../lib/red/modelo";

type Props = {
  espacios: Espacio[];
  puertosDe: (id: string) => Puerto[];
  etiquetaDePuerto: (id: string) => string;
  cubiculos: Cubiculo[];
  seleccionado: string;
  onAbrir: (id: string) => void;
};

export default function VistaEspacios({ espacios, puertosDe, etiquetaDePuerto, cubiculos, seleccionado, onAbrir }: Props) {
  if (!espacios.length) return <p className="empty-state">Ningún espacio coincide con el filtro.</p>;
  return (
    <div className="net-grid">
      {espacios.map(espacio => {
        const puertos = puertosDe(espacio.id);
        const esSalaComputacion = espacio.id === ID_SALA_COMPUTACION;
        return (
          <button key={espacio.id} className={`net-card ${espacio.estado} ${seleccionado === espacio.id ? "selected" : ""}`} onClick={() => onAbrir(espacio.id)} aria-label={`${espacio.nombre}, ${etiquetasEstadoEspacio[espacio.estado]}`}>
            <span className="net-card-name">{espacio.nombre}</span>
            {puertos.length ? <span className="net-card-port">{puertos.map(puerto => etiquetaDePuerto(puerto.id)).join(" · ")}</span> : <span className="net-card-port none">Sin puerto</span>}
            {esSalaComputacion && <span className="net-card-extra">{cubiculos.length} cubículos</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Escribir el shell de la ruta**

Crear `app/red/page.tsx`. Este archivo es el único con estado y llamadas de red de la pestaña:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import NavSecciones from "../nav-secciones";
import VistaEspacios from "./vista-espacios";
import { estadosEspacio, etiquetaPuerto, etiquetasEstadoEspacio, puertosDeEndpoint, type EstadoEspacio, type EstadoRed } from "../../lib/red/modelo";

const estadoVacio: EstadoRed = { racks: [], equipos: [], puertos: [], espacios: [], enlaces: [], bitacora: [], cubiculos: [] };

const cortosEstado: Record<EstadoEspacio, string> = { operativo: "OK", "solo-wifi": "≈", "sin-internet": "×", "sin-verificar": "?" };

const leerError = async (response: Response, respaldo: string) => {
  try {
    const datos = await response.json() as { error?: string };
    return datos.error || respaldo;
  } catch {
    return respaldo;
  }
};

export default function PaginaRed() {
  const [estado, setEstado] = useState<EstadoRed>(estadoVacio);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState<EstadoEspacio | "todos">("todos");
  const [consulta, setConsulta] = useState("");
  const [seleccionado, setSeleccionado] = useState("");
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [aviso, setAviso] = useState("");
  const [tipoAviso, setTipoAviso] = useState<"success" | "error">("success");

  const mostrarAviso = (mensaje: string, tipo: "success" | "error" = "success") => { setAviso(mensaje); setTipoAviso(tipo); };

  const cargar = async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const response = await fetch("/api/red");
      if (!response.ok) throw new Error(await leerError(response, "No fue posible cargar la red."));
      setEstado(await response.json() as EstadoRed);
      setUltimaSync(new Date());
    } catch (error) {
      setErrorCarga(`${error instanceof Error ? error.message : "No se pudo conectar con el almacenamiento."} Revisa la conexión e inténtalo nuevamente.`);
      mostrarAviso("No se pudieron cargar los datos de la red.", "error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(temporizador);
    // Carga inicial; los refrescos manuales llaman a cargar directamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conteos = useMemo(() => Object.fromEntries(estadosEspacio.map(valor => [valor, estado.espacios.filter(espacio => espacio.estado === valor).length])) as Record<EstadoEspacio, number>, [estado.espacios]);

  const puertosDe = (id: string) => puertosDeEndpoint(estado, id);
  const etiquetaDePuerto = (id: string) => etiquetaPuerto(estado, id);

  const pendientes = useMemo(() => {
    const endpoints = [...estado.espacios.map(espacio => espacio.id), ...estado.cubiculos.map(cubiculo => `cub:${cubiculo.id}`)];
    return {
      sinPuerto: endpoints.filter(id => !puertosDeEndpoint(estado, id).length).length,
      sinEtiqueta: estado.puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento").length,
      desconocidos: estado.puertos.filter(puerto => puerto.nota === "destino desconocido según canvas").length,
    };
  }, [estado]);

  const espaciosVisibles = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    return estado.espacios.filter(espacio => {
      if (filtro !== "todos" && espacio.estado !== filtro) return false;
      if (!texto) return true;
      const puertos = puertosDeEndpoint(estado, espacio.id).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" ");
      return `${espacio.nombre} ${espacio.categoria} ${puertos}`.toLowerCase().includes(texto);
    });
  }, [estado, filtro, consulta]);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Red del colegio</span></div><NavSecciones activa="red" /></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void cargar()} aria-label={cargando ? "Actualizando datos" : "Actualizar datos"} disabled={cargando}>{cargando ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{ultimaSync ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(ultimaSync) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {errorCarga && <div className="error-banner" role="alert"><span>{errorCarga}</span><button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Red del colegio</h1><p className="subtitle">{estado.racks.length} racks · {estado.puertos.filter(puerto => puerto.n > 0).length} puertos · {estado.espacios.length} espacios · {estado.cubiculos.length} cubículos.</p></div></div>

        <section className="status-rail" aria-label="Filtros y pendientes de la red">
          <div className="status-filters">
            {estadosEspacio.map(valor => <button key={valor} className={`status-filter ${valor === "operativo" ? "operational" : valor === "sin-internet" ? "offline" : valor === "solo-wifi" ? "attention" : "pending"} ${filtro === valor ? "active" : ""}`} aria-pressed={filtro === valor} onClick={() => setFiltro(filtro === valor ? "todos" : valor)}><i aria-hidden="true">{cortosEstado[valor]}</i><strong>{conteos[valor]}</strong><span>{etiquetasEstadoEspacio[valor]}</span></button>)}
          </div>
          <p className="pending-line"><span><strong>{pendientes.sinPuerto}</strong> sin puerto</span><span><strong>{pendientes.sinEtiqueta}</strong> puertos sin etiqueta</span><span><strong>{pendientes.desconocidos}</strong> destinos desconocidos</span></p>
        </section>

        <section className="room-surface">
          <div className="room-toolbar"><h2>Espacios del colegio</h2><label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar espacio o puerto</span><input value={consulta} aria-label="Buscar espacio o puerto" onChange={event => setConsulta(event.target.value)} placeholder="Buscar espacio o puerto" /></label></div>
          <div className={cargando ? "net-body is-loading" : "net-body"}>
            <VistaEspacios espacios={espaciosVisibles} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={setSeleccionado} />
          </div>
        </section>
      </section>

      {aviso && <div className={`toast ${tipoAviso}`} role={tipoAviso === "error" ? "alert" : "status"} aria-live="polite">{aviso}</div>}
    </main>
  );
}
```

- [ ] **Step 6: Agregar las clases de estilo**

Al final de `app/globals.css`, en el mismo estilo compacto del archivo:

```css
.net-tabs{display:flex;gap:2px;margin-left:18px}.net-tabs a{padding:7px 13px;font:700 10px var(--font-mono);letter-spacing:.09em;color:var(--muted);border-bottom:2px solid transparent;text-decoration:none}.net-tabs a:hover{color:var(--ink)}.net-tabs a.active{color:var(--ink);border-bottom-color:var(--ink)}
.net-body{padding:0 0 8px;transition:.2s}.net-body.is-loading{opacity:.5}
.net-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:6px}
.net-card{display:grid;gap:4px;text-align:left;min-height:62px;padding:9px 10px;border:1px solid #cfd5dc;border-radius:3px;background:var(--surface);color:var(--ink);transition:.16s}
.net-card:hover{border-color:var(--ink);transform:translateY(-1px)}.net-card.selected{outline:2px solid var(--ink);outline-offset:1px}
.net-card-name{font-size:12px;font-weight:800;line-height:1.25}
.net-card-port{font:700 9px var(--font-mono);color:var(--green)}.net-card-port.none{color:#9a6d00}
.net-card-extra{font-size:9px;color:var(--muted)}
.net-card.operativo{border-color:#a8cbbb}.net-card\.solo-wifi,.net-card.solo-wifi{border-color:#d7b969;background:#fffaf0}.net-card.sin-internet{border-color:#d9a5ac;background:#fff7f8}.net-card.sin-verificar{border-style:dashed}
@media(max-width:600px){.net-tabs{margin-left:0}.net-tabs a{padding:7px 9px}.net-grid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr))}}
```

- [ ] **Step 7: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores, y la salida del build lista la ruta `/red`.

- [ ] **Step 8: Comprobación manual**

Con `npm run dev`:

1. Abrir `http://localhost:3000` — la barra superior muestra `SALA · RED` con `SALA` subrayada, y **el plano de la sala sigue funcionando igual que antes** (abrir un cubículo, guardar, cerrar).
2. Hacer clic en `RED` — la URL cambia a `/red` y aparecen los 61 espacios con su semáforo, la mayoría con "Sin puerto".
3. La línea de pendientes muestra `99 sin puerto · 20 puertos sin etiqueta · 8 destinos desconocidos`.
4. Hacer clic en un contador del rail filtra la grilla; volver a hacer clic lo desactiva.
5. Escribir `mate` en el buscador deja solo `Salón de Matemáticas`.
6. `Sala Computación` muestra el distintivo `40 cubículos`.
7. Con el ancho de la ventana en 375 px la grilla sigue legible y la barra superior no se desborda.

- [ ] **Step 9: Commit**

```bash
git add app/nav-secciones.tsx app/red app/globals.css app/page.tsx lib/red/modelo.ts
git commit -m "Add the Red tab shell with section tabs and the spaces view"
```

---

### Task 8: Ficha en cajón con trazado, edición y asignación

**Files:**
- Create: `app/red/ficha.tsx`
- Modify: `app/red/page.tsx` (estado de selección, handlers de guardado y enlaces, montaje del cajón)
- Modify: `app/globals.css` (clases de la ficha)

**Interfaces:**
- Consumes: de Task 2 — `trazarCadena`, `cadenaComoTexto`. De Task 6 — `PUT /api/red`, `POST /api/red/enlaces`, `DELETE /api/red/enlaces`.
- Produces: `Ficha({ estado, endpointId, cadena, guardando, onCerrar, onGuardarCampos, onCrearEnlace, onBorrarEnlace })`, donde `onGuardarCampos(cambios: { estado?: string; nota?: string })`, `onCrearEnlace(puertoId: string, nota: string)` y `onBorrarEnlace(id: number)` devuelven `Promise<void>`.

- [ ] **Step 1: Escribir la ficha**

Crear `app/red/ficha.tsx`:

```tsx
import { useMemo, useState } from "react";
import { cadenaComoTexto, type Cadena } from "../../lib/red/trazado";
import { estadosEspacio, estadosPuerto, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, etiquetasEstadoPuerto, numeroCubiculo, prefijoDe, type EstadoRed } from "../../lib/red/modelo";

type Props = {
  estado: EstadoRed;
  endpointId: string;
  cadena: Cadena;
  guardando: boolean;
  onCerrar: () => void;
  onGuardarCampos: (cambios: { estado?: string; nota?: string }) => Promise<void>;
  onCrearEnlace: (puertoId: string, nota: string) => Promise<void>;
  onBorrarEnlace: (id: number) => Promise<void>;
};

export default function Ficha({ estado, endpointId, cadena, guardando, onCerrar, onGuardarCampos, onCrearEnlace, onBorrarEnlace }: Props) {
  const tipo = prefijoDe(endpointId);
  const espacio = estado.espacios.find(candidato => candidato.id === endpointId);
  const puerto = estado.puertos.find(candidato => candidato.id === endpointId);
  const cubiculo = tipo === "cub" ? estado.cubiculos.find(candidato => candidato.id === numeroCubiculo(endpointId)) : undefined;
  const [nota, setNota] = useState(espacio?.nota ?? puerto?.nota ?? "");
  const [notaRoseta, setNotaRoseta] = useState("");
  const [puertoElegido, setPuertoElegido] = useState("");
  const [copiado, setCopiado] = useState(false);

  const enlaces = estado.enlaces.filter(enlace => enlace.a === endpointId || enlace.b === endpointId);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo === endpointId);
  const librePara = useMemo(() => estado.puertos
    .filter(candidato => candidato.n > 0 && candidato.estado !== "dañado")
    .map(candidato => ({ id: candidato.id, etiqueta: `${etiquetaPuerto(estado, candidato.id)} · ${etiquetasEstadoPuerto[candidato.estado]}` })), [estado]);

  const copiar = async () => {
    await navigator.clipboard.writeText(cadenaComoTexto(cadena));
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };

  const asignar = async () => {
    if (!puertoElegido) return;
    await onCrearEnlace(puertoElegido, notaRoseta.trim());
    setPuertoElegido("");
    setNotaRoseta("");
  };

  const titulo = etiquetaEndpoint(estado, endpointId);
  const subtitulo = espacio ? (espacio.categoria === "sala" ? "Sala de clases" : "Oficina u otro espacio")
    : puerto ? `${estado.equipos.find(equipo => equipo.id === puerto.equipo)?.etiqueta ?? puerto.equipo} · rack ${estado.equipos.find(equipo => equipo.id === puerto.equipo)?.rack ?? ""}`
    : cubiculo ? `Sala de Enlace · ${cubiculo.inventoryCode || "sin código de inventario"}` : "";

  return (
    <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ficha-red-titulo">
      <div className="drawer-head">
        <div><span>{espacio ? "FICHA DE ESPACIO" : puerto ? "FICHA DE PUERTO" : "FICHA DE CUBÍCULO"}</span><h2 id="ficha-red-titulo">{titulo}</h2><small className="net-sub">{subtitulo}</small></div>
        <button onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="drawer-body">
        <div className="net-chain">
          <span className="net-label">CADENA HASTA EL BORDE</span>
          {cadena.saltos.length ? <ol>{cadena.saltos.map(salto => <li key={salto.id}><b>{salto.etiqueta}</b></li>)}</ol> : null}
          {!cadena.completa && <p className="net-chain-warn">{cadena.motivo}</p>}
          <button className="secondary" type="button" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar cadena"}</button>
        </div>

        {espacio && <label>Estado<select value={espacio.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosEspacio.map(valor => <option key={valor} value={valor}>{etiquetasEstadoEspacio[valor]}</option>)}</select></label>}
        {puerto && <label>Estado<select value={puerto.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosPuerto.map(valor => <option key={valor} value={valor}>{etiquetasEstadoPuerto[valor]}</option>)}</select></label>}

        {(espacio || puerto) && <label>Nota<textarea value={nota} maxLength={500} rows={3} onChange={event => setNota(event.target.value)} onBlur={() => void onGuardarCampos({ nota })} placeholder="Roseta, canalización, hallazgos en terreno…" /><small className="character-count">{nota.length}/500</small></label>}

        {cubiculo && <div className="net-kv"><div><span>IP</span><b>{cubiculo.ip || "sin registrar"}</b></div><div><span>MAC</span><b>{cubiculo.mac || "sin registrar"}</b></div><div><span>ESTADO</span><b>{cubiculo.status}</b></div></div>}
        {cubiculo && <a className="secondary net-link" href="/">Ver ficha completa en la pestaña Sala</a>}

        <div className="net-links">
          <span className="net-label">ENLACES</span>
          {enlaces.length ? enlaces.map(enlace => {
            const otro = enlace.a === endpointId ? enlace.b : enlace.a;
            return <div className="net-link-row" key={enlace.id}><span><b>{etiquetaEndpoint(estado, otro)}</b>{enlace.nota && <small>{enlace.nota}</small>}</span><button type="button" disabled={guardando} onClick={() => void onBorrarEnlace(enlace.id)} aria-label={`Quitar enlace con ${etiquetaEndpoint(estado, otro)}`}>Quitar</button></div>;
          }) : <p className="empty-state">Todavía sin enlaces.</p>}

          {tipo !== "pto" && <div className="net-assign">
            <label>Asignar a un puerto<select value={puertoElegido} disabled={guardando} onChange={event => setPuertoElegido(event.target.value)}><option value="">Elige un puerto…</option>{librePara.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.etiqueta}</option>)}</select></label>
            <label>Nota de la roseta<input value={notaRoseta} maxLength={200} onChange={event => setNotaRoseta(event.target.value)} placeholder="Ej: roseta junto a la pizarra" /></label>
            <button className="primary" type="button" disabled={guardando || !puertoElegido} onClick={() => void asignar()}>{guardando ? "Guardando…" : "Asignar"}</button>
          </div>}
        </div>

        <div className="net-log">
          <span className="net-label">BITÁCORA</span>
          {historial.length ? <ul>{historial.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues || entrada.nota}</li>)}</ul> : <p className="empty-state">Sin movimientos registrados.</p>}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Conectar la ficha al shell**

En `app/red/page.tsx`, agregar los imports:

```tsx
import Ficha from "./ficha";
import { trazarCadena } from "../../lib/red/trazado";
```

Agregar el estado y los handlers después de `mostrarAviso`:

```tsx
  const [guardando, setGuardando] = useState(false);

  const cadena = useMemo(() => trazarCadena(estado, seleccionado), [estado, seleccionado]);

  const conGuardado = async (accion: () => Promise<void>, exito: string) => {
    if (guardando) return;
    setGuardando(true);
    try {
      await accion();
      await cargar();
      mostrarAviso(exito);
    } catch (error) {
      mostrarAviso(error instanceof Error ? error.message : "No fue posible guardar el cambio.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const pedir = async (url: string, opciones: RequestInit, respaldo: string) => {
    const response = await fetch(url, opciones);
    if (!response.ok) throw new Error(await leerError(response, respaldo));
    return response;
  };

  const guardarCampos = (cambios: { estado?: string; nota?: string }) => conGuardado(async () => {
    const tipo = seleccionado.startsWith("esp:") ? "espacio" : "puerto";
    await pedir("/api/red", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, id: seleccionado, ...cambios }) }, "No fue posible guardar los cambios.");
  }, "Cambio guardado.");

  const crearEnlace = (puertoId: string, nota: string) => conGuardado(async () => {
    await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: seleccionado, b: puertoId, nota }) }, "No fue posible crear el enlace.");
  }, "Puerto asignado.");

  const borrarEnlace = (id: number) => conGuardado(async () => {
    await pedir(`/api/red/enlaces?id=${id}`, { method: "DELETE" }, "No fue posible quitar el enlace.");
  }, "Enlace quitado.");
```

Y montar el cajón justo antes del toast, al final del `return`:

```tsx
      {seleccionado && <Ficha estado={estado} endpointId={seleccionado} cadena={cadena} guardando={guardando} onCerrar={() => setSeleccionado("")} onGuardarCampos={guardarCampos} onCrearEnlace={crearEnlace} onBorrarEnlace={borrarEnlace} />}
      {seleccionado && <button className="backdrop" onClick={() => setSeleccionado("")} aria-label="Cerrar ficha" />}
```

- [ ] **Step 3: Cerrar el cajón con Escape y bloquear el scroll de fondo**

En `app/red/page.tsx`, agregar los dos efectos después del `useEffect` de carga. Replican el comportamiento que ya tiene la pestaña Sala:

```tsx
  useEffect(() => {
    if (!seleccionado) return;
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === "Escape") { evento.preventDefault(); setSeleccionado(""); } };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [seleccionado]);

  useEffect(() => {
    if (!seleccionado) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, [seleccionado]);
```

- [ ] **Step 4: Agregar los estilos de la ficha**

Al final de `app/globals.css`:

```css
.net-sub{display:block;margin-top:5px;color:var(--muted);font-size:11px;font-weight:600}
.net-label{display:block;margin-bottom:8px;color:var(--green);font:700 10px var(--font-mono);letter-spacing:.09em}
.net-chain{border-bottom:1px solid var(--line);padding-bottom:16px}
.net-chain ol{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:5px}
.net-chain li{display:flex;align-items:center;gap:8px;font:700 10px var(--font-mono)}
.net-chain li:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--green);flex:0 0 6px}
.net-chain-warn{margin:0 0 10px;color:#9a5c14;font-size:11px;line-height:1.5}
.net-kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.net-kv>div{display:flex;flex-direction:column;gap:3px}.net-kv span{font:700 8px var(--font-mono);letter-spacing:.1em;color:var(--muted)}.net-kv b{font:700 11px var(--font-mono)}
.net-link{display:inline-block;text-align:center;text-decoration:none;padding:11px 16px}
.net-links,.net-log{border-top:1px solid var(--line);padding-top:16px}
.net-link-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #ecedef;font-size:12px}
.net-link-row span{display:flex;flex-direction:column;gap:2px;min-width:0}.net-link-row small{color:var(--muted);font-size:10px}
.net-link-row button{border:0;background:none;color:var(--red);font-size:10px;font-weight:800}
.net-assign{display:grid;gap:10px;margin-top:12px;padding:12px;background:#f4f5f6;border-radius:6px}
.net-log ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.net-log li{font-size:10px;color:var(--muted);line-height:1.5}.net-log li b{color:var(--ink);font-family:var(--font-mono);font-size:9px}
@media(max-width:600px){.net-kv{grid-template-columns:1fr 1fr}}
```

- [ ] **Step 5: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 6: Comprobación manual**

Con `npm run dev`, en `/red`:

1. Abrir `UTP E. Básica` — el cajón muestra la cadena con al menos dos saltos y el enlace a `R2/PP1 p19` con su nota "según el canvas, sin verificar en terreno".
2. Abrir `4° Básico A` — la cadena dice "Sin puerto asignado todavía".
3. Asignar un puerto desde el selector: el aviso confirma, el cajón vuelve a cargar con el enlace, y la tarjeta de la grilla ya muestra el puerto.
4. Cambiar el estado a `Operativo`: la tarjeta cambia de color y aparece una entrada nueva en la bitácora de la ficha.
5. Escribir una nota y sacar el foco del campo: se guarda, y aparece una segunda entrada de tipo `nota`.
6. Pulsar *Copiar cadena* y pegar en un editor: sale la cadena con flechas.
7. *Quitar* el enlace: el puerto vuelve a quedar libre y la bitácora suma la entrada `enlace-borrado`.
8. `Escape` cierra el cajón; hacer clic en el fondo también.

- [ ] **Step 7: Commit**

```bash
git add app/red/ficha.tsx app/red/page.tsx app/globals.css
git commit -m "Add endpoint drawer with tracing, editing and port assignment"
```

---

### Task 9: Vista Racks — tiras de puertos y formato lista

**Files:**
- Create: `app/red/vista-racks.tsx`
- Modify: `app/red/page.tsx` (estado `vista`, segmentado, montaje de la vista)
- Modify: `app/globals.css` (clases de tiras y tabla)

**Interfaces:**
- Consumes: de Task 1 — `etiquetaPuerto`, `etiquetaEndpoint`, `etiquetasEstadoPuerto`, `prefijoDe`. De Task 2 — `trazarCadena`, `cadenaComoTexto`.
- Produces: `VistaRacks({ estado, rackActivo, onRack, formato, onFormato, seleccionado, onAbrir })`.

- [ ] **Step 1: Escribir la vista**

Crear `app/red/vista-racks.tsx`. La cadena solo se calcula para los puertos del rack visible, memoizada: recorrer los 324 en cada render es innecesario.

```tsx
import { useMemo } from "react";
import { cadenaComoTexto, trazarCadena } from "../../lib/red/trazado";
import { etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoPuerto, prefijoDe, type EstadoRed } from "../../lib/red/modelo";

type Props = {
  estado: EstadoRed;
  rackActivo: string;
  onRack: (id: string) => void;
  formato: "tiras" | "lista";
  onFormato: (formato: "tiras" | "lista") => void;
  seleccionado: string;
  onAbrir: (id: string) => void;
};

export default function VistaRacks({ estado, rackActivo, onRack, formato, onFormato, seleccionado, onAbrir }: Props) {
  const equipos = estado.equipos.filter(equipo => equipo.rack === rackActivo && equipo.puertos > 0).sort((a, b) => a.y - b.y);
  const puertosDelRack = useMemo(() => estado.puertos.filter(puerto => equipos.some(equipo => equipo.id === puerto.equipo)), [estado.puertos, equipos]);

  const destinos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const enlace of estado.enlaces) {
      const pares: [string, string][] = [[enlace.a, enlace.b], [enlace.b, enlace.a]];
      for (const [uno, otro] of pares) {
        if (prefijoDe(uno) !== "pto" || prefijoDe(otro) === "pto") continue;
        mapa.set(uno, etiquetaEndpoint(estado, otro));
      }
    }
    return mapa;
  }, [estado]);

  const cadenas = useMemo(() => {
    if (formato !== "lista") return new Map<string, string>();
    return new Map(puertosDelRack.map(puerto => [puerto.id, cadenaComoTexto(trazarCadena(estado, puerto.id))]));
  }, [estado, formato, puertosDelRack]);

  return (
    <div className="net-racks">
      <div className="net-racks-bar">
        <div className="net-seg" role="group" aria-label="Rack">
          {estado.racks.map(rack => <button key={rack.id} className={rackActivo === rack.id ? "on" : ""} aria-pressed={rackActivo === rack.id} onClick={() => onRack(rack.id)}>{rack.id}</button>)}
        </div>
        <div className="net-seg" role="group" aria-label="Formato">
          <button className={formato === "tiras" ? "on" : ""} aria-pressed={formato === "tiras"} onClick={() => onFormato("tiras")}>TIRAS</button>
          <button className={formato === "lista" ? "on" : ""} aria-pressed={formato === "lista"} onClick={() => onFormato("lista")}>LISTA</button>
        </div>
      </div>

      <p className="net-rack-name">{estado.racks.find(rack => rack.id === rackActivo)?.nombre}{estado.racks.find(rack => rack.id === rackActivo)?.notas ? <small>{estado.racks.find(rack => rack.id === rackActivo)?.notas}</small> : null}</p>

      {formato === "tiras" ? equipos.map(equipo => {
        const puertos = puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
        const ocupados = puertos.filter(puerto => puerto.estado === "ocupado").length;
        return (
          <section className="net-eq" key={equipo.id} aria-label={equipo.etiqueta}>
            <div className="net-eq-head"><b>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</b><small>{ocupados} de {puertos.length} ocupados{equipo.modelo ? ` · ${equipo.modelo}` : ""}</small></div>
            <div className="net-strip">
              {puertos.map(puerto => <button key={puerto.id} className={`net-pt ${puerto.estado} ${seleccionado === puerto.id ? "selected" : ""}`} onClick={() => onAbrir(puerto.id)} title={`${etiquetaPuerto(estado, puerto.id)} · ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? ` · ${destinos.get(puerto.id)}` : ""}`} aria-label={`Puerto ${puerto.n}, ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? `, ${destinos.get(puerto.id)}` : ""}`}>{puerto.n}</button>)}
            </div>
          </section>
        );
      }) : (
        <div className="net-table-wrap">
          <table className="net-table">
            <thead><tr><th>PUERTO</th><th>ESTADO</th><th>DESTINO</th><th>CADENA HASTA EL BORDE</th></tr></thead>
            <tbody>
              {equipos.map(equipo => [
                <tr className="net-group" key={equipo.id}><td colSpan={4}>{equipo.id.replace("-", "/")} · {equipo.etiqueta} · {equipo.puertos} puertos</td></tr>,
                ...puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n).map(puerto => (
                  <tr key={puerto.id} className={seleccionado === puerto.id ? "selected" : ""} onClick={() => onAbrir(puerto.id)} tabIndex={0} onKeyDown={evento => { if (evento.key === "Enter") onAbrir(puerto.id); }}>
                    <td>{etiquetaPuerto(estado, puerto.id)}</td>
                    <td>{etiquetasEstadoPuerto[puerto.estado]}</td>
                    <td>{destinos.get(puerto.id) ?? <span className="net-none">sin asignar</span>}</td>
                    <td className="net-mono">{cadenas.get(puerto.id)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar el segmentado de vistas al shell**

En `app/red/page.tsx`, agregar el import y el estado:

```tsx
import VistaRacks from "./vista-racks";
```

```tsx
  const [vista, setVista] = useState<"espacios" | "racks">("espacios");
  const [rackActivo, setRackActivo] = useState("");
  const [formatoRacks, setFormatoRacks] = useState<"tiras" | "lista">("tiras");

  useEffect(() => {
    if (!rackActivo && estado.racks.length) setRackActivo(estado.racks[0].id);
  }, [estado.racks, rackActivo]);
```

Reemplazar el bloque `<div className="room-toolbar">…</div>` y el cuerpo por:

```tsx
          <div className="room-toolbar">
            <h2>{vista === "espacios" ? "Espacios del colegio" : "Racks y puertos"}</h2>
            <div className="net-toolbar-right">
              <div className="net-seg" role="group" aria-label="Vista">
                <button className={vista === "espacios" ? "on" : ""} aria-pressed={vista === "espacios"} onClick={() => setVista("espacios")}>ESPACIOS</button>
                <button className={vista === "racks" ? "on" : ""} aria-pressed={vista === "racks"} onClick={() => setVista("racks")}>RACKS</button>
              </div>
              <label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar espacio o puerto</span><input value={consulta} aria-label="Buscar espacio o puerto" onChange={event => setConsulta(event.target.value)} placeholder="Buscar espacio o puerto" /></label>
            </div>
          </div>
          <div className={cargando ? "net-body is-loading" : "net-body"}>
            {vista === "espacios"
              ? <VistaEspacios espacios={espaciosVisibles} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={setSeleccionado} />
              : <VistaRacks estado={estado} rackActivo={rackActivo} onRack={setRackActivo} formato={formatoRacks} onFormato={setFormatoRacks} seleccionado={seleccionado} onAbrir={setSeleccionado} />}
          </div>
```

- [ ] **Step 3: Agregar los estilos**

Al final de `app/globals.css`:

```css
.net-toolbar-right{display:flex;align-items:center;gap:10px}
.net-seg{display:inline-flex;border:1px solid var(--line);border-radius:5px;overflow:hidden;background:var(--surface)}
.net-seg button{border:0;background:transparent;padding:9px 12px;font:700 9px var(--font-mono);letter-spacing:.08em;color:var(--muted)}
.net-seg button.on{background:var(--ink);color:#fff}
.net-racks-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px}
.net-rack-name{margin:0 0 14px;font:700 11px var(--font-mono);color:var(--ink)}.net-rack-name small{display:block;margin-top:4px;color:var(--muted);font-family:var(--font-manrope);font-size:10px;font-weight:600;white-space:pre-line}
.net-eq{margin-bottom:14px}
.net-eq-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:5px}
.net-eq-head b{font:700 10px var(--font-mono)}.net-eq-head small{color:var(--muted);font-size:10px}
.net-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(26px,1fr));gap:3px}
.net-pt{height:26px;border:1px solid #cfd5dc;border-radius:2px;background:var(--surface);font:700 9px var(--font-mono);color:var(--muted);padding:0}
.net-pt:hover{border-color:var(--ink);color:var(--ink)}
.net-pt.ocupado{background:var(--green);border-color:var(--green);color:#fff}
.net-pt.desconocido{background:#f1f3f5;border-style:dashed;color:#9aa3af}
.net-pt.dañado{background:#f6dfe2;border-color:var(--red);color:var(--red)}
.net-pt.selected{outline:2px solid var(--ink);outline-offset:1px}
.net-table-wrap{overflow-x:auto}
.net-table{width:100%;border-collapse:collapse;font-size:11px}
.net-table th{text-align:left;font:700 8px var(--font-mono);letter-spacing:.09em;color:var(--muted);border-bottom:1px solid var(--line);padding:7px 8px;white-space:nowrap}
.net-table td{padding:6px 8px;border-bottom:1px solid #edeff2}
.net-table tbody tr:hover{background:#f7f8f9;cursor:pointer}
.net-table tr.selected{background:#eaf0f7}
.net-table tr.net-group td{background:#f4f6f8;font:700 8px var(--font-mono);letter-spacing:.06em}
.net-table .net-mono{font-family:var(--font-mono);font-size:9px;color:var(--muted)}
.net-none{color:#9a6d00}
@media(max-width:600px){.net-toolbar-right{align-items:stretch;flex-direction:column}.net-racks-bar{flex-wrap:wrap}.net-strip{grid-template-columns:repeat(auto-fit,minmax(32px,1fr))}.net-pt{height:34px}}
```

- [ ] **Step 4: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Comprobación manual**

Con `npm run dev`, en `/red`:

1. Cambiar a `RACKS`: aparece Rack 1 con su patch panel y su switch, con las tiras de puertos numeradas.
2. Los puertos ocupados salen en azul, los sin etiqueta con borde punteado.
3. Pasar el cursor por un puerto ocupado muestra su destino en el tooltip.
4. Hacer clic en un puerto abre su ficha con la cadena, el equipo y el rack.
5. Cambiar a `R2` y `R3`: cada rack muestra sus equipos ordenados de arriba abajo. Rack 3 muestra la nota del segmento IP bajo el nombre.
6. Cambiar a `LISTA`: la tabla agrupa por equipo y muestra destino y cadena. Hacer clic en una fila abre la ficha.
7. Con la ventana a 375 px la tabla scrollea horizontalmente sin desbordar la página.

- [ ] **Step 6: Commit**

```bash
git add app/red/vista-racks.tsx app/red/page.tsx app/globals.css
git commit -m "Add racks view with port strips and dense list format"
```

---

### Task 10: Modal de captura rápida

**Files:**
- Create: `app/red/captura.tsx`
- Modify: `app/red/page.tsx` (asignación optimista, sesión de captura, botón de apertura)
- Modify: `app/globals.css` (clases del modal de captura)

**Interfaces:**
- Consumes: de Task 6 — `POST /api/red/enlaces`, `DELETE /api/red/enlaces?id=`, `PUT /api/red`.
- Produces: `Captura({ estado, sesion, onCerrar, onAsignar, onMarcarLibre, onDeshacer })`, donde `onAsignar(endpointId: string, puertoId: string): void` es **no bloqueante** (dispara la petición y retorna), `onMarcarLibre(puertoId: string): void` también, y `onDeshacer(enlaceId: number): void` revierte una fila de la sesión.

**Reglas de esta tarea:**
- El cursor avanza **antes** de que la petición responda. Si falla, el aviso lo informa y el estado se resincroniza; el foco no se mueve del campo.
- El autocompletado busca sobre los 61 espacios **y** los 40 cubículos, y marca cuando el destino ya tiene puerto.
- `Enter` asigna y avanza · `Tab` salta · `Ctrl+Z` deshace la última · `Esc` cierra.

- [ ] **Step 1: Escribir el modal**

Crear `app/red/captura.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { etiquetaPuerto, etiquetasEstadoPuerto, puertosDeEndpoint, type EstadoRed } from "../../lib/red/modelo";

export type FilaSesion = { enlaceId: number; texto: string };

type Props = {
  estado: EstadoRed;
  sesion: FilaSesion[];
  puertoInicial: string;
  onCerrar: () => void;
  onAsignar: (endpointId: string, puertoId: string) => void;
  onMarcarLibre: (puertoId: string) => void;
  onDeshacer: (enlaceId: number) => void;
};

type Candidato = { id: string; nombre: string; grupo: string; puerto: string };

export default function Captura({ estado, sesion, puertoInicial, onCerrar, onAsignar, onMarcarLibre, onDeshacer }: Props) {
  const [sentido, setSentido] = useState<"puerto" | "endpoint">("puerto");
  const [equipoId, setEquipoId] = useState(() => puertoInicial ? estado.puertos.find(puerto => puerto.id === puertoInicial)?.equipo ?? "" : "");
  const [indicePuerto, setIndicePuerto] = useState(0);
  const [indiceEndpoint, setIndiceEndpoint] = useState(0);
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  const equipos = useMemo(() => estado.equipos.filter(equipo => equipo.puertos > 0), [estado.equipos]);
  useEffect(() => { if (!equipoId && equipos.length) setEquipoId(equipos[0].id); }, [equipoId, equipos]);

  const puertosDelEquipo = useMemo(() => estado.puertos.filter(puerto => puerto.equipo === equipoId).sort((a, b) => a.n - b.n), [estado.puertos, equipoId]);
  const puertoActual = puertosDelEquipo[indicePuerto];

  const candidatos = useMemo<Candidato[]>(() => [
    ...estado.espacios.map(espacio => ({ id: espacio.id, nombre: espacio.nombre, grupo: espacio.categoria === "sala" ? "SALA" : "OFICINA", puerto: puertosDeEndpoint(estado, espacio.id).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" · ") })),
    ...estado.cubiculos.map(cubiculo => ({ id: `cub:${cubiculo.id}`, nombre: `Cubículo ${cubiculo.id}`, grupo: "CUBÍCULO", puerto: puertosDeEndpoint(estado, `cub:${cubiculo.id}`).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" · ") })),
  ], [estado]);

  const pendientes = useMemo(() => candidatos.filter(candidato => !candidato.puerto), [candidatos]);
  const endpointActual = pendientes[indiceEndpoint];

  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const coincidencias = useMemo(() => {
    const buscado = normalizar(texto.trim());
    if (!buscado) return [] as Candidato[];
    return candidatos.filter(candidato => normalizar(candidato.nombre).includes(buscado)).slice(0, 6);
  }, [candidatos, texto]);

  const coincidenciasPuerto = useMemo(() => {
    const buscado = normalizar(texto.trim().replace(/\s+/g, ""));
    if (!buscado) return [] as { id: string; etiqueta: string; estado: string }[];
    return estado.puertos
      .filter(puerto => puerto.n > 0 && normalizar(etiquetaPuerto(estado, puerto.id).replace(/[\s/]/g, "")).includes(buscado.replace(/[/]/g, "")))
      .slice(0, 6)
      .map(puerto => ({ id: puerto.id, etiqueta: etiquetaPuerto(estado, puerto.id), estado: etiquetasEstadoPuerto[puerto.estado] }));
  }, [estado, texto]);

  const opciones = sentido === "puerto" ? coincidencias.map(item => ({ id: item.id, principal: item.nombre, secundario: item.grupo, aviso: item.puerto ? `ya en ${item.puerto}` : "" })) : coincidenciasPuerto.map(item => ({ id: item.id, principal: item.etiqueta, secundario: item.estado, aviso: "" }));

  useEffect(() => { setResaltado(0); }, [texto, sentido]);
  useEffect(() => { campo.current?.focus(); }, [sentido, indicePuerto, indiceEndpoint]);

  const avanzar = () => {
    setTexto("");
    if (sentido === "puerto") setIndicePuerto(indice => Math.min(indice + 1, Math.max(puertosDelEquipo.length - 1, 0)));
    else setIndiceEndpoint(indice => Math.min(indice + 1, Math.max(pendientes.length - 1, 0)));
  };

  const confirmar = () => {
    const elegida = opciones[resaltado];
    if (!elegida) return;
    if (sentido === "puerto") { if (!puertoActual) return; onAsignar(elegida.id, puertoActual.id); }
    else { if (!endpointActual) return; onAsignar(endpointActual.id, elegida.id); }
    avanzar();
  };

  const alTeclear = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "Enter") { evento.preventDefault(); confirmar(); }
    if (evento.key === "Tab") { evento.preventDefault(); avanzar(); }
    if (evento.key === "ArrowDown") { evento.preventDefault(); setResaltado(indice => Math.min(indice + 1, Math.max(opciones.length - 1, 0))); }
    if (evento.key === "ArrowUp") { evento.preventDefault(); setResaltado(indice => Math.max(indice - 1, 0)); }
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "z") { evento.preventDefault(); if (sesion[0]) onDeshacer(sesion[0].enlaceId); }
    if (evento.key === "Escape") { evento.preventDefault(); onCerrar(); }
  };

  const asignadosDelEquipo = puertosDelEquipo.filter(puerto => puerto.estado === "ocupado").length;

  return (
    <div className="net-capture-wrap" role="dialog" aria-modal="true" aria-labelledby="captura-titulo">
      <div className="net-capture">
        <div className="modal-head">
          <div>
            <span>CAPTURA RÁPIDA</span>
            <h2 id="captura-titulo">{sentido === "puerto" ? "Recorrer el panel puerto por puerto" : "Recorrer los pendientes espacio por espacio"}</h2>
            <p>{sentido === "puerto" ? "Prueba el puerto, escribe dónde llega y pasa al siguiente." : "La cola de pendientes manda: escribe el puerto que le corresponde."}</p>
            <div className="net-seg" role="group" aria-label="Sentido de captura">
              <button className={sentido === "puerto" ? "on" : ""} aria-pressed={sentido === "puerto"} onClick={() => setSentido("puerto")}>DESDE EL PUERTO</button>
              <button className={sentido === "endpoint" ? "on" : ""} aria-pressed={sentido === "endpoint"} onClick={() => setSentido("endpoint")}>DESDE EL ESPACIO</button>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar captura">×</button>
        </div>

        <div className="net-capture-body">
          {sentido === "puerto" && <label className="net-capture-equipo">Equipo<select value={equipoId} onChange={event => { setEquipoId(event.target.value); setIndicePuerto(0); }}>{equipos.map(equipo => <option key={equipo.id} value={equipo.id}>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</option>)}</select></label>}

          {sentido === "puerto" && <div className="net-strip net-capture-strip">
            {puertosDelEquipo.map((puerto, indice) => <button key={puerto.id} className={`net-pt ${puerto.estado} ${indice === indicePuerto ? "selected" : ""}`} onClick={() => { setIndicePuerto(indice); setTexto(""); }} aria-label={`Ir al puerto ${puerto.n}`}>{puerto.n}</button>)}
          </div>}

          <div className="net-capture-target">
            <div>
              <div className="net-capture-big">{sentido === "puerto" ? (puertoActual ? etiquetaPuerto(estado, puertoActual.id) : "Sin puertos") : (endpointActual ? endpointActual.nombre : "No queda nada pendiente")}</div>
              <div className="net-capture-where">{sentido === "puerto"
                ? `${estado.equipos.find(equipo => equipo.id === equipoId)?.etiqueta ?? ""} · ${puertoActual ? etiquetasEstadoPuerto[puertoActual.estado] : ""}`
                : (endpointActual ? `${endpointActual.grupo} · sin puerto asignado` : "Los 101 puntos tienen puerto")}</div>
            </div>
            <div className="net-capture-prog"><b>{sesion.length}</b> asignados en esta sesión<span>{sentido === "puerto" ? `${asignadosDelEquipo} de ${puertosDelEquipo.length} ocupados en este equipo` : `${pendientes.length} pendientes`}</span></div>
          </div>

          <div className="net-capture-field">
            <label htmlFor="captura-campo">{sentido === "puerto" ? "¿Qué llega a este puerto?" : "¿A qué puerto llega su roseta?"}</label>
            <input id="captura-campo" ref={campo} value={texto} autoComplete="off" onChange={event => setTexto(event.target.value)} onKeyDown={alTeclear} placeholder={sentido === "puerto" ? "Ej: 3 básico b, cubículo 12" : "Ej: r2/pp1/15"} />
            {opciones.length > 0 && <ul className="net-capture-ac" role="listbox">
              {opciones.map((opcion, indice) => <li key={opcion.id} role="option" aria-selected={indice === resaltado} className={indice === resaltado ? "hl" : ""} onMouseDown={event => { event.preventDefault(); setResaltado(indice); confirmar(); }}>
                <span>{opcion.principal}</span><small>{opcion.secundario}</small>{opcion.aviso && <em>{opcion.aviso}</em>}
              </li>)}
            </ul>}
          </div>

          {sesion.length > 0 && <div className="net-capture-done">
            <span className="net-label">EN ESTA SESIÓN</span>
            <ul>{sesion.map(fila => <li key={fila.enlaceId}><span>{fila.texto}</span><button type="button" onClick={() => onDeshacer(fila.enlaceId)}>deshacer</button></li>)}</ul>
          </div>}
        </div>

        <div className="net-capture-foot">
          <div className="net-hints"><span><kbd>↵</kbd> asignar y siguiente</span><span><kbd>tab</kbd> saltar</span><span><kbd>ctrl</kbd>+<kbd>z</kbd> deshacer</span><span><kbd>esc</kbd> salir</span></div>
          <div className="net-capture-actions">
            {sentido === "puerto" && <button className="secondary" type="button" disabled={!puertoActual} onClick={() => { if (puertoActual) onMarcarLibre(puertoActual.id); avanzar(); }}>Marcar sin uso</button>}
            <button className="primary" type="button" disabled={!opciones.length} onClick={confirmar}>Asignar</button>
          </div>
        </div>
      </div>
      <button className="backdrop" onClick={onCerrar} aria-label="Cerrar captura" />
    </div>
  );
}
```

- [ ] **Step 2: Conectar la captura al shell con asignación optimista**

En `app/red/page.tsx`, agregar el import y el estado:

```tsx
import Captura, { type FilaSesion } from "./captura";
import { etiquetaEndpoint, type Enlace } from "../../lib/red/modelo";
```

(`etiquetaEndpoint` y `Enlace` se suman a los que ya se importan de `modelo`.)

```tsx
  const [capturaAbierta, setCapturaAbierta] = useState(false);
  const [sesion, setSesion] = useState<FilaSesion[]>([]);
```

Y los handlers, que **no bloquean** el avance del cursor:

```tsx
  const asignarRapido = (endpointId: string, puertoId: string) => {
    const provisional = -Date.now();
    const texto = `${etiquetaEndpoint(estado, endpointId)} → ${etiquetaPuerto(estado, puertoId)}`;
    setEstado(actual => ({
      ...actual,
      enlaces: [...actual.enlaces, { id: provisional, a: endpointId, b: puertoId, tipo: "roseta", nota: "" }],
      puertos: actual.puertos.map(puerto => puerto.id === puertoId && puerto.estado === "libre" ? { ...puerto, estado: "ocupado" } : puerto),
    }));
    void (async () => {
      try {
        const response = await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: endpointId, b: puertoId }) }, "No fue posible asignar el puerto.");
        const { enlace } = await response.json() as { enlace: Enlace };
        setEstado(actual => ({ ...actual, enlaces: actual.enlaces.map(candidato => candidato.id === provisional ? enlace : candidato) }));
        setSesion(actual => [{ enlaceId: enlace.id, texto }, ...actual]);
      } catch (error) {
        setEstado(actual => ({ ...actual, enlaces: actual.enlaces.filter(candidato => candidato.id !== provisional) }));
        mostrarAviso(`${error instanceof Error ? error.message : "No fue posible asignar el puerto."} (${texto})`, "error");
        void cargar();
      }
    })();
  };

  const marcarLibre = (puertoId: string) => {
    void (async () => {
      try {
        await pedir("/api/red", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "puerto", id: puertoId, estado: "libre" }) }, "No fue posible marcar el puerto.");
        setEstado(actual => ({ ...actual, puertos: actual.puertos.map(puerto => puerto.id === puertoId ? { ...puerto, estado: "libre" } : puerto) }));
      } catch (error) {
        mostrarAviso(error instanceof Error ? error.message : "No fue posible marcar el puerto.", "error");
        void cargar();
      }
    })();
  };

  const deshacerAsignacion = (enlaceId: number) => {
    void (async () => {
      try {
        await pedir(`/api/red/enlaces?id=${enlaceId}`, { method: "DELETE" }, "No fue posible deshacer la asignación.");
        setSesion(actual => actual.filter(fila => fila.enlaceId !== enlaceId));
        await cargar();
      } catch (error) {
        mostrarAviso(error instanceof Error ? error.message : "No fue posible deshacer la asignación.", "error");
      }
    })();
  };
```

Agregar el botón en `workspace-head` (queda igual al patrón de "Administrar checklist" de la Sala):

```tsx
        <div className="workspace-head"><div><h1>Red del colegio</h1><p className="subtitle">{estado.racks.length} racks · {estado.puertos.filter(puerto => puerto.n > 0).length} puertos · {estado.espacios.length} espacios · {estado.cubiculos.length} cubículos.</p></div><button className="secondary toolbar-action" onClick={() => setCapturaAbierta(true)}>Captura rápida</button></div>
```

Y montar el modal antes del toast:

```tsx
      {capturaAbierta && <Captura estado={estado} sesion={sesion} puertoInicial={seleccionado.startsWith("pto:") ? seleccionado : ""} onCerrar={() => setCapturaAbierta(false)} onAsignar={asignarRapido} onMarcarLibre={marcarLibre} onDeshacer={deshacerAsignacion} />}
```

- [ ] **Step 3: Agregar los estilos**

Al final de `app/globals.css`:

```css
.net-capture-wrap{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px}
.net-capture{position:relative;z-index:2;width:min(660px,94vw);max-height:92dvh;display:flex;flex-direction:column;background:var(--surface);border-radius:8px;box-shadow:0 18px 40px #14251d4a;overflow:hidden}
.net-capture .modal-head p{margin:6px 0 10px}
.net-capture-body{padding:16px 18px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.net-capture-equipo{display:flex;flex-direction:column;gap:7px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.net-capture-equipo select{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-size:12px;text-transform:none;letter-spacing:0}
.net-capture-strip{grid-template-columns:repeat(auto-fit,minmax(24px,1fr))}
.net-capture-target{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;border-top:1px solid var(--line);padding-top:14px}
.net-capture-big{font:700 24px var(--font-mono);letter-spacing:-.02em;line-height:1.1}
.net-capture-where{margin-top:5px;color:var(--muted);font-size:11px}
.net-capture-prog{text-align:right;color:var(--muted);font-size:10px}.net-capture-prog b{display:block;font:700 18px var(--font-mono);color:var(--ink)}.net-capture-prog span{display:block;margin-top:3px}
.net-capture-field{position:relative;display:flex;flex-direction:column;gap:7px}
.net-capture-field label{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.net-capture-field input{border:1px solid var(--green);box-shadow:0 0 0 3px #294f7c1a;border-radius:6px;padding:12px 13px;font-size:15px;font-weight:700;outline:0}
.net-capture-ac{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:6px;background:var(--surface);box-shadow:0 8px 18px #16223318;max-height:210px;overflow:auto}
.net-capture-ac li{display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:1px solid #f0f2f4;font-size:12px;cursor:pointer}
.net-capture-ac li.hl{background:#eaf0f7;font-weight:800}
.net-capture-ac small{font:700 8px var(--font-mono);letter-spacing:.08em;color:var(--muted)}
.net-capture-ac em{margin-left:auto;font-style:normal;color:#9a6d00;font-size:10px;font-weight:700}
.net-capture-done ul{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:4px}
.net-capture-done li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 9px;background:#f7f8f9;border-radius:4px;font-size:11px}
.net-capture-done button{border:0;background:none;color:var(--green);font-size:10px;font-weight:800}
.net-capture-foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#f4f5f6;border-top:1px solid var(--line)}
.net-hints{display:flex;flex-wrap:wrap;gap:10px;color:var(--muted);font-size:10px}
.net-hints kbd{background:var(--surface);border:1px solid var(--line);border-bottom-width:2px;border-radius:3px;padding:2px 5px;font:700 9px var(--font-mono);color:var(--ink)}
.net-capture-actions{display:flex;gap:8px}
@media(max-width:600px){.net-capture-wrap{padding:0}.net-capture{width:100%;max-height:100dvh;height:100dvh;border-radius:0}.net-capture-target{flex-direction:column;align-items:flex-start}.net-capture-prog{text-align:left}.net-capture-field input{font-size:16px}.net-capture-foot{flex-direction:column;align-items:stretch}.net-capture-actions button{flex:1;min-height:48px}}
```

- [ ] **Step 4: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Comprobación manual del ritmo**

Con `npm run dev`, en `/red`, botón *Captura rápida*:

1. El modal abre con el foco en el campo y el primer puerto del primer equipo como objetivo.
2. Escribir `3 bas` muestra hasta 6 coincidencias; `3° Básico A` aparece con el aviso `ya en …` si ya tiene puerto.
3. `Enter` asigna, el campo se limpia, el objetivo salta al puerto siguiente **sin esperar** a la respuesta, y la fila aparece en "En esta sesión".
4. Asignar cinco seguidos solo con teclado, sin tocar el mouse: contador en 5.
5. `Ctrl+Z` deshace la última: desaparece de la sesión y el puerto vuelve a libre.
6. `Tab` salta un puerto sin asignar nada. `Marcar sin uso` deja el puerto libre y avanza.
7. Cambiar a `DESDE EL ESPACIO`: el objetivo pasa a ser el primer pendiente y el campo ahora autocompleta puertos (`r2/pp1/1`).
8. Provocar un error: asignar el mismo espacio a dos puertos distintos está permitido (rosetas múltiples), pero repetir exactamente el mismo par debe fallar con el aviso rojo `Ese enlace ya existe.` y el cursor no se mueve de lugar.
9. `Esc` cierra el modal. Reabrirlo conserva la lista de la sesión.

- [ ] **Step 6: Commit**

```bash
git add app/red/captura.tsx app/red/page.tsx app/globals.css
git commit -m "Add keyboard-first bulk assignment modal"
```

---

### Task 11: Vista Cobertura y buscador con cadena

**Files:**
- Create: `app/red/vista-cobertura.tsx`
- Modify: `app/red/page.tsx` (opción del segmentado, franja de resultado del buscador)
- Modify: `app/globals.css` (clases de cobertura y de la franja)

**Interfaces:**
- Consumes: de Task 1 — `puertosDeEndpoint`, `etiquetaEndpoint`, `etiquetaPuerto`, `estadosPuerto`. De Task 2 — `trazarCadena`, `cadenaComoTexto`.
- Produces: `VistaCobertura({ estado, onAbrir })`.

- [ ] **Step 1: Escribir la vista**

Crear `app/red/vista-cobertura.tsx`:

```tsx
import { useMemo } from "react";
import { estadosPuerto, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoPuerto, puertosDeEndpoint, type EstadoRed } from "../../lib/red/modelo";

type Props = { estado: EstadoRed; onAbrir: (id: string) => void };

export default function VistaCobertura({ estado, onAbrir }: Props) {
  const resumen = useMemo(() => {
    const endpoints = [
      ...estado.espacios.map(espacio => ({ id: espacio.id, nombre: espacio.nombre, grupo: espacio.categoria === "sala" ? "Salas" : "Oficinas" })),
      ...estado.cubiculos.map(cubiculo => ({ id: `cub:${cubiculo.id}`, nombre: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
    ];
    const sinPuerto = endpoints.filter(endpoint => !puertosDeEndpoint(estado, endpoint.id).length);
    return {
      total: endpoints.length,
      asignados: endpoints.length - sinPuerto.length,
      sinPuerto,
      sinEtiqueta: estado.puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento"),
      desconocidos: estado.puertos.filter(puerto => puerto.nota === "destino desconocido según canvas"),
      revisar: estado.bitacora.filter(entrada => entrada.tipo === "revisar"),
    };
  }, [estado]);

  const porRack = useMemo(() => estado.racks.map(rack => {
    const puertos = estado.puertos.filter(puerto => puerto.n > 0 && estado.equipos.some(equipo => equipo.id === puerto.equipo && equipo.rack === rack.id));
    return { rack, total: puertos.length, porEstado: estadosPuerto.map(valor => ({ valor, cuantos: puertos.filter(puerto => puerto.estado === valor).length })) };
  }), [estado]);

  const porcentaje = resumen.total ? Math.round((resumen.asignados / resumen.total) * 100) : 0;
  const cambios = estado.bitacora.filter(entrada => entrada.tipo !== "revisar").slice(0, 50);

  return (
    <div className="net-cov">
      <section className="net-cov-top">
        <div>
          <span className="net-label">AVANCE DEL LEVANTAMIENTO</span>
          <p className="net-cov-big"><b>{resumen.asignados}</b> de {resumen.total} puntos con puerto asignado</p>
          <div className="net-bar" role="img" aria-label={`${porcentaje} por ciento asignado`}><i style={{ width: `${porcentaje}%` }} /></div>
        </div>
        <ul className="net-cov-nums">
          <li><b>{resumen.sinPuerto.length}</b><span>sin puerto</span></li>
          <li><b>{resumen.sinEtiqueta.length}</b><span>puertos sin etiqueta</span></li>
          <li><b>{resumen.desconocidos.length}</b><span>destinos desconocidos</span></li>
          <li><b>{resumen.revisar.length}</b><span>casos por revisar</span></li>
        </ul>
      </section>

      <section className="net-cov-racks">
        <span className="net-label">PUERTOS POR RACK</span>
        <table className="net-table">
          <thead><tr><th>RACK</th><th>TOTAL</th>{estadosPuerto.map(valor => <th key={valor}>{etiquetasEstadoPuerto[valor].toUpperCase()}</th>)}</tr></thead>
          <tbody>{porRack.map(fila => <tr key={fila.rack.id}><td>{fila.rack.id} · {fila.rack.ubicacion || fila.rack.nombre}</td><td>{fila.total}</td>{fila.porEstado.map(dato => <td key={dato.valor}>{dato.cuantos}</td>)}</tr>)}</tbody>
        </table>
      </section>

      <section className="net-cov-pend">
        <span className="net-label">PENDIENTES</span>
        <details open><summary>{resumen.sinPuerto.length} puntos sin puerto asignado</summary>
          <div className="net-chips">{resumen.sinPuerto.map(endpoint => <button key={endpoint.id} onClick={() => onAbrir(endpoint.id)}>{endpoint.nombre}<small>{endpoint.grupo}</small></button>)}</div>
        </details>
        <details><summary>{resumen.sinEtiqueta.length} puertos sin etiquetar en el levantamiento</summary>
          <div className="net-chips">{resumen.sinEtiqueta.map(puerto => <button key={puerto.id} onClick={() => onAbrir(puerto.id)}>{etiquetaPuerto(estado, puerto.id)}</button>)}</div>
        </details>
        <details><summary>{resumen.desconocidos.length} puertos con destino desconocido</summary>
          <div className="net-chips">{resumen.desconocidos.map(puerto => <button key={puerto.id} onClick={() => onAbrir(puerto.id)}>{etiquetaPuerto(estado, puerto.id)}</button>)}</div>
        </details>
        <details><summary>{resumen.revisar.length} casos marcados para revisar en la importación</summary>
          <ul className="net-cov-list">{resumen.revisar.map(entrada => <li key={entrada.id}><b>{entrada.objetivo.startsWith("esp:") || entrada.objetivo.startsWith("pto:") ? etiquetaEndpoint(estado, entrada.objetivo) : entrada.objetivo}</b> {entrada.nota}</li>)}</ul>
        </details>
      </section>

      <section className="net-cov-log">
        <span className="net-label">ÚLTIMOS CAMBIOS</span>
        {cambios.length ? <ul className="net-cov-list">{cambios.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} · {entrada.objetivo.startsWith("esp:") || entrada.objetivo.startsWith("pto:") ? etiquetaEndpoint(estado, entrada.objetivo) : entrada.objetivo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues}</li>)}</ul> : <p className="empty-state">Todavía no hay cambios registrados.</p>}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Agregar la vista y la franja del buscador al shell**

En `app/red/page.tsx`, agregar el import:

```tsx
import VistaCobertura from "./vista-cobertura";
```

Cambiar el tipo del estado `vista`:

```tsx
  const [vista, setVista] = useState<"espacios" | "racks" | "cobertura">("espacios");
```

Agregar el cálculo de la mejor coincidencia del buscador, después de `espaciosVisibles`:

```tsx
  const coincidenciaBuscador = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    if (texto.length < 2) return "";
    const normalizar = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const buscado = normalizar(texto);
    const espacio = estado.espacios.find(candidato => normalizar(candidato.nombre).includes(buscado));
    if (espacio) return espacio.id;
    const cubiculo = estado.cubiculos.find(candidato => `cubiculo ${candidato.id}`.includes(buscado) || `cub ${candidato.id}` === buscado);
    if (cubiculo) return `cub:${cubiculo.id}`;
    const puerto = estado.puertos.find(candidato => normalizar(etiquetaPuerto(estado, candidato.id)).replace(/[\s/]/g, "").includes(buscado.replace(/[\s/]/g, "")));
    return puerto?.id ?? "";
  }, [consulta, estado]);

  const cadenaBuscador = useMemo(() => trazarCadena(estado, coincidenciaBuscador), [estado, coincidenciaBuscador]);

  const copiarCadenaBuscador = async () => {
    await navigator.clipboard.writeText(cadenaComoTexto(cadenaBuscador));
    mostrarAviso("Cadena copiada.");
  };
```

Agregar `cadenaComoTexto` al import de `../../lib/red/trazado`.

Agregar la opción al segmentado, junto a las otras dos:

```tsx
                <button className={vista === "cobertura" ? "on" : ""} aria-pressed={vista === "cobertura"} onClick={() => setVista("cobertura")}>COBERTURA</button>
```

Agregar `onKeyDown` al input del buscador para que Enter abra la ficha:

```tsx
              <label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar espacio, cubículo o puerto</span><input value={consulta} aria-label="Buscar espacio, cubículo o puerto" onChange={event => setConsulta(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && coincidenciaBuscador) setSeleccionado(coincidenciaBuscador); }} placeholder="Buscar espacio, cubículo o puerto" /></label>
```

Agregar la franja de resultado justo después del `div.room-toolbar`:

```tsx
          {coincidenciaBuscador && <div className="net-quick"><span className="net-quick-chain">{cadenaComoTexto(cadenaBuscador)}</span><div className="net-quick-actions"><button className="secondary" type="button" onClick={() => void copiarCadenaBuscador()}>Copiar</button><button className="secondary" type="button" onClick={() => setSeleccionado(coincidenciaBuscador)}>Abrir ficha</button></div></div>}
```

Y en el cuerpo, agregar la tercera rama:

```tsx
            {vista === "espacios"
              ? <VistaEspacios espacios={espaciosVisibles} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={setSeleccionado} />
              : vista === "racks"
                ? <VistaRacks estado={estado} rackActivo={rackActivo} onRack={setRackActivo} formato={formatoRacks} onFormato={setFormatoRacks} seleccionado={seleccionado} onAbrir={setSeleccionado} />
                : <VistaCobertura estado={estado} onAbrir={setSeleccionado} />}
```

Y en el título de la superficie:

```tsx
            <h2>{vista === "espacios" ? "Espacios del colegio" : vista === "racks" ? "Racks y puertos" : "Cobertura del levantamiento"}</h2>
```

- [ ] **Step 3: Agregar los estilos**

Al final de `app/globals.css`:

```css
.net-quick{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;background:#eaf0f7;border-radius:6px}
.net-quick-chain{font:700 10px var(--font-mono);line-height:1.6;overflow-wrap:anywhere}
.net-quick-actions{display:flex;gap:7px;flex:0 0 auto}
.net-cov{display:grid;gap:22px}
.net-cov-top{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.net-cov-big{margin:0 0 9px;font-size:14px;color:var(--muted)}.net-cov-big b{font:700 30px var(--font-mono);color:var(--ink);letter-spacing:-.02em}
.net-bar{width:min(340px,60vw);height:7px;background:#e8ebef;border-radius:4px;overflow:hidden}.net-bar i{display:block;height:100%;background:var(--green)}
.net-cov-nums{list-style:none;display:flex;gap:20px;margin:0;padding:0}
.net-cov-nums b{display:block;font:700 20px var(--font-mono)}.net-cov-nums span{font-size:10px;color:var(--muted)}
.net-cov-pend details{border-top:1px solid var(--line);padding:9px 0}
.net-cov-pend summary{font-size:12px;font-weight:800;cursor:pointer}
.net-chips{display:flex;flex-wrap:wrap;gap:5px;padding:10px 0 2px}
.net-chips button{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);border-radius:4px;padding:6px 9px;font-size:11px;color:var(--ink)}
.net-chips button:hover{border-color:var(--ink)}.net-chips small{font:700 8px var(--font-mono);letter-spacing:.08em;color:var(--muted)}
.net-cov-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.net-cov-list li{font-size:11px;color:var(--muted);line-height:1.5}.net-cov-list li b{color:var(--ink);font-family:var(--font-mono);font-size:9px}
@media(max-width:600px){.net-cov-nums{flex-wrap:wrap;gap:14px}.net-quick{align-items:stretch;flex-direction:column}}
```

- [ ] **Step 4: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Comprobación manual**

Con `npm run dev`, en `/red`:

1. Escribir `3 basico b` en el buscador: aparece la franja azul con la cadena y los botones *Copiar* y *Abrir ficha*. `Enter` abre la ficha.
2. Escribir `r2/pp1/14`: la franja traza la cadena de ese puerto.
3. Escribir `cub 12`: la franja traza la cadena del cubículo 12.
4. Cambiar a `COBERTURA`: la barra de avance muestra el porcentaje real, y los cuatro números coinciden con la línea de pendientes del rail.
5. La tabla por rack suma, para cada rack, el total de sus puertos nominales.
6. Desplegar "puntos sin puerto asignado" y hacer clic en un chip: abre su ficha.
7. Hacer un cambio cualquiera y volver a Cobertura: aparece en "Últimos cambios".

- [ ] **Step 6: Commit**

```bash
git add app/red/vista-cobertura.tsx app/red/page.tsx app/globals.css
git commit -m "Add coverage dashboard and chain search strip"
```

---

### Task 12: Diagrama SVG de solo lectura

**Files:**
- Create: `app/red/diagrama.tsx`
- Modify: `app/red/page.tsx` (cuarta opción del segmentado)
- Modify: `app/globals.css` (clases del diagrama)

**Interfaces:**
- Consumes: de Task 1 — `etiquetaEndpoint`, `prefijoDe`, tipos.
- Produces: `Diagrama({ estado, seleccionado, centrarEn, onAbrir })`.

**Nota de modelo:** los equipos guardan `x`/`y` pero no ancho, así que el diagrama sintetiza el ancho a partir del número de puertos: `ANCHO_PUERTO = 80` unidades de canvas por puerto, que reproduce la escala del dibujo original (un panel de 24 puertos medía 2149 unidades). Los espacios se dibujan como cajas de 250×60, la medida que tenían en el canvas.

- [ ] **Step 1: Escribir el diagrama**

Crear `app/red/diagrama.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { prefijoDe, type EstadoRed } from "../../lib/red/modelo";

const ANCHO_PUERTO = 80;
const ALTO_EQUIPO = 90;
const ANCHO_ESPACIO = 250;
const ALTO_ESPACIO = 60;
const MARGEN = 400;

type Props = { estado: EstadoRed; seleccionado: string; centrarEn: string; onAbrir: (id: string) => void };
type Vista = { x: number; y: number; escala: number };

export default function Diagrama({ estado, seleccionado, centrarEn, onAbrir }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, escala: 0.1 });
  const arrastre = useRef<{ x: number; y: number; vista: Vista } | null>(null);

  const anchoEquipo = (puertos: number) => Math.max(puertos, 1) * ANCHO_PUERTO;

  const anclas = useMemo(() => {
    const mapa = new Map<string, { x: number; y: number }>();
    for (const equipo of estado.equipos) {
      const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
      const ancho = anchoEquipo(equipo.puertos || 1);
      puertos.forEach((puerto, indice) => {
        const paso = ancho / Math.max(puertos.length, 1);
        mapa.set(puerto.id, { x: equipo.x + paso * (indice + 0.5), y: equipo.y + ALTO_EQUIPO / 2 });
      });
    }
    for (const espacio of estado.espacios) mapa.set(espacio.id, { x: espacio.x + ANCHO_ESPACIO / 2, y: espacio.y + ALTO_ESPACIO / 2 });
    return mapa;
  }, [estado]);

  const limites = useMemo(() => {
    const puntos = [
      ...estado.racks.map(rack => ({ x1: rack.x, y1: rack.y, x2: rack.x + rack.w, y2: rack.y + rack.h })),
      ...estado.espacios.map(espacio => ({ x1: espacio.x, y1: espacio.y, x2: espacio.x + ANCHO_ESPACIO, y2: espacio.y + ALTO_ESPACIO })),
      ...estado.equipos.map(equipo => ({ x1: equipo.x, y1: equipo.y, x2: equipo.x + anchoEquipo(equipo.puertos || 1), y2: equipo.y + ALTO_EQUIPO })),
    ];
    if (!puntos.length) return { x1: 0, y1: 0, x2: 1000, y2: 1000 };
    return {
      x1: Math.min(...puntos.map(punto => punto.x1)) - MARGEN,
      y1: Math.min(...puntos.map(punto => punto.y1)) - MARGEN,
      x2: Math.max(...puntos.map(punto => punto.x2)) + MARGEN,
      y2: Math.max(...puntos.map(punto => punto.y2)) + MARGEN,
    };
  }, [estado]);

  const ajustar = () => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const escala = Math.min(caja.width / (limites.x2 - limites.x1), caja.height / (limites.y2 - limites.y1));
    setVista({ escala, x: -limites.x1 * escala, y: -limites.y1 * escala });
  };

  useEffect(() => { ajustar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [limites.x1, limites.y1, limites.x2, limites.y2]);

  useEffect(() => {
    const ancla = anclas.get(centrarEn);
    const caja = contenedor.current?.getBoundingClientRect();
    if (!ancla || !caja || !centrarEn) return;
    setVista(actual => {
      const escala = Math.max(actual.escala, 0.35);
      return { escala, x: caja.width / 2 - ancla.x * escala, y: caja.height / 2 - ancla.y * escala };
    });
  }, [centrarEn, anclas]);

  const alRodar = (evento: React.WheelEvent) => {
    evento.preventDefault();
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    setVista(actual => {
      const escala = Math.min(Math.max(actual.escala * factor, 0.03), 3);
      const puntero = { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
      return { escala, x: puntero.x - ((puntero.x - actual.x) / actual.escala) * escala, y: puntero.y - ((puntero.y - actual.y) / actual.escala) * escala };
    });
  };

  const alBajar = (evento: React.PointerEvent) => {
    if (evento.button !== 0) return;
    arrastre.current = { x: evento.clientX, y: evento.clientY, vista };
    (evento.target as Element).setPointerCapture?.(evento.pointerId);
  };
  const alMover = (evento: React.PointerEvent) => {
    if (!arrastre.current) return;
    const inicio = arrastre.current;
    setVista({ escala: inicio.vista.escala, x: inicio.vista.x + (evento.clientX - inicio.x), y: inicio.vista.y + (evento.clientY - inicio.y) });
  };
  const alSoltar = () => { arrastre.current = null; };

  const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const medio = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
  };

  const colorEnlace = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#68717e" } as const;

  return (
    <div className="net-diagram">
      <div className="net-diagram-bar">
        <div className="net-seg" role="group" aria-label="Zoom">
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.min(actual.escala * 1.25, 3) }))} aria-label="Acercar">+</button>
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.max(actual.escala / 1.25, 0.03) }))} aria-label="Alejar">−</button>
          <button onClick={ajustar}>AJUSTAR A LA VISTA</button>
        </div>
        <p className="net-diagram-hint">Solo lectura: arrastra para mover, rueda para hacer zoom, clic en un nodo para abrir su ficha.</p>
      </div>

      <div className="net-diagram-canvas" ref={contenedor} onWheel={alRodar} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={alSoltar}>
        <svg role="img" aria-label="Diagrama de la red del colegio">
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
            {estado.racks.map(rack => <g key={rack.id}>
              <rect className="net-d-rack" x={rack.x} y={rack.y} width={rack.w} height={rack.h} rx={24} />
              <text className="net-d-racklabel" x={rack.x + 30} y={rack.y + 90}>{rack.nombre}</text>
            </g>)}

            {estado.enlaces.map(enlace => {
              const a = anclas.get(enlace.a);
              const b = anclas.get(enlace.b);
              if (!a || !b) return null;
              return <path key={enlace.id} className="net-d-link" d={curva(a, b)} stroke={colorEnlace[enlace.tipo] ?? "#68717e"} strokeWidth={enlace.tipo === "uplink" ? 9 : 5} />;
            })}

            {estado.equipos.map(equipo => {
              const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
              const ancho = anchoEquipo(equipo.puertos || 1);
              const paso = ancho / Math.max(puertos.length, 1);
              return <g key={equipo.id}>
                <rect className={`net-d-eq ${equipo.tipo}`} x={equipo.x} y={equipo.y} width={ancho} height={ALTO_EQUIPO} rx={10} />
                <text className="net-d-eqlabel" x={equipo.x} y={equipo.y - 16}>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</text>
                {equipo.puertos > 0 && puertos.map((puerto, indice) => <rect key={puerto.id} className={`net-d-pt ${puerto.estado} ${seleccionado === puerto.id ? "sel" : ""}`} x={equipo.x + paso * indice + 6} y={equipo.y + 12} width={paso - 12} height={ALTO_EQUIPO - 24} rx={5} onClick={() => onAbrir(puerto.id)} />)}
              </g>;
            })}

            {estado.espacios.map(espacio => <g key={espacio.id} onClick={() => onAbrir(espacio.id)}>
              <rect className={`net-d-esp ${espacio.estado} ${seleccionado === espacio.id ? "sel" : ""}`} x={espacio.x} y={espacio.y} width={ANCHO_ESPACIO} height={ALTO_ESPACIO} rx={8} />
              <text className="net-d-esplabel" x={espacio.x + 14} y={espacio.y + 38}>{espacio.nombre}</text>
            </g>)}
          </g>
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Agregar la vista al shell**

En `app/red/page.tsx`:

```tsx
import Diagrama from "./diagrama";
```

```tsx
  const [vista, setVista] = useState<"espacios" | "racks" | "cobertura" | "diagrama">("espacios");
```

Agregar la opción al segmentado:

```tsx
                <button className={vista === "diagrama" ? "on" : ""} aria-pressed={vista === "diagrama"} onClick={() => setVista("diagrama")}>DIAGRAMA</button>
```

Extender el título y el cuerpo:

```tsx
            <h2>{vista === "espacios" ? "Espacios del colegio" : vista === "racks" ? "Racks y puertos" : vista === "cobertura" ? "Cobertura del levantamiento" : "Diagrama de la red"}</h2>
```

```tsx
                : vista === "cobertura"
                  ? <VistaCobertura estado={estado} onAbrir={setSeleccionado} />
                  : <Diagrama estado={estado} seleccionado={seleccionado} centrarEn={vista === "diagrama" ? coincidenciaBuscador : ""} onAbrir={setSeleccionado} />}
```

- [ ] **Step 3: Agregar los estilos**

Al final de `app/globals.css`:

```css
.net-diagram{display:flex;flex-direction:column;gap:10px}
.net-diagram-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.net-diagram-hint{margin:0;color:var(--muted);font-size:10px}
.net-diagram-canvas{height:min(70vh,640px);background:#f7f8f9;border:1px solid var(--line);border-radius:6px;overflow:hidden;touch-action:none;cursor:grab}
.net-diagram-canvas:active{cursor:grabbing}
.net-diagram-canvas svg{width:100%;height:100%;display:block}
.net-d-rack{fill:#eceff2;stroke:#cfd5dc;stroke-width:4}
.net-d-racklabel{fill:#596474;font:700 60px var(--font-mono)}
.net-d-eq{fill:#dfe4ea;stroke:#b9c1cb;stroke-width:3}
.net-d-eq.isp,.net-d-eq.firewall,.net-d-eq.router,.net-d-eq.ap{fill:#dff0e7;stroke:#237a52}
.net-d-eqlabel{fill:#182334;font:700 30px var(--font-mono)}
.net-d-pt{fill:#ffffff;stroke:#b9c1cb;stroke-width:2;cursor:pointer}
.net-d-pt.ocupado{fill:#294f7c;stroke:#294f7c}
.net-d-pt.desconocido{fill:#f1f3f5;stroke-dasharray:8 6}
.net-d-pt.dañado{fill:#f6dfe2;stroke:#a33442}
.net-d-pt.sel,.net-d-esp.sel{stroke:#182334;stroke-width:8}
.net-d-esp{fill:#ffffff;stroke:#b9c1cb;stroke-width:3;cursor:pointer}
.net-d-esp.operativo{stroke:#237a52}.net-d-esp.solo-wifi{stroke:#986900;fill:#fffaf0}.net-d-esp.sin-internet{stroke:#a33442;fill:#fff7f8}.net-d-esp.sin-verificar{stroke-dasharray:10 8}
.net-d-esplabel{fill:#182334;font:700 26px var(--font-manrope);pointer-events:none}
.net-d-link{fill:none;opacity:.7}
@media(max-width:600px){.net-diagram-canvas{height:60vh}}
```

- [ ] **Step 4: Verificar que compila y construye**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 5: Comprobación manual**

Con `npm run dev`, en `/red`, pestaña `DIAGRAMA`:

1. Al entrar, todo el dibujo cabe en pantalla: los 3 racks, los 61 espacios a la izquierda y los equipos de borde.
2. Arrastrar mueve el lienzo; la rueda hace zoom hacia donde está el cursor.
3. *Ajustar a la vista* vuelve al encuadre completo.
4. Los 92 enlaces internos se ven como curvas entre puertos; los uplinks más gruesos y en naranjo.
5. Hacer clic en un puerto abre su ficha; hacer clic en un espacio abre la suya.
6. Escribir `3 basico b` en el buscador con esta vista activa centra y acerca ese nodo.
7. Nada se puede mover ni editar arrastrando: el diagrama es de solo lectura.

- [ ] **Step 6: Commit**

```bash
git add app/red/diagrama.tsx app/red/page.tsx app/globals.css
git commit -m "Add read-only network diagram with pan and zoom"
```

---

### Task 13: Cierre del circuito con la pestaña Sala

**Files:**
- Modify: `app/page.tsx` (línea de red en el cajón del cubículo)
- Modify: `app/red/page.tsx` (abrir la ficha que venga en la URL)
- Modify: `app/globals.css` (clase de la línea de red)

**Interfaces:**
- Consumes: de Task 5 — `GET /api/red/cadena?endpoint=cub:N`. De Task 2 — el tipo `Cadena`.
- Produces: nada nuevo hacia otras tareas; cierra la navegación en los dos sentidos.

- [ ] **Step 1: Pedir la cadena al abrir el cajón de la Sala**

En `app/page.tsx`, agregar el estado junto a los demás `useState`:

```tsx
  const [redCadena, setRedCadena] = useState<{ texto: string; completa: boolean } | null>(null);
```

Y el efecto que la carga cuando cambia el cubículo abierto. No bloquea la carga de la sala: es una petición aparte y su falla solo apaga la línea.

```tsx
  useEffect(() => {
    if (selected === null) { setRedCadena(null); return; }
    let vigente = true;
    setRedCadena(null);
    void (async () => {
      try {
        const response = await fetch(`/api/red/cadena?endpoint=cub:${selected}`);
        if (!response.ok) return;
        const cadena = await response.json() as { saltos: { etiqueta: string }[]; completa: boolean; motivo?: string };
        if (!vigente) return;
        const ruta = cadena.saltos.map(salto => salto.etiqueta).join(" → ");
        setRedCadena({ texto: cadena.completa ? ruta : (cadena.motivo ?? "Sin puerto asignado"), completa: cadena.completa });
      } catch {
        if (vigente) setRedCadena(null);
      }
    })();
    return () => { vigente = false; };
  }, [selected]);
```

- [ ] **Step 2: Mostrar la línea en el cajón**

En `app/page.tsx`, dentro del `drawer-body`, justo después del bloque de `Dirección IP` / `Dirección MAC` (la línea 348), agregar:

```tsx
          <div className="net-line"><span>RED</span>{redCadena ? <b className={redCadena.completa ? "" : "pending"}>{redCadena.texto}</b> : <b className="pending">Consultando…</b>}<a href={`/red?endpoint=cub:${draft.id}`}>Ver en la pestaña Red</a></div>
```

- [ ] **Step 3: Abrir la ficha que venga en la URL**

En `app/red/page.tsx`, dentro del efecto de carga inicial, después de `setUltimaSync(new Date())` en `cargar()`, no: hacerlo en un efecto propio para que corra una sola vez y no en cada refresco. Agregar después del `useEffect` de carga:

```tsx
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("endpoint") ?? "";
    if (/^(pto|esp|cub):/.test(inicial)) setSeleccionado(inicial);
  }, []);
```

- [ ] **Step 4: Agregar el estilo**

Al final de `app/globals.css`:

```css
.net-line{display:flex;flex-direction:column;gap:5px;padding:11px 12px;background:#f4f5f6;border-radius:6px}
.net-line>span{font:700 9px var(--font-mono);letter-spacing:.11em;color:var(--green)}
.net-line b{font:700 10px var(--font-mono);line-height:1.6;overflow-wrap:anywhere}
.net-line b.pending{color:#9a5c14}
.net-line a{font-size:10px;font-weight:800;color:var(--green)}
```

- [ ] **Step 5: Verificar que compila y construye**

Run: `npm test`
Expected: el build pasa y las 22 pruebas de funciones puras pasan.

- [ ] **Step 6: Comprobación manual del circuito completo**

Con `npm run dev`:

1. En `/red`, asignar el cubículo 12 a un puerto con la captura rápida.
2. Ir a `/` y abrir el cubículo 12: la línea `RED` muestra la cadena hasta el ISP.
3. Hacer clic en *Ver en la pestaña Red*: abre `/red?endpoint=cub:12` con la ficha del cubículo ya abierta, mostrando IP, MAC y su puerto.
4. Abrir un cubículo sin puerto: la línea dice "Sin puerto asignado todavía" en color de advertencia, y la ficha de la Sala sigue guardando normalmente.
5. Comprobar que la pestaña Sala **no se volvió más lenta**: la línea `RED` llega después del resto del cajón, sin bloquearlo.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/red/page.tsx app/globals.css
git commit -m "Link cubicles between the room and network tabs"
```

---

## Cierre de la implementación

- [ ] **Verificación final**

Run: `npm test && npm run lint`
Expected: build correcto y 22 pruebas pasando (9 de modelo, 10 de trazado, 3 de semilla).

- [ ] **Aplicar la migración en Supabase**

Ejecutar el SQL de `drizzle-pg/` (el archivo generado en Task 4) en el proyecto Supabase de producción, antes de desplegar. Sin este paso la pestaña Red responde 500 en Vercel, porque `getDb()` no corre DDL cuando `process.env.VERCEL` está definido.

- [ ] **Comprobar en producción**

Después del despliegue: abrir `/red`, confirmar que la siembra dejó 3 racks, 331 puertos y 61 espacios, y que la pestaña Sala sigue funcionando igual. Revisar en la vista Cobertura que el avance parte en 2 de 101.

- [ ] **Decidir los dos pendientes registrados en el spec §7**

Con el equipo (no es decisión del implementador): si `Estructura Redes CAB.canvas` entra al repo para poder reconvertir desde otra máquina, y si el spec anterior `2026-07-29-plataforma-red-cab-design.md` se versiona o se archiva.

---

## Autorevisión del plan

**Cobertura del spec.** §5 arquitectura → Tasks 5-13 (todos los archivos de la tabla del spec tienen tarea). §6 modelo → Tasks 1 y 4; contratos de API → Tasks 5 y 6; `trazarCadena` con adyacencia de chasis y guardia de ciclos → Task 2. §7 conversión, invariantes y siembra idempotente → Tasks 3 y 4. §8.1 pestañas → Task 7; §8.2 rail → Task 7; §8.3 espacios → Task 7; §8.4 racks en dos formatos → Task 9; §8.5 cobertura → Task 11; §8.6 diagrama → Task 12; §8.7 ficha en sus tres variantes → Task 8; §8.8 captura con toggle y avance optimista → Task 10; §8.9 buscador sin sintaxis de escritura → Task 11. §9 errores y accesibilidad → patrón replicado en Tasks 7-12. §10 verificación → Task 1 (runner), 2, 3 y cierre. §11 despliegue → Task 4 y cierre. Los dos cambios en producción del §5 → Tasks 7 y 13.

**Sin placeholders.** Cada paso trae el código o el comando exacto, con el valor esperado de cada verificación.

**Consistencia de tipos.** `EstadoRed` se define una vez en Task 1 y las tablas de Task 4 la reflejan campo por campo; `leerEstado` (Task 5) devuelve esa forma y `app/red/page.tsx` la consume sin adaptadores. `Cadena` y `Salto` se definen en Task 2 y se usan igual en Tasks 8, 9, 11, 12 y 13. Los nombres de handler del shell (`guardarCampos`, `crearEnlace`, `borrarEnlace`, `asignarRapido`, `marcarLibre`, `deshacerAsignacion`) se declaran una vez en Tasks 8 y 10 y se pasan con esos mismos nombres a la ficha y a la captura.

**Notas del implementador.** Dos refinamientos sobre el spec, deliberados y documentados: un `PUT` que cambia estado y nota a la vez escribe **dos** entradas de bitácora, una por campo; y el estado derivado del puerto no escribe entrada propia. Ambos están en las Global Constraints y en la Task 6.

