# Ajustes al flujo y adopción de IP reales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la jerarquía visual del diagrama de flujo, dar sangría al contenido dentro del shell, y permitir adoptar en lote las IP reales de los cubículos en drift, con revisión previa.

**Architecture:** Las tres correcciones del diagrama son cambios acotados dentro de `lib/red/flujo.ts`, todos cubiertos por `tests/flujo.test.ts`. La adopción de IP nace como función pura `lib/red/adopcion-ip.ts` con sus pruebas, y recién después se le monta el endpoint y el modal: la decisión de qué se adopta y qué se omite no toca la base de datos.

**Tech Stack:** Next.js 16.2.12, React 19.2.6, TypeScript 5.9.3, Drizzle + postgres.js, `node --test` con `--experimental-strip-types`.

## Global Constraints

- **Rama:** `feat/ajustes-flujo-y-adopcion-ip`, creada desde `main`. No se commitea a `main`.
- **NODE NO ESTÁ INSTALADO EN EL HOST.** `npm` no existe en cabserver. Todo comando de node corre en contenedor:

  ```bash
  # pruebas
  docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
    sh -c "node --experimental-strip-types --test tests/*.test.ts"
  # una sola prueba
  docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
    sh -c "node --experimental-strip-types --test tests/flujo.test.ts"
  # lint y build
  docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim sh -c "npm run lint"
  cd /srv/apps/compose/panel-enlace && docker compose build panel-web
  ```

- **Idioma del código:** identificadores, tipos y comentarios en español. Comentarios explican **por qué**, no qué.
- **Imports:** entre módulos de `lib/` con extensión `.ts`; desde `app/` sin extensión.
- **Lo vivo nunca sobrescribe lo documentado por su cuenta.** La adopción de IP es la única excepción y por eso exige acción explícita del usuario, revisión previa y bitácora.
- **`MINUTOS_FRESCURA`** se importa de `lib/red/estado-efectivo.ts`. No redefinir el umbral.
- **Lint:** el repo arrastra 4 errores preexistentes de `react-hooks/set-state-in-effect`. No se arreglan aquí; verificar que el conteo **no suba**.

## Estructura de archivos

| Archivo | Responsabilidad | Estado |
| --- | --- | --- |
| `lib/red/flujo.ts` | baricentro de grupos, rótulos, orden por ocupación, peso por tipo | modificar |
| `tests/flujo.test.ts` | pruebas de lo anterior | modificar |
| `app/red/diagrama-nodos.tsx` | `stroke-opacity` por tipo, rótulo truncado | modificar |
| `app/globals.css` | sangría del shell y patrón de sangrado completo | modificar |
| `lib/red/adopcion-ip.ts` | puro: qué se adopta y qué se omite | **crear** |
| `tests/adopcion-ip.test.ts` | pruebas de lo anterior | **crear** |
| `lib/red/modelo.ts` | `"ip-adoptada"` en `TipoBitacora` | modificar |
| `app/api/room/adoptar-ip/route.ts` | transacción, bitácora, guardias | **crear** |
| `app/page.tsx` | el contador de drift abre el modal de revisión | modificar |

---

### Task 1: El baricentro ordena también la columna de destinos

**Files:**
- Modify: `lib/red/flujo.ts` (bloque `if (columna.capa === "destinos")`)
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `ordenarPorBaricentro`, `ordenarPor`, `porGrupo`, `posicionPrevia` — todos internos a `flujo.ts`
- Produces: nada nuevo hacia afuera; cambia el orden de `Flujo.bloques` de capa `destinos`

- [ ] **Step 1: Escribir la prueba que falla**

Añadir a `tests/flujo.test.ts`:

```ts
// El defecto que se vio en el despliegue: los grupos se recorrían en el orden de
// inserción del Map, así que "Salas talleres" quedaba arriba alimentado desde
// R3/PP1, que está abajo, y su cinta cruzaba el lienzo entero.
test("los grupos de destino se ordenan por el baricentro de sus padres", () => {
  const estado = real();
  const flujo = construirFlujo(estado);
  const grupos = flujo.bloques.filter(bloque => bloque.capa === "destinos");

  // Los grupos se apilan de arriba a abajo en el orden en que se resolvieron.
  for (let i = 1; i < grupos.length; i += 1) {
    assert.ok(grupos[i].y > grupos[i - 1].y, "los grupos van de arriba a abajo");
  }

  // Y la que de verdad falla hoy: el orden no puede ser el de inserción del Map.
  const orden = grupos.map(bloque => bloque.id);
  const insercion = [...new Set(estado.espacios
    .filter(espacio => estado.enlaces.some(enlace => enlace.a === espacio.id || enlace.b === espacio.id))
    .map(espacio => `grp:${espacio.categoria}`))];
  assert.notDeepEqual(orden.filter(id => insercion.includes(id)), insercion,
    "el orden de los grupos sigue siendo el de inserción del Map");
});

test("el orden manual manda sobre el baricentro de los grupos", () => {
  const estado = real();
  const ids = construirFlujo(estado).bloques.filter(bloque => bloque.capa === "destinos").map(bloque => bloque.id);
  estado.orden = Object.fromEntries([...ids].reverse().map((id, indice) => [id, indice]));
  const resultado = construirFlujo(estado).bloques.filter(bloque => bloque.capa === "destinos").map(bloque => bloque.id);
  assert.deepEqual(resultado, [...ids].reverse());
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/flujo.test.ts" 2>&1 | tail -20
```

