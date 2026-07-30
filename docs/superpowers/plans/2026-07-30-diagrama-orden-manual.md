# Orden manual de los elementos del diagrama — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda fijar a mano el orden de los racks, de los switches y patch panels dentro de cada rack, y de los destinos dentro de su pila, guardándolo en la base de datos.

**Architecture:** Una tabla nueva `net_orden` (id de nodo → entero) se carga en `EstadoRed.orden`. Una función pura `ordenarPor()` mezcla ese diccionario con el orden automático que ya calcula `lib/red/layout.ts` en sus cuatro puntos de decisión, y el layout publica los grupos ordenables en `Layout.grupos`. La vista agrega un tercer modo ORDENAR que dibuja flechas de intercambio y guarda de forma optimista contra `PUT /api/red/orden`.

**Tech Stack:** Next 16 (App Router, React 19), TypeScript, Drizzle ORM sobre Postgres (Supabase), `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-07-30-diagrama-orden-manual-design.md`

## Global Constraints

- No se agregan dependencias. Todo se hace con lo que ya está en `package.json`.
- Node >= 22.13.0. Las pruebas corren con `npm test`, que es `npm run build && node --experimental-strip-types --test tests/*.test.ts`.
- Los identificadores, comentarios y textos de interfaz van en español, como el resto del código.
- Los comentarios explican **por qué**, no qué. Es el estilo de `lib/red/layout.ts` y `app/red/diagrama.tsx`; no se agregan comentarios que repitan el código.
- Las importaciones dentro de `tests/` y `lib/` llevan extensión `.ts` explícita; las de `app/` no la llevan. Copiar el estilo del archivo que se está tocando.
- El esquema vive en **dos** lugares que hay que mantener sincronizados: `db/schema.ts` (Drizzle, para producción vía migración) y el arreglo `statements` de `ensureSchema()` en `db/index.ts` (DDL directo, que es el que corre en desarrollo). Toda tabla nueva va en los dos.
- `npm run lint` debe quedar limpio.

---

### Task 1: Tabla `net_orden` y el campo `orden` en `EstadoRed`

Plomería: crear la tabla, cargarla en el estado y poblar el campo en los seis lugares que construyen un `EstadoRed`. Al terminar, el diagrama se dibuja exactamente igual que antes —la tabla está vacía— y toda la suite sigue verde.

**Files:**
- Modify: `db/schema.ts` (al final del archivo)
- Modify: `db/index.ts:79` (dentro del arreglo `statements`)
- Create: `drizzle-pg/0003_*.sql` (lo genera `npm run db:generate`, el nombre lo pone la herramienta)
- Modify: `lib/red/modelo.ts:21`
- Modify: `app/api/red/route.ts:3,11-20`
- Modify: `app/api/red/cadena/route.ts:3,18`
- Modify: `app/red/page.tsx:14`
- Modify: `tests/fixture-red.ts:38-43`
- Modify: `tests/layout.test.ts:10`
- Modify: `tests/aristas.test.ts:11`

**Interfaces:**
- Produces: `netOrden` (tabla Drizzle con columnas `id: text` y `orden: integer`), y `EstadoRed.orden: Record<string, number>`, que la Task 2 consume.

- [ ] **Step 1: Declarar la tabla en el esquema de Drizzle**

Al final de `db/schema.ts`:

```ts
export const netOrden = pgTable("net_orden", {
  id: text("id").primaryKey(),
  orden: integer("orden").notNull(),
});
```

`integer` y `text` ya están importados en la primera línea del archivo.

- [ ] **Step 2: Declarar la misma tabla en el DDL de desarrollo**

En `db/index.ts`, dentro del arreglo `statements`, después del bloque de `net_bitacora` (línea 133) y antes de la lista de `CREATE INDEX`:

```ts
      `CREATE TABLE IF NOT EXISTS net_orden (
        id TEXT PRIMARY KEY,
        orden INTEGER NOT NULL
      )`,
```

- [ ] **Step 3: Generar la migración**

Run: `npm run db:generate`
Expected: crea `drizzle-pg/0003_<nombre>.sql` con un `CREATE TABLE "net_orden"` y actualiza `drizzle-pg/meta/`. Si pide confirmación interactiva, revisar que no proponga borrar ninguna tabla existente antes de aceptar.

- [ ] **Step 4: Agregar el campo al tipo del estado**

En `lib/red/modelo.ts:21`, agregar `orden` al final del tipo:

```ts
export type EstadoRed = { racks: Rack[]; equipos: Equipo[]; puertos: Puerto[]; espacios: Espacio[]; enlaces: Enlace[]; bitacora: EntradaBitacora[]; cubiculos: Cubiculo[]; orden: Record<string, number> };
```

