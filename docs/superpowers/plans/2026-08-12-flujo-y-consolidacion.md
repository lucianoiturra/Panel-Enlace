# Diagrama de flujo, aire interno y consolidación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar aire al texto, eliminar el solapamiento de las tarjetas de espacio, reemplazar el mapa por racks del diagrama por un flujo de cuatro capas de ancho constante, y disolver la pestaña MONITOREO repartiendo sus tres secciones.

**Architecture:** `lib/red/flujo.ts` nace como módulo puro con sus pruebas antes que sus consumidores, y reemplaza a `construirLayout()` publicando el mismo contrato de anclas (`id → {x,y}`) para que la interacción del diagrama —conectar, arrastrar puntas, ordenar— no cambie. `lib/red/estado-cubiculo.ts` cruza los cubículos documentados con la red viva siguiendo el patrón ya establecido por `lib/red/estado-efectivo.ts`. Todo lo visual vive en `app/globals.css`.

**Tech Stack:** Next.js 16.2.12, React 19.2.6, TypeScript 5.9.3, Node ≥22.13, `node --test` con `--experimental-strip-types`, Drizzle + postgres.js, Tailwind 4 (solo el `@import`; el estilo real es CSS plano).

## Global Constraints

- **Rama:** todo el trabajo va sobre `feat/flujo-y-consolidacion`. No se commitea a `main`.
- **Idioma del código:** identificadores, tipos y comentarios en español, como todo el repo. `estado`, `nodo`, `cinta`, `capa`.
- **Imports:** entre módulos de `lib/` llevan extensión `.ts` explícita (`from "./modelo.ts"`). Desde `app/` **no** la llevan (`from "../../lib/red/flujo"`). Es lo que hace hoy cada archivo; seguirlo exactamente.
- **Comentarios:** explican **por qué**, no qué. No agregar comentarios que repitan el código.
- **Pruebas:** `npm test` corre `npm run build` y después `node --experimental-strip-types --test tests/*.test.ts`. Para iterar rápido en una sola prueba: `node --experimental-strip-types --test tests/flujo.test.ts`.
- **Lo vivo nunca sobrescribe lo documentado.** La capa de red viva se muestra al lado del dato documentado, nunca en su lugar y nunca escribiendo en la base.
- **Guardia de frescura:** `MINUTOS_FRESCURA = 15`, ya exportado por `lib/red/estado-efectivo.ts`. Reutilizarlo; no redefinir el umbral.
- **El repo vive en cabserver** (`/srv/apps/panel-enlace`). Los comandos se corren ahí.

---

## Estructura de archivos

| Archivo | Responsabilidad | Estado |
| --- | --- | --- |
| `app/globals.css` | escala de espaciado, tarjetas de espacio, columnas y cintas del flujo | modificar |
| `app/red/vista-espacios.tsx` | envolver el texto de la conexión para poder truncarlo | modificar |
| `lib/red/flujo.ts` | puro: `EstadoRed` + abiertas → columnas, bloques, nodos, cintas, anclas | **crear** |
| `tests/flujo.test.ts` | pruebas de `flujo.ts` | **crear** |
| `app/red/diagrama-nodos.tsx` | dibuja columnas, bloques, cintas y nodos | modificar |
| `app/red/diagrama.tsx` | consume `construirFlujo`; la tira del circuito sube a encabezado | modificar |
| `lib/red/layout.ts` | conserva `ordenarPor`, `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos`, tipos y constantes | podar |
| `tests/layout.test.ts` | se poda a lo que sobrevive | modificar |
| `lib/red/estado-cubiculo.ts` | puro: `Station[]` + `Reconciliacion` → `CubiculoEfectivo[]` | **crear** |
| `tests/estado-cubiculo.test.ts` | pruebas de `estado-cubiculo.ts` | **crear** |
| `app/page.tsx` | SALA: rail vivo, punto vivo en el plano, bloque RED VIVA en la ficha | modificar |
| `app/red/ficha.tsx` | testigo con guardado explícito | modificar |
| `app/salud/page.tsx` | bloque «Equipos sin documentar» | modificar |
| `app/nav-secciones.tsx` | tres pestañas | modificar |
| `app/monitoreo/page.tsx` | redirección a `/` | reemplazar |

Se conservan sin tocar: `lib/red/aristas.ts`, `lib/red/trazado.ts`, `lib/red/modelo.ts`, `lib/red/reconciliacion.ts`, `lib/red/estado-ubicacion.ts`, `lib/red/estado-efectivo.ts`, y las dos rutas `app/api/monitoreo/*`.

---

# FASE 1 · Aire interno y solapamiento

### Task 1: Escala de espaciado

**Files:**
- Modify: `app/globals.css:3` (`:root`) y los selectores de la tabla

**Interfaces:**
- Consumes: nada
- Produces: las variables CSS `--esp-1` … `--esp-6`, disponibles para el resto del plan

No hay prueba automatizada posible: el repo no tiene pruebas de DOM ni de estilo. La verificación es `npm run build`, `npm run lint` y una pasada manual por cuatro anchos.

- [ ] **Step 1: Añadir los tokens y el comentario de exclusiones**

En `app/globals.css`, reemplazar la línea 3 completa por:

```css
/* Escala de espaciado. Antes de esto convivían 3, 5, 6, 7, 8, 9, 10, 11, 12, 13,
   14, 16, 18, 20, 22, 25, 27 y 28px, elegidos uno por uno; los más bajos dejaban
   el texto pegado al filo de su caja.
   NO aplicar la escala a lo que mide algo: .station (58px, define el plano de la
   sala), .net-pt y .net-strip (la tira de puertos), .wol-dias button (36x36),
   .brand-mark, .icon-button, .task-check, .task-delete, y los mínimos de 44px de
   @media(pointer:coarse). Ahí el tamaño es la geometría, no el estilo. */
:root { --ink:#182334; --muted:#596474; --canvas:#f3f4f6; --surface:#ffffff; --green:#294f7c; --ok:#237a52; --warning:#986900; --line:#d7dce2; --orange:#a65330; --red:#a33442; --gray:#68717e; --focus:#0e5aa7;
  --esp-1:4px; --esp-2:8px; --esp-3:12px; --esp-4:16px; --esp-5:24px; --esp-6:32px; }
```

- [ ] **Step 2: Aplicar la escala a los diez selectores del spec**

Cambios exactos, uno por uno:

| Línea aprox. | Selector | De | A |
| --- | --- | --- | --- |
| 629 | `.mon-table th,.mon-table td` | `padding:9px 12px` | `padding:var(--esp-3) var(--esp-4)` |
| 168 | `.net-table th` | `padding:7px 8px` | `padding:var(--esp-2) var(--esp-3)` |
| 169 | `.net-table td` | `padding:6px 8px` | `padding:var(--esp-2) var(--esp-3)` |
| 497 | `.net-space-row` | `padding:9px 12px` | `padding:var(--esp-3) var(--esp-4)` |
| 539 | `.net-space-card` | `padding:12px` | `padding:var(--esp-4)` |
| 65 | `.net-card` | `padding:9px 10px` | `padding:var(--esp-3) var(--esp-4)` |
| 653 | `.wol-linea` | `padding:13px 16px` | `padding:var(--esp-4) var(--esp-5)` |
| 113 | `.net-rack-head` | `padding:13px 15px` | `padding:var(--esp-4) var(--esp-5)` |
| 118 | `.net-chip` | `padding:3px 8px` | `padding:var(--esp-1) var(--esp-3)` |
| 125 | `.net-eq-id` | `padding:9px 11px` | `padding:var(--esp-3) var(--esp-4)` |
| 137 | `.net-eq-puertos` | `padding:9px 11px` | `padding:var(--esp-3) var(--esp-4)` |

Además, en `.net-space-list-head` (línea 495) cambiar `padding:0 12px` por `padding:0 var(--esp-4)` para que la cabecera de la lista siga alineada con sus filas. **Este es el único cambio que no está en la tabla del spec y existe solo para no romper una alineación que el cambio de `.net-space-row` movería.**

- [ ] **Step 3: Verificar que compila y pasa el lint**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: lint sin errores, build exitoso.

- [ ] **Step 4: Verificación manual**

Abrir el panel por Tailscale y revisar a **1440, 1000, 760 y 375 px** de ancho:

1. SALA: el plano de 4 columnas × 10 puestos sigue intacto, los puestos siguen midiendo 58px y no hay scroll horizontal donde no lo había.
2. SALA: la caja de ENCENDIDO PROGRAMADO tiene aire entre su borde izquierdo y la palabra `ENCENDIDO PROGRAMADO`.
3. RED → Espacios: las celdas de la tabla ya no pegan al filo.
4. SALUD: las filas de las cuatro tablas respiran.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/globals.css
git commit -m "style: escala de espaciado y aire interno

Los paddings se habían elegido uno por uno y los más bajos dejaban el texto
pegado al filo. Seis tokens los reemplazan. Quedan fuera a propósito los
elementos cuyo tamaño es su geometría; la lista va en un comentario para que
el próximo barrido no se los lleve por delante.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: El solapamiento de las tarjetas y filas de espacio

**Files:**
- Modify: `app/red/vista-espacios.tsx:70-75` (`conexion`)
- Modify: `app/globals.css` (`.net-space-connection`, `.net-space-card-foot`, `.net-space-state`, bloque `@media(max-width:760px)`)

**Interfaces:**
- Consumes: los tokens `--esp-*` de la Task 1
- Produces: la clase `.net-space-connection-texto`, que no usa nadie más

- [ ] **Step 1: Envolver el texto de la conexión en su propio span**

En `app/red/vista-espacios.tsx`, reemplazar la función `conexion` completa (líneas 70-75):

```tsx
  // El texto va en su propio span y no suelto dentro del contenedor flex:
  // text-overflow no tiene efecto sobre un contenedor flex, así que el
  // ellipsis que esta fila declaraba nunca llegó a recortar nada.
  const conexion = (espacio: EspacioEfectivo) => {
    const datos = datosDe(espacio);
    return datos.puertos.length
      ? <span className="net-space-connection documented"><i aria-hidden="true">↳</i><span className="net-space-connection-texto">{datos.conexion}</span></span>
      : <span className="net-space-connection undocumented"><i aria-hidden="true">!</i><span className="net-space-connection-texto">Sin documentar</span></span>;
  };
```

- [ ] **Step 2: Mover el truncado al span interior y partir el pie de la tarjeta**

En `app/globals.css`, reemplazar las líneas 516-521 (el bloque `.net-space-connection`) por:

```css
.net-space-connection{display:flex;min-width:0;align-items:center;gap:7px;font:700 11px var(--font-mono);line-height:1.35}
.net-space-connection i{display:grid;width:16px;height:16px;flex:0 0 16px;place-items:center;border-radius:3px;font-size:10px;font-style:normal}
.net-space-connection-texto{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.net-space-connection.documented{color:var(--green)}
.net-space-connection.documented i{background:#e6f2ec;color:var(--ok)}
.net-space-connection.undocumented{color:#795600}
.net-space-connection.undocumented i{border:1px dashed #b88918;background:#fff6da}
```

Reemplazar `.net-space-card-foot` (línea 547) por:

```css
/* Grid de una columna y no flex con space-between: los dos hijos llevan
   white-space:nowrap y conservan min-width:auto, así que en una tarjeta angosta
   no encogían, desbordaban y se pintaban encima. Dos elementos que no comparten
   fila no pueden solaparse a ningún ancho. */
.net-space-card-foot{display:grid;gap:var(--esp-2);justify-items:start;margin-top:auto}
.net-space-card-foot .net-space-connection{max-width:100%}
```

Reemplazar `.net-space-state` (línea 513) por:

```css
.net-space-state{display:inline-flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
```

- [ ] **Step 3: Ajustar la vista lista, que sufre lo mismo con menos margen**

En el bloque `@media(max-width:760px)`, reemplazar la regla `.net-space-connection` (línea 607) por:

```css
  .net-space-connection{grid-column:2;grid-row:3;justify-self:end;max-width:48vw}
```

y borrar de ahí `overflow:hidden;text-overflow:ellipsis;white-space:nowrap`, que ahora los aplica `.net-space-connection-texto`.

En el bloque `@media(max-width:1000px)` añadir, para que las celdas de la rejilla puedan encoger:

```css
  .net-space-row>span{min-width:0}
```

- [ ] **Step 4: Verificar que compila y pasa el lint**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: lint sin errores, build exitoso.

- [ ] **Step 5: Verificación manual — el criterio de aceptación del spec**

En RED → Espacios, vista **Cuadrícula**, agrupado por tipo:

1. Estrechar la ventana hasta que las tarjetas queden en su ancho mínimo (250px). **Ninguna insignia `AUTO`/`MANUAL` debe montarse sobre el texto de la conexión.** Este es el caso exacto de las capturas 3 y 4.
2. El espacio con el nombre de conexión más largo (`Wifi Área Financiera`) debe truncar con `…`, no desbordar ni encimarse.
3. Cambiar a vista **Lista** y repetir entre 1000 y 760 px.
4. A 375 px, comprobar que la fila apilada sigue mostrando estado y conexión en filas distintas.

- [ ] **Step 6: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/globals.css app/red/vista-espacios.tsx
git commit -m "fix: el estado y la conexión de un espacio ya no se solapan

.net-space-card-foot era un flex con space-between y dos hijos que no podían
encoger: en una tarjeta angosta desbordaban y se pintaban encima. Pasa a grid
de una columna.

De paso, el ellipsis de .net-space-connection nunca funcionó: estaba sobre un
contenedor flex, donde text-overflow no aplica. El texto pasa a un span propio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 2 · El diagrama pasa a ser un flujo

### Task 3: `lib/red/flujo.ts` — capas y clasificación

**Files:**
- Create: `lib/red/flujo.ts`
- Create: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `TipoEquipo`, `EstadoRed` de `lib/red/modelo.ts`
- Produces:
  - `type Capa = "borde" | "switches" | "patch" | "destinos"`
  - `const CAPAS: Capa[]`
  - `const TITULO_CAPA: Record<Capa, string>`
  - `capaDeEquipo(tipo: TipoEquipo): Capa`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/flujo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPAS, capaDeEquipo } from "../lib/red/flujo.ts";

test("cada tipo de equipo cae en su capa", () => {
  assert.equal(capaDeEquipo("isp"), "borde");
  assert.equal(capaDeEquipo("firewall"), "borde");
  assert.equal(capaDeEquipo("router"), "borde");
  assert.equal(capaDeEquipo("switch"), "switches");
  assert.equal(capaDeEquipo("patchpanel"), "patch");
});

// Un AP cuelga de un puerto y no tiene puertos propios que mostrar: es una hoja,
// aunque esté enchufado directo al firewall como AP-cab-enlace.
test("un punto de acceso es siempre un destino", () => {
  assert.equal(capaDeEquipo("ap"), "destinos");
});