Expected: FAIL en «el orden de los grupos sigue siendo el de inserción del Map».

- [ ] **Step 3: Escribir la implementación**

En `lib/red/flujo.ts`, dentro de `construirFlujo`, justo antes de
`if (columna.capa === "destinos") {`, calcular el orden de los grupos y usarlo en vez
de iterar el `Map` directo. Reemplazar la línea
`for (const [grupo, lista] of porGrupo) {` (la del bloque de destinos, dentro del
`if`) por:

```ts
        // Los grupos se ordenan igual que los equipos: por la media de las y de
        // quienes los alimentan. Sin esto el Map itera en orden de inserción y la
        // columna con más cruces es justo la que queda sin ordenar.
        const padresDeGrupo = new Map<string, string[]>();
        for (const [grupo, lista] of porGrupo) {
          const padres = lista.flatMap(destino =>
            puertosDeEndpoint(estado, destino.id).map(puerto => {
              const equipo = estado.equipos.find(candidato => candidato.id === puerto.equipo);
              return equipo && equipo.puertos > 0 ? `eq:${equipo.id}` : puerto.id;
            }));
          padresDeGrupo.set(grupo, padres);
        }
        const ordenGrupos = ordenarPor(
          estado.orden,
          ordenarPorBaricentro([...porGrupo.keys()], padresDeGrupo, posicionPrevia),
        );

        for (const grupo of ordenGrupos) {
          const lista = porGrupo.get(grupo)!;
```

y cerrar ese `for` donde cerraba el anterior.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/flujo.test.ts" 2>&1 | tail -12
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts tests/flujo.test.ts
git commit -m "fix: el baricentro ordena también la columna de destinos

El Map de grupos se iteraba en orden de inserción, así que la columna con más
cruces era justo la que quedaba sin ordenar: Salas talleres arriba, alimentado
desde R3/PP1 que está abajo, con la cinta cruzando el lienzo entero.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rótulos que caben y equipos vacíos al final

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `app/red/diagrama-nodos.tsx`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `anchoDeTexto` de `lib/red/layout.ts`
- Produces: `recortarAlAncho(texto: string, ancho: number): string`; `ColumnaFlujo.titulo` ya recortado

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
import { recortarAlAncho } from "../lib/red/flujo.ts";

test("un rótulo más largo que su columna se recorta", () => {
  assert.equal(recortarAlAncho("Borde", 300), "Borde");
  const largo = recortarAlAncho("Salón de Matemáticas y Ciencias Aplicadas", 120);
  assert.ok(largo.endsWith("…"));
  assert.ok(largo.length < "Salón de Matemáticas y Ciencias Aplicadas".length);
});

test("el rótulo del borde ya no invade la columna vecina", () => {
  const flujo = construirFlujo(real());
  const borde = flujo.columnas.find(columna => columna.capa === "borde")!;
  assert.ok(anchoDeTexto(borde.titulo) <= borde.w, `«${borde.titulo}» mide más que su columna`);
});

// Los equipos con 0/24 estaban arriba empujando hacia abajo a los que sí tienen
// cableado, que es lo que la gente viene a mirar.
test("un equipo sin puertos ocupados va al final de su bloque", () => {
  const flujo = construirFlujo(real());
  const enR2 = flujo.nodos.filter(nodo => nodo.capa === "patch" && nodo.bloque === "R2").sort((a, b) => a.y - b.y);
  const ocupados = enR2.map(nodo => (nodo.resumen?.ocupados ?? 0) > 0);
  assert.deepEqual(ocupados, [...ocupados].sort((a, b) => Number(b) - Number(a)),
    "los que tienen puertos ocupados van primero");
});
```

Añadir `anchoDeTexto` al import de `../lib/red/layout.ts` en el archivo de pruebas.

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/flujo.test.ts" 2>&1 | tail -20
```

Expected: FAIL con `recortarAlAncho is not a function`.

- [ ] **Step 3: Escribir la implementación**

En `lib/red/flujo.ts`:

```ts
// Un rótulo que no cabe es un dato de entrada posible, no un accidente: los
// tipos de espacio se renombran desde la interfaz.
export const recortarAlAncho = (texto: string, ancho: number): string => {
  if (anchoDeTexto(texto) <= ancho) return texto;
  let corte = texto.length;
  while (corte > 1 && anchoDeTexto(`${texto.slice(0, corte)}…`) > ancho) corte -= 1;
  return `${texto.slice(0, corte).trimEnd()}…`;
};
```

Cambiar `TITULO_CAPA.borde` (línea 17) de `"Borde · salida a internet"` a `"Borde"`.

En el armado de columnas (línea 277), recortar:

```ts
    columnas.push({ capa, titulo: recortarAlAncho(TITULO_CAPA[capa], w), x, w });
```

Y en el orden dentro de cada bloque, poner al final lo que no tiene puertos ocupados.
En la rama de equipos, reemplazar `const alfabetico = lista.map(nodo => nodo.id).sort();` por:

```ts
      // Los vacíos al final: un 0/24 no es lo que alguien viene a mirar, y arriba
      // empuja hacia abajo a los que sí tienen cableado.
      const vacio = (id: string) => ((lista.find(nodo => nodo.id === id)?.resumen?.ocupados ?? 0) === 0 ? 1 : 0);
      const alfabetico = lista.map(nodo => nodo.id).sort()
        .sort((a, b) => vacio(a) - vacio(b));
```

Y en `app/red/diagrama-nodos.tsx`, aplicar el mismo recorte al rótulo de un bloque de
destinos, que también puede desbordar. Reemplazar la línea del `net-d-bloque-titulo`:

```tsx
                <text className="net-d-bloque-titulo" x={bloque.x + 10} y={bloque.y + 17}>{recortarAlAncho(bloque.titulo, bloque.w - 60)}</text>
```

añadiendo `recortarAlAncho` al import de `../../lib/red/flujo`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/flujo.test.ts" 2>&1 | tail -12
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts app/red/diagrama-nodos.tsx tests/flujo.test.ts
git commit -m "fix: los rótulos de columna caben y los equipos vacíos van al final

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: El peso de la línea lo fija el tipo

**Files:**
- Modify: `lib/red/flujo.ts`
- Modify: `app/red/diagrama-nodos.tsx`
- Modify: `tests/flujo.test.ts`

**Interfaces:**
- Consumes: `TipoEnlace` de `lib/red/modelo.ts`
- Produces: `grosorDeCinta(tipo: TipoEnlace, cuenta: number): number` — **cambia de firma**; `opacidadDeCinta(tipo: TipoEnlace): number`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
import { grosorDeCinta, opacidadDeCinta } from "../lib/red/flujo.ts";

// La prueba que fija la jerarquía. Hoy falla: nueve rosetas se dibujan más
// gruesas que el uplink que las alimenta, y el ojo lee las capilares como
// espina dorsal.
test("una roseta nunca pesa más que un uplink, por muchas que sean", () => {
  assert.ok(grosorDeCinta("roseta", 9) < grosorDeCinta("uplink", 1));
  assert.ok(grosorDeCinta("roseta", 40) < grosorDeCinta("patch", 1));
  assert.ok(grosorDeCinta("patch", 24) < grosorDeCinta("borde", 1));
});

test("la cantidad modula dentro de la banda de su tipo", () => {
  assert.ok(grosorDeCinta("patch", 9) > grosorDeCinta("patch", 1));
  assert.ok(grosorDeCinta("patch", 100) <= 4);
  assert.ok(grosorDeCinta("borde", 100) <= 7);
});