- [ ] **Step 5: Cargar la tabla en `leerEstado`**

En `app/api/red/route.ts`, agregar `netOrden` a la importación de la línea 3, y dentro de `leerEstado`, después de la consulta de `cubiculos`:

```ts
  const filasOrden = await db.select().from(netOrden);
  const orden = Object.fromEntries(filasOrden.map(fila => [fila.id, fila.orden]));
  return { racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos, orden } as EstadoRed;
```

(la línea del `return` reemplaza a la actual).

- [ ] **Step 6: Poblar el campo en los otros cinco constructores**

`app/api/red/cadena/route.ts:18` — esta ruta solo traza cadenas, no dibuja, así que va vacío:

```ts
    const estado = { racks: [], equipos, puertos, espacios, enlaces, bitacora: [], cubiculos: listaCubiculos, orden: {} } as EstadoRed;
```

`app/red/page.tsx:14`:

```ts
const estadoVacio: EstadoRed = { racks: [], equipos: [], puertos: [], espacios: [], enlaces: [], bitacora: [], cubiculos: [], orden: {} };
```

`tests/fixture-red.ts` — agregar `orden: {},` como última propiedad del objeto, después del arreglo `cubiculos`.

`tests/layout.test.ts:10` y `tests/aristas.test.ts:11` — los dos arman el estado esparciendo `semilla.json`, que no trae el campo:

```ts
const real = (): EstadoRed => ({ ...semilla, bitacora: [], cubiculos: [], orden: {} } as unknown as EstadoRed);
```

En `tests/aristas.test.ts` la expresión es `const estado = { ...semilla, bitacora: [], cubiculos: [], orden: {} } as unknown as EstadoRed;`. El `as unknown as` no obliga a nada al compilador, así que si esto se olvida el error aparece recién en tiempo de ejecución, cuando la Task 2 lea `estado.orden`.

- [ ] **Step 7: Verificar que nada se rompió**

Run: `npm test`
Expected: PASS, con la misma cantidad de pruebas que antes del cambio.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts db/index.ts drizzle-pg lib/red/modelo.ts app/api/red/route.ts app/api/red/cadena/route.ts app/red/page.tsx tests/fixture-red.ts tests/layout.test.ts tests/aristas.test.ts
git commit -m "Agrega la tabla net_orden y el campo orden al estado de la red"
```

---

### Task 2: `ordenarPor()` y los grupos ordenables en el layout

El corazón del cambio. `layout.ts` decide el orden en cuatro lugares; los cuatro pasan a llamar a la misma función pura, y el layout publica los grupos para que la vista sepa quién es vecino de quién sin reproducir las reglas de zona y fila.

**Files:**
- Modify: `lib/red/layout.ts:36` (tipo `Layout`), `:58-92` (`ordenDeZonas`), `:208-288` (`construirLayout`)
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `EstadoRed.orden` de la Task 1.
- Produces:
  - `ordenarPor(orden: Record<string, number>, automatico: string[]): string[]`
  - `Layout.grupos: string[][]` — cada entrada es un grupo ordenable ya ordenado. La Task 4 lo consume para dibujar las flechas y para armar la lista que manda al servidor.

- [ ] **Step 1: Escribir las pruebas de `ordenarPor`**

En `tests/layout.test.ts`, agregar `ordenarPor` a la lista de importaciones desde `../lib/red/layout.ts` y estas tres pruebas al final del archivo:

```ts
test("sin orden guardado, ordenarPor respeta el orden automático", () => {
  assert.deepEqual(ordenarPor({}, ["b", "a", "c"]), ["b", "a", "c"]);
});

test("el orden guardado manda sobre el automático", () => {
  assert.deepEqual(ordenarPor({ a: 0, b: 1, c: 2 }, ["c", "b", "a"]), ["a", "b", "c"]);
});

// El caso del equipo agregado después de acomodar el rack: cae al final sin
// desarmar lo que ya se ordenó a mano.
test("lo que no tiene orden guardado va al final, en su orden automático", () => {
  assert.deepEqual(ordenarPor({ c: 0 }, ["a", "b", "c", "d"]), ["c", "a", "b", "d"]);
});

test("un orden guardado de un id que ya no existe no altera la lista", () => {
  assert.deepEqual(ordenarPor({ "eq:BORRADO": 0 }, ["a", "b"]), ["a", "b"]);
});
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — `ordenarPor is not a function` / error de importación.

- [ ] **Step 3: Implementar `ordenarPor`**

En `lib/red/layout.ts`, después de `anchoDeTexto` (línea 42):