test("las capas van del borde a los destinos", () => {
  assert.deepEqual(CAPAS, ["borde", "switches", "patch", "destinos"]);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: FAIL con `Cannot find module` sobre `../lib/red/flujo.ts`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/red/flujo.ts`:

```ts
import type { TipoEquipo } from "./modelo.ts";

/**
 * Las capas del diagrama son semánticas y fijas, no la distancia al ISP.
 *
 * Calcularlas por saltos —lo que haría un Sankey de manual— desplegaría la
 * cadena de uplinks en columnas: R1/SW1 a profundidad 2, R2/SW1 a 3, R3/SW1 a 4,
 * R3/SW2 a 5. Cuatro columnas de switches hoy y una más por cada switch que se
 * sume a la cadena, que es exactamente el defecto que este diseño viene a
 * arreglar. Con capas fijas, un switch nuevo crece hacia abajo.
 */
export type Capa = "borde" | "switches" | "patch" | "destinos";

export const CAPAS: Capa[] = ["borde", "switches", "patch", "destinos"];

export const TITULO_CAPA: Record<Capa, string> = {
  borde: "Borde · salida a internet",
  switches: "Switches",
  patch: "Patch panels",
  destinos: "Destinos",
};

const BORDE: TipoEquipo[] = ["isp", "firewall", "router"];

export const capaDeEquipo = (tipo: TipoEquipo): Capa => {
  if (BORDE.includes(tipo)) return "borde";
  if (tipo === "switch") return "switches";
  if (tipo === "patchpanel") return "patch";
  return "destinos";
};
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: PASS, 3 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "feat: capas semánticas del diagrama de flujo

Fijas y no por distancia al ISP: por saltos, la cadena de tres uplinks
desplegaría cuatro columnas de switches y el diagrama volvería a crecer a lo
ancho, que es el defecto que se viene a arreglar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `flujo.ts` — nodos, columnas y ancho constante

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `capaDeEquipo`, `CAPAS`, `TITULO_CAPA` (Task 3); `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos`, `RELLENO`, `ALTO_TARJETA`, `type Nodo`, `type PuertoNodo`, `type ClaseNodo` de `lib/red/layout.ts`
- Produces:
  - `ANCHO_PUERTO_FLUJO = 24`, `COLUMNAS_PUERTO_FLUJO = 12`, `ANCHO_ABIERTA = 304`, `ANCHO_GRUPO_DESTINO = 260`, `SEPARACION_COLUMNA = 60`, `SEPARACION_NODO = 26`, `ALTO_PUERTO_FLUJO = 22`
  - `type NodoFlujo = Nodo & { capa: Capa; bloque: string }`
  - `type ColumnaFlujo = { capa: Capa; titulo: string; x: number; w: number }`
  - `type Flujo = { columnas: ColumnaFlujo[]; bloques: BloqueFlujo[]; nodos: NodoFlujo[]; cintas: CintaFlujo[]; bandeja: FichaBandeja[]; grupos: string[][]; ancho: number; alto: number }`
  - `construirFlujo(estado: EstadoRed, abiertas?: Set<string>): Flujo`

`BloqueFlujo` y `CintaFlujo` se completan en las Tasks 5 y 7; en esta task los arreglos salen vacíos.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir a `tests/flujo.test.ts`, con estos imports al principio del archivo:

```ts
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { CATEGORIAS_BASE, type EstadoRed } from "../lib/red/modelo.ts";
import { ANCHO_ABIERTA, CAPAS, capaDeEquipo, construirFlujo } from "../lib/red/flujo.ts";

const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [], categorias: CATEGORIAS_BASE, orden: {} } as unknown as EstadoRed);
```

y estas pruebas al final:

```ts
test("cada equipo cae en la columna de su capa", () => {
  const flujo = construirFlujo(real());
  const porId = new Map(flujo.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.capa, "borde");
  assert.equal(porId.get("eq:R2-SW1")?.capa, "switches");
  assert.equal(porId.get("eq:R2-PP2")?.capa, "patch");
});

test("hay una columna por capa con contenido, en orden", () => {
  const flujo = construirFlujo(real());
  assert.deepEqual(flujo.columnas.map(columna => columna.capa), CAPAS);
  for (let i = 1; i < flujo.columnas.length; i += 1) {
    assert.ok(flujo.columnas[i].x > flujo.columnas[i - 1].x, "las columnas van de izquierda a derecha");
  }
});

// La propiedad que arregla el problema de fondo: abrir una tarjeta no puede
// mover una columna de lugar, o `ajustar()` vuelve a pelear con un lienzo que
// cambia de forma bajo sus pies.
test("el ancho del lienzo es el mismo con todo cerrado y con todo abierto", () => {
  const estado = real();
  const cerrado = construirFlujo(estado);
  const todas = new Set(cerrado.nodos.filter(nodo => nodo.clase === "equipo").map(nodo => nodo.id));
  const abierto = construirFlujo(estado, todas);
  assert.equal(abierto.ancho, cerrado.ancho);
  assert.deepEqual(abierto.columnas.map(c => c.x), cerrado.columnas.map(c => c.x));
  assert.ok(abierto.alto > cerrado.alto, "abrir tiene que crecer hacia abajo");
});

test("una columna con equipos de rejilla reserva el ancho de una tarjeta abierta", () => {
  const flujo = construirFlujo(real());
  const switches = flujo.columnas.find(columna => columna.capa === "switches");
  assert.equal(switches?.w, ANCHO_ABIERTA);
});

test("el equipo más grande cabe en tres filas de puertos", () => {
  const estado = real();
  const flujo = construirFlujo(estado, new Set(["eq:R3-SW1"]));
  const nodo = flujo.nodos.find(item => item.id === "eq:R3-SW1");
  assert.equal(nodo?.puertos.length, 28);
  assert.equal(nodo?.abierta, true);
  assert.ok((nodo?.w ?? 0) <= ANCHO_ABIERTA);
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: FAIL con `construirFlujo is not a function` / `ANCHO_ABIERTA` sin exportar.

- [ ] **Step 3: Escribir la implementación**

Añadir a `lib/red/flujo.ts`:

```ts
import { anchoDeTexto, codigoDeEquipo, resumenDePuertos, ALTO_TARJETA, RELLENO,
  type ClaseNodo, type FichaBandeja, type Nodo, type PuertoNodo } from "./layout.ts";
import { etiquetaCategoria, puertosDeEndpoint, type Equipo, type EstadoRed, type TipoEnlace } from "./modelo.ts";

// Un puerto de 24 y no de 34: la columna reserva de entrada el ancho de su
// tarjeta abierta, y a 34 la reserva mediría 424 y el lienzo no cabría en el
// shell. A 24 una celda todavía admite dos dígitos a 11px de mono con holgura.
export const ANCHO_PUERTO_FLUJO = 24;
export const ALTO_PUERTO_FLUJO = 22;
export const COLUMNAS_PUERTO_FLUJO = 12;
export const ANCHO_ABIERTA = COLUMNAS_PUERTO_FLUJO * ANCHO_PUERTO_FLUJO + RELLENO;
export const ANCHO_GRUPO_DESTINO = 260;
export const SEPARACION_COLUMNA = 60;
export const SEPARACION_NODO = 26;
export const ALTO_TITULO_COLUMNA = 26;

export type NodoFlujo = Nodo & { capa: Capa; bloque: string };
export type BloqueFlujo = { id: string; capa: Capa; titulo: string; x: number; y: number; w: number; h: number; colapsable: boolean; abierto: boolean; cuenta: number };
export type CintaFlujo = { clave: string; a: string; b: string; tipo: TipoEnlace; cuenta: number; enlaceId: number; intraCapa: boolean };
export type Flujo = {
  columnas: ColumnaFlujo[]; bloques: BloqueFlujo[]; nodos: NodoFlujo[];
  cintas: CintaFlujo[]; bandeja: FichaBandeja[]; grupos: string[][];
  ancho: number; alto: number;
};
export type ColumnaFlujo = { capa: Capa; titulo: string; x: number; w: number };

const nodoDeEquipo = (estado: EstadoRed, equipo: Equipo, abiertas: Set<string>): NodoFlujo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conRejilla = equipo.puertos > 0;
  const codigo = codigoDeEquipo(equipo.id);
  const id = conRejilla ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`;
  const abierta = conRejilla && abiertas.has(id);
  const filas = abierta ? Math.ceil(puertos.length / COLUMNAS_PUERTO_FLUJO) : 0;
  return {
    id,
    clase: (conRejilla ? "equipo" : "aparato") as ClaseNodo,
    codigo,
    etiqueta: `${codigo} · ${equipo.etiqueta}`,
    capa: capaDeEquipo(equipo.tipo),
    bloque: equipo.rack || "sin-rack",
    zona: equipo.rack || "",
    fila: 0,
    x: 0, y: 0,
    w: abierta ? ANCHO_ABIERTA : anchoDeTexto(codigo),
    h: ALTO_TARJETA + filas * (ALTO_PUERTO_FLUJO + 4),
    abierta,
    idsPuerto: puertos.map(puerto => puerto.id),
    puertos: abierta ? puertos.map((puerto, indice): PuertoNodo => ({
      id: puerto.id,
      n: puerto.n,
      estado: puerto.estado,
      x: RELLENO / 2 + (indice % COLUMNAS_PUERTO_FLUJO) * ANCHO_PUERTO_FLUJO,
      y: ALTO_TARJETA + Math.floor(indice / COLUMNAS_PUERTO_FLUJO) * (ALTO_PUERTO_FLUJO + 4),
      w: ANCHO_PUERTO_FLUJO - 4,
      h: ALTO_PUERTO_FLUJO,
    })) : [],
    resumen: conRejilla ? resumenDePuertos(estado, equipo.id) : null,
    estado: conRejilla ? null : puertos[0]?.estado ?? null,
    sinRuta: false,
  };
};

// El ancho de la columna no depende de qué esté abierto ahora sino de qué
// puede abrirse: por eso `abiertas` no entra en este cálculo. Es lo que hace
// que abrir una tarjeta empuje hacia abajo y nunca hacia el lado.
const anchoDeColumna = (capa: Capa, estado: EstadoRed): number => {
  if (capa === "destinos") return ANCHO_GRUPO_DESTINO;
  const equipos = estado.equipos.filter(equipo => capaDeEquipo(equipo.tipo) === capa);
  if (!equipos.length) return 0;
  return Math.max(...equipos.map(equipo =>
    equipo.puertos > 0 ? ANCHO_ABIERTA : anchoDeTexto(codigoDeEquipo(equipo.id))));
};

export const construirFlujo = (estado: EstadoRed, abiertas: Set<string> = new Set()): Flujo => {
  const nodos = estado.equipos
    .filter(equipo => equipo.tipo !== "ap")
    .map(equipo => nodoDeEquipo(estado, equipo, abiertas));

  const columnas: ColumnaFlujo[] = [];
  let x = 0;
  for (const capa of CAPAS) {
    const w = capa === "destinos" ? ANCHO_GRUPO_DESTINO : anchoDeColumna(capa, estado);
    if (!w) continue;
    columnas.push({ capa, titulo: TITULO_CAPA[capa], x, w });
    x += w + SEPARACION_COLUMNA;
  }
  const xDeCapa = new Map(columnas.map(columna => [columna.capa, columna.x]));

  let alto = 0;
  for (const columna of columnas) {
    const dentro = nodos.filter(nodo => nodo.capa === columna.capa);
    let y = ALTO_TITULO_COLUMNA;
    for (const nodo of dentro) {
      nodo.x = xDeCapa.get(nodo.capa) ?? 0;
      nodo.y = y;
      y += nodo.h + SEPARACION_NODO;
    }
    alto = Math.max(alto, y);
  }

  return {
    columnas, bloques: [], nodos, cintas: [], bandeja: [], grupos: [],
    ancho: columnas.length ? columnas[columnas.length - 1].x + columnas[columnas.length - 1].w : 0,
    alto,
  };
};
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "feat: columnas del flujo con ancho constante

Cada columna reserva el ancho de su tarjeta más ancha abierta, calculado desde
los datos y no desde qué esté abierto. Abrir un equipo empuja hacia abajo a sus
vecinos de columna y nunca mueve una columna de lugar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `flujo.ts` — bloques por rack, grupos de destino y orden vertical

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `construirFlujo`, `NodoFlujo`, `BloqueFlujo` (Task 4); `ordenarPor` de `lib/red/layout.ts:46`; `etiquetaCategoria`, `puertosDeEndpoint` de `lib/red/modelo.ts`
- Produces: `Flujo.bloques` y `Flujo.grupos` poblados; `ID_GRUPO_CUBICULOS = "grp:cubiculos"`, `ID_GRUPO_APS = "grp:aps"`, `idGrupoDe(categoria: string): string`

Los grupos de destino se abren y cierran con **el mismo `Set<string>` `abiertas` que los equipos**, usando ids con prefijo `grp:`. Así el botón CERRAR TODO que ya existe cierra las dos cosas sin código nuevo.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir a `tests/flujo.test.ts`:

```ts
test("los switches se agrupan en un bloque por rack", () => {
  const flujo = construirFlujo(real());
  const bloques = flujo.bloques.filter(bloque => bloque.capa === "switches");
  assert.deepEqual(bloques.map(bloque => bloque.id).sort(), ["R1", "R2", "R3"]);
  assert.equal(bloques.every(bloque => bloque.colapsable === false), true);
});

test("los destinos se agrupan por tipo de espacio, más cubículos y APs", () => {
  const estado = real();
  estado.cubiculos = [{ id: 1, status: "operational", ip: "", mac: "", inventoryCode: "" }];
  estado.enlaces = [...estado.enlaces, { id: 900, a: "cub:1", b: "pto:R2-PP1-p01", tipo: "roseta", nota: "" }];
  const flujo = construirFlujo(estado);
  const ids = flujo.bloques.filter(bloque => bloque.capa === "destinos").map(bloque => bloque.id);
  assert.ok(ids.includes("grp:cubiculos"), `bloques: ${ids.join(", ")}`);
  assert.ok(ids.some(id => id.startsWith("grp:") && id !== "grp:cubiculos" && id !== "grp:aps"));
});

test("un grupo de destinos colapsado no dibuja a sus miembros", () => {
  const flujo = construirFlujo(real());
  const grupo = flujo.bloques.find(bloque => bloque.capa === "destinos");
  assert.ok(grupo, "tiene que haber al menos un grupo de destinos");
  assert.equal(grupo.abierto, false);
  assert.ok(grupo.cuenta > 0);
  assert.equal(flujo.nodos.some(nodo => nodo.bloque === grupo.id), false);
});

test("abrir el grupo dibuja a sus miembros", () => {
  const estado = real();
  const grupo = construirFlujo(estado).bloques.find(bloque => bloque.capa === "destinos")!;
  const flujo = construirFlujo(estado, new Set([grupo.id]));
  assert.equal(flujo.nodos.filter(nodo => nodo.bloque === grupo.id).length, grupo.cuenta);
});

test("el orden manual manda sobre el automático", () => {
  const estado = real();
  const sinOrden = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "switches").map(nodo => nodo.id);
  estado.orden = Object.fromEntries([...sinOrden].reverse().map((id, indice) => [id, indice]));
  const conOrden = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "switches").map(nodo => nodo.id);
  assert.deepEqual(conOrden, [...sinOrden].reverse());
});

test("cada bloque publica su grupo reordenable", () => {
  const flujo = construirFlujo(real());
  const switches = flujo.nodos.filter(nodo => nodo.capa === "switches" && nodo.bloque === "R2").map(nodo => nodo.id);
  assert.ok(flujo.grupos.some(grupo => grupo.length === switches.length && grupo.every(id => switches.includes(id))));
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: FAIL — `flujo.bloques` viene vacío, así que `assert.ok(grupo)` revienta.

- [ ] **Step 3: Escribir la implementación**

En `lib/red/flujo.ts`, añadir arriba del `construirFlujo`:

```ts
import { ordenarPor } from "./layout.ts";

export const ID_GRUPO_CUBICULOS = "grp:cubiculos";
export const ID_GRUPO_APS = "grp:aps";
export const idGrupoDe = (categoria: string) => `grp:${categoria}`;

export const ALTO_DESTINO = 26;
export const SEPARACION_DESTINO = 5;
export const ALTO_CABECERA_GRUPO = 26;
export const SEPARACION_BLOQUE = 22;
export const ALTO_TITULO_BLOQUE = 18;

type Destino = { id: string; etiqueta: string; grupo: string; grupoTitulo: string };

// Un destino solo existe en el diagrama si tiene por dónde llegar. Los que no,
// viven en la bandeja de «sin puerto asignado», igual que hoy.
const destinosConectados = (estado: EstadoRed): Destino[] => [
  ...estado.espacios
    .filter(espacio => puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({
      id: espacio.id, etiqueta: espacio.nombre,
      grupo: idGrupoDe(espacio.categoria), grupoTitulo: etiquetaCategoria(estado, espacio.categoria),
    })),
  ...estado.cubiculos
    .filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({
      id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`,
      grupo: ID_GRUPO_CUBICULOS, grupoTitulo: "Cubículos",
    })),
  ...estado.equipos
    .filter(equipo => equipo.tipo === "ap")
    .map(equipo => {
      const puerto = estado.puertos.find(candidato => candidato.equipo === equipo.id);
      if (!puerto || !puertosDeEndpoint(estado, puerto.id).length) return null;
      return {
        id: puerto.id, etiqueta: `${codigoDeEquipo(equipo.id)} · ${equipo.etiqueta}`,
        grupo: ID_GRUPO_APS, grupoTitulo: "Puntos de acceso Wi-Fi",
      };
    })
    .filter((destino): destino is Destino => destino !== null),
];