test("la opacidad baja del borde a la capilar", () => {
  assert.ok(opacidadDeCinta("borde") > opacidadDeCinta("patch"));
  assert.ok(opacidadDeCinta("patch") > opacidadDeCinta("roseta"));
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/flujo.test.ts" 2>&1 | tail -20
```

Expected: FAIL — `grosorDeCinta` ignora el primer argumento y `opacidadDeCinta` no existe.

- [ ] **Step 3: Escribir la implementación**

Reemplazar `grosorDeCinta` (línea 216) por:

```ts
// El peso lo fija el tipo y la cantidad solo modula dentro de su banda. Al revés
// —que es como estaba— nueve rosetas de una sala se dibujan más gruesas que el
// uplink que las alimenta, y la jerarquía queda invertida.
const BANDA: Record<TipoEnlace, { base: number; max: number; opacidad: number }> = {
  borde: { base: 5, max: 7, opacidad: 1 },
  uplink: { base: 4.5, max: 6.5, opacidad: 0.95 },
  patch: { base: 2, max: 4, opacidad: 0.55 },
  roseta: { base: 1.2, max: 2.4, opacidad: 0.3 },
};

export const grosorDeCinta = (tipo: TipoEnlace, cuenta: number): number => {
  const banda = BANDA[tipo] ?? BANDA.patch;
  return Math.min(banda.max, banda.base + Math.log2(Math.max(cuenta, 1)) * 0.5);
};

export const opacidadDeCinta = (tipo: TipoEnlace): number => (BANDA[tipo] ?? BANDA.patch).opacidad;
```

En `app/red/diagrama-nodos.tsx`, en el `<path>` de la cinta:

```tsx
          <path
            d={d}
            stroke={COLOR_ENLACE[cinta.tipo] ?? "#68717e"}
            strokeWidth={grosorDeCinta(cinta.tipo, cinta.cuenta)}
            strokeOpacity={opacidadDeCinta(cinta.tipo)}
            fill="none"
          />
```

**`strokeOpacity` en el `<path>` y no `opacity` en el `<g>`:** el grupo ya lleva la
opacidad del aislamiento de circuito (`.net-d-lienzo.sel-activa .net-d-link` a `.07`,
`.ruta` a `1`). Si la jerarquía viviera ahí, una roseta de la ruta iluminada seguiría
al 30 % y la ruta dejaría de verse. Son dos ejes y van en dos propiedades.

Añadir `opacidadDeCinta` al import de `../../lib/red/flujo`.

- [ ] **Step 4: Correr toda la batería**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/*.test.ts" 2>&1 | tail -12
```

Expected: PASS. Si alguna prueba vieja llamaba `grosorDeCinta(n)` con un solo
argumento, actualizarla a la firma nueva.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/flujo.ts app/red/diagrama-nodos.tsx tests/flujo.test.ts
git commit -m "fix: el peso de la cinta lo fija el tipo, no la cantidad

Nueve rosetas se dibujaban más gruesas que el uplink que las alimenta. La
opacidad va en stroke-opacity del path porque el grupo ya usa opacity para
aislar el circuito: son dos ejes distintos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sangría del contenido

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: los tokens `--esp-*`
- Produces: la variable `--sangria`

- [ ] **Step 1: Definir la sangría y aplicarla al shell**

En `:root`, añadir `--sangria: var(--esp-5);`.

En `.shell` (línea 13), añadir `padding-inline: var(--sangria);`.

- [ ] **Step 2: Sangrado completo para las reglas que deben llegar de borde a borde**

Añadir al final de `app/globals.css`:

```css
/* Sangrado completo. La escala de espaciado dio aire dentro de las cajas, pero
   el shell no tenía padding y el texto quedaba en el extremo mismo de las líneas
   divisorias. Estos elementos salen del padding con un margen negativo y lo
   reponen como propio: el borde abarca la caja de padding, así que la regla llega
   de borde a borde y el texto queda adentro. */
.room-surface,
.status-rail,
.net-navigation-bar,
.net-space-filters,
.net-space-controls,
.net-space-list-head,
.net-active-filters{
  margin-inline:calc(var(--sangria) * -1);
  padding-inline:var(--sangria);
}
/* Las filas de espacio también salen a todo el ancho, para que su borde inferior
   se alinee con el de la cabecera de la lista. */
.net-space-row,.net-space-group-head{
  margin-inline:calc(var(--sangria) * -1);
  padding-inline:var(--sangria);
}
```

- [ ] **Step 3: Bajar la sangría en móvil**

Dentro de `@media(max-width:600px)`, añadir:

```css
  :root{--sangria:var(--esp-3)}
  .shell{padding:22px var(--sangria) calc(40px + env(safe-area-inset-bottom))}
```

A 375px, 24 por lado se come el 13 % del ancho útil.

- [ ] **Step 4: Verificar que compila y que el lint no empeora**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim sh -c "npm run lint" 2>&1 | tail -8
cd /srv/apps/compose/panel-enlace && docker compose build panel-web 2>&1 | tail -4
```

Expected: build exitoso; el lint sigue con los **mismos 4 errores preexistentes**, ni uno más.

- [ ] **Step 5: Verificación manual**

A 1440 / 1000 / 760 / 375 px, en las tres pestañas:

1. Ningún texto toca el extremo de una línea divisoria.
2. Las líneas de `.room-surface`, `.status-rail` y `.net-navigation-bar` **siguen llegando de borde a borde** — si alguna se acortó, le falta el margen negativo.
3. El plano de la sala no se desplazó ni perdió columnas.
4. A 375px el contenido no se ve estrangulado.

- [ ] **Step 6: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/globals.css
git commit -m "style: sangría del contenido dentro del shell

Las reglas siguen llegando de borde a borde con el patrón de sangrado completo;
el texto queda adentro. La escala de espaciado había dado aire dentro de las
cajas pero no entre el texto y el filo de las líneas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `lib/red/adopcion-ip.ts` — qué se adopta y qué se omite

**Files:**
- Create: `lib/red/adopcion-ip.ts`
- Create: `tests/adopcion-ip.test.ts`

**Interfaces:**
- Consumes: `FilaCubiculo` de `lib/red/reconciliacion.ts`
- Produces:
  - `type CambioPedido = { id: number; ipEsperada: string }`
  - `type Adopcion = { aplicar: { id: number; ip: string; antes: string }[]; omitidos: { id: number; motivo: string }[] }`
  - `planAdopcion(filas: FilaCubiculo[], pedidos: CambioPedido[], frescos: boolean): Adopcion`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/adopcion-ip.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../lib/red/reconciliacion.ts";
import { planAdopcion } from "../lib/red/adopcion-ip.ts";

const docs: CubiculoDoc[] = [
  { id: 1, ip: "192.168.1.101", mac: "1C-83-41-1C-7D-A1", status: "operational", marca: "" },
  { id: 2, ip: "192.168.1.102", mac: "1C-83-41-1C-7D-A2", status: "operational", marca: "" },
  { id: 3, ip: "192.168.1.103", mac: "1C-83-41-1C-7D-A3", status: "operational", marca: "" },
];
const vivos: DispositivoVivo[] = [
  { mac: "1c:83:41:1c:7d:a1", ip: "192.168.1.211", nombre: "", fabricante: "", ultimaConexion: "", presente: true },
  { mac: "1c:83:41:1c:7d:a2", ip: "192.168.1.102", nombre: "", fabricante: "", ultimaConexion: "", presente: true },
];
const filas = () => reconciliar(docs, vivos).cubiculos;

test("adopta la IP real y registra la anterior", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.101" }], true);
  assert.deepEqual(plan.aplicar, [{ id: 1, ip: "192.168.1.211", antes: "192.168.1.101" }]);
  assert.deepEqual(plan.omitidos, []);
});

// El cliente dice QUÉ cubículos, nunca QUÉ valor: la IP sale siempre de la
// reconciliación que el servidor acaba de calcular.
test("un cubículo que ya no está en drift se omite", () => {
  const plan = planAdopcion(filas(), [{ id: 2, ipEsperada: "192.168.1.102" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 2);
  assert.match(plan.omitidos[0].motivo, /drift|coincide/i);
});

test("si la IP documentada cambió mientras el modal estaba abierto, se omite", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.199" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 1);
  assert.match(plan.omitidos[0].motivo, /cambió/i);
});

test("con datos viejos no se adopta nada", () => {
  const plan = planAdopcion(filas(), [{ id: 1, ipEsperada: "192.168.1.101" }], false);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos.length, 1);
  assert.match(plan.omitidos[0].motivo, /frescos|viejos/i);
});

test("un cubículo inexistente se omite en vez de reventar", () => {
  const plan = planAdopcion(filas(), [{ id: 99, ipEsperada: "" }], true);
  assert.deepEqual(plan.aplicar, []);
  assert.equal(plan.omitidos[0].id, 99);
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/adopcion-ip.test.ts" 2>&1 | tail -12
```

Expected: FAIL con `Cannot find module` sobre `../lib/red/adopcion-ip.ts`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/red/adopcion-ip.ts`:

```ts
import type { FilaCubiculo } from "./reconciliacion.ts";

// El cuerpo del request dice QUÉ cubículos adoptar, nunca QUÉ valor: la IP sale
// siempre de la reconciliación que el servidor acaba de calcular. Aceptar la IP
// del cliente convertiría este endpoint en una escritura arbitraria sobre la
// documentación, con la reconciliación de adorno.
export type CambioPedido = { id: number; ipEsperada: string };

export type Adopcion = {
  aplicar: { id: number; ip: string; antes: string }[];
  omitidos: { id: number; motivo: string }[];
};

export function planAdopcion(
  filas: FilaCubiculo[],
  pedidos: CambioPedido[],
  frescos: boolean,
): Adopcion {
  if (!frescos) {
    return {
      aplicar: [],
      omitidos: pedidos.map(pedido => ({ id: pedido.id, motivo: "los datos de red no están frescos" })),
    };
  }

  const porId = new Map(filas.map(fila => [fila.cubiculo.id, fila]));
  const aplicar: Adopcion["aplicar"] = [];
  const omitidos: Adopcion["omitidos"] = [];

  for (const pedido of pedidos) {
    const fila = porId.get(pedido.id);
    if (!fila) { omitidos.push({ id: pedido.id, motivo: "ese cubículo ya no existe" }); continue; }
    if (fila.estado !== "ip-distinta") { omitidos.push({ id: pedido.id, motivo: "ya no está en drift: su IP documentada coincide con la real" }); continue; }
    if (fila.ipDocumentada !== pedido.ipEsperada) { omitidos.push({ id: pedido.id, motivo: "su IP documentada cambió mientras revisabas" }); continue; }
    aplicar.push({ id: pedido.id, ip: fila.ipReal, antes: fila.ipDocumentada });
  }

  return { aplicar, omitidos };
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/adopcion-ip.test.ts" 2>&1 | tail -12
```

Expected: PASS, 5 pruebas.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add lib/red/adopcion-ip.ts tests/adopcion-ip.test.ts
git commit -m "feat: decide qué IP se adoptan y qué se omite, sin tocar la base

El cuerpo del request dice qué cubículos, nunca qué valor: la IP sale de la
reconciliación que el servidor acaba de calcular.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `POST /api/room/adoptar-ip`

**Files:**
- Create: `app/api/room/adoptar-ip/route.ts`
- Modify: `lib/red/modelo.ts:8` (`TipoBitacora`)

**Interfaces:**
- Consumes: `planAdopcion` (Task 5); `reconciliar` de `lib/red/reconciliacion.ts`; `datosFrescos` de `lib/red/estado-efectivo.ts`; `getDb` de `db`; `cubicles`, `monDevices`, `netBitacora` de `db/schema`; `noStoreJson`, `apiErrorResponse` de `lib/api-response`
- Produces: `POST /api/room/adoptar-ip` → `{ actualizados: number[]; omitidos: { id: number; motivo: string }[] }`

- [ ] **Step 1: Añadir el tipo de bitácora**

En `lib/red/modelo.ts:8`, añadir `"ip-adoptada"` a la unión `TipoBitacora`, después de `"estado-puerto"`.

- [ ] **Step 2: Escribir la ruta**

Crear `app/api/room/adoptar-ip/route.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cubicles, monDevices, netBitacora } from "../../../../db/schema";
import { apiErrorResponse, noStoreJson } from "../../../../lib/api-response";
import { datosFrescos } from "../../../../lib/red/estado-efectivo";
import { planAdopcion, type CambioPedido } from "../../../../lib/red/adopcion-ip";
import { reconciliar, type CubiculoDoc, type DispositivoVivo } from "../../../../lib/red/reconciliacion";

export async function POST(request: Request) {
  try {
    const cuerpo = await request.json().catch(() => ({})) as { cambios?: CambioPedido[] };
    const pedidos = Array.isArray(cuerpo.cambios) ? cuerpo.cambios.filter(cambio => Number.isInteger(cambio?.id)) : [];
    if (!pedidos.length) return noStoreJson({ error: "No se pidió adoptar ninguna IP." }, { status: 400 });

    const db = await getDb();
    // El pooler usa una sola conexión: lecturas en secuencia, no en paralelo.
    const documentados = await db
      .select({ id: cubicles.id, ip: cubicles.ip, mac: cubicles.mac, status: cubicles.status, marca: cubicles.brandModel })
      .from(cubicles)
      .orderBy(asc(cubicles.id));
    const vivos = await db.select().from(monDevices);

    const refrescado = vivos.reduce<Date | null>(
      (mayor, fila) => (mayor === null || fila.refreshedAt > mayor ? fila.refreshedAt : mayor),
      null,
    );
    // Adoptar desde un volcado viejo escribiría en la documentación una foto de
    // hace horas, que es peor que no escribir nada.
    if (!datosFrescos(refrescado ? refrescado.toISOString() : null)) {
      return noStoreJson({ error: "Los datos de red no están frescos. Espera al próximo volcado." }, { status: 409 });
    }

    const cubiculos: CubiculoDoc[] = documentados.map(fila => ({ id: fila.id, ip: fila.ip, mac: fila.mac, status: fila.status, marca: fila.marca }));
    const dispositivos: DispositivoVivo[] = vivos.map(fila => ({
      mac: fila.mac, ip: fila.ip, nombre: fila.name, fabricante: fila.vendor,
      ultimaConexion: fila.lastConnection, presente: fila.present,
    }));
    const plan = planAdopcion(reconciliar(cubiculos, dispositivos).cubiculos, pedidos, true);

    if (!plan.aplicar.length) return noStoreJson({ actualizados: [], omitidos: plan.omitidos });

    // Una transacción: un fallo a mitad de camino no puede dejar media sala
    // reescrita con IP nuevas y media con las viejas.
    const actualizados = await db.transaction(async (tx) => {
      const fecha = new Date().toISOString();
      const hechos: number[] = [];
      for (const cambio of plan.aplicar) {
        await tx.update(cubicles).set({ ip: cambio.ip, updatedAt: fecha }).where(eq(cubicles.id, cambio.id));
        // Los cubículos no tienen bitácora propia (hallazgo U8), así que se usa
        // la de red con objetivo cub:N, que es justo por donde la ficha de RED
        // ya filtra su historial.
        await tx.insert(netBitacora).values({
          fecha, tipo: "ip-adoptada", objetivo: `cub:${cambio.id}`,
          antes: cambio.antes, despues: cambio.ip,
          nota: "IP real adoptada desde el monitoreo.",
        });
        hechos.push(cambio.id);
      }
      return hechos;
    });

    return noStoreJson({ actualizados, omitidos: plan.omitidos });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible adoptar las IP.");
  }
}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /srv/apps/compose/panel-enlace && docker compose build panel-web 2>&1 | tail -6
```

Expected: build exitoso. Si `tsc` marca la profundidad del import (`../../../../`), contarla contra `app/api/monitoreo/route.ts`, que está un nivel más arriba.

- [ ] **Step 4: Probar el endpoint contra la instancia viva**

```bash
# 400 con cuerpo vacío
curl -s -u "$APP_USERNAME:$APP_PASSWORD" -X POST http://127.0.0.1:8083/api/room/adoptar-ip \
  -H 'Content-Type: application/json' -d '{}' | head -c 200; echo
# omitido, no aplicado: id inexistente
curl -s -u "$APP_USERNAME:$APP_PASSWORD" -X POST http://127.0.0.1:8083/api/room/adoptar-ip \
  -H 'Content-Type: application/json' -d '{"cambios":[{"id":999,"ipEsperada":"1.2.3.4"}]}' | head -c 300; echo
```

Expected: la primera devuelve el 400 con su mensaje; la segunda devuelve
`{"actualizados":[],"omitidos":[{"id":999,...}]}` **sin escribir nada**. Comprobar con
`docker exec panel-db psql … -c "select count(*) from net_bitacora where tipo='ip-adoptada'"` que sigue en 0.

- [ ] **Step 5: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/api/room/adoptar-ip/route.ts lib/red/modelo.ts
git commit -m "feat: endpoint para adoptar en lote las IP reales

Cuatro guardias: el servidor recalcula la reconciliación, rechaza volcados de
más de 15 minutos, omite las filas cuya IP documentada cambió mientras tanto, y
escribe todo en una transacción con bitácora por cubículo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: El modal de revisión en SALA

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `POST /api/room/adoptar-ip` (Task 6); `vivo.porCubiculo` de SALA
- Produces: nada

- [ ] **Step 1: Estado y apertura desde el contador**

En `app/page.tsx`, junto a los demás `useState`:

```tsx
  const [adopcionAbierta, setAdopcionAbierta] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [adoptando, setAdoptando] = useState(false);

  const enDrift = useMemo(
    () => stations
      .filter(station => vivo.porCubiculo.get(station.id)?.estado === "ip-distinta")
      .map(station => ({ id: station.id, documentada: station.ip, real: vivo.porCubiculo.get(station.id)!.ipReal })),
    [stations, vivo],
  );

  const abrirAdopcion = () => {
    setMarcados(new Set(enDrift.map(fila => fila.id)));
    setAdopcionAbierta(true);
  };

  const adoptar = async () => {
    setAdoptando(true);
    try {
      const respuesta = await fetch("/api/room/adoptar-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambios: enDrift.filter(fila => marcados.has(fila.id)).map(fila => ({ id: fila.id, ipEsperada: fila.documentada })) }),
      });
      const datos = await respuesta.json() as { actualizados?: number[]; omitidos?: { id: number; motivo: string }[]; error?: string };
      if (!respuesta.ok) throw new Error(datos.error || "No fue posible adoptar las IP.");
      setAdopcionAbierta(false);
      await load();
      await cargarVivo();
      // Se informa lo omitido con sus números: un "listo" genérico escondería
      // que dos cubículos no se tocaron y nadie se enteraría.
      const omitidos = datos.omitidos ?? [];
      showNotice(omitidos.length
        ? `${datos.actualizados?.length ?? 0} IP adoptadas. Sin tocar: ${omitidos.map(item => item.id).join(", ")}.`
        : `${datos.actualizados?.length ?? 0} IP adoptadas.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "No fue posible adoptar las IP.", "error");
    } finally {
      setAdoptando(false);
    }
  };
```

En el rail vivo, el botón de `ip-distinta` abre el modal en vez de solo filtrar cuando hay drift. Reemplazar el `onClick` de ese contador por:

```tsx
                    onClick={() => { if (clave === "ip-distinta" && vivo.resumen!["ip-distinta"] > 0) { abrirAdopcion(); return; } setFiltroVivo(filtroVivo === clave ? "" : clave); }}
```

- [ ] **Step 2: El modal**

Antes del `{notice && …}` del final, insertar:

```tsx
      {adopcionAbierta && <div className="modal-fondo">
        <button className="backdrop" onClick={() => setAdopcionAbierta(false)} aria-label="Cerrar" />
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="adopcion-titulo">
          <div className="modal-head">
            <div>
              <span>RED VIVA</span>
              <h2 id="adopcion-titulo">Adoptar IP reales</h2>
              <p>La IP documentada de estos cubículos no coincide con la que tienen ahora en la red. Revisa y aplica lo que corresponda.</p>
            </div>
            <button onClick={() => setAdopcionAbierta(false)} aria-label="Cerrar">×</button>
          </div>
          <div className="modal-list">
            {enDrift.map(fila => <label className="adopcion-fila" key={fila.id}>
              <input
                type="checkbox"
                checked={marcados.has(fila.id)}
                onChange={evento => setMarcados(actual => {
                  const siguiente = new Set(actual);
                  if (evento.target.checked) siguiente.add(fila.id);
                  else siguiente.delete(fila.id);
                  return siguiente;
                })}
              />
              <b>{String(fila.id).padStart(2, "0")}</b>
              <span className="adopcion-ip">{fila.documentada || "sin registrar"}</span>
              <i aria-hidden="true">→</i>
              <span className="adopcion-ip nueva">{fila.real}</span>
            </label>)}
          </div>
          <div className="net-resource-foot">
            <button className="secondary" onClick={() => setAdopcionAbierta(false)} disabled={adoptando}>Cancelar</button>
            <button className="primary" onClick={() => void adoptar()} disabled={adoptando || !marcados.size}>
              {adoptando ? "Adoptando…" : `Adoptar ${marcados.size} IP`}
            </button>
          </div>
        </div>
      </div>}
```

- [ ] **Step 3: Estilos**

Añadir a `app/globals.css`:

```css
.adopcion-fila{display:flex;align-items:center;gap:var(--esp-3);padding:var(--esp-2) 0;border-bottom:1px solid #e8e9e5;font-size:12px;cursor:pointer}
.adopcion-fila input{accent-color:var(--green);width:16px;height:16px;flex:0 0 16px}
.adopcion-fila b{font:700 12px var(--font-mono);min-width:22px}
.adopcion-ip{font:700 11px var(--font-mono);color:var(--muted)}
.adopcion-ip.nueva{color:#9a5c14}
.adopcion-fila i{color:var(--muted);font-style:normal}
.live-filters button.accionable{border-color:#d7b969;background:#fffaf0;color:var(--ink)}
@media(max-width:600px){.adopcion-fila{flex-wrap:wrap;min-height:48px}}
```

Y marcar el contador accionable añadiendo `accionable` a su `className` cuando
`clave === "ip-distinta" && vivo.resumen!["ip-distinta"] > 0`.

- [ ] **Step 4: Verificar que compila y que el lint no empeora**

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-slim sh -c "npm run lint" 2>&1 | tail -8
cd /srv/apps/compose/panel-enlace && docker compose build panel-web 2>&1 | tail -4
```

Expected: build verde, los mismos 4 errores de lint preexistentes.

- [ ] **Step 5: Verificación manual**

1. Con al menos un cubículo en drift, el contador `IP distinta` se ve accionable y abre el modal.
2. Todas las filas vienen marcadas; desmarcar una baja el número del botón.
3. Aplicar: el plano y la ficha muestran la IP nueva, y el toast dice cuántas se adoptaron.
4. En RED → ficha del cubículo adoptado, la bitácora muestra la entrada `ip-adoptada` con la IP anterior y la nueva.
5. Sin cubículos en drift, el contador solo filtra, como los demás.

- [ ] **Step 6: Commit**

```bash
cd /srv/apps/panel-enlace
git add app/page.tsx app/globals.css
git commit -m "feat: modal de revisión para adoptar las IP reales

Se ve exactamente qué va a cambiar antes de que cambie, y lo omitido se informa
con sus números en vez de un 'listo' genérico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificación final

```bash
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/*.test.ts" 2>&1 | tail -12
cd /srv/apps/compose/panel-enlace && docker compose build panel-web && docker compose up -d panel-web
```

Y la pasada visual a 1440 / 1000 / 760 / 375 px sobre las tres pestañas, con foco en
el diagrama: la espina dorsal tiene que leerse de un vistazo y las rosetas tienen que
haber pasado a segundo plano.

## Qué queda fuera, a propósito

- **Ruteo ortogonal por canales.** Se monta encima después si los cruces siguen molestando.
- **Bitácora propia de cubículos** (hallazgo U8). Esto usa `net_bitacora` con `objetivo = cub:N`; no cierra U8, solo evita abrir un agujero nuevo.