```ts
// El orden guardado manda; lo que no tiene va al final, en su orden automático.
// El desplazamiento de mil es lo que garantiza esa segunda mitad: las filas
// guardadas se escriben siempre como 0..n-1 y ningún grupo llega a mil.
export const ordenarPor = (orden: Record<string, number>, automatico: string[]): string[] =>
  [...automatico].sort((a, b) =>
    (orden[a] ?? 1000 + automatico.indexOf(a)) - (orden[b] ?? 1000 + automatico.indexOf(b)));
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir la prueba del orden de las zonas**

Agregar al final de `tests/layout.test.ts`:

```ts
test("las zonas salen en el orden guardado y el borde sigue primero", () => {
  const estado = real();
  estado.orden = { R3: 0, R2: 1, R1: 2, [ZONA_BORDE]: 0 };
  assert.deepEqual(ordenDeZonas(estado), [ZONA_BORDE, "R3", "R2", "R1"]);
});
```

El `[ZONA_BORDE]: 0` está a propósito: comprueba que la zona de borde no participa del reordenamiento aunque alguien le haya escrito una fila.

- [ ] **Step 6: Correr y ver que falla**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — devuelve `[borde, R1, R2, R3]`, el orden por uplinks.

- [ ] **Step 7: Aplicar la mezcla en `ordenDeZonas`**

En `lib/red/layout.ts`, reemplazar la última línea de `ordenDeZonas` (línea 91):

```ts
  return [ZONA_BORDE, ...ordenarPor(estado.orden, orden)];
```

- [ ] **Step 8: Correr y ver que pasa**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS, incluida la prueba vieja «las zonas salen en el orden de la cadena de uplinks, no por id», que con `orden` vacío sigue dando `[borde, R1, R2, R3]`.

- [ ] **Step 9: Escribir las pruebas de las filas, las pilas y los grupos**

Agregar al final de `tests/layout.test.ts`:

```ts
const equisDe = (layout: ReturnType<typeof construirLayout>, id: string) =>
  layout.nodos.find(nodo => nodo.id === id)?.x ?? -1;
const yeDe = (layout: ReturnType<typeof construirLayout>, id: string) =>
  layout.nodos.find(nodo => nodo.id === id)?.y ?? -1;

test("dos switches del mismo rack se intercambian sin mover los paneles", () => {
  const base = construirLayout(real());
  const estado = real();
  estado.orden = { "eq:R2-SW3": 0, "eq:R2-SW2": 1, "eq:R2-SW1": 2 };
  const movido = construirLayout(estado);
  assert.ok(equisDe(base, "eq:R2-SW1") < equisDe(base, "eq:R2-SW3"), "el orden de partida es SW1, SW2, SW3");
  assert.ok(equisDe(movido, "eq:R2-SW3") < equisDe(movido, "eq:R2-SW1"), "SW3 quedó a la izquierda de SW1");
  assert.equal(equisDe(movido, "eq:R2-PP1"), equisDe(base, "eq:R2-PP1"), "la fila de paneles no se movió");
});

test("un destino sube dentro de la pila de su equipo", () => {
  const base = construirLayout(real());
  assert.ok(yeDe(base, "esp:utp-e-basica") < yeDe(base, "esp:pie-administrativo"), "el orden de partida");
  const estado = real();
  estado.orden = { "esp:pie-administrativo": 0, "esp:utp-e-basica": 1 };
  const movido = construirLayout(estado);
  assert.ok(yeDe(movido, "esp:pie-administrativo") < yeDe(movido, "esp:utp-e-basica"));
  assert.equal(equisDe(movido, "esp:pie-administrativo"), equisDe(movido, "esp:utp-e-basica"), "siguen en la misma columna");
});

// R2/PP1 sostiene la columna de los espacios y R2/SW1 la del AP. Al mandar el
// panel al final de su fila, su columna pasa a la derecha de la del switch.
test("al mover un panel, la columna de destinos que cuelga de él se mueve con él", () => {
  const base = construirLayout(real());
  assert.ok(equisDe(base, "esp:utp-e-basica") < equisDe(base, "pto:AP-sala-multicopiado-p0"), "el orden de partida");
  const estado = real();
  estado.orden = { "eq:R2-PP2": 0, "eq:R2-PP3": 1, "eq:R2-PP1": 2 };
  const movido = construirLayout(estado);
  assert.ok(equisDe(movido, "pto:AP-sala-multicopiado-p0") < equisDe(movido, "esp:utp-e-basica"));
});