const nodoDeDestino = (destino: Destino): NodoFlujo => ({
  id: destino.id,
  clase: (destino.id.startsWith("cub:") ? "cubiculo" : destino.id.startsWith("esp:") ? "espacio" : "aparato") as ClaseNodo,
  codigo: destino.etiqueta, etiqueta: destino.etiqueta,
  capa: "destinos", bloque: destino.grupo, zona: "", fila: 2,
  x: 0, y: 0, w: ANCHO_GRUPO_DESTINO - RELLENO, h: ALTO_DESTINO,
  abierta: false, idsPuerto: [], puertos: [], resumen: null, estado: null, sinRuta: false,
});
```

y reemplazar el cuerpo de `construirFlujo` desde `let alto = 0;` hasta el `return` por:

```ts
  const destinos = destinosConectados(estado);
  const porGrupo = new Map<string, Destino[]>();
  const tituloGrupo = new Map<string, string>();
  for (const destino of destinos) {
    porGrupo.set(destino.grupo, [...(porGrupo.get(destino.grupo) ?? []), destino]);
    tituloGrupo.set(destino.grupo, destino.grupoTitulo);
  }
  for (const [grupo, lista] of porGrupo) {
    if (!abiertas.has(grupo)) continue;
    for (const destino of lista) nodos.push(nodoDeDestino(destino));
  }

  const bloques: BloqueFlujo[] = [];
  const grupos: string[][] = [];
  let alto = 0;

  for (const columna of columnas) {
    let y = ALTO_TITULO_COLUMNA;

    if (columna.capa === "destinos") {
      for (const [grupo, lista] of porGrupo) {
        const abierto = abiertas.has(grupo);
        const inicio = y;
        y += ALTO_CABECERA_GRUPO;
        if (abierto) {
          const ids = ordenarPor(estado.orden, lista.map(destino => destino.id));
          grupos.push(ids);
          const porId = new Map(nodos.map(nodo => [nodo.id, nodo]));
          for (const id of ids) {
            const nodo = porId.get(id);
            if (!nodo) continue;
            nodo.x = columna.x + RELLENO / 2;
            nodo.y = y;
            y += ALTO_DESTINO + SEPARACION_DESTINO;
          }
        }
        bloques.push({
          id: grupo, capa: "destinos", titulo: tituloGrupo.get(grupo) ?? grupo,
          x: columna.x, y: inicio, w: columna.w, h: y - inicio,
          colapsable: true, abierto, cuenta: lista.length,
        });
        y += SEPARACION_BLOQUE;
      }
      alto = Math.max(alto, y);
      continue;
    }

    // Fuera de los destinos, el bloque es el rack: los tres racks son 100 %
    // intra-rack salvo los tres uplinks, así que agrupar por rack no es
    // cosmético, es la estructura real del cableado.
    const dentro = nodos.filter(nodo => nodo.capa === columna.capa);
    const porBloque = new Map<string, NodoFlujo[]>();
    for (const nodo of dentro) porBloque.set(nodo.bloque, [...(porBloque.get(nodo.bloque) ?? []), nodo]);

    for (const [bloqueId, lista] of porBloque) {
      const inicio = y;
      const conTitulo = columna.capa !== "borde";
      if (conTitulo) y += ALTO_TITULO_BLOQUE;
      const ids = ordenarPor(estado.orden, lista.map(nodo => nodo.id).sort());
      grupos.push(ids);
      const porId = new Map(lista.map(nodo => [nodo.id, nodo]));
      for (const id of ids) {
        const nodo = porId.get(id)!;
        nodo.x = columna.x;
        nodo.y = y;
        y += nodo.h + SEPARACION_NODO;
      }
      bloques.push({
        id: bloqueId, capa: columna.capa,
        titulo: conTitulo ? (estado.racks.find(rack => rack.id === bloqueId)?.nombre ?? bloqueId) : "",
        x: columna.x, y: inicio, w: columna.w, h: y - inicio,
        colapsable: false, abierto: true, cuenta: lista.length,
      });
      y += SEPARACION_BLOQUE;
    }
    alto = Math.max(alto, y);
  }

  return {
    columnas, bloques, nodos, cintas: [], bandeja: bandejaDe(estado), grupos,
    ancho: columnas.length ? columnas[columnas.length - 1].x + columnas[columnas.length - 1].w : 0,
    alto,
  };
```

Y añadir `bandejaDe`, copiada tal cual de `lib/red/layout.ts:200-215` (misma lógica, sin cambios) para que `flujo.ts` no dependa de una función que la Task 8 va a borrar:

```ts
const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length)
    .map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: etiquetaCategoria(estado, espacio.categoria) })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length)
    .map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
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
];
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: PASS, 14 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "feat: bloques por rack y grupos de destino por tipo

Los 92 destinos se agrupan por tipo de espacio, más cubículos y APs, y se
abren con el mismo Set que los equipos: así CERRAR TODO cierra las dos cosas
sin código nuevo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `flujo.ts` — baricentro para reducir cruces

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `construirFlujo` (Task 5); `nodoDeExtremo` de `lib/red/aristas.ts`
- Produces: `cruces(flujo: Flujo): number`, exportada para poder probar la propiedad

- [ ] **Step 1: Escribir la prueba que falla**

```ts
import { construirFlujo, cruces } from "../lib/red/flujo.ts";

// El baricentro es una heurística: no garantiza el mínimo, sí garantiza no
// empeorar respecto del orden alfabético, que es con lo que se compara.
test("el baricentro no produce más cruces que el orden alfabético", () => {
  const estado = real();
  const conBaricentro = cruces(construirFlujo(estado));
  const alfabetico = construirFlujo(estado, new Set(), { baricentro: false });
  assert.ok(conBaricentro <= cruces(alfabetico), `baricentro ${conBaricentro} vs alfabético ${cruces(alfabetico)}`);
});

test("el orden manual sigue mandando sobre el baricentro", () => {
  const estado = real();
  const ids = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "patch").map(nodo => nodo.id);
  estado.orden = Object.fromEntries([...ids].reverse().map((id, indice) => [id, indice]));
  const resultado = construirFlujo(estado).nodos.filter(nodo => nodo.capa === "patch").map(nodo => nodo.id);
  assert.deepEqual(resultado, [...ids].reverse());
});

test("el mismo estado produce siempre el mismo dibujo", () => {
  const estado = real();
  assert.deepEqual(
    construirFlujo(estado).nodos.map(nodo => [nodo.id, nodo.x, nodo.y]),
    construirFlujo(estado).nodos.map(nodo => [nodo.id, nodo.x, nodo.y]),
  );
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: FAIL con `cruces is not a function`.

- [ ] **Step 3: Escribir la implementación**

Cambiar la firma de `construirFlujo` a:

```ts
export type OpcionesFlujo = { baricentro?: boolean };

export const construirFlujo = (
  estado: EstadoRed,
  abiertas: Set<string> = new Set(),
  opciones: OpcionesFlujo = {},
): Flujo => {
```

Añadir el import que el baricentro necesita, arriba del archivo:

```ts
import { nodoDeExtremo } from "./aristas.ts";
```

Añadir, antes de `construirFlujo`:

```ts
// Baricentro: cada nodo se coloca en la media de las posiciones de sus vecinos
// de la capa anterior. Dos pasadas alcanzan sobre una topología de 25 equipos y
// el resultado es determinista, que es lo que permite probarlo.
const PASADAS_BARICENTRO = 2;

const ordenarPorBaricentro = (
  ids: string[],
  vecinos: Map<string, string[]>,
  posicionPrevia: Map<string, number>,
): string[] => {
  const base = new Map(ids.map((id, indice) => [id, indice]));
  const media = (id: string) => {
    const lista = (vecinos.get(id) ?? []).map(vecino => posicionPrevia.get(vecino)).filter((valor): valor is number => valor !== undefined);
    return lista.length ? lista.reduce((suma, valor) => suma + valor, 0) / lista.length : base.get(id)!;
  };
  // El desempate por el índice original es lo que hace determinista al orden:
  // sin él, dos nodos con la misma media quedarían a merced del sort.
  return [...ids].sort((a, b) => media(a) - media(b) || base.get(a)! - base.get(b)!);
};

export const cruces = (flujo: Flujo): number => {
  const y = new Map(flujo.nodos.map(nodo => [nodo.id, nodo.y]));
  const x = new Map(flujo.nodos.map(nodo => [nodo.id, nodo.x]));
  const aristas = flujo.cintas.filter(cinta => !cinta.intraCapa && y.has(cinta.a) && y.has(cinta.b));
  let total = 0;
  for (let i = 0; i < aristas.length; i += 1) {
    for (let j = i + 1; j < aristas.length; j += 1) {
      const una = aristas[i];
      const otra = aristas[j];
      if (x.get(una.a) !== x.get(otra.a) || x.get(una.b) !== x.get(otra.b)) continue;
      const cruzan = (y.get(una.a)! - y.get(otra.a)!) * (y.get(una.b)! - y.get(otra.b)!) < 0;
      if (cruzan) total += 1;
    }
  }
  return total;
};
```

Y dentro de `construirFlujo`, justo antes del bucle que coloca los nodos de cada columna, ordenar cada capa. Reemplazar la línea `const ids = ordenarPor(estado.orden, lista.map(nodo => nodo.id).sort());` por:

```ts
      const alfabetico = lista.map(nodo => nodo.id).sort();
      const automatico = opciones.baricentro === false
        ? alfabetico
        : ordenarPorBaricentro(alfabetico, vecinosPorNodo, posicionPrevia);
      const ids = ordenarPor(estado.orden, automatico);
```

y construir `vecinosPorNodo` y `posicionPrevia` antes del bucle de columnas:

```ts
  const vecinosPorNodo = new Map<string, string[]>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    vecinosPorNodo.set(a, [...(vecinosPorNodo.get(a) ?? []), b]);
    vecinosPorNodo.set(b, [...(vecinosPorNodo.get(b) ?? []), a]);
  }
  const posicionPrevia = new Map<string, number>();
```

Envolver el recorrido de columnas en el bucle de pasadas, conservando el resultado de la última. El bucle de columnas que ya existe (`for (const columna of columnas) { … }`) queda dentro de esto, y `bloques`, `grupos` y `alto` se reinician en cada pasada para no acumular:

```ts
  let bloques: BloqueFlujo[] = [];
  let grupos: string[][] = [];
  let alto = 0;

  // Dos pasadas: en la primera `posicionPrevia` está vacía y el baricentro cae
  // al orden alfabético; en la segunda ya tiene las `y` reales de la capa
  // anterior y es cuando de verdad reduce cruces.
  for (let pasada = 0; pasada < PASADAS_BARICENTRO; pasada += 1) {
    bloques = [];
    grupos = [];
    alto = 0;
    for (const columna of columnas) {
      // …el cuerpo que ya existe, sin cambios…

      // Al cerrar cada columna, alimentar posicionPrevia para la siguiente.
      for (const nodo of nodos.filter(item => item.capa === columna.capa)) posicionPrevia.set(nodo.id, nodo.y);
    }
  }
