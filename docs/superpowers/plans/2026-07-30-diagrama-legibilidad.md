# Legibilidad del diagrama de la red · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el diagrama de `/red` se lea sin zoom, reorganizándolo en zonas de rack con tarjetas de equipo colapsadas y aristas agregadas.

**Architecture:** `lib/red/layout.ts` se reescribe para producir zonas de rack en vez de capas planas, con tarjetas dimensionadas por su código en vez de por sus puertos, y pasa a depender del conjunto de tarjetas abiertas. `lib/red/aristas.ts` es nuevo y agrupa los 98 enlaces en 16 aristas, desagregándolas cuando las dos puntas están resueltas. Los componentes de dibujo consumen esa geometría ya resuelta y no calculan nada.

**Tech Stack:** TypeScript, React 19, Next.js (App Router), SVG inline, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-30-diagrama-legibilidad-design.md`

## Global Constraints

- Todo el código, los nombres y los comentarios van **en español**, como el resto del proyecto (`construirLayout`, `nodoDeExtremo`, `sinRuta`). Los mensajes de commit van en inglés, como el historial.
- Los imports entre módulos de `lib/` llevan **extensión `.ts` explícita** (`from "./modelo.ts"`). Los imports desde `app/` no la llevan (`from "../../lib/red/layout"`). Sigue exactamente lo que ya hace cada archivo.
- **El spec dice «tarjeta»; en el código el tipo se llama `Nodo`**, en `lib/red/layout.ts`. No se renombra: costaría una pasada por dos componentes sin cambiar comportamiento.
- Durante los pasos de prueba usa `node --experimental-strip-types --test tests/<archivo>.test.ts`, que corre en ~300 ms. **No uses `npm test` en cada paso**: incluye `next build` y tarda. `npm test` completo es la puerta final de la Task 11.
- No se toca `lib/red/modelo.ts`, `lib/red/trazado.ts`, `lib/red/semilla.json` ni `app/api/red/*`.
- La verificación de los planes usa la herramienta **Grep**, no `npx --no-install rg`.
- Tipografía de las etiquetas: **15 unidades de layout**, ancho de carácter **0.55 em**. Estos dos números aparecen en varias fórmulas; salen de las constantes `TIPOGRAFIA` y `ANCHO_CARACTER`, nunca escritos a mano.

---

### Task 1: Agregación de enlaces por par de equipos

**Files:**
- Create: `lib/red/aristas.ts`
- Test: `tests/aristas.test.ts`

**Interfaces:**
- Consumes: `EstadoRed`, `TipoEnlace`, `prefijoDe` de `lib/red/modelo.ts`.
- Produces: `type Arista = { clave: string; a: string; b: string; tipo: TipoEnlace; cuenta: number }`, `nodoDeExtremo(estado: EstadoRed, extremo: string): string`, `agruparEnlaces(estado: EstadoRed): Arista[]`.

`nodoDeExtremo` traduce un extremo de enlace al id del nodo que lo dibuja. La convención ya existe en `lib/red/layout.ts:34`: un equipo con `puertos > 0` se dibuja como `eq:<id>`; uno con `puertos === 0` (ISP, MIKROTIK, los APs) se dibuja como su único puerto. Espacios y cubículos son ellos mismos.

- [ ] **Step 1: Write the failing test**

Crea `tests/aristas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { agruparEnlaces, nodoDeExtremo } from "../lib/red/aristas.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed);

test("nodoDeExtremo lleva un puerto a su equipo y respeta los aparatos de un puerto", () => {
  const estado = real();
  assert.equal(nodoDeExtremo(estado, "pto:R2-PP1-p19"), "eq:R2-PP1");
  assert.equal(nodoDeExtremo(estado, "pto:ISP-p0"), "pto:ISP-p0");
  assert.equal(nodoDeExtremo(estado, "esp:utp-e-basica"), "esp:utp-e-basica");
});

test("los 98 enlaces de la semilla se agregan a 16 pares", () => {
  const aristas = agruparEnlaces(real());
  assert.equal(aristas.length, 16);
  assert.equal(real().enlaces.length, 98);
});

test("el par R2/SW3 con R2/PP3 lleva la cuenta de sus 24 patcheos", () => {
  const par = agruparEnlaces(real()).find(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3");
  assert.ok(par, "el par existe con la clave ordenada alfabéticamente");
  assert.equal(par.cuenta, 24);
  assert.equal(par.tipo, "patch");
});

test("un par con tipos mezclados se queda con el más pesado", () => {
  const estado = real();
  estado.enlaces = [
    { id: 1, a: "pto:R2-SW1-p1", b: "pto:R2-PP1-p1", tipo: "patch", nota: "" },
    { id: 2, a: "pto:R2-SW1-p2", b: "pto:R2-PP1-p2", tipo: "uplink", nota: "" },
  ];
  const [par] = agruparEnlaces(estado);
  assert.equal(par.cuenta, 2);
  assert.equal(par.tipo, "uplink");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/aristas.test.ts`
Expected: FAIL — `Cannot find module '../lib/red/aristas.ts'`

- [ ] **Step 3: Write minimal implementation**

Crea `lib/red/aristas.ts`:

```ts
import { prefijoDe, type EstadoRed, type TipoEnlace } from "./modelo.ts";

export type Arista = { clave: string; a: string; b: string; tipo: TipoEnlace; cuenta: number };

// Cuando un par junta enlaces de distinto tipo, se dibuja con el más importante.
const PESO: Record<TipoEnlace, number> = { borde: 3, uplink: 2, patch: 1, roseta: 0 };

// La convención de ids de nodo la fija layout.ts: un equipo con puertos se dibuja
// como `eq:<id>`; uno sin puertos propios es su único puerto.
export const nodoDeExtremo = (estado: EstadoRed, extremo: string): string => {
  if (prefijoDe(extremo) !== "pto") return extremo;
  const puerto = estado.puertos.find(candidato => candidato.id === extremo);
  const equipo = estado.equipos.find(candidato => candidato.id === puerto?.equipo);
  return equipo && equipo.puertos > 0 ? `eq:${equipo.id}` : extremo;
};

export const claveDePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const agruparEnlaces = (estado: EstadoRed): Arista[] => {
  const pares = new Map<string, Arista>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    const clave = claveDePar(a, b);
    const par = pares.get(clave);
    if (!par) {
      const [primero, segundo] = a < b ? [a, b] : [b, a];
      pares.set(clave, { clave, a: primero, b: segundo, tipo: enlace.tipo, cuenta: 1 });
      continue;
    }
    par.cuenta += 1;
    if (PESO[enlace.tipo] > PESO[par.tipo]) par.tipo = enlace.tipo;
  }
  return [...pares.values()];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/aristas.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/red/aristas.ts tests/aristas.test.ts
git commit -m "Aggregate the network links into one edge per equipment pair"
```

---

### Task 2: Desagregar una arista cuando sus dos puntas están resueltas

**Files:**
- Modify: `lib/red/aristas.ts`
- Test: `tests/aristas.test.ts`

**Interfaces:**
- Consumes: `agruparEnlaces`, `nodoDeExtremo`, `claveDePar` de la Task 1.
- Produces: `aristasParaDibujar(estado: EstadoRed, abiertas: Set<string>): Arista[]`. `abiertas` contiene ids de nodo de equipo (`eq:R2-PP1`).

Una punta está **resuelta** si está abierta o si no tiene rejilla que abrir. Un espacio, un cubículo o un AP no tienen puertos que mostrar, así que su borde de tarjeta ya es el destino correcto de la línea.

- [ ] **Step 1: Write the failing test**

Añade a `tests/aristas.test.ts`:

```ts
import { aristasParaDibujar } from "../lib/red/aristas.ts";

test("sin nada abierto se dibujan las 16 aristas agregadas", () => {
  assert.equal(aristasParaDibujar(real(), new Set()).length, 16);
});

test("con las dos puntas abiertas el par se desagrega en sus 24 enlaces", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-SW3", "eq:R2-PP3"]));
  const sueltas = aristas.filter(arista => arista.a.startsWith("pto:R2-") && arista.cuenta === 1
    && [arista.a, arista.b].some(punta => punta.includes("PP3")));
  assert.equal(sueltas.length, 24);
  assert.equal(aristas.some(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3"), false);
  assert.equal(aristas.length, 16 - 1 + 24);
});

test("con una sola punta abierta el par sigue agregado", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-SW3"]));
  const par = aristas.find(arista => arista.clave === "eq:R2-PP3|eq:R2-SW3");
  assert.equal(par?.cuenta, 24);
});

test("un destino no tiene rejilla, así que basta con abrir el panel", () => {
  const aristas = aristasParaDibujar(real(), new Set(["eq:R2-PP1"]));
  const roseta = aristas.find(arista => arista.a === "esp:utp-e-basica" || arista.b === "esp:utp-e-basica");
  assert.ok(roseta);
  assert.equal(roseta.cuenta, 1);
  assert.equal([roseta.a, roseta.b].includes("pto:R2-PP1-p19"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/aristas.test.ts`
Expected: FAIL — `aristasParaDibujar is not a function`

- [ ] **Step 3: Write minimal implementation**

Añade a `lib/red/aristas.ts`:

```ts
// Solo los equipos con rejilla se pueden abrir. Un destino no tiene puertos que
// mostrar, así que cuenta como resuelto y la línea puede apuntar a su borde.
const resuelta = (nodoId: string, abiertas: Set<string>) => !nodoId.startsWith("eq:") || abiertas.has(nodoId);

export const aristasParaDibujar = (estado: EstadoRed, abiertas: Set<string>): Arista[] => {
  const desagregados = new Set<string>();
  const salida: Arista[] = [];
  for (const par of agruparEnlaces(estado)) {
    if (resuelta(par.a, abiertas) && resuelta(par.b, abiertas)) desagregados.add(par.clave);
    else salida.push(par);
  }
  if (!desagregados.size) return salida;
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b || !desagregados.has(claveDePar(a, b))) continue;
    salida.push({ clave: `e${enlace.id}`, a: enlace.a, b: enlace.b, tipo: enlace.tipo, cuenta: 1 });
  }
  return salida;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/aristas.test.ts`
Expected: PASS, 8 tests

Si el cuarto test falla porque la roseta sale agregada: `resuelta` devuelve `true` para `esp:utp-e-basica` porque no empieza con `eq:`, y `eq:R2-PP1` está en `abiertas`. Revisa que no estés exigiendo `abiertas.has` en las dos puntas.

- [ ] **Step 5: Commit**

```bash
git add lib/red/aristas.ts tests/aristas.test.ts
git commit -m "Disaggregate an edge once both of its endpoints are resolved"
```

---

### Task 3: Orden de las zonas por la cadena de uplinks

**Files:**
- Modify: `lib/red/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Produces: `ordenDeZonas(estado: EstadoRed): string[]`. Devuelve `["borde", ...racks]`. Con la semilla real: `["borde", "R1", "R2", "R3"]`.

El recorrido arranca en el rack del equipo que recibe el enlace `borde` (`ISP ══ R1/PP1` → `R1`) y sigue los uplinks. Un rack que no se alcance por uplinks va al final por orden de `id`.

- [ ] **Step 1: Write the failing test**

Añade a `tests/layout.test.ts`:

```ts
import { ordenDeZonas } from "../lib/red/layout.ts";

test("las zonas salen en el orden de la cadena de uplinks, no por id", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  assert.deepEqual(ordenDeZonas(estado), ["borde", "R1", "R2", "R3"]);
});

test("un rack sin uplink que lo alcance va al final, por id", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  estado.equipos = [...estado.equipos, { id: "R0-SW1", rack: "R0", tipo: "switch", etiqueta: "Suelto", modelo: "", puertos: 8, color: "", x: 0, y: 0, nota: "" }];
  assert.deepEqual(ordenDeZonas(estado), ["borde", "R1", "R2", "R3", "R0"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — `ordenDeZonas is not a function`

- [ ] **Step 3: Write minimal implementation**

Añade a `lib/red/layout.ts`:

```ts
export const ZONA_BORDE = "borde";

export const ordenDeZonas = (estado: EstadoRed): string[] => {
  const equipos = new Map(estado.equipos.map(equipo => [equipo.id, equipo]));
  const puertos = new Map(estado.puertos.map(puerto => [puerto.id, puerto]));
  const rackDe = (extremo: string) => equipos.get(puertos.get(extremo)?.equipo ?? "")?.rack ?? "";

  const racks = new Set(estado.equipos.map(equipo => equipo.rack).filter(Boolean));
  const vecinos = new Map<string, Set<string>>();
  const unir = (a: string, b: string) => {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    vecinos.get(a)!.add(b);
  };

  let arranque = "";
  for (const enlace of estado.enlaces) {
    const a = rackDe(enlace.a);
    const b = rackDe(enlace.b);
    if (enlace.tipo === "borde" && !arranque) arranque = a || b;
    if (enlace.tipo !== "uplink" || !a || !b || a === b) continue;
    unir(a, b);
    unir(b, a);
  }

  const orden: string[] = [];
  const vistos = new Set<string>();
  const cola = racks.has(arranque) ? [arranque] : [];
  while (cola.length) {
    const actual = cola.shift()!;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    orden.push(actual);
    for (const vecino of [...(vecinos.get(actual) ?? [])].sort()) if (!vistos.has(vecino)) cola.push(vecino);
  }
  for (const rack of [...racks].sort()) if (!vistos.has(rack)) orden.push(rack);
  return [ZONA_BORDE, ...orden];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS — los 11 tests viejos siguen verdes y los 2 nuevos pasan

- [ ] **Step 5: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Order the diagram zones along the uplink chain"
```

---

### Task 4: Dimensionar por texto y resumir los puertos

**Files:**
- Modify: `lib/red/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Produces:
  - `TIPOGRAFIA = 15`, `ANCHO_CARACTER = 0.55`, `ANCHO_MINIMO = 120`, `RELLENO = 16`
  - `anchoDeTexto(texto: string): number`
  - `codigoDeEquipo(equipoId: string): string` — `"R2-SW1"` → `"R2/SW1"`
  - `type ResumenPuertos = { total: number; ocupados: number; libres: number; dañados: number; sinVerificar: number }`
  - `resumenDePuertos(estado: EstadoRed, equipoId: string): ResumenPuertos`

- [ ] **Step 1: Write the failing test**

Añade a `tests/layout.test.ts`:

```ts
import { anchoDeTexto, codigoDeEquipo, resumenDePuertos, ANCHO_MINIMO } from "../lib/red/layout.ts";

test("el ancho sale del texto y nunca baja del mínimo", () => {
  assert.equal(anchoDeTexto("R2/SW1"), ANCHO_MINIMO);
  assert.equal(anchoDeTexto("PIE Administrativo"), Math.round(18 * 15 * 0.55) + 16);
  assert.ok(anchoDeTexto("PIE Administrativo") > ANCHO_MINIMO);
});

test("el código del equipo es el id con barra", () => {
  assert.equal(codigoDeEquipo("R2-SW1"), "R2/SW1");
  assert.equal(codigoDeEquipo("AP-sala-multicopiado"), "AP/sala-multicopiado");
});

test("el resumen cuenta cada estado de puerto", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  assert.deepEqual(resumenDePuertos(estado, "R2-PP2"), { total: 24, ocupados: 19, libres: 1, dañados: 4, sinVerificar: 0 });
  assert.deepEqual(resumenDePuertos(estado, "R1-PP1"), { total: 24, ocupados: 0, libres: 0, dañados: 0, sinVerificar: 24 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — `anchoDeTexto is not a function`

- [ ] **Step 3: Write minimal implementation**

Añade a `lib/red/layout.ts` y **borra** las constantes viejas `ANCHO_HOJA`, `ALTO_HOJA` y `ALTO_CAPA` cuando dejen de usarse en la Task 5:

```ts
export const TIPOGRAFIA = 15;
// Ancho medio de un carácter como fracción del tamaño de fuente. Antes servía para
// recortar la etiqueta al nodo; ahora dimensiona el nodo según su etiqueta.
export const ANCHO_CARACTER = 0.55;
export const ANCHO_MINIMO = 120;
export const RELLENO = 16;

export type ResumenPuertos = { total: number; ocupados: number; libres: number; dañados: number; sinVerificar: number };

export const anchoDeTexto = (texto: string) =>
  Math.max(ANCHO_MINIMO, Math.round(texto.length * TIPOGRAFIA * ANCHO_CARACTER) + RELLENO);

export const codigoDeEquipo = (equipoId: string) => equipoId.replace("-", "/");
```

`EstadoPuerto` tiene que estar en el import de `./modelo.ts` de este archivo; si no está, añádelo:

```ts
import { type EstadoPuerto, type EstadoRed } from "./modelo.ts";

export const resumenDePuertos = (estado: EstadoRed, equipoId: string): ResumenPuertos => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipoId);
  const cuantos = (valor: EstadoPuerto) => puertos.filter(puerto => puerto.estado === valor).length;
  return {
    total: puertos.length,
    ocupados: cuantos("ocupado"),
    libres: cuantos("libre"),
    dañados: cuantos("dañado"),
    sinVerificar: cuantos("desconocido"),
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Size diagram cards from their text and summarise port states"
```

---

### Task 5: Reescribir `construirLayout` en zonas de rack

Esta es la tarea grande: cambia la forma de `Layout` y de `Nodo`, así que reescribe también `tests/layout.test.ts` y aplica el parche mínimo a los dos componentes para que `next build` siga compilando.

**Files:**
- Modify: `lib/red/layout.ts`
- Modify: `app/red/diagrama-nodos.tsx:39`, `:54`, `:62-67`
- Modify: `app/red/diagrama.tsx:28`
- Test: `tests/layout.test.ts` (se reescribe)

**Interfaces:**
- Consumes: `ordenDeZonas`, `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos` (Tasks 3-4); `aristasParaDibujar`, `type Arista` (Tasks 1-2).
- Produces:

```ts
export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = {
  id: string; clase: ClaseNodo;
  codigo: string;        // lo que se dibuja dentro de la tarjeta: "R2/SW1"
  etiqueta: string;      // rótulo completo, para <title> y aria-label
  zona: string; fila: number;
  x: number; y: number; w: number; h: number;
  abierta: boolean;
  idsPuerto: string[];   // siempre, abierta o cerrada
  puertos: PuertoNodo[]; // geometría, solo si abierta
  resumen: ResumenPuertos | null;
  sinRuta: boolean;
};
export type Zona = { id: string; nombre: string; x: number; y: number; w: number; h: number };
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };
export type Layout = { zonas: Zona[]; nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number };
export const construirLayout = (estado: EstadoRed, abiertas?: Set<string>): Layout;
```

En esta tarea `fila` solo toma los valores 0 (switches, y todo lo de la zona borde) y 1 (patch panels). Los destinos llegan en la Task 6 con `fila: 2`.

- [ ] **Step 1: Write the failing test**

Reemplaza el contenido de `tests/layout.test.ts` por:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import {
  anchoDeTexto, codigoDeEquipo, construirLayout, ordenDeZonas, resumenDePuertos,
  ANCHO_MINIMO, ZONA_BORDE,
} from "../lib/red/layout.ts";
import type { EstadoRed } from "../lib/red/modelo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed);

test("las zonas salen en el orden de la cadena de uplinks, no por id", () => {
  assert.deepEqual(ordenDeZonas(real()), [ZONA_BORDE, "R1", "R2", "R3"]);
});

test("un rack sin uplink que lo alcance va al final, por id", () => {
  const estado = real();
  estado.equipos = [...estado.equipos, { id: "R0-SW1", rack: "R0", tipo: "switch", etiqueta: "Suelto", modelo: "", puertos: 8, color: "", x: 0, y: 0, nota: "" }];
  assert.deepEqual(ordenDeZonas(estado), [ZONA_BORDE, "R1", "R2", "R3", "R0"]);
});

test("el ancho sale del texto y nunca baja del mínimo", () => {
  assert.equal(anchoDeTexto("R2/SW1"), ANCHO_MINIMO);
  assert.equal(anchoDeTexto("PIE Administrativo"), Math.round(18 * 15 * 0.55) + 16);
});

test("el código del equipo es el id con barra", () => {
  assert.equal(codigoDeEquipo("R2-SW1"), "R2/SW1");
});

test("el resumen cuenta cada estado de puerto", () => {
  assert.deepEqual(resumenDePuertos(real(), "R2-PP2"), { total: 24, ocupados: 19, libres: 1, dañados: 4, sinVerificar: 0 });
  assert.deepEqual(resumenDePuertos(real(), "R1-PP1"), { total: 24, ocupados: 0, libres: 0, dañados: 0, sinVerificar: 24 });
});

test("cada equipo cae en su zona y en su fila", () => {
  const layout = construirLayout(real());
  const porId = new Map(layout.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.zona, ZONA_BORDE);
  assert.equal(porId.get("pto:MIKROTIK-p0")?.zona, ZONA_BORDE);
  assert.equal(porId.get("eq:R2-SW2")?.zona, "R2");
  assert.equal(porId.get("eq:R2-SW2")?.fila, 0);
  assert.equal(porId.get("eq:R2-PP2")?.zona, "R2");
  assert.equal(porId.get("eq:R2-PP2")?.fila, 1);
});

test("la tarjeta cerrada lleva el código, no el rótulo largo", () => {
  const switche = construirLayout(real()).nodos.find(nodo => nodo.id === "eq:R2-SW1");
  assert.equal(switche?.codigo, "R2/SW1");
  assert.equal(switche?.etiqueta, "R2/SW1 · Switch 1 | Gigabit 24p Smart");
  assert.equal(switche?.abierta, false);
  assert.deepEqual(switche?.puertos, []);
  assert.equal(switche?.idsPuerto.length, 24);
  assert.equal(switche?.w, anchoDeTexto("R2/SW1"));
});

test("con todo cerrado el lienzo no pasa de 1400 unidades de ancho", () => {
  const layout = construirLayout(real());
  assert.ok(layout.ancho > 0);
  assert.ok(layout.ancho <= 1400, `mide ${layout.ancho}`);
});

test("dos tarjetas de la misma zona y fila no se solapan", () => {
  const layout = construirLayout(real());
  for (const zona of layout.zonas) {
    for (const fila of [0, 1, 2]) {
      const cartas = layout.nodos.filter(nodo => nodo.zona === zona.id && nodo.fila === fila).sort((a, b) => a.x - b.x);
      for (let i = 1; i < cartas.length; i += 1) {
        assert.ok(cartas[i].x >= cartas[i - 1].x + cartas[i - 1].w, `se solapan en ${zona.id} fila ${fila}`);
      }
    }
  }
});

test("las zonas no se solapan entre sí y siguen el orden calculado", () => {
  const layout = construirLayout(real());
  assert.deepEqual(layout.zonas.map(zona => zona.id), [ZONA_BORDE, "R1", "R2", "R3"]);
  const racks = layout.zonas.filter(zona => zona.id !== ZONA_BORDE).sort((a, b) => a.x - b.x);
  for (let i = 1; i < racks.length; i += 1) {
    assert.ok(racks[i].x >= racks[i - 1].x + racks[i - 1].w, "las zonas de rack se solapan");
  }
});

test("cada tarjeta cabe dentro de su zona", () => {
  const layout = construirLayout(real());
  const porId = new Map(layout.zonas.map(zona => [zona.id, zona]));
  for (const nodo of layout.nodos) {
    const zona = porId.get(nodo.zona);
    assert.ok(zona, `la zona ${nodo.zona} existe`);
    assert.ok(nodo.x >= zona.x && nodo.x + nodo.w <= zona.x + zona.w, `${nodo.id} se sale de ${zona.id}`);
  }
});

test("el layout trae las aristas ya agregadas", () => {
  assert.equal(construirLayout(real()).aristas.length, 16);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — los tests nuevos rompen porque `Nodo` todavía no tiene `zona`, `fila`, `codigo`, `idsPuerto` ni `abierta`

- [ ] **Step 3: Write minimal implementation**

Reescribe `lib/red/layout.ts`. Conserva `ordenDeZonas`, `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos` y las constantes de las Tasks 3-4, y reemplaza el resto:

```ts
import { aristasParaDibujar, type Arista } from "./aristas.ts";
import { puertosDeEndpoint, type EstadoPuerto, type EstadoRed, type TipoEquipo } from "./modelo.ts";

export const ALTO_TARJETA = 44;
export const SEPARACION = 26;
export const SEPARACION_FILA = 54;
export const SEPARACION_ZONA = 60;
export const RELLENO_ZONA = 16;
export const ALTO_TITULO_ZONA = 24;

export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = {
  id: string; clase: ClaseNodo; codigo: string; etiqueta: string;
  zona: string; fila: number;
  x: number; y: number; w: number; h: number;
  abierta: boolean; idsPuerto: string[]; puertos: PuertoNodo[];
  resumen: ResumenPuertos | null; sinRuta: boolean;
};
export type Zona = { id: string; nombre: string; x: number; y: number; w: number; h: number };
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };
export type Layout = { zonas: Zona[]; nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number };

const FILA_BORDE: TipoEquipo[] = ["isp", "firewall", "router"];
const GRUPOS = { sala: "Salas", oficina: "Oficinas", otro: "Otros" } as const;

const filaDeEquipo = (tipo: TipoEquipo) => (FILA_BORDE.includes(tipo) ? 0 : tipo === "switch" ? 0 : 1);

const nodoDeEquipo = (estado: EstadoRed, equipo: EstadoRed["equipos"][number]): Nodo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  return {
    id: conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`,
    clase: conRejilla ? "equipo" : "aparato",
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    zona: FILA_BORDE.includes(equipo.tipo) ? ZONA_BORDE : equipo.rack || ZONA_BORDE,
    fila: filaDeEquipo(equipo.tipo),
    x: 0, y: 0, w: anchoDeTexto(codigo), h: ALTO_TARJETA,
    abierta: false,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    sinRuta: false,
  };
};

export const construirLayout = (estado: EstadoRed, abiertas: Set<string> = new Set()): Layout => {
  const orden = ordenDeZonas(estado);
  const nodos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo));

  const zonas: Zona[] = [];
  let x = 0;
  for (const idZona of orden) {
    const dentro = nodos.filter(nodo => nodo.zona === idZona);
    if (!dentro.length) continue;
    let ancho = 0;
    let alto = ALTO_TITULO_ZONA;
    for (const fila of [0, 1]) {
      const cartas = dentro.filter(nodo => nodo.fila === fila).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (!cartas.length) continue;
      let cursor = x + RELLENO_ZONA;
      for (const carta of cartas) {
        carta.x = cursor;
        carta.y = alto;
        cursor += carta.w + SEPARACION;
      }
      ancho = Math.max(ancho, cursor - SEPARACION - x - RELLENO_ZONA);
      alto += ALTO_TARJETA + SEPARACION_FILA;
    }
    const w = ancho + RELLENO_ZONA * 2;
    zonas.push({ id: idZona, nombre: nombreDeZona(estado, idZona), x, y: 0, w, h: alto });
    x += w + SEPARACION_ZONA;
  }

  return {
    zonas,
    nodos,
    aristas: aristasParaDibujar(estado, abiertas),
    bandeja: bandejaDe(estado),
    ancho: Math.max(x - SEPARACION_ZONA, 0),
    alto: Math.max(...zonas.map(zona => zona.h), 0),
  };
};

const nombreDeZona = (estado: EstadoRed, idZona: string) =>
  idZona === ZONA_BORDE ? "Borde · salida a internet" : estado.racks.find(rack => rack.id === idZona)?.nombre ?? idZona;

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: GRUPOS[espacio.categoria] })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
];

export const anclasDeLayout = (layout: Layout) => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of layout.nodos) {
    const centro = { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 };
    anclas.set(nodo.id, centro);
    // Una tarjeta cerrada no dibuja sus puertos, pero trazarCadena() sí devuelve
    // ids de puerto: sin esta caída al centro la ruta no ilumina nada.
    for (const id of nodo.idsPuerto) anclas.set(id, centro);
    for (const puerto of nodo.puertos) {
      anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
    }
  }
  return anclas;
};
```

Borra de este archivo `capaDeEquipo`, `ANCHO_HOJA`, `ALTO_HOJA`, `ALTO_CAPA`, `ALTO_EQUIPO`, `nodosDeHojas` y el bloque de `vecinos`/BFS de islas: la Task 6 vuelve a introducir destinos y `sinRuta` con otra forma.

**Orden de declaración:** `construirLayout` usa `nombreDeZona` y `bandejaDe`, que son `const` declaradas más abajo. Funciona porque la función se llama después de evaluar el módulo, pero se lee mal. Declara los dos ayudantes **antes** de `construirLayout`.

Ahora el parche mínimo a los componentes para que compile:

En `app/red/diagrama-nodos.tsx`, cambia el import de `Arista`:

```ts
import { anclasDeLayout, type Layout, type Nodo } from "../../lib/red/layout";
import type { Arista } from "../../lib/red/aristas";
```

y en el cuerpo, tres reemplazos:

```tsx
// clasesNodo: isla -> sinRuta
const clasesNodo = (nodo: Nodo) => ["net-d-nodo", nodo.clase, nivel(nodo.id), nodo.sinRuta ? "sin-ruta" : "", seleccionado === nodo.id ? "sel" : "", origen === nodo.id ? "origen" : ""].filter(Boolean).join(" ");

// la key de la arista pasa de id a clave
<path key={arista.clave} className={`net-d-link ${nivelArista(arista)}`} d={curva(a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={arista.tipo === "uplink" ? 5 : 3} />

// el texto del nodo pasa a ser el código, sin recortar
<text className="net-d-nombre" x={nodo.w / 2} y={-8 / escala} style={{ fontSize: `${tipografia}px` }}>{nodo.codigo}</text>
```

Borra de ese archivo la constante `ANCHO_CARACTER` y la función `recortar` (líneas 27-34): ya no se usan.

En `app/globals.css:173`, renombra el selector de isla:

```css
.net-d-nodo.sin-ruta>rect{stroke-dasharray:6 4;stroke:var(--red)}
```

y en la línea 177:

```css
.net-d-nodo.sin-ruta .net-d-nombre{fill:var(--red)}
```

(El color pasa a ámbar en la Task 9; aquí solo se renombra para que no quede CSS muerto.)

- [ ] **Step 4: Run the tests and the build**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS, 12 tests

Run: `node --experimental-strip-types --test tests/aristas.test.ts tests/trazado.test.ts tests/modelo.test.ts tests/busqueda.test.ts tests/semilla.test.ts`
Expected: PASS — ninguno de esos toca `layout.ts`

Run: `npm run build`
Expected: compila sin errores de TypeScript

- [ ] **Step 5: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts app/red/diagrama-nodos.tsx app/globals.css
git commit -m "Rebuild the diagram layout around rack zones"
```

---

### Task 6: Destinos apilados, bandeja de equipos sin enlace y marca de sin ruta

**Files:**
- Modify: `lib/red/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: la `Layout` de la Task 5.
- Produces: nodos con `fila: 2` para espacios, cubículos y APs enlazados; `FichaBandeja` con grupo `"Equipos sin enlace"`; `Nodo.sinRuta` calculado.

Los destinos van en su propia fila, agrupados por el equipo del que cuelgan. Cada grupo es una columna que apila sus destinos hacia abajo; las columnas se ordenan por la `x` de su equipo padre. La zona se ensancha al mayor de sus tres filas.

`sinRuta` marca lo que no alcanza al ISP: un BFS por `estado.enlaces` desde el puerto del equipo `isp`, proyectado a ids de nodo con `nodoDeExtremo`.

- [ ] **Step 1: Write the failing test**

Añade a `tests/layout.test.ts`:

```ts
test("un espacio con puerto cuelga de su panel, en la fila de destinos", () => {
  const layout = construirLayout(real());
  const destino = layout.nodos.find(nodo => nodo.id === "esp:utp-e-basica");
  assert.equal(destino?.zona, "R2");
  assert.equal(destino?.fila, 2);
  assert.equal(destino?.clase, "espacio");
  assert.equal(destino?.codigo, "UTP E. Básica");
});

test("dos destinos del mismo panel se apilan en la misma columna", () => {
  const layout = construirLayout(real());
  const uno = layout.nodos.find(nodo => nodo.id === "esp:utp-e-basica");
  const otro = layout.nodos.find(nodo => nodo.id === "esp:pie-administrativo");
  assert.ok(uno && otro);
  assert.equal(uno.x, otro.x, "comparten columna");
  assert.notEqual(uno.y, otro.y, "no comparten fila");
});

test("un AP enlazado es un destino y uno sin enlace va a la bandeja", () => {
  const layout = construirLayout(real());
  const ids = layout.nodos.map(nodo => nodo.id);
  assert.equal(ids.includes("pto:AP-sala-de-profesores-p0"), true);
  assert.equal(ids.includes("pto:AP-wifi-direccion-p0"), false);
  const ficha = layout.bandeja.find(item => item.id === "pto:AP-wifi-direccion-p0");
  assert.equal(ficha?.grupo, "Equipos sin enlace");
  assert.equal(ficha?.etiqueta, "AP/wifi-direccion · Wifi Dirección");
});

test("R3/PP2 se queda en su rack aunque no tenga enlaces, marcado sin ruta", () => {
  const layout = construirLayout(real());
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R3-PP2");
  assert.equal(panel?.zona, "R3");
  assert.equal(panel?.sinRuta, true);
  assert.equal(layout.bandeja.some(ficha => ficha.id === "eq:R3-PP2"), false);
});

test("FORTINET y MIKROTIK quedan en la banda de borde, sin ruta", () => {
  const layout = construirLayout(real());
  for (const id of ["pto:FORTINET-p0", "pto:MIKROTIK-p0"]) {
    const nodo = layout.nodos.find(candidato => candidato.id === id);
    assert.equal(nodo?.zona, ZONA_BORDE, `${id} está en el borde`);
    assert.equal(nodo?.sinRuta, true, `${id} no alcanza al ISP`);
  }
  assert.equal(layout.nodos.find(nodo => nodo.id === "eq:R2-SW1")?.sinRuta, false);
});

test("la zona se ensancha al destino más ancho que cuelga de ella", () => {
  const layout = construirLayout(real());
  const zona = layout.zonas.find(candidata => candidata.id === "R2");
  const destino = layout.nodos.find(nodo => nodo.id === "esp:pie-administrativo");
  assert.ok(zona && destino);
  assert.ok(destino.x + destino.w <= zona.x + zona.w);
  assert.equal(destino.w, anchoDeTexto("PIE Administrativo"));
});

test("con todo cerrado el lienzo sigue sin pasar de 1400 de ancho", () => {
  assert.ok(construirLayout(real()).ancho <= 1400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — `esp:utp-e-basica` no está entre los nodos

- [ ] **Step 3: Write minimal implementation**

En `lib/red/layout.ts`, añade el cálculo de destinos y de `sinRuta`, y mete la fila 2 en el bucle de zonas:

```ts
export const ALTO_DESTINO = 30;
export const SEPARACION_DESTINO = 6;

// El equipo del que cuelga un destino: el primer puerto al que está enlazado.
const padreDeDestino = (estado: EstadoRed, endpointId: string) => {
  const puerto = puertosDeEndpoint(estado, endpointId)[0];
  if (!puerto) return "";
  const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
  return equipo ? (equipo.puertos > 0 ? `eq:${equipo.id}` : puerto.id) : "";
};

const alcanzablesDesdeIsp = (estado: EstadoRed): Set<string> => {
  const isp = estado.equipos.find(equipo => equipo.tipo === "isp");
  const arranque = estado.puertos.find(puerto => puerto.equipo === isp?.id);
  const vistos = new Set<string>();
  if (!arranque) return vistos;
  const vecinos = new Map<string, string[]>();
  const unir = (a: string, b: string) => vecinos.set(a, [...(vecinos.get(a) ?? []), b]);
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    unir(a, b);
    unir(b, a);
  }
  const cola = [nodoDeExtremo(estado, arranque.id)];
  while (cola.length) {
    const actual = cola.shift()!;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    for (const vecino of vecinos.get(actual) ?? []) if (!vistos.has(vecino)) cola.push(vecino);
  }
  return vistos;
};
```

Los destinos se construyen así, antes de posicionar las zonas:

```ts
const destinosDe = (estado: EstadoRed, padres: Map<string, Nodo>): Nodo[] => {
  const hoja = (id: string, texto: string, clase: ClaseNodo): Nodo | null => {
    const padre = padres.get(padreDeDestino(estado, id));
    if (!padre) return null;
    return {
      id, clase, codigo: texto, etiqueta: texto,
      zona: padre.zona, fila: 2,
      x: 0, y: 0, w: anchoDeTexto(texto), h: ALTO_DESTINO,
      abierta: false, idsPuerto: [], puertos: [], resumen: null, sinRuta: false,
    };
  };
  const apDe = (equipo: EstadoRed["equipos"][number]) => {
    const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
    if (!puerto || !puertosDeEndpoint(estado, puerto.id).length) return null;
    return hoja(puerto.id, `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`, "aparato");
  };
  return [
    ...estado.espacios.filter(espacio => puertosDeEndpoint(estado, espacio.id).length)
      .map(espacio => hoja(espacio.id, espacio.nombre, "espacio")),
    ...estado.cubiculos.filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
      .map(cubiculo => hoja(`cub:${cubiculo.id}`, `Cubículo ${cubiculo.id}`, "cubiculo")),
    ...estado.equipos.filter(equipo => equipo.tipo === "ap").map(apDe),
  ].filter((nodo): nodo is Nodo => Boolean(nodo));
};
```

Y se enganchan en `construirLayout`, justo después de construir los nodos de equipo y **antes** de posicionar las zonas, porque las columnas de destino se ordenan por la `x` de su padre y esa `x` se fija en el bucle de filas 0 y 1:

```ts
const equipos = estado.equipos
  .filter(equipo => equipo.tipo !== "ap")
  .map(equipo => nodoDeEquipo(estado, equipo, abiertas));
const porId = new Map(equipos.map(nodo => [nodo.id, nodo]));
const nodos = [...equipos, ...destinosDe(estado, porId)];
```

`porId` es el mapa que `destinosDe` recibe como `padres` y el mismo que usa el ordenamiento de columnas de abajo.

En el bucle de zonas, la fila 2 se coloca **después** de las filas 0 y 1, por columnas en vez de por tarjetas sueltas:

```ts
// fila 2: una columna por equipo padre, ordenadas por la x del padre
const columnas = new Map<string, Nodo[]>();
for (const destino of dentro.filter(nodo => nodo.fila === 2)) {
  const padre = padreDeDestino(estado, destino.id);
  columnas.set(padre, [...(columnas.get(padre) ?? []), destino]);
}
const ordenadas = [...columnas.entries()].sort(([a], [b]) => (porId.get(a)?.x ?? 0) - (porId.get(b)?.x ?? 0));
let cursor = x + RELLENO_ZONA;
let altoFila = 0;
for (const [, pila] of ordenadas) {
  const anchoColumna = Math.max(...pila.map(destino => destino.w));
  let y = alto;
  for (const destino of pila) {
    destino.x = cursor;
    destino.y = y;
    y += ALTO_DESTINO + SEPARACION_DESTINO;
  }
  altoFila = Math.max(altoFila, y - alto);
  cursor += anchoColumna + SEPARACION;
}
if (ordenadas.length) {
  ancho = Math.max(ancho, cursor - SEPARACION - x - RELLENO_ZONA);
  alto += altoFila;
}
```

Y al final de `construirLayout`, marca `sinRuta`:

```ts
const alcanzables = alcanzablesDesdeIsp(estado);
for (const nodo of nodos) nodo.sinRuta = !alcanzables.has(nodo.id);
```

Añade a `bandejaDe` los equipos sin enlace:

```ts
...estado.equipos.filter(equipo => equipo.puertos === 0 && equipo.tipo === "ap")
  .filter(equipo => {
    const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
    return !puerto || !puertosDeEndpoint(estado, puerto.id).length;
  })
  .map(equipo => ({
    id: estado.puertos.find(candidato => candidato.equipo === equipo.id)?.id ?? `eq:${equipo.id}`,
    etiqueta: `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`,
    grupo: "Equipos sin enlace",
  })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS, 19 tests

Run: `npm run build`
Expected: compila

- [ ] **Step 5: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Stack the diagram destinations under the equipment they hang from"
```

---

### Task 7: Abrir una tarjeta en rejilla de 12, con reflow local

**Files:**
- Modify: `lib/red/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Produces: `ANCHO_PUERTO = 34`, `ALTO_PUERTO = 26`, `COLUMNAS_PUERTO = 12`; `construirLayout(estado, abiertas)` respeta `abiertas` y produce nodos con `abierta: true`, `puertos` con geometría y `w = 424`.

- [ ] **Step 1: Write the failing test**

Añade a `tests/layout.test.ts`:

```ts
import { ANCHO_PUERTO, COLUMNAS_PUERTO } from "../lib/red/layout.ts";

const ANCHO_ABIERTA = COLUMNAS_PUERTO * ANCHO_PUERTO + 16;

test("una tarjeta abierta mide 12 columnas, tenga 24 o 28 puertos", () => {
  const layout = construirLayout(real(), new Set(["eq:R2-PP2", "eq:R2-SW3"]));
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  const switche = layout.nodos.find(nodo => nodo.id === "eq:R2-SW3");
  assert.equal(panel?.abierta, true);
  assert.equal(panel?.w, ANCHO_ABIERTA);
  assert.equal(panel?.puertos.length, 24);
  assert.equal(switche?.puertos.length, 28);
  assert.equal(switche?.w, ANCHO_ABIERTA);
});

test("los puertos de una tarjeta abierta caben dentro de ella", () => {
  const panel = construirLayout(real(), new Set(["eq:R2-PP2"])).nodos.find(nodo => nodo.id === "eq:R2-PP2");
  assert.ok(panel);
  for (const puerto of panel.puertos) {
    assert.ok(puerto.x >= 0 && puerto.x + puerto.w <= panel.w, `el puerto ${puerto.n} se sale de ancho`);
    assert.ok(puerto.y + puerto.h <= panel.h, `el puerto ${puerto.n} se sale de alto`);
  }
  assert.equal(panel.puertos[0].y, panel.puertos[11].y, "los 12 primeros comparten fila");
  assert.notEqual(panel.puertos[0].y, panel.puertos[12].y, "el 13 baja de fila");
});

test("abrir una tarjeta de R2 no mueve ninguna de R1 ni de R3", () => {
  const cerrado = construirLayout(real());
  const abierto = construirLayout(real(), new Set(["eq:R2-PP2"]));
  const antes = new Map(cerrado.nodos.map(nodo => [nodo.id, nodo.x]));
  for (const nodo of abierto.nodos) {
    if (nodo.zona !== "R1" && nodo.zona !== "R3") continue;
    assert.equal(nodo.x, antes.get(nodo.id), `${nodo.id} se movió`);
  }
});

test("el ancla de un puerto de tarjeta cerrada cae en el centro de la tarjeta", () => {
  const layout = construirLayout(real());
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  assert.ok(panel);
  assert.deepEqual(anclas.get("pto:R2-PP2-p7"), { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 });
});

test("al abrirla, el ancla del puerto pasa a su propia casilla", () => {
  const layout = construirLayout(real(), new Set(["eq:R2-PP2"]));
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP2");
  const puerto = panel?.puertos.find(candidato => candidato.n === 7);
  assert.ok(panel && puerto);
  assert.deepEqual(anclas.get("pto:R2-PP2-p7"), {
    x: panel.x + puerto.x + puerto.w / 2,
    y: panel.y + puerto.y + puerto.h / 2,
  });
});
```

Acuérdate de importar `anclasDeLayout` arriba del archivo si no está.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — la tarjeta abierta sigue midiendo `anchoDeTexto("R2/PP2")` y `puertos` está vacío

- [ ] **Step 3: Write minimal implementation**

En `lib/red/layout.ts`:

```ts
export const ANCHO_PUERTO = 34;
export const ALTO_PUERTO = 26;
export const COLUMNAS_PUERTO = 12;
export const ANCHO_ABIERTA = COLUMNAS_PUERTO * ANCHO_PUERTO + RELLENO;
```

En `nodoDeEquipo`, recibe `abiertas` y resuelve la geometría según el estado:

```ts
const nodoDeEquipo = (estado: EstadoRed, equipo: EstadoRed["equipos"][number], abiertas: Set<string>): Nodo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  const id = conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`;
  const abierta = conRejilla && abiertas.has(id);
  const filas = abierta ? Math.ceil(puertos.length / COLUMNAS_PUERTO) : 0;
  return {
    id,
    clase: conRejilla ? "equipo" : "aparato",
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    zona: FILA_BORDE.includes(equipo.tipo) ? ZONA_BORDE : equipo.rack || ZONA_BORDE,
    fila: filaDeEquipo(equipo.tipo),
    x: 0, y: 0,
    w: abierta ? ANCHO_ABIERTA : anchoDeTexto(codigo),
    h: ALTO_TARJETA + filas * (ALTO_PUERTO + 4),
    abierta,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: abierta
      ? puertos.map((puerto, indice) => ({
          id: puerto.id,
          n: puerto.n,
          estado: puerto.estado,
          x: RELLENO / 2 + (indice % COLUMNAS_PUERTO) * ANCHO_PUERTO,
          y: ALTO_TARJETA + Math.floor(indice / COLUMNAS_PUERTO) * (ALTO_PUERTO + 4),
          w: ANCHO_PUERTO - 4,
          h: ALTO_PUERTO,
        }))
      : [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    sinRuta: false,
  };
};
```

En el bucle de filas 0 y 1, el alto de la fila deja de ser fijo:

```ts
const altoFila = Math.max(...cartas.map(carta => carta.h));
// ...
alto += altoFila + SEPARACION_FILA;
```

**El reflow local no sale gratis.** Con el avance acumulado de `x` que dejó la Task 5, abrir una tarjeta de R2 ensancha la zona R2 y empuja R3 hacia la derecha, que es justo lo que el test prohíbe. R1 no se mueve solo porque va antes en el orden.

Extrae la medición a una función que se pueda llamar dos veces:

```ts
// La rejilla de zonas se calcula siempre con todo cerrado, para que abrir una
// tarjeta no empuje a los racks vecinos: la zona abierta se desborda sobre la
// siguiente en vez de reacomodar el lienzo entero.
const anchoDeZona = (estado: EstadoRed, idZona: string, abiertas: Set<string>) => {
  const dentro = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas))
    .filter(nodo => nodo.zona === idZona);
  const anchoDeFila = (fila: number) => {
    const cartas = dentro.filter(nodo => nodo.fila === fila);
    return cartas.length ? cartas.reduce((suma, carta) => suma + carta.w + SEPARACION, 0) - SEPARACION : 0;
  };
  return Math.max(anchoDeFila(0), anchoDeFila(1)) + RELLENO_ZONA * 2;
};
```

y en el bucle de zonas, avanza `x` con el ancho cerrado mientras dibujas con el ancho real:

```ts
const w = ancho + RELLENO_ZONA * 2;
zonas.push({ id: idZona, nombre: nombreDeZona(estado, idZona), x, y: 0, w, h: alto });
x += anchoDeZona(estado, idZona, new Set()) + SEPARACION_ZONA;
```

El test «cada tarjeta cabe dentro de su zona» de la Task 5 sigue pasando porque `zona.w` es el ancho **real**, no el cerrado: lo que se ancla es solo el avance de `x`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS, 24 tests

Run: `npm run build`
Expected: compila

- [ ] **Step 5: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Expand an equipment card into a twelve column port grid"
```

---

### Task 8: Dibujar zonas, tarjetas cerradas y tarjetas abiertas

**Files:**
- Modify: `app/red/diagrama-nodos.tsx`
- Modify: `app/globals.css:167-189`

**Interfaces:**
- Consumes: `Layout`, `Nodo`, `Zona`, `ResumenPuertos` de `lib/red/layout`.
- Produces: `PropsNodos` gana `onAbrir` para alternar una tarjeta: `onAlternar: (id: string) => void`.

La tipografía deja de escalar al revés: `tipografia` desaparece y los tamaños se escriben en unidades de layout.

- [ ] **Step 1: Escribe el dibujo de zonas y tarjetas**

En `app/red/diagrama-nodos.tsx`, borra `const tipografia = 13 / escala;` y todos los `style={{ fontSize: ... }}` que lo usaban. Con eso la prop `escala` queda sin uso: **bórrala de `PropsNodos` y de la desestructuración**, o `npm run lint` la marca. La Task 11 deja de pasarla desde `diagrama.tsx`; hasta entonces sobra un atributo en el JSX, que TypeScript sí acepta quitar del tipo y seguir compilando el llamador solo si lo quitas también allí — así que quítalo en los dos archivos en este mismo paso.

Amplía el import de tipos:

```ts
import { anclasDeLayout, type Layout, type Nodo, type PuertoNodo, type ResumenPuertos } from "../../lib/red/layout";
```

Y añade `onAlternar: (id: string) => void` a `PropsNodos`.

La marca de corte también usa `escala`; pásala a unidades fijas:

```tsx
{cortada && <g className="net-d-corte" transform={`translate(${cortada.x} ${cortada.y})`}>
  <circle r={13} />
  <text y={5}>×</text>
</g>}
```

y en `app/globals.css` dale tamaño a ese texto, que antes venía por `style`:

```css
.net-d-corte text{fill:#fff;text-anchor:middle;font:700 15px var(--font-mono);pointer-events:none}
```

Añade el dibujo de zonas antes de las aristas:

```tsx
{layout.zonas.map(zona => (
  <g key={zona.id} className="net-d-zona">
    <rect x={zona.x} y={zona.y} width={zona.w} height={zona.h} rx={10} />
    <text x={zona.x + 12} y={zona.y + 16}>{zona.nombre}</text>
  </g>
))}
```

Y reemplaza el cuerpo de cada nodo:

```tsx
{layout.nodos.map(nodo => <g key={nodo.id} className={clasesNodo(nodo)} transform={`translate(${nodo.x} ${nodo.y})`}>
  <title>{nodo.etiqueta}</title>
  <rect
    width={nodo.w} height={nodo.h} rx={6}
    role="button" tabIndex={0}
    aria-label={etiquetaAccesible(nodo)}
    onKeyDown={evento => alTeclado(evento, nodo)}
    onClick={() => (nodo.clase === "equipo" ? onAlternar(nodo.id) : onPunto(nodo.id))}
    onDoubleClick={() => onFicha(nodo.id)}
  />
  <text className="net-d-codigo" x={10} y={19}>{nodo.codigo}</text>
  {nodo.resumen && <text className="net-d-resumen" x={10} y={34}>{textoResumen(nodo.resumen)}</text>}
  {nodo.puertos.map(puerto => <g key={puerto.id} className={clasesPuerto(puerto)}>
    <rect x={puerto.x} y={puerto.y} width={puerto.w} height={puerto.h} rx={3}
      role="button" tabIndex={0}
      aria-label={`Puerto ${puerto.n}, ${puerto.estado}. Enter para seleccionar; doble clic para abrir la ficha.`}
      onKeyDown={evento => alTecladoPuerto(evento, puerto.id)}
      onClick={evento => { evento.stopPropagation(); onPunto(puerto.id); }}
      onDoubleClick={evento => { evento.stopPropagation(); onFicha(puerto.id); }} />
    <text x={puerto.x + puerto.w / 2} y={puerto.y + puerto.h / 2 + 5}>{puerto.n}</text>
  </g>)}
</g>)}
```

con estos ayudantes, que reemplazan al `alTeclado` de hoy:

```tsx
const clasesPuerto = (puerto: PuertoNodo) => ["net-d-pt", puerto.estado, nivel(puerto.id),
  seleccionado === puerto.id ? "sel" : "", origen === puerto.id ? "origen" : ""].filter(Boolean).join(" ");

const alTeclado = (evento: React.KeyboardEvent<SVGRectElement>, nodo: Nodo) => {
  if (evento.key !== "Enter" && evento.key !== " ") return;
  evento.preventDefault();
  if (nodo.clase === "equipo") onAlternar(nodo.id);
  else onPunto(nodo.id);
};

const alTecladoPuerto = (evento: React.KeyboardEvent<SVGRectElement>, id: string) => {
  if (evento.key !== "Enter" && evento.key !== " ") return;
  evento.preventDefault();
  onPunto(id);
};

const textoResumen = (resumen: ResumenPuertos) => {
  if (resumen.sinVerificar === resumen.total) return `${resumen.total} sin verificar`;
  const partes = [`${resumen.ocupados}/${resumen.total}`];
  if (resumen.dañados) partes.push(`${resumen.dañados} dañados`);
  return partes.join(" · ");
};

const etiquetaAccesible = (nodo: Nodo) => nodo.clase === "equipo"
  ? `${nodo.etiqueta}. Enter para ${nodo.abierta ? "cerrar" : "abrir"} sus puertos; doble clic para abrir la ficha.`
  : `${nodo.etiqueta}. Enter para seleccionar; doble clic para abrir la ficha.`;
```

- [ ] **Step 2: Ajusta el CSS**

En `app/globals.css`, reemplaza las reglas de nodo y puerto:

```css
.net-d-zona rect{fill:#eef1f4;stroke:#d7dce2;stroke-width:1}
.net-d-zona text{fill:var(--muted);font:700 11px var(--font-mono);letter-spacing:.09em;text-transform:uppercase;pointer-events:none}
.net-d-nodo rect{fill:var(--surface);stroke:#c2c9d2;stroke-width:1.5;cursor:pointer}
.net-d-nodo.equipo>rect{fill:#f7f8f9}
.net-d-nodo.aparato>rect,.net-d-nodo.espacio>rect,.net-d-nodo.cubiculo>rect{fill:var(--surface)}
.net-d-nodo.alcance>rect{stroke:#8da8c2}
.net-d-nodo.ruta>rect,.net-d-nodo.sel>rect{stroke:var(--ink);stroke-width:3}
.net-d-nodo.sin-ruta>rect{stroke-dasharray:6 4;stroke:var(--warning)}
.net-d-nodo.origen>rect{stroke:var(--ok);stroke-width:3}
.net-d-codigo{fill:var(--ink);font:700 15px var(--font-mono);pointer-events:none}
.net-d-resumen{fill:var(--muted);font:11px var(--font-mono);pointer-events:none}
.net-d-nodo.sin-ruta .net-d-codigo{fill:var(--warning)}
.net-d-pt rect{fill:var(--surface);stroke:#c2c9d2;stroke-width:1}
.net-d-pt.ocupado rect{fill:var(--green);stroke:var(--green)}
.net-d-pt.desconocido rect{fill:#fdf6e4;stroke:var(--warning);stroke-dasharray:3 2}
.net-d-pt.dañado rect{fill:#f6dfe2;stroke:var(--red)}
.net-d-pt text{fill:var(--muted);font:11px var(--font-mono);text-anchor:middle;pointer-events:none}
.net-d-pt.ocupado text{fill:#fff}
.net-d-pt.ruta rect,.net-d-pt.sel rect,.net-d-pt.origen rect{stroke:var(--ink);stroke-width:2.5}
```

Borra la regla vieja `.net-d-nombre` y la de `.net-d-nodo.equipo>rect{...pointer-events:none}`: ahora la caja del equipo **sí** recibe clic, para abrirse.

- [ ] **Step 3: Verifica en el navegador**

Run: `npm run dev` y abre `http://localhost:3000/red`, pestaña DIAGRAMA.
Expected: se ven tres zonas rotuladas, cada equipo como una tarjeta con su código y su ocupación, y al hacer clic en una tarjeta de equipo se despliega su rejilla de puertos numerados.

- [ ] **Step 4: Commit**

```bash
git add app/red/diagrama-nodos.tsx app/globals.css
git commit -m "Draw the diagram as rack zones with collapsible equipment cards"
```

---

### Task 9: Aristas con grosor por cuenta y la opacidad invertida

**Files:**
- Modify: `app/red/diagrama-nodos.tsx`
- Modify: `app/globals.css:164-166`

**Interfaces:**
- Consumes: `Arista` con `cuenta`.

- [ ] **Step 1: Cambia el dibujo de la arista**

En `app/red/diagrama-nodos.tsx`, reemplaza la constante de color y el `map` de aristas:

```tsx
const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#182334" } as const;
const grosorDe = (cuenta: number) => Math.min(7, 2 + Math.log2(Math.max(cuenta, 1)));

{layout.aristas.map(arista => {
  const a = anclas.get(arista.a);
  const b = anclas.get(arista.b);
  if (!a || !b) return null;
  const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return <g key={arista.clave} className={`net-d-link ${nivelArista(arista)}`}>
    <path d={trazo(arista, a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={grosorDe(arista.cuenta)} fill="none" />
    {arista.cuenta > 1 && <text className="net-d-cuenta" x={medio.x} y={medio.y}>×{arista.cuenta}</text>}
  </g>;
})}
```

**Los uplinks entre racks van horizontales**, no en curva vertical: unen dos switches que están a la misma altura, y la curva actual —que sale hacia abajo y vuelve a subir— atraviesa las tarjetas de la fila de paneles. Añade el selector de trazo:

```tsx
// Un uplink entre racks une dos switches a la misma altura: una curva vertical
// bajaría hasta la fila de paneles y volvería a subir, cruzando las tarjetas.
const trazo = (arista: Arista, a: Punto, b: Punto) => {
  if (arista.tipo !== "uplink" || Math.abs(a.y - b.y) > 8) return curva(a, b);
  const medio = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${medio} ${a.y}, ${medio} ${b.y}, ${b.x} ${b.y}`;
};
```

donde `type Punto = { x: number; y: number }`. El umbral de 8 unidades deja que un uplink interno al rack —`R3/SW1 p28 ↔ R3/SW2 p28`, que también está a la misma altura— use el mismo trazo horizontal, que es lo correcto, y que cualquier uplink entre filas distintas caiga en la curva de siempre.

- [ ] **Step 2: Cambia la opacidad en el CSS**

```css
.net-d-link{opacity:.5}
.net-d-link path{fill:none}
.net-d-cuenta{fill:var(--muted);font:700 11px var(--font-mono);text-anchor:middle;paint-order:stroke;stroke:#f7f8f9;stroke-width:4px;pointer-events:none}
.net-d-lienzo.sel-activa .net-d-link{opacity:.12}
.net-d-lienzo.sel-activa .net-d-link.alcance{opacity:.5}
.net-d-lienzo.sel-activa .net-d-link.ruta{opacity:1}
.net-d-link.ruta path{stroke-width:6}
```

Borra las reglas viejas `.net-d-link{fill:none;opacity:.18}`, `.net-d-link.alcance{opacity:.4}` y `.net-d-link.ruta{opacity:1;stroke-width:6}`.

- [ ] **Step 3: Añade la clase al `<g>` raíz**

En `app/red/diagrama.tsx`, en el `<g>` que ya aplica el transform:

```tsx
<g className={`net-d-lienzo ${seleccionado ? "sel-activa" : ""}`} transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
```

- [ ] **Step 4: Verifica en el navegador**

Run: `npm run dev`, abre DIAGRAMA.
Expected: 16 aristas visibles con `×N` escrito sobre las que agrupan más de un enlace; al hacer clic en un nodo, lo que no alcanza se apaga en vez de que todo esté apagado por defecto.

- [ ] **Step 5: Commit**

```bash
git add app/red/diagrama-nodos.tsx app/red/diagrama.tsx app/globals.css
git commit -m "Weight the diagram edges by link count and invert the dimming"
```

---

### Task 10: Leyenda fija bajo el lienzo

**Files:**
- Create: `app/red/diagrama-leyenda.tsx`
- Modify: `app/red/diagrama.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Crea el componente**

```tsx
const PUERTOS = [
  { clase: "ocupado", texto: "ocupado" },
  { clase: "libre", texto: "libre" },
  { clase: "desconocido", texto: "sin verificar" },
  { clase: "dañado", texto: "dañado" },
];
const ENLACES = [
  { color: "#182334", texto: "borde" },
  { color: "#a65330", texto: "uplink" },
  { color: "#294f7c", texto: "patch" },
  { color: "#237a52", texto: "roseta" },
];

export default function DiagramaLeyenda() {
  return (
    <div className="net-d-leyenda">
      {PUERTOS.map(item => <span key={item.clase}><i className={`pt ${item.clase}`} aria-hidden="true" />{item.texto}</span>)}
      <b aria-hidden="true" />
      {ENLACES.map(item => <span key={item.texto}><i className="ln" style={{ borderTopColor: item.color }} aria-hidden="true" />{item.texto}</span>)}
      <b aria-hidden="true" />
      <span className="aviso">┈ sin ruta al ISP</span>
      <span className="falla">╳ corte de la cadena</span>
    </div>
  );
}
```

- [ ] **Step 2: Móntalo y dale estilo**

En `app/red/diagrama.tsx`, justo después del `div.net-diagram-canvas`:

```tsx
<DiagramaLeyenda />
```

En `app/globals.css`:

```css
.net-d-leyenda{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:9px 14px;border-bottom:1px solid var(--line);background:#f7f8f9;font-size:10px;color:var(--muted)}
.net-d-leyenda span{display:flex;align-items:center;gap:5px;white-space:nowrap}
.net-d-leyenda i{display:inline-block;width:16px;height:12px;border-radius:2px;border:1px solid #c2c9d2}
.net-d-leyenda i.pt.ocupado{background:var(--green);border-color:var(--green)}
.net-d-leyenda i.pt.libre{background:var(--surface)}
.net-d-leyenda i.pt.desconocido{background:#fdf6e4;border-color:var(--warning);border-style:dashed}
.net-d-leyenda i.pt.dañado{background:#f6dfe2;border-color:var(--red)}
.net-d-leyenda i.ln{height:0;border:0;border-top:3px solid;border-radius:0}
.net-d-leyenda b{width:1px;height:14px;background:var(--line)}
.net-d-leyenda .aviso{color:var(--warning)}
.net-d-leyenda .falla{color:var(--red)}
@media(max-width:600px){.net-d-leyenda{gap:6px 10px;line-height:1.5}}
```

- [ ] **Step 3: Verifica en el navegador**

Expected: la tira aparece bajo el lienzo, en una línea en escritorio y envuelta en móvil, con los ocho colores explicados.

- [ ] **Step 4: Commit**

```bash
git add app/red/diagrama-leyenda.tsx app/red/diagrama.tsx app/globals.css
git commit -m "Add a fixed legend for the diagram colour code"
```

---

### Task 11: Estado de tarjetas abiertas, cerrar todo y encuadre al ancho

**Files:**
- Modify: `app/red/diagrama.tsx`

**Interfaces:**
- Consumes: `construirLayout(estado, abiertas)`, `DiagramaNodos` con `onAlternar`.

- [ ] **Step 1: Añade el estado de abiertas**

```tsx
const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
const layout = useMemo(() => construirLayout(estado, abiertas), [estado, abiertas]);

const alternar = useCallback((id: string) => {
  setAbiertas(actual => {
    const siguiente = new Set(actual);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    return siguiente;
  });
}, []);
```

En modo conectar, el clic sobre una tarjeta cerrada la abre en vez de seleccionarla; eso ya lo cumple `onAlternar` porque `DiagramaNodos` manda los equipos a `onAlternar` en los dos modos. Pásalo al componente:

```tsx
<DiagramaNodos layout={layout} ruta={ruta} alcance={cadena.alcanzables} seleccionado={seleccionado} origen={origen} corte={corte} onPunto={alPunto} onFicha={onAbrir} onAlternar={alternar} />
```

La prop `escala` ya se quitó en la Task 8; aquí solo confirma que no quedó en el JSX.

- [ ] **Step 2: Añade el botón de cerrar todo**

En el `.net-seg` del zoom:

```tsx
<button onClick={() => setAbiertas(new Set())} disabled={!abiertas.size}>CERRAR TODO</button>
```

- [ ] **Step 3: Cambia `ajustar()`**

```tsx
const ajustar = useCallback(() => {
  const caja = contenedor.current?.getBoundingClientRect();
  if (!caja || !layout.ancho) return;
  const escala = Math.min(Math.max(caja.width / (layout.ancho + MARGEN * 2), 0.55), 1.15);
  const alto = layout.alto * escala;
  setVista({
    escala,
    x: (caja.width - layout.ancho * escala) / 2,
    y: alto < caja.height ? (caja.height - alto) / 2 : MARGEN * escala,
  });
}, [layout]);
```

- [ ] **Step 4: Corre la suite completa**

Run: `npm test`
Expected: PASS — build limpio y los cinco archivos de prueba en verde

Run: `npm run lint`
Expected: sin errores

- [ ] **Step 5: Verificación manual**

Run: `npm run dev`, abre `http://localhost:3000/red` → DIAGRAMA.

Comprueba una por una:
1. La escala de ajuste queda cerca de 1.1 y **todas** las etiquetas se leen enteras, sin `…`.
2. Las tres zonas de rack se distinguen y salen en el orden R1, R2, R3.
3. `R1/PP1` muestra `24 sin verificar`; `R2/PP2` muestra `19/24 · 4 dañados`.
4. FORTINET, MIKROTIK y R3/PP2 salen con borde punteado ámbar, no rojo.
5. Seleccionar `UTP E. Básica` resalta su ruta y apaga lo que no alcanza.
6. Abrir `R2/PP2` despliega 24 puertos numerados, con 4 en rojo; R1 y R3 no se mueven.
7. Abrir además `R2/SW2` desagrega esa arista en sus 19 líneas puerto a puerto.
8. `CERRAR TODO` vuelve al estado inicial.
9. En modo conectar, abrir un panel y asignarle un espacio de la bandeja registra el enlace.
10. La bandeja tiene el grupo `Equipos sin enlace` con los dos APs.

- [ ] **Step 6: Commit**

```bash
git add app/red/diagrama.tsx
git commit -m "Drive the diagram from the open card set and fit it to width"
```

---

## Notas de riesgo

**El reflow local de la Task 7 es el punto que más probablemente falle.** El test «abrir una tarjeta de R2 no mueve R1 ni R3» pasa trivialmente para R1 (va antes en el orden) pero exige trabajo real para R3. El Step 3 trae la salida: anclar cada zona al ancho que tendría cerrada. Si esa solución resulta fea al verla en pantalla —una zona abierta desbordando sobre la siguiente—, la alternativa aceptable es que la zona abierta sí empuje a las siguientes y **relajar el test a R1 solamente**, dejando escrito por qué. Lo que no vale es borrar el test.

**`npm test` corre `next build` primero.** Si un paso intermedio deja el proyecto sin compilar, todas las pruebas fallan con un error que no habla de la prueba. Por eso los pasos usan `node --experimental-strip-types --test`, y `npm run build` aparece explícito donde toca.