test("los grupos cubren racks, filas y pilas, sin repetir ningún id", () => {
  const layout = construirLayout(real());
  const todos = layout.grupos.flat();
  assert.equal(new Set(todos).size, todos.length, "un id aparece en dos grupos");
  const tiene = (...ids: string[]) => layout.grupos.some(grupo => ids.every(id => grupo.includes(id)));
  assert.ok(tiene("R1", "R2", "R3"), "falta el grupo de racks");
  assert.equal(layout.grupos.some(grupo => grupo.includes(ZONA_BORDE)), false, "la zona de borde no se ordena");
  assert.ok(tiene("eq:R2-SW1", "eq:R2-SW2", "eq:R2-SW3"), "falta la fila de switches de R2");
  assert.ok(tiene("eq:R2-PP1", "eq:R2-PP2", "eq:R2-PP3"), "falta la fila de paneles de R2");
  assert.equal(tiene("eq:R2-SW1", "eq:R2-PP1"), false, "un switch no se ordena contra un panel");
  assert.equal(tiene("eq:R2-SW1", "eq:R3-SW1"), false, "un switch no se ordena contra otro rack");
  assert.ok(tiene("esp:utp-e-basica", "esp:pie-administrativo"), "falta la pila de R2/PP1");
  assert.ok(tiene("pto:FORTINET-p0", "pto:ISP-p0", "pto:MIKROTIK-p0"), "falta la fila de equipos de borde");
});
```

- [ ] **Step 10: Correr y ver que fallan**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL — las de intercambio porque el orden sigue siendo alfabético, y la de grupos porque `layout.grupos` es `undefined`.

- [ ] **Step 11: Publicar `grupos` en el tipo `Layout`**

En `lib/red/layout.ts:36`:

```ts
export type Layout = { zonas: Zona[]; nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; grupos: string[][]; ancho: number; alto: number };
```

- [ ] **Step 12: Aplicar la mezcla en `construirLayout`**

En `construirLayout`, después de la línea `const nodos = [...equipos, ...destinosDe(estado, porId)];` (línea 214), agregar el índice de todos los nodos y el acumulador de grupos:

```ts
  const porNodo = new Map(nodos.map(nodo => [nodo.id, nodo]));
  const grupos: string[][] = [];
  const racksDibujados: string[] = [];
```

Reemplazar el bucle de filas 0 y 1 (líneas 228-240) por:

```ts
    for (const fila of [0, 1]) {
      const ids = ordenarPor(estado.orden, dentro.filter(nodo => nodo.fila === fila).map(nodo => nodo.id).sort());
      if (!ids.length) continue;
      grupos.push(ids);
      const cartas = ids.map(id => porNodo.get(id)!);
      const altoFila = Math.max(...cartas.map(carta => carta.h));
      let cursor = xZona + RELLENO_ZONA;
      for (const carta of cartas) {
        carta.x = cursor;
        carta.y = yZona + alto;
        cursor += carta.w + SEPARACION;
      }
      ancho = Math.max(ancho, cursor - SEPARACION - xZona - RELLENO_ZONA);
      alto += altoFila + SEPARACION_FILA;
    }
```

El `.sort()` sobre los ids conserva el orden automático alfabético de hoy, que es el respaldo cuando el grupo no tiene filas guardadas.

En el bloque de la fila 2, reemplazar el bucle de columnas (líneas 251-261) por:

```ts
    for (const [, columna] of ordenadas) {
      const ids = ordenarPor(estado.orden, columna.map(destino => destino.id));
      grupos.push(ids);
      const pila = ids.map(id => porNodo.get(id)!);
      const anchoColumna = Math.max(...pila.map(destino => destino.w));
      let y = yZona + alto;
      for (const destino of pila) {
        destino.x = cursor;
        destino.y = y;
        y += ALTO_DESTINO + SEPARACION_DESTINO;
      }
      altoFila = Math.max(altoFila, y - (yZona + alto));
      cursor += anchoColumna + SEPARACION;
    }
```

Justo antes del `if (esBorde) altoBorde = alto;` (línea 270), registrar la zona dibujada:

```ts
    if (!esBorde) racksDibujados.push(idZona);
```

Y en el `return` final, agregar el grupo de racks y el campo:

```ts
  if (racksDibujados.length) grupos.push(racksDibujados);

  const alcanzables = alcanzablesDesdeIsp(estado);
  for (const nodo of nodos) nodo.sinRuta = !alcanzables.has(nodo.id);

  return {
    zonas,
    nodos,
    aristas: aristasParaDibujar(estado, abiertas),
    bandeja: bandejaDe(estado),
    grupos,
    ancho: anchoLienzo,
    alto: Math.max(...zonas.map(zona => zona.y + zona.h), 0),
  };