```

**Importante:** el `for (const [grupo, lista] of porGrupo)` de la columna de destinos también avanza `y`, así que la línea de `posicionPrevia` va al final del cuerpo de la columna, después del `continue` de destinos — mover ese `continue` a un `else` para que la asignación corra en las dos ramas.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: PASS, 17 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "feat: baricentro para reducir cruces entre capas

Determinista por el desempate con el índice original: el mismo estado tiene
que dar siempre el mismo dibujo, o el diagrama se movería solo entre dos
cargas iguales.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `flujo.ts` — cintas, anclas y nodos sin ruta

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `aristasParaDibujar`, `nodoDeExtremo` de `lib/red/aristas.ts`
- Produces:
  - `Flujo.cintas` poblado, con `intraCapa: boolean`
  - `anclasDeFlujo(flujo: Flujo): Map<string, { x: number; y: number }>` — **mismo contrato que `anclasDeLayout`**, que es lo que permite que la interacción del diagrama no cambie
  - `NodoFlujo.sinRuta` calculado
  - `grosorDeCinta(cuenta: number): number`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
import { anclasDeFlujo, construirFlujo, capaDeEquipo, CAPAS, cruces } from "../lib/red/flujo.ts";

test("ninguna cinta va hacia una capa anterior", () => {
  const flujo = construirFlujo(real(), new Set(["grp:sala", "grp:oficina", "grp:cubiculos", "grp:aps"]));
  const capaDe = new Map(flujo.nodos.map(nodo => [nodo.id, CAPAS.indexOf(nodo.capa)]));
  for (const cinta of flujo.cintas) {
    const a = capaDe.get(cinta.a);
    const b = capaDe.get(cinta.b);
    if (a === undefined || b === undefined) continue;
    assert.ok(a <= b, `${cinta.a} (capa ${a}) → ${cinta.b} (capa ${b}) va hacia atrás`);
  }
});

test("los uplinks entre switches quedan marcados como intra-capa", () => {
  const flujo = construirFlujo(real());
  const uplinks = flujo.cintas.filter(cinta => cinta.tipo === "uplink");
  assert.equal(uplinks.length, 3);
  assert.equal(uplinks.every(cinta => cinta.intraCapa), true);
});

test("las anclas cubren nodos, puertos abiertos y puertos de tarjeta cerrada", () => {
  const estado = real();
  const anclas = anclasDeFlujo(construirFlujo(estado));
  assert.ok(anclas.has("eq:R2-SW1"));
  // Con la tarjeta cerrada, el puerto cae al centro de su tarjeta: si no, la
  // ruta que trazarCircuito() devuelve en ids de puerto no iluminaría nada.
  assert.deepEqual(anclas.get("pto:R2-SW1-p09"), anclas.get("eq:R2-SW1"));
  const abierto = anclasDeFlujo(construirFlujo(estado, new Set(["eq:R2-SW1"])));
  assert.notDeepEqual(abierto.get("pto:R2-SW1-p09"), abierto.get("eq:R2-SW1"));
});

test("lo que no alcanza al ISP queda marcado sin ruta", () => {
  const estado = real();
  estado.enlaces = estado.enlaces.filter(enlace => enlace.tipo !== "borde");
  const flujo = construirFlujo(estado);
  assert.equal(flujo.nodos.every(nodo => nodo.sinRuta), true);
});

test("un estado sin ISP no lanza", () => {
  const estado = real();
  estado.equipos = estado.equipos.filter(equipo => equipo.tipo !== "isp");
  assert.doesNotThrow(() => construirFlujo(estado));
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: FAIL con `anclasDeFlujo is not a function` y `flujo.cintas` vacío.

- [ ] **Step 3: Escribir la implementación**

Añadir a `lib/red/flujo.ts`:

```ts
import { aristasParaDibujar, nodoDeExtremo } from "./aristas.ts";

// Grosor proporcional pero acotado: sin tope, el par R2/SW3 ══ R2/PP3 con 24
// enlaces taparía las tarjetas que une.
export const grosorDeCinta = (cuenta: number) => Math.min(14, 2 + Math.log2(Math.max(cuenta, 1)) * 2.5);

const alcanzablesDesdeIsp = (estado: EstadoRed): Set<string> => {
  const isp = estado.equipos.find(equipo => equipo.tipo === "isp");
  const arranque = estado.puertos.find(puerto => puerto.equipo === isp?.id);
  const vistos = new Set<string>();
  if (!arranque) return vistos;
  const vecinos = new Map<string, string[]>();
  for (const enlace of estado.enlaces) {
    const a = nodoDeExtremo(estado, enlace.a);
    const b = nodoDeExtremo(estado, enlace.b);
    if (a === b) continue;
    vecinos.set(a, [...(vecinos.get(a) ?? []), b]);
    vecinos.set(b, [...(vecinos.get(b) ?? []), a]);
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

export const anclasDeFlujo = (flujo: Flujo): Map<string, { x: number; y: number }> => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of flujo.nodos) {
    const centro = { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 };
    anclas.set(nodo.id, centro);
    for (const id of nodo.idsPuerto) anclas.set(id, centro);
    for (const puerto of nodo.puertos) {
      anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
    }
  }
  // Un grupo de destinos colapsado no dibuja a sus miembros, pero sus cintas
  // siguen apuntándoles: caen a la cabecera del grupo, que es lo que hace que
  // la cinta agregada salga de un punto y no del vacío.
  for (const bloque of flujo.bloques) {
    if (!bloque.colapsable || bloque.abierto) continue;
    anclas.set(bloque.id, { x: bloque.x + bloque.w / 2, y: bloque.y + ALTO_CABECERA_GRUPO / 2 });
  }
  return anclas;
};
```

Dentro de `construirFlujo`, antes del `return`, calcular las cintas y `sinRuta`:

```ts
  const alcanzables = alcanzablesDesdeIsp(estado);
  for (const nodo of nodos) nodo.sinRuta = !alcanzables.has(nodo.id);

  // Un destino dentro de un grupo cerrado no se dibuja, así que su cinta se
  // redirige a la cabecera del grupo y las de un mismo grupo se agregan en una.
  const grupoDe = new Map(destinos.map(destino => [destino.id, destino.grupo]));
  const visible = (id: string) => nodos.some(nodo => nodo.id === id) ? id : grupoDe.get(id) ?? id;
  const capaDe = new Map<string, Capa>(nodos.map(nodo => [nodo.id, nodo.capa]));
  for (const bloque of bloques) if (bloque.colapsable) capaDe.set(bloque.id, "destinos");

  const agregadas = new Map<string, CintaFlujo>();
  for (const arista of aristasParaDibujar(estado, abiertas)) {
    const a = visible(nodoDeExtremo(estado, arista.a) === arista.a ? arista.a : nodoDeExtremo(estado, arista.a));
    const b = visible(nodoDeExtremo(estado, arista.b) === arista.b ? arista.b : nodoDeExtremo(estado, arista.b));
    if (a === b) continue;
    const capaA = CAPAS.indexOf(capaDe.get(a) ?? "destinos");
    const capaB = CAPAS.indexOf(capaDe.get(b) ?? "destinos");
    // Se orienta siempre de la capa menor a la mayor: es lo que garantiza que
    // ninguna cinta se dibuje hacia atrás.
    const [desde, hasta] = capaA <= capaB ? [a, b] : [b, a];
    const clave = `${desde}|${hasta}`;
    const previa = agregadas.get(clave);
    if (previa) {
      previa.cuenta += arista.cuenta;
      previa.enlaceId = 0;
      continue;
    }
    agregadas.set(clave, {
      clave, a: desde, b: hasta, tipo: arista.tipo, cuenta: arista.cuenta,
      enlaceId: arista.enlaceId, intraCapa: capaA === capaB,
    });
  }
  const cintas = [...agregadas.values()];
```

y devolver `cintas` en vez de `[]`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/flujo.test.ts`
Expected: PASS, 22 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "feat: cintas del flujo, siempre hacia adelante

Cada cinta se orienta de la capa menor a la mayor, así que ninguna se dibuja
hacia atrás. anclasDeFlujo publica el mismo contrato que anclasDeLayout para
que conectar y arrastrar puntas no cambien.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El diagrama dibuja el flujo

**Files:**
- Modify: `app/red/diagrama-nodos.tsx`
- Modify: `app/red/diagrama.tsx`
- Modify: `app/globals.css`
- Modify: `lib/red/layout.ts` (podar)
- Modify: `tests/layout.test.ts` (podar)

**Interfaces:**
- Consumes: todo lo de `lib/red/flujo.ts` (Tasks 3-7)
- Produces: nada nuevo; es el consumidor final

- [ ] **Step 1: Cambiar el layout por el flujo en `diagrama.tsx`**

En `app/red/diagrama.tsx`:

1. Línea 4: reemplazar `import { anclasDeLayout, construirLayout } from "../../lib/red/layout";` por `import { anclasDeFlujo, construirFlujo } from "../../lib/red/flujo";`
2. Línea 70: `const layout = useMemo(() => construirFlujo(estado, abiertasEfectivas), [estado, abiertasEfectivas]);`
3. Línea 71: `const anclas = useMemo(() => anclasDeFlujo(layout), [layout]);`
4. Línea 143: la escala mínima sube, porque el lienzo ya cabe: `Math.min(Math.max(caja.width / (layout.ancho + MARGEN * 2), 0.75), 1.4)`.
5. Línea 335: mover el bloque `{seleccionado && <div className="net-diagram-cadena">…</div>}` para que quede **inmediatamente después** de `<div className="net-diagram-bar">` y antes del panel de conectar, con la clase `net-diagram-cadena encabezado`.

- [ ] **Step 2: Reescribir el dibujo en `diagrama-nodos.tsx`**

Reemplazar los imports de layout (líneas 2-8) por:

```tsx
import { anclasDeFlujo, grosorDeCinta, type BloqueFlujo, type CintaFlujo, type Flujo, type NodoFlujo } from "../../lib/red/flujo";
import { type PuertoNodo, type ResumenPuertos } from "../../lib/red/layout";
```

Cambiar `PropsNodos.layout` a `Flujo`, `Nodo` a `NodoFlujo`, `Arista` a `CintaFlujo` y `anclasDeLayout` a `anclasDeFlujo`. Reemplazar `trazo` (líneas 44-48) por:

```tsx
// Todas las cintas van de una columna a la siguiente o más allá, así que la
// curva es horizontal. La única excepción es la intra-capa —los uplinks—, que
// sale por un riel a la izquierda de su columna en vez de cruzar las tarjetas.
const trazo = (cinta: CintaFlujo, a: Punto, b: Punto, xColumna: number) => {
  if (cinta.intraCapa) {
    const riel = xColumna - RIEL;
    return `M ${a.x} ${a.y} L ${riel} ${a.y} L ${riel} ${b.y} L ${b.x} ${b.y}`;
  }
  const dx = (b.x - a.x) * 0.45;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
const RIEL = 26;
```

Reemplazar el bloque `layout.zonas.map(...)` (líneas 163-168) por columnas y bloques:

```tsx
      {layout.columnas.map(columna => (
        <g key={columna.capa} className="net-d-columna">
          <text x={columna.x} y={14}>{columna.titulo.toUpperCase()}</text>
        </g>
      ))}

      {layout.bloques.map(bloque => (
        <g key={bloque.id} className={`net-d-bloque ${bloque.colapsable ? "grupo" : ""} ${bloque.abierto ? "abierto" : ""}`}>
          {bloque.colapsable
            ? <>
                <rect
                  x={bloque.x} y={bloque.y} width={bloque.w} height={ALTO_CABECERA}
                  rx={4} role="button" tabIndex={0}
                  aria-expanded={bloque.abierto}
                  aria-label={`${bloque.titulo}, ${bloque.cuenta} destinos. Enter para ${bloque.abierto ? "cerrar" : "abrir"}.`}
                  onKeyDown={evento => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); onAlternar(bloque.id); } }}
                  onClick={() => onAlternar(bloque.id)}
                />
                <text className="net-d-bloque-titulo" x={bloque.x + 10} y={bloque.y + 17}>{bloque.titulo}</text>
                <text className="net-d-bloque-cuenta" x={bloque.x + bloque.w - 10} y={bloque.y + 17}>{bloque.cuenta} {bloque.abierto ? "▾" : "▸"}</text>
              </>
            : bloque.titulo && <text className="net-d-bloque-rotulo" x={bloque.x} y={bloque.y + 12}>{bloque.titulo.toUpperCase()}</text>}
        </g>
      ))}
```

con `const ALTO_CABECERA = 26;` junto a `RIEL`.

Reemplazar el `layout.aristas.map(arista => {…})` por el de cintas. Cambia el nombre de la variable, el origen de la `x` del riel y el grosor; el resto del cuerpo —zarpa, halo, manijas, contador— queda igual:

```tsx
      {layout.cintas.map(cinta => {
        const a = anclas.get(cinta.a);
        const b = anclas.get(cinta.b);
        if (!a || !b) return null;
        const nivelDeArista = nivelArista(cinta);
        const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const conManijas = editable && cinta.enlaceId > 0 && !reenlazando;
        // El riel de una cinta intra-capa sale del borde izquierdo de la columna
        // donde vive: por eso hace falta la x de la columna y no basta el ancla.
        const xColumna = layout.nodos.find(nodo => nodo.id === cinta.a)?.x ?? a.x;
        const d = trazo(cinta, a, b, xColumna);
        return <g key={cinta.clave} className={`net-d-link ${nivelDeArista} ${conManijas ? "editable" : ""}`}>
          {conManijas && <path className="net-d-zarpa" d={d} />}
          {nivelDeArista === "ruta" && <path className="net-d-ruta-halo" d={d} />}
          <path d={d} stroke={COLOR_ENLACE[cinta.tipo] ?? "#68717e"} strokeWidth={grosorDeCinta(cinta.cuenta)} fill="none" />
          {cinta.cuenta > 1 && <text className="net-d-cuenta" x={medio.x} y={medio.y}>×{cinta.cuenta}</text>}
          {conManijas && ([[cinta.a, cinta.b, a, b], [cinta.b, cinta.a, b, a]] as [string, string, Punto, Punto][]).map(([suelto, fijo, desde, hacia]) => {
            const punto = manija(desde, hacia);
            return <circle
              key={suelto}
              className="net-d-manija"
              cx={punto.x}
              cy={punto.y}
              r={9}
              onPointerDown={evento => { evento.stopPropagation(); onTomarPunta(cinta, fijo, evento); }}
            ><title>Arrastra esta punta para reconectar el enlace</title></circle>;
          })}
        </g>;
      })}
```

Borrar la función `grosorDe` de la línea 30, que queda sin uso.

`onTomarPunta` recibe ahora una `CintaFlujo`. En `app/red/diagrama.tsx`, la firma de `tomarPunta` (línea 226) cambia su primer parámetro de `Arista` a `CintaFlujo`; el cuerpo no cambia, porque solo lee `enlaceId`.

En el bloque `ordenando` (líneas 248-253), reemplazar por flechas verticales en todos los casos, ya que el orden dentro de una columna ahora es vertical:

```tsx
      {ordenando && <g className="net-d-orden">
        {layout.nodos.map(nodo => flechasDe(nodo.id, nodo.etiqueta, nodo.x + nodo.w + 4, nodo.y, true))}
      </g>}
```

- [ ] **Step 3: Estilos de columnas, bloques y cintas**

En `app/globals.css`, reemplazar las reglas `.net-d-zona` (líneas 260-261) por:

```css
.net-d-columna text{fill:var(--muted);font:700 10px var(--font-mono);letter-spacing:.12em;pointer-events:none}
.net-d-bloque-rotulo{fill:var(--muted);font:700 9px var(--font-mono);letter-spacing:.1em;pointer-events:none}
.net-d-bloque.grupo rect{fill:#eef1f4;stroke:#d7dce2;stroke-width:1;cursor:pointer}
.net-d-bloque.grupo:hover rect{stroke:var(--ink)}
.net-d-bloque-titulo{fill:var(--ink);font:700 12px var(--font-manrope);pointer-events:none}
.net-d-bloque-cuenta{fill:var(--muted);font:700 10px var(--font-mono);text-anchor:end;pointer-events:none}
.net-diagram-cadena.encabezado{border-top:0;border-bottom:1px solid var(--line)}
```

- [ ] **Step 4: Podar `layout.ts` y sus pruebas**

Borrar de `lib/red/layout.ts`: `construirLayout`, `anclasDeLayout`, `ordenDeZonas`, `destinosDe`, `bandejaDe`, `padreDeDestino`, `alcanzablesDesdeIsp`, `nodoDeEquipo`, `nombreDeZona`, `filaDeEquipo`, `FILA_BORDE` y `ZONA_BORDE`.

**Conservar**: `ordenarPor` (lo importa `lib/red/inventario.ts:2`), `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos`, y los tipos `ResumenPuertos`, `ClaseNodo`, `PuertoNodo`, `Nodo`, `FichaBandeja`, más las constantes `TIPOGRAFIA`, `ANCHO_CARACTER`, `ANCHO_MINIMO`, `RELLENO`, `ALTO_TARJETA`.

En `tests/layout.test.ts`, borrar las pruebas de `ordenDeZonas`, `construirLayout` y `anclasDeLayout`; conservar las de `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos` y `ordenarPor`.

- [ ] **Step 5: Correr toda la batería**

```bash
cd /srv/apps/panel-enlace && npm test
```

Expected: build exitoso y todas las pruebas en verde. Si `tsc` se queja de un import muerto de `layout.ts`, borrarlo.

- [ ] **Step 6: Verificación manual**

En RED → Diagrama, a 1440px:

1. El lienzo cabe entero sin zoom, con cuatro columnas rotuladas.
2. Abrir `R2/SW1`: la tarjeta crece hacia abajo y **ninguna columna se mueve de lugar**.
3. Clic en un puerto: la tira del circuito aparece arriba del lienzo y la ruta se ilumina; el grupo de destinos del final se abre solo.
4. Modo CONECTAR: clic origen → clic destino sigue creando el enlace; arrastrar una punta sigue reenlazando.
5. Modo ORDENAR: las flechas ▲▼ mueven nodos dentro de su columna y el orden persiste al recargar.
6. CERRAR TODO cierra equipos y grupos de destino.

- [ ] **Step 7: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/red/diagrama.tsx app/red/diagrama-nodos.tsx app/globals.css lib/red/layout.ts tests/layout.test.ts
git commit -m "feat: el diagrama de la red pasa a ser un flujo por capas

Cuatro columnas fijas en vez de una zona por rack. El ancho del lienzo deja de
crecer con cada rack y con cada tarjeta abierta, y ninguna cinta va hacia atrás.
Conectar, reenlazar y ordenar siguen funcionando: dependen de las anclas, no
del layout, y anclasDeFlujo publica el mismo contrato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 3 · MONITOREO se disuelve

### Task 9: `lib/red/estado-cubiculo.ts`

**Files:**
- Create: `lib/red/estado-cubiculo.ts`
- Create: `tests/estado-cubiculo.test.ts`

**Interfaces:**
- Consumes: `FilaCubiculo`, `EstadoReconciliacion` de `lib/red/reconciliacion.ts`; `datosFrescos` de `lib/red/estado-efectivo.ts`
- Produces:
  - `type VivoCubiculo = { estado: EstadoReconciliacion; ipReal: string; ultimaConexion: string; nombreVivo: string }`
  - `type ResumenVivo = Record<EstadoReconciliacion, number>`
  - `vivoDeCubiculos(filas: FilaCubiculo[], refrescado: string | null, ahora?: number): { porCubiculo: Map<number, VivoCubiculo>; resumen: ResumenVivo | null; frescos: boolean }`

`resumen: null` y un mapa vacío son la señal de «no hay datos vivos». La interfaz no debe inventar un estado a partir de ausencia.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/estado-cubiculo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../lib/red/reconciliacion.ts";
import { vivoDeCubiculos } from "../lib/red/estado-cubiculo.ts";

const AHORA = Date.parse("2026-08-12T12:00:00.000Z");
const hace = (minutos: number) => new Date(AHORA - minutos * 60_000).toISOString();

const docs: CubiculoDoc[] = [
  { id: 1, ip: "192.168.1.101", mac: "1C-83-41-1C-7D-A1", status: "operational", marca: "Lenovo" },
  { id: 2, ip: "192.168.1.102", mac: "1C-83-41-1C-7D-A2", status: "operational", marca: "Lenovo" },
  { id: 3, ip: "", mac: "", status: "operational", marca: "Lenovo" },
  { id: 4, ip: "", mac: "", status: "no_computer", marca: "" },
];
const vivos: DispositivoVivo[] = [
  { mac: "1c:83:41:1c:7d:a1", ip: "192.168.1.101", nombre: "PC-01", fabricante: "Lenovo", ultimaConexion: "2026-08-12 11:58", presente: true },
  { mac: "1c:83:41:1c:7d:a2", ip: "192.168.1.212", nombre: "PC-02", fabricante: "Lenovo", ultimaConexion: "2026-08-12 11:57", presente: true },
];

test("el cruce coincide con reconciliar y trae la IP real", () => {
  const { porCubiculo, resumen, frescos } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(2), AHORA);
  assert.equal(frescos, true);
  assert.equal(porCubiculo.get(1)?.estado, "en-linea");
  assert.equal(porCubiculo.get(2)?.estado, "ip-distinta");
  assert.equal(porCubiculo.get(2)?.ipReal, "192.168.1.212");
  assert.equal(porCubiculo.get(1)?.nombreVivo, "PC-01");
  assert.equal(resumen?.["en-linea"], 1);
  assert.equal(resumen?.["ip-distinta"], 1);
});

// El modo de falla real: el sidecar deja mon_devices vacía o vieja. Sin este
// guardia, 38 cubículos se pintarían en rojo y mandarían a alguien a revisar
// una sala que está bien.
test("un volcado de más de 15 minutos no produce ningún estado vivo", () => {
  const { porCubiculo, resumen, frescos } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(16), AHORA);
  assert.equal(frescos, false);
  assert.equal(porCubiculo.size, 0);
  assert.equal(resumen, null);
});

test("sin marca de refresco tampoco hay estado vivo", () => {
  const { porCubiculo, resumen } = vivoDeCubiculos(reconciliar(docs, []).cubiculos, null, AHORA);
  assert.equal(porCubiculo.size, 0);
  assert.equal(resumen, null);
});