```

`racksDibujados` se llena solo con las zonas que tienen nodos, porque el bucle salta con `continue` las vacías: una zona que no se dibuja no puede reordenarse.

- [ ] **Step 13: Correr toda la suite**

Run: `npm test`
Expected: PASS. Las pruebas viejas de geometría —solapamientos, anchos, zonas que no se pisan— siguen verdes porque con `orden` vacío el resultado es idéntico.

- [ ] **Step 14: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Mezcla el orden guardado con el automático en el layout del diagrama"
```

---

### Task 3: Endpoint `PUT` y `DELETE /api/red/orden`

La validación del cuerpo se saca a `lib/red/orden.ts` para poder probarla sin montar la ruta, siguiendo el corte que ya usa el proyecto entre lógica pura en `lib/red/` y rutas delgadas en `app/api/`.

**Files:**
- Create: `lib/red/orden.ts`
- Create: `tests/orden.test.ts`
- Create: `app/api/red/orden/route.ts`

**Interfaces:**
- Consumes: `netOrden` de la Task 1.
- Produces: `PUT /api/red/orden` con cuerpo `{ ids: string[] }` y `DELETE /api/red/orden`, que la Task 4 llama. Los dos responden `{ ok: true }` o `{ error: string }`.

- [ ] **Step 1: Escribir las pruebas de la validación**

Crear `tests/orden.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { idsValidos, MAXIMO_IDS } from "../lib/red/orden.ts";

test("una lista de ids válida vuelve limpia", () => {
  assert.deepEqual(idsValidos(["R1", " R2 ", "eq:R2-SW1"]), ["R1", "R2", "eq:R2-SW1"]);
});

test("lo que no es una lista con contenido se rechaza", () => {
  assert.equal(idsValidos(undefined), null);
  assert.equal(idsValidos("R1"), null);
  assert.equal(idsValidos([]), null);
});

test("se rechaza una lista más larga que el máximo", () => {
  assert.equal(idsValidos(Array.from({ length: MAXIMO_IDS + 1 }, (_, i) => `id-${i}`)), null);
});

test("se rechaza un id que no es texto, que está vacío o que es demasiado largo", () => {
  assert.equal(idsValidos(["R1", 2]), null);
  assert.equal(idsValidos(["R1", "   "]), null);
  assert.equal(idsValidos(["R1", "x".repeat(121)]), null);
});

// Un id repetido dejaría dos filas peleando por la misma posición.
test("se rechaza una lista con ids repetidos", () => {
  assert.equal(idsValidos(["R1", "R2", "R1"]), null);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --experimental-strip-types --test tests/orden.test.ts`
Expected: FAIL — no existe `../lib/red/orden.ts`.

- [ ] **Step 3: Implementar la validación**

Crear `lib/red/orden.ts`:

```ts
export const MAXIMO_IDS = 200;
const LARGO_ID = 120;

// Devuelve la lista saneada, o null si el cuerpo no sirve. No se comprueba que
// los ids existan: la tabla es un diccionario de presentación y una fila
// huérfana —un equipo que se borró— no rompe el dibujo, porque el layout solo
// consulta los ids que él mismo arma.
export const idsValidos = (valor: unknown): string[] | null => {
  if (!Array.isArray(valor) || !valor.length || valor.length > MAXIMO_IDS) return null;
  const ids = valor.map(id => (typeof id === "string" ? id.trim() : ""));
  if (ids.some(id => !id || id.length > LARGO_ID)) return null;
  if (new Set(ids).size !== ids.length) return null;
  return ids;
};
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --experimental-strip-types --test tests/orden.test.ts`
Expected: PASS, las cinco pruebas.

- [ ] **Step 5: Escribir la ruta**

Crear `app/api/red/orden/route.ts`:

```ts
import { getDb } from "../../../../db";
import { netOrden } from "../../../../db/schema";
import { idsValidos } from "../../../../lib/red/orden";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

export async function PUT(request: Request) {
  try {
    const payload = await readJson<{ ids?: unknown }>(request);
    const ids = idsValidos(payload.ids);
    if (!ids) return noStoreJson({ error: "Lista de elementos inválida." }, { status: 400 });

    const db = await getDb();
    // Se escribe el grupo entero como 0..n-1 y no solo el par que se
    // intercambió: así la operación es idempotente y repara sola cualquier
    // escritura anterior que haya quedado a medias.
    await db.transaction(async (tx) => {
      for (const [indice, id] of ids.entries()) {
        await tx.insert(netOrden).values({ id, orden: indice })
          .onConflictDoUpdate({ target: netOrden.id, set: { orden: indice } });
      }
    });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el orden.");
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    await db.delete(netOrden);
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible restablecer el orden.");
  }
}
```

- [ ] **Step 6: Probar la ruta contra el servidor de desarrollo**

En una terminal: `npm run dev`. En otra:

```bash
curl -s -X PUT localhost:3000/api/red/orden -H "Content-Type: application/json" -d '{"ids":["R3","R2","R1"]}'
curl -s localhost:3000/api/red | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).orden))"
curl -s -X PUT localhost:3000/api/red/orden -H "Content-Type: application/json" -d '{"ids":[]}'
curl -s -X DELETE localhost:3000/api/red/orden
curl -s localhost:3000/api/red | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).orden))"
```

Expected, en orden: `{"ok":true}`; `{ R3: 0, R2: 1, R1: 2 }`; `{"error":"Lista de elementos inválida."}` con código 400; `{"ok":true}`; `{}`.

- [ ] **Step 7: Correr la suite y el lint**

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add lib/red/orden.ts tests/orden.test.ts app/api/red/orden/route.ts
git commit -m "Agrega el endpoint para guardar y restablecer el orden del diagrama"
```

---

### Task 4: Modo ORDENAR con flechas de intercambio

La parte visible. Un tercer modo dibuja las flechas, el intercambio se ve al instante y se guarda en segundo plano.

**Files:**
- Modify: `app/red/page.tsx` (después de `reenlazar`, línea 120, y en el `<Diagrama .../>` de la línea 286)
- Modify: `app/red/diagrama.tsx:11-35, 192-229`
- Modify: `app/red/diagrama-nodos.tsx:11-24, 108-186`
- Modify: `app/globals.css` (después de la línea 211)

**Interfaces:**
- Consumes: `Layout.grupos` de la Task 2 y `PUT`/`DELETE /api/red/orden` de la Task 3.
- Produces: nada que consuman tareas posteriores; es la última.

- [ ] **Step 1: Agregar el guardado en `page.tsx`**

En `app/red/page.tsx`, después de la función `reenlazar` (línea 120):

```ts
  // El movimiento se ve al instante y se guarda en segundo plano: acomodar un
  // rack son diez o quince clics seguidos, y esperar la recarga completa del
  // estado en cada uno haría el modo inusable.
  const reordenar = (ids: string[]) => {
    const previo = estado.orden;
    setEstado(actual => ({ ...actual, orden: { ...actual.orden, ...Object.fromEntries(ids.map((id, indice) => [id, indice])) } }));
    void (async () => {
      try {
        await pedir("/api/red/orden", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }, "No fue posible guardar el orden.");
      } catch (error) {
        setEstado(actual => ({ ...actual, orden: previo }));
        mostrarAviso(error instanceof Error ? error.message : "No fue posible guardar el orden.", "error");
      }
    })();
  };

  const restablecerOrden = () => {
    if (!window.confirm("¿Volver al orden automático del diagrama? Se pierde el orden que definiste a mano.")) return;
    void conGuardado(async () => {
      await pedir("/api/red/orden", { method: "DELETE" }, "No fue posible restablecer el orden.");
    }, "Orden restablecido.");
  };
```

Y en el `<Diagrama .../>` de la línea 286, agregar las tres props nuevas antes de `onAviso`:

```tsx
onReordenar={reordenar} onRestablecerOrden={restablecerOrden} hayOrden={Object.keys(estado.orden).length > 0}
```

- [ ] **Step 2: Agregar el modo y el movimiento en `diagrama.tsx`**

En el tipo `Props` (línea 11), después de `onReenlazar`:

```ts
  onReordenar: (ids: string[]) => void;
  onRestablecerOrden: () => void;
  hayOrden: boolean;
```

Agregarlas a la desestructuración de la línea 27, y cambiar el estado del modo (línea 30):

```ts
  const [modo, setModo] = useState<"consultar" | "conectar" | "ordenar">("consultar");
```

Después de la declaración de `arrastre` (línea 35):

```ts
  const ultimoMovido = useRef("");
```

Después de `alternar` (línea 56):

```ts
  const mover = useCallback((id: string, delta: number) => {
    const grupo = layout.grupos.find(lista => lista.includes(id));
    if (!grupo) return;
    const indice = grupo.indexOf(id);
    const destino = indice + delta;
    if (destino < 0 || destino >= grupo.length) return;
    const ids = [...grupo];
    ids[indice] = grupo[destino];
    ids[destino] = grupo[indice];
    ultimoMovido.current = `${id}:${delta}`;
    onReordenar(ids);
  }, [layout, onReordenar]);

  // Reordenar mueve el nodo de lugar en el DOM y el navegador suelta el foco:
  // sin esto, encadenar dos movimientos con el teclado obliga a tabular de
  // nuevo hasta el botón.
  useEffect(() => {
    const clave = ultimoMovido.current;
    if (!clave) return;
    ultimoMovido.current = "";
    contenedor.current?.querySelector<SVGGraphicsElement>(`[data-flecha="${clave}"]`)?.focus();
  }, [layout]);