test("un cubículo sin MAC documentada nunca queda sin verse", () => {
  const { porCubiculo } = vivoDeCubiculos(reconciliar(docs, vivos).cubiculos, hace(1), AHORA);
  assert.equal(porCubiculo.get(3)?.estado, "sin-mac");
  assert.equal(porCubiculo.get(4)?.estado, "sin-computador");
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/estado-cubiculo.test.ts`
Expected: FAIL con `Cannot find module` sobre `../lib/red/estado-cubiculo.ts`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/red/estado-cubiculo.ts`:

```ts
import { datosFrescos } from "./estado-efectivo.ts";
import type { EstadoReconciliacion, FilaCubiculo } from "./reconciliacion.ts";

// Espejo de estado-efectivo.ts para el otro lado del panel: allá los espacios,
// acá los cubículos. La regla es la misma y por la misma razón: lo vivo se
// muestra al lado de lo documentado y nunca en su lugar.
export type VivoCubiculo = {
  estado: EstadoReconciliacion;
  ipReal: string;
  ultimaConexion: string;
  nombreVivo: string;
};

export type ResumenVivo = Record<EstadoReconciliacion, number>;

const SIN_NOMBRE = new Set(["(unknown)", "(name not found)"]);

export function vivoDeCubiculos(
  filas: FilaCubiculo[],
  refrescado: string | null,
  ahora: number = Date.now(),
): { porCubiculo: Map<number, VivoCubiculo>; resumen: ResumenVivo | null; frescos: boolean } {
  const frescos = datosFrescos(refrescado, ahora);
  // Sin datos frescos no se devuelve nada, en vez de devolver todo "sin verse":
  // la ausencia de un volcado no es evidencia de que los equipos estén apagados.
  if (!frescos) return { porCubiculo: new Map(), resumen: null, frescos: false };

  const resumen: ResumenVivo = {
    "en-linea": 0, "ip-distinta": 0, "sin-verse": 0, "sin-mac": 0, "sin-computador": 0,
  };
  const porCubiculo = new Map<number, VivoCubiculo>();
  for (const fila of filas) {
    resumen[fila.estado] += 1;
    const nombre = fila.vivo?.nombre ?? "";
    porCubiculo.set(fila.cubiculo.id, {
      estado: fila.estado,
      ipReal: fila.ipReal,
      ultimaConexion: fila.vivo?.ultimaConexion ?? "",
      nombreVivo: SIN_NOMBRE.has(nombre) ? "" : nombre,
    });
  }
  return { porCubiculo, resumen, frescos: true };
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd /srv/apps/panel-enlace && node --experimental-strip-types --test tests/estado-cubiculo.test.ts`
Expected: PASS, 4 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/estado-cubiculo.ts tests/estado-cubiculo.test.ts
git commit -m "feat: cruce de cubículos documentados con la red viva

Espejo de estado-efectivo.ts. Sin datos frescos devuelve un mapa vacío y no
todo 'sin verse': la ausencia de volcado no es evidencia de que los equipos
estén apagados, y un sidecar caído pintaría 38 cubículos en rojo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: SALA muestra la red viva

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `vivoDeCubiculos`, `VivoCubiculo`, `ResumenVivo` (Task 9); `useAhora`, `useRefrescoPeriodico` de `app/use-refresco`; `haceCuanto` de `lib/formato-tiempo`
- Produces: nada; es consumidor final

- [ ] **Step 1: Traer la capa viva**

En `app/page.tsx`, añadir tras los imports existentes:

```tsx
import { haceCuanto } from "../lib/formato-tiempo";
import { useAhora } from "./use-refresco";
import { vivoDeCubiculos, type ResumenVivo, type VivoCubiculo } from "../lib/red/estado-cubiculo";
import type { EstadoReconciliacion, Reconciliacion } from "../lib/red/reconciliacion";

// El sidecar vuelca cada 3 minutos; preguntar cada 90 s alcanza para no mirar
// nunca un volcado que ya tuvo reemplazo. La sala documentada cambia sólo
// cuando alguien la edita, y por eso sigue en 120 s.
const CADA_MS_VIVO = 90_000;

const ETIQUETA_VIVO: Record<EstadoReconciliacion, { texto: string; color: string }> = {
  "en-linea": { texto: "En línea", color: "#237a52" },
  "ip-distinta": { texto: "IP distinta", color: "#986900" },
  "sin-verse": { texto: "Sin verse", color: "#a33442" },
  "sin-mac": { texto: "Sin MAC", color: "#68717e" },
  "sin-computador": { texto: "Sin PC", color: "#9aa3af" },
};
const ORDEN_VIVO: EstadoReconciliacion[] = ["en-linea", "ip-distinta", "sin-verse", "sin-mac"];
```

y dentro de `Home()`, junto a los demás `useState`:

```tsx
  const [vivo, setVivo] = useState<{ porCubiculo: Map<number, VivoCubiculo>; resumen: ResumenVivo | null; refrescado: string | null }>({ porCubiculo: new Map(), resumen: null, refrescado: null });
  const [filtroVivo, setFiltroVivo] = useState<EstadoReconciliacion | "">("");
  const [ahora, anclarReloj] = useAhora();

  const cargarVivo = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/monitoreo", { cache: "no-store" });
      if (!respuesta.ok) return;
      const datos = await respuesta.json() as Reconciliacion & { refrescado: string | null; ahoraServidor: string };
      anclarReloj(datos.ahoraServidor);
      const { porCubiculo, resumen } = vivoDeCubiculos(datos.cubiculos, datos.refrescado);
      setVivo({ porCubiculo, resumen, refrescado: datos.refrescado });
    } catch {
      // La capa viva no puede romper la pantalla de la sala: el plano
      // documentado se dibuja igual y el rail dice que no hay datos.
      setVivo({ porCubiculo: new Map(), resumen: null, refrescado: null });
    }
  }, [anclarReloj]);

  useEffect(() => { void cargarVivo(); }, [cargarVivo]);
  useRefrescoPeriodico(() => void cargarVivo(), CADA_MS_VIVO, draft === null);
```

Añadir `useCallback` al import de `react` de la línea 3.

- [ ] **Step 2: El rail vivo**

Después de la `<section className="status-rail">` (línea 466), insertar:

```tsx
        <section className="live-rail" aria-label="Estado en la red viva">
          {vivo.resumen
            ? <>
                <span className="wol-etiqueta">RED VIVA · {haceCuanto(vivo.refrescado, ahora)}</span>
                <div className="live-filters">
                  {ORDEN_VIVO.map(clave => <button
                    key={clave}
                    type="button"
                    className={filtroVivo === clave ? "on" : ""}
                    aria-pressed={filtroVivo === clave}
                    onClick={() => setFiltroVivo(filtroVivo === clave ? "" : clave)}
                  ><i aria-hidden="true" style={{ background: ETIQUETA_VIVO[clave].color }} /><strong>{vivo.resumen![clave]}</strong> {ETIQUETA_VIVO[clave].texto}</button>)}
                </div>
              </>
            : <span className="live-sin-datos">Sin datos de red viva. El plano muestra lo documentado.</span>}
        </section>
```

- [ ] **Step 3: El punto vivo en cada puesto y su filtro**

En `visible()` (línea 199), añadir el filtro vivo:

```tsx
  const visible = (station: Station) => {
    const text = normalizeSearch(`${station.id} ${station.ip} ${station.mac} ${station.serialNumber} ${station.inventoryCode} ${station.brandModel}`);
    const pasaVivo = !filtroVivo || vivo.porCubiculo.get(station.id)?.estado === filtroVivo;
    return (filter === "all" || station.status === filter) && pasaVivo && text.includes(search);
  };
```

En el botón del puesto (línea 476), después de `<span className="station-top">…</span>`, insertar el punto:

```tsx
{(() => { const v = vivo.porCubiculo.get(station.id); return v ? <i className="live-dot" style={{ background: ETIQUETA_VIVO[v.estado].color }} title={ETIQUETA_VIVO[v.estado].texto} /> : null; })()}
```

y ampliar el `aria-label` del botón para que la señal viva no sea solo color:

```tsx
aria-label={loaded ? `Cubículo ${station.id}, ${statusInfo[station.status].label}${vivo.porCubiculo.get(station.id) ? `, en la red: ${ETIQUETA_VIVO[vivo.porCubiculo.get(station.id)!.estado].texto}` : ""}` : `Cubículo ${station.id}, sin datos cargados`}
```

- [ ] **Step 4: Estilos**

En `app/globals.css`, añadir al final:

```css
/* Red viva en SALA. El chip cuadrado del puesto sigue siendo el estado
   documentado y el punto redondo es lo que la red ve ahora: son dos señales de
   dos fuentes distintas y no se mezclan nunca en un solo color. */
.live-rail{display:flex;align-items:center;gap:var(--esp-4);flex-wrap:wrap;margin:0 0 var(--esp-4);padding:var(--esp-3) var(--esp-4);border:1px solid var(--line);border-left:3px solid var(--green);border-radius:4px;background:var(--surface)}
.live-filters{display:flex;gap:var(--esp-1);flex-wrap:wrap}
.live-filters button{display:flex;align-items:center;gap:7px;border:1px solid transparent;border-radius:5px;padding:var(--esp-1) var(--esp-2);background:transparent;color:var(--muted);font-size:12px;font-weight:700}
.live-filters button:hover{background:#eef0f3;color:var(--ink)}
.live-filters button.on{border-color:var(--line);background:#eef1f4;color:var(--ink)}
.live-filters strong{font:700 13px var(--font-mono);color:var(--ink)}
.live-filters i{width:9px;height:9px;flex:0 0 9px;border-radius:50%}
.live-sin-datos{color:var(--muted);font-size:12px}
.station{position:relative}
.live-dot{position:absolute;top:7px;right:44px;width:9px;height:9px;border-radius:50%}
@media(max-width:600px){.live-rail{align-items:flex-start;flex-direction:column;gap:var(--esp-2)}.live-dot{top:9px;right:42px;width:11px;height:11px}}
```

- [ ] **Step 5: Verificar que compila y pasa el lint**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: lint y build en verde.

- [ ] **Step 6: Verificación manual, incluido el modo degradado**

1. Con el sidecar vivo: el rail muestra los cuatro contadores y cada puesto con MAC documentada tiene su punto.
2. Clic en `Sin verse`: el plano filtra a esos puestos.
3. **Detener el sidecar y esperar 16 minutos**, o cambiar temporalmente `MINUTOS_FRESCURA` a 0 en una consola: el rail debe decir «Sin datos de red viva» y **no debe quedar ni un punto**. Restaurar el valor.
4. Abrir una ficha: el refresco vivo se detiene mientras está abierta.

- [ ] **Step 7: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/page.tsx app/globals.css
git commit -m "feat: SALA muestra la red viva junto al plano

Rail con contadores que filtran y un punto por puesto. El chip cuadrado sigue
siendo lo documentado y el punto es lo vivo: dos fuentes, dos señales, nunca
mezcladas. Sin datos frescos no se pinta ningún punto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: El bloque RED VIVA en la ficha del cubículo

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `vivo.porCubiculo` (Task 10)
- Produces: nada

- [ ] **Step 1: Insertar el bloque en la ficha**

En `app/page.tsx`, dentro de `<div className="drawer-body">`, inmediatamente después del `loadingPins` (línea 487), insertar:

```tsx
          {(() => {
            const v = vivo.porCubiculo.get(draft.id);
            if (!v) return null;
            const difiere = v.estado === "ip-distinta";
            return <section className="live-ficha" aria-label="Estado en la red viva">
              <span className="net-label">RED VIVA</span>
              <p className="live-ficha-estado">
                <i aria-hidden="true" style={{ background: ETIQUETA_VIVO[v.estado].color }} />
                <b>{ETIQUETA_VIVO[v.estado].texto}</b>
                {v.ultimaConexion && <small>visto {v.ultimaConexion}</small>}
              </p>
              <div className="net-kv">
                <div><span>IP DOCUMENTADA</span><b>{draft.ip || "sin registrar"}</b></div>
                <div><span>IP REAL AHORA</span><b className={difiere ? "live-difiere" : ""}>{v.ipReal || "—"}</b></div>
                <div><span>NOMBRE EN LA RED</span><b>{v.nombreVivo || "—"}</b></div>
              </div>
              {difiere && <p className="live-ficha-aviso">La IP real no coincide con la documentada. Corrígela en el campo de abajo si el cambio es el bueno.</p>}
            </section>;
          })()}
```

- [ ] **Step 2: Estilos**

Añadir a `app/globals.css`:

```css
.live-ficha{display:flex;flex-direction:column;gap:var(--esp-2);padding:var(--esp-3) var(--esp-4);border:1px solid var(--line);border-left:3px solid var(--green);border-radius:6px;background:#f7f8f9}
.live-ficha-estado{display:flex;align-items:center;gap:var(--esp-2);margin:0;font-size:13px}
.live-ficha-estado i{width:10px;height:10px;flex:0 0 10px;border-radius:50%}
.live-ficha-estado small{color:var(--muted);font-size:11px}
.live-difiere{color:#9a5c14}
.live-ficha-aviso{margin:0;color:#9a5c14;font-size:11px;line-height:1.45}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: verde.

- [ ] **Step 4: Verificación manual**

Abrir un cubículo con IP distinta: el bloque muestra las dos IP, la real en ámbar, y el aviso. Abrir un cubículo sin MAC: el bloque muestra «Sin MAC» sin inventar IP. Con datos no frescos, el bloque no aparece.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/page.tsx app/globals.css
git commit -m "feat: bloque RED VIVA en la ficha del cubículo

IP documentada contra IP real, nombre que reporta NetAlertX y última vez
visto, sin cruzar de pestaña.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: El testigo se guarda con botón, no al rozar el desplegable

**Files:**
- Modify: `app/red/ficha.tsx:167-186`

**Interfaces:**
- Consumes: `onGuardarTestigo`, `candidatosTestigo` — ya existen en `Props`, sin cambios de firma
- Produces: nada

- [ ] **Step 1: Estado local para el testigo elegido**

En `app/red/ficha.tsx`, junto a los demás `useState` (después de la línea 42):

```tsx
  // El select no guarda al cambiar: rozarlo reescribía de dónde sale el estado
  // del espacio sin confirmación. Elegir es local; guardar es un botón.
  const [testigoElegido, setTestigoElegido] = useState(espacio?.testigoMac ?? "");

  // Reencuadra el valor local contra el guardado cada vez que llega uno nuevo
  // del servidor. Si el PUT salió bien, confirma; si falló, `testigoMac` no
  // cambió y esto devuelve el select a lo que de verdad está guardado, en vez
  // de dejarlo mostrando una elección que nunca llegó a la base.
  useEffect(() => { setTestigoElegido(espacio?.testigoMac ?? ""); }, [espacio?.testigoMac]);
```

`useEffect` ya viene importado en la línea 1 del archivo.

- [ ] **Step 2: Reemplazar el select y añadir el botón**

Reemplazar el `<label>Dispositivo testigo…</label>` y el botón que le sigue (líneas 178-185) por:

```tsx
          <label>Dispositivo testigo
            <select value={testigoElegido} disabled={guardando} onChange={event => setTestigoElegido(event.target.value)}>
              <option value="">— sin testigo (estado manual) —</option>
              {espacio.testigoMac && !candidatosTestigo.some(candidato => candidato.mac === espacio.testigoMac) && <option value={espacio.testigoMac}>{espacio.testigoMac} (no visto)</option>}
              {candidatosTestigo.map(candidato => <option key={candidato.mac} value={candidato.mac}>{`${candidato.ip} · ${candidato.vendor || "?"}${candidato.present ? "" : " (ausente)"}`}</option>)}
            </select>
          </label>
          <button
            className="secondary"
            type="button"
            disabled={guardando || testigoElegido === espacio.testigoMac}
            onClick={() => void onGuardarTestigo(espacio.id, testigoElegido)}
          >{guardando ? "Guardando…" : testigoElegido ? "Guardar testigo" : "Quitar testigo y volver a manual"}</button>
```

- [ ] **Step 3: Verificar que compila y pasa el lint**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: verde. La `key={fichaAbierta}` de `app/red/page.tsx:624` ya remonta la ficha al cambiar de espacio, así que el estado local arranca correcto en cada apertura.

- [ ] **Step 4: Verificación manual**

Abrir la ficha de un espacio, recorrer el desplegable con el teclado: **nada se guarda**. El botón se habilita solo cuando el valor difiere del guardado. Al presionarlo, el estado del espacio pasa a AUTO. Volver a «— sin testigo —» y guardar devuelve el espacio a MANUAL.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/red/ficha.tsx
git commit -m "fix: el testigo se guarda con un botón y no al rozar el select

Hallazgo U7 de la revisión: guardar en el onChange hacía que recorrer el
desplegable reescribiera de dónde sale el estado del espacio sin confirmación.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: SALUD recibe «Equipos sin documentar»

**Files:**
- Modify: `app/salud/page.tsx`

**Interfaces:**
- Consumes: `Reconciliacion.sinDocumentar` de `/api/monitoreo`
- Produces: nada

- [ ] **Step 1: Traer la lista**

En `app/salud/page.tsx`, añadir al import de tipos y al cuerpo del componente:

```tsx
import type { DispositivoVivo, Reconciliacion } from "../../lib/red/reconciliacion";

// Vive en SALUD por decisión registrada en el spec: se planteó ponerlo junto a
// Cobertura en RED, que es donde vive «lo que falta documentar», y se decidió
// que fuera acá.
const [sinDocumentar, setSinDocumentar] = useState<DispositivoVivo[]>([]);
```

y dentro de `cargar`, tras cargar la salud:

```tsx
      const monitoreo = await fetch("/api/monitoreo", { cache: "no-store" });
      if (monitoreo.ok) setSinDocumentar(((await monitoreo.json()) as Reconciliacion).sinDocumentar);
```

- [ ] **Step 2: Dibujar el bloque**

Antes del cierre de `</section>` de `shell` (línea 119), insertar:

```tsx
        <section className="salud-bloque" aria-label="Equipos sin documentar">
          <h2>Equipos sin documentar<span className="mon-badge" style={dot(sinDocumentar.length ? "#d08700" : "#1f9d55")}>{sinDocumentar.length || "Ninguno"}</span></h2>
          <p className="subtitle">MAC vivas en la red que no están en ningún cubículo. Candidatos a documentar, o equipos que no deberían estar.</p>
          {sinDocumentar.length > 0 && <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>IP</th><th>MAC</th><th>Nombre</th><th>Fabricante</th><th>Presente</th></tr></thead>
              <tbody>
                {sinDocumentar.map(dispositivo => <tr key={dispositivo.mac}>
                  <td className="mon-mono">{dispositivo.ip || "—"}</td>
                  <td className="mon-mono">{dispositivo.mac}</td>
                  <td>{dispositivo.nombre && dispositivo.nombre !== "(unknown)" && dispositivo.nombre !== "(name not found)" ? dispositivo.nombre : <span className="mon-muted">—</span>}</td>
                  <td>{dispositivo.fabricante || <span className="mon-muted">—</span>}</td>
                  <td><span className="mon-badge" style={dot(dispositivo.presente ? "#1f9d55" : "#8a8f98")}>{dispositivo.presente ? "Sí" : "No"}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
```

- [ ] **Step 3: Verificar que compila y pasa el lint**

```bash
cd /srv/apps/panel-enlace && npm run lint && npm run build
```

Expected: verde.

- [ ] **Step 4: Verificación manual**

SALUD muestra el bloque nuevo al final, con la misma tabla que tenía MONITOREO. Con la lista vacía, muestra «Ninguno» en verde y no dibuja tabla.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/salud/page.tsx
git commit -m "feat: SALUD lista los equipos vivos sin documentar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: La pestaña MONITOREO desaparece

**Files:**
- Modify: `app/nav-secciones.tsx`
- Replace: `app/monitoreo/page.tsx`

**Interfaces:**
- Consumes: nada
- Produces: nada

Esta task va **al final** a propósito: hasta aquí las tres mudanzas se pueden verificar con MONITOREO todavía en pie, lado a lado con su destino.

- [ ] **Step 1: Bajar la navegación a tres pestañas**

Reemplazar `app/nav-secciones.tsx` completo:

```tsx
import Link from "next/link";
import PuntoSalud from "./punto-salud";

export default function NavSecciones({ activa }: { activa: "sala" | "red" | "salud" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
      <Link href="/salud" className={activa === "salud" ? "active" : ""} aria-current={activa === "salud" ? "page" : undefined}>SALUD<PuntoSalud /></Link>
    </nav>
  );
}
```

- [ ] **Step 2: Redirigir `/monitoreo`**

Reemplazar `app/monitoreo/page.tsx` completo por:

```tsx
import { redirect } from "next/navigation";

// La pestaña se disolvió el 2026-08-12: los cubículos viven en SALA, el estado
// por ubicación y el testigo en RED, y los equipos sin documentar en SALUD.
// La ruta sobrevive sólo para no romper un enlace guardado o un marcador.
export default function Monitoreo() {
  redirect("/");
}
```

- [ ] **Step 3: Correr toda la batería**

```bash
cd /srv/apps/panel-enlace && npm test && npm run lint
```

Expected: build, pruebas y lint en verde. Si `tsc` marca `activa="monitoreo"` en algún lado, es un consumidor que quedó sin migrar: corregirlo.

- [ ] **Step 4: Verificación manual completa**

1. Las tres pestañas se ven en las tres páginas y la activa se marca bien.
2. `/monitoreo` redirige a `/`.
3. SALA: rail vivo, puntos en el plano, bloque RED VIVA en la ficha.
4. RED: lista de espacios con AUTO/MANUAL, ficha con testigo y botón Guardar, diagrama de flujo.
5. SALUD: los cuatro bloques de siempre más «Equipos sin documentar».
6. Ningún dato de los que había en MONITOREO se perdió.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/nav-secciones.tsx app/monitoreo/page.tsx
git commit -m "refactor: MONITOREO se disuelve en SALA, RED y SALUD

Cada dato queda en un solo lugar. La ruta sobrevive como redirección para no
romper un marcador guardado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificación final

```bash
cd /srv/apps/panel-enlace && npm test && npm run lint
```

Y una pasada manual por **1440 / 1000 / 760 / 375 px** sobre las tres pestañas, con el criterio de aceptación de la Task 2 (tarjeta de espacio a 250px sin solapamiento) y el de la Task 8 (abrir un equipo no mueve ninguna columna).

## Qué queda fuera, a propósito

- El botón **«Adoptar IP real»** de la ficha del cubículo. Necesita endpoint de escritura y entrada en bitácora; es funcionalidad nueva, no arreglo de interfaz.
- Los hallazgos **B1-B14** de `revision-panel-enlace.md`. El guardia de frescura los tolera; no los arregla.