```

- [ ] **Step 3: Agregar el botón del modo, el de restablecer y la ayuda**

En la barra (línea 195-198), después del botón CONECTAR:

```tsx
          <button className={modo === "ordenar" ? "on" : ""} aria-pressed={modo === "ordenar"} onClick={() => { setModo("ordenar"); setOrigen(""); setCursor(null); }}>ORDENAR</button>
```

En el grupo de zoom (línea 199-204), después del botón CERRAR TODO:

```tsx
          {modo === "ordenar" && <button onClick={onRestablecerOrden} disabled={!hayOrden}>RESTABLECER ORDEN</button>}
```

En el texto de ayuda (línea 205-211), agregar el caso del modo nuevo antes del último ternario, de modo que la cadena quede:

```tsx
        <p className="net-diagram-hint">{reenlace
          ? `Moviendo la punta ${etiquetaEndpoint(estado, reenlace.suelto)} · suéltala sobre el nuevo destino, esc para cancelar`
          : origen
            ? `Conectando desde ${etiquetaEndpoint(estado, origen)} · clic en el destino, esc para cancelar`
            : modo === "conectar"
              ? "Clic en un puerto libre para empezar un enlace, o arrastra la punta de una línea para llevarla a otro destino."
              : modo === "ordenar"
                ? "Usa las flechas para mover racks, equipos y destinos. El orden se guarda solo y vale para todos."
                : "Clic en un nodo resalta su ruta hasta el ISP. Doble clic abre la ficha."}</p>
```

- [ ] **Step 4: Pasar el modo al dibujo**

En el `<DiagramaNodos ... />` (línea 227), agregar antes de `onPunto`:

```tsx
ordenando={modo === "ordenar"} onMover={mover}
```

- [ ] **Step 5: Dibujar las flechas en `diagrama-nodos.tsx`**

En `PropsNodos` (línea 11), después de `reenlazando`:

```ts
  ordenando: boolean;
  onMover: (id: string, delta: number) => void;
```

Agregar los dos nombres a la desestructuración de los parámetros del componente (líneas 54-67).

Después de la constante `grosorDe` (línea 27):

```ts
const ANCHO_FLECHA = 20;
const ALTO_FLECHA = 18;
const ALTO_FLECHA_V = 14;
```

Después del `useMemo` de `nodosPorId` (línea 69):

```ts
  const posicion = useMemo(() => {
    const mapa = new Map<string, { grupo: string[]; indice: number }>();
    for (const grupo of layout.grupos) grupo.forEach((id, indice) => mapa.set(id, { grupo, indice }));
    return mapa;
  }, [layout]);
```

Después de `etiquetaAccesible` (línea 104), la función que arma el par de flechas. Es una función corriente y no un componente: definir un componente dentro del render lo remontaría en cada dibujo y el foco se perdería igual.

```tsx
  // Devuelve null para lo que no pertenece a ningún grupo —la zona de borde— y
  // omite la flecha del extremo: una flecha que no hace nada es ruido sobre un
  // diagrama que ya está denso.
  const flechasDe = (id: string, nombre: string, x: number, y: number, vertical: boolean) => {
    const lugar = posicion.get(id);
    if (!lugar) return null;
    const alto = vertical ? ALTO_FLECHA_V : ALTO_FLECHA;
    const pasos = [
      { delta: -1, simbolo: vertical ? "▲" : "◀", hacia: vertical ? "arriba" : "la izquierda" },
      { delta: 1, simbolo: vertical ? "▼" : "▶", hacia: vertical ? "abajo" : "la derecha" },
    ];
    return <g key={id}>
      {pasos.map(({ delta, simbolo, hacia }, indice) => {
        const destino = lugar.indice + delta;
        if (destino < 0 || destino >= lugar.grupo.length) return null;
        const cx = x + (vertical ? 0 : indice * (ANCHO_FLECHA + 4));
        const cy = y + (vertical ? indice * (alto + 2) : 0);
        return <g key={delta} className="net-d-flecha">
          <rect
            x={cx}
            y={cy}
            width={ANCHO_FLECHA}
            height={alto}
            rx={3}
            role="button"
            tabIndex={0}
            data-flecha={`${id}:${delta}`}
            aria-label={`Mover ${nombre} hacia ${hacia}`}
            onKeyDown={evento => {
              if (evento.key !== "Enter" && evento.key !== " ") return;
              evento.preventDefault();
              onMover(id, delta);
            }}
            onClick={evento => { evento.stopPropagation(); onMover(id, delta); }}
          />
          <text x={cx + ANCHO_FLECHA / 2} y={cy + alto / 2 + 4}>{simbolo}</text>
        </g>;
      })}
    </g>;
  };
```

Y como último bloque del fragmento, después del `map` de los nodos (línea 183) y antes del `</>`:

```tsx
      {ordenando && <g className="net-d-orden">
        {layout.zonas.map(zona => flechasDe(zona.id, zona.nombre, zona.x + zona.w - 52, zona.y + 4, false))}
        {layout.nodos.map(nodo => nodo.fila === 2
          ? flechasDe(nodo.id, nodo.etiqueta, nodo.x + nodo.w + 4, nodo.y, true)
          : flechasDe(nodo.id, nodo.etiqueta, nodo.x, nodo.y + nodo.h + 6, false))}
      </g>}
```

Las flechas se dibujan en una capa propia al final, con coordenadas absolutas: van encima de todo y no heredan el `translate` de cada tarjeta. Las de equipo van **debajo** de la tarjeta, en los 54 unidades de aire que `SEPARACION_FILA` deja entre filas; arriba chocarían con el rótulo de la zona. Las de destino van a la derecha, dentro de las 26 unidades de `SEPARACION` entre columnas.

- [ ] **Step 6: Estilar las flechas**

En `app/globals.css`, después de la línea 211 (`.net-d-nodo rect:focus-visible,...`):

```css
.net-d-flecha rect{fill:var(--surface);stroke:var(--ink);stroke-width:1.5;cursor:pointer}
.net-d-flecha text{fill:var(--ink);font:700 12px var(--font-mono);text-anchor:middle;pointer-events:none}
.net-d-flecha:hover rect{fill:var(--ink)}
.net-d-flecha:hover text{fill:#fff}
.net-d-flecha rect:focus-visible{outline:none;stroke:var(--focus);stroke-width:3}
```

- [ ] **Step 7: Compilar y pasar el lint**

Run: `npm test`
Expected: PASS. El build de Next es el que atrapa una prop mal pasada entre `page.tsx`, `diagrama.tsx` y `diagrama-nodos.tsx`.

Run: `npm run lint`
Expected: sin errores. Si `mover` aparece en el arreglo de dependencias de algún hook y ESLint reclama, revisar que `mover` esté envuelto en `useCallback` como indica el Step 2.

- [ ] **Step 8: Verificación manual**

Con `npm run dev`, abrir `/red` → DIAGRAMA y recorrer:

1. En CONSULTAR y en CONECTAR no se dibuja ninguna flecha.
2. En ORDENAR aparecen: `◀ ▶` arriba a la derecha de cada rack (no en la banda de borde), `◀ ▶` bajo cada switch y cada panel, `▲ ▼` a la derecha de cada destino.
3. Mover un rack a la derecha: el diagrama se redibuja al instante. Recargar la página (F5) y comprobar que el orden quedó.
4. Intercambiar dos paneles de un mismo rack y ver que sus columnas de destinos los siguen.
5. Subir una sala dentro de su pila con `▲`.
6. Con el teclado: tabular hasta una flecha, activarla con Enter dos veces seguidas sin volver a tabular — el foco se queda en la flecha.
7. El primero de un grupo no muestra `◀` y el último no muestra `▶`.
8. RESTABLECER ORDEN pide confirmación y devuelve el diagrama al orden por uplinks; después queda deshabilitado.
9. Volver a CONSULTAR: no queda ninguna flecha, y la ruta y las fichas siguen funcionando.

- [ ] **Step 9: Commit**

```bash
git add app/red/page.tsx app/red/diagrama.tsx app/red/diagrama-nodos.tsx app/globals.css
git commit -m "Agrega el modo ORDENAR con flechas para reordenar el diagrama"
```

---

## Notas para quien ejecute

**El orden automático no se borra nunca.** Es el respaldo: `ordenarPor()` lo usa para todo id que no tenga fila guardada. Si en algún momento parece más simple guardar el orden de *todos* los elementos siempre, no lo es: se pierde la propiedad de que un equipo agregado después caiga al final sin desarmar lo acomodado.

**Las columnas de destinos no tienen orden propio a propósito.** Se ordenan por la `x` de su equipo padre (`lib/red/layout.ts:248`), y eso es lo que evita que una columna quede lejos de su equipo con las líneas cruzadas. La prueba «al mover un panel, la columna de destinos que cuelga de él se mueve con él» es la que protege esa propiedad.

**El esquema está en dos lugares.** `db/schema.ts` alimenta la migración de producción; el arreglo `statements` de `db/index.ts` es el que realmente corre en desarrollo. Olvidar el segundo da un error de «tabla inexistente» solo en local, y olvidar el primero solo en producción.
