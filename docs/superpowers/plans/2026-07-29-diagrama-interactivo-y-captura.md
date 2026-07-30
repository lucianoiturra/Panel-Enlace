# Diagrama interactivo y arreglo de la captura rápida — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar la captura rápida, que hoy no se puede usar, y convertir el diagrama de la pestaña Red en una vista de flujo por capas donde se lee cada nombre, se resalta la ruta de cualquier punto hacia el ISP y se crean enlaces con dos clics.

**Architecture:** La geometría del diagrama se calcula en un módulo puro nuevo, `lib/red/layout.ts`, que convierte `EstadoRed` en nodos, aristas y bandeja sin tocar el DOM. `lib/red/trazado.ts` gana dos campos derivados del BFS que ya ejecuta —la ruta cruda y el conjunto alcanzable— para que el diagrama sepa qué aristas encender. `app/red/diagrama.tsx` queda solo con lienzo, zoom, selección y modos, y delega el dibujo SVG en `app/red/diagrama-nodos.tsx`. El matcher de búsqueda sale de `app/red/captura.tsx` hacia `lib/red/busqueda.ts`, donde se puede probar.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.6, TypeScript 5.9.3, CSS propio en `app/globals.css`, runner de pruebas nativo de Node 22.

**Spec:** `docs/superpowers/specs/2026-07-29-diagrama-interactivo-y-captura-design.md`

## Global Constraints

- **Sin dependencias nuevas.** Ni de runtime ni de desarrollo. No se instala ninguna librería de grafos, layout ni SVG.
- **Node ≥ 22.13.0** (`package.json` → `engines`). Las pruebas corren con `npm test`, que ejecuta `npm run build && node --experimental-strip-types --test tests/*.test.ts`. El runner recibe un **patrón de archivos**, no un directorio.
- **Todo el texto de interfaz va en español**, con el tono de `PRODUCT.md`: claro, directo, sin adornos. Sin emojis en la interfaz.
- **Estilo de código:** el del repo — líneas densas, `const` con arrow functions para helpers, `type` en vez de `interface`, comillas dobles, punto y coma, sin comentarios decorativos. Nombres de variables y funciones en español.
- **Imports en `lib/` y `tests/` llevan extensión `.ts`** (`from "./modelo.ts"`), porque los corre Node directo. Los imports en `app/` **no** la llevan, porque los resuelve Next.
- **Ids con prefijo:** `pto:` puertos, `esp:` espacios, `cub:` cubículos, `eq:` chasis de equipo. Los ids de nodo del layout reutilizan `eq:` para equipos con puertos, y para equipos de 0 puertos usan el id de su único puerto (`pto:ISP-p0`), que es lo que referencian los enlaces.
- **No se modifican los datos de la red.** Nada de agregar enlaces a la semilla ni a la base para "completar" la cadena hacia el ISP. El hueco se muestra, no se rellena.
- **`saltos`, `completa` y `motivo` de `trazarCadena` no cambian de forma.** La ficha y el buscador dependen de ellos y sus pruebas actuales deben seguir pasando sin editarlas.
- **`masLejano()` no se toca.**
- **Los estados de puerto válidos** son `libre` · `ocupado` · `desconocido` · `dañado`. Solo `libre` y `desconocido` pueden ser origen de una conexión nueva.

## Estructura de archivos

| archivo | responsabilidad | estado |
|---|---|---|
| `lib/red/busqueda.ts` | puro: normalizar texto y calzar candidatos | crear |
| `lib/red/layout.ts` | puro: `EstadoRed` → nodos, aristas, capas, bandeja, anclas | crear |
| `lib/red/trazado.ts` | agrega `camino` y `alcanzables` al resultado | modificar |
| `app/red/captura.tsx` | usa `busqueda.ts`, avisa cuando no hay coincidencias | modificar |
| `app/red/diagrama.tsx` | lienzo: pan, zoom, modos, selección, barra de cadena | reescribir |
| `app/red/diagrama-nodos.tsx` | dibujo SVG de nodos y aristas | crear |
| `app/red/page.tsx` | generaliza `asignarRapido`, pasa props al diagrama | modificar |
| `app/globals.css` | arregla el choque de `.modal-head button`, estilos del diagrama | modificar |
| `tests/busqueda.test.ts` | pruebas del matcher | crear |
| `tests/layout.test.ts` | pruebas del layout | crear |
| `tests/trazado.test.ts` | pruebas de `camino` y `alcanzables` | modificar |

---

### Task 1: Arreglar el choque de CSS que rompe la captura

La regla del botón × de cierre alcanza a todo botón dentro de `.modal-head`, incluidos los dos del selector de sentido, y los dibuja como círculos de 34 px con el texto cortado. En los cuatro lugares donde se usan estas cabeceras el × es hijo directo, así que acotar el selector con `>` es seguro. Verificado en `app/page.tsx:362`, `app/page.tsx:379`, `app/red/ficha.tsx:53` y `app/red/captura.tsx:90`.

**Files:**
- Modify: `app/globals.css:16` y `app/globals.css:49`

**Interfaces:**
- Consumes: nada.
- Produces: nada que otras tareas importen. Solo cambia CSS.

- [ ] **Step 1: Acotar la regla de escritorio a hijos directos**

En `app/globals.css` línea 16, dentro de la línea larga, buscar exactamente:

```css
.drawer-head button,.modal-head button{border:0;background:#eef0eb;width:34px;height:34px;border-radius:50%;font-size:23px}
```

y reemplazar por:

```css
.drawer-head>button,.modal-head>button{border:0;background:#eef0eb;width:34px;height:34px;border-radius:50%;font-size:23px}
```

- [ ] **Step 2: Acotar la regla móvil a hijos directos**

En `app/globals.css` línea 49, dentro de la línea larga, buscar exactamente:

```css
.drawer-head button,.modal-head button{width:44px;height:44px;flex:0 0 44px}
```

y reemplazar por:

```css
.drawer-head>button,.modal-head>button{width:44px;height:44px;flex:0 0 44px}
```

- [ ] **Step 3: Confirmar que no queda ningún selector amplio**

Run: `npx --no-install rg -n "head button" app/globals.css`
Expected: sin resultados. Si aparece alguno, acotarlo igual con `>`.

- [ ] **Step 4: Verificar en el navegador**

Run: `npm run dev`
Abrir `http://localhost:3000/red`, pulsar **Captura rápida**.
Expected: los botones **DESDE EL PUERTO** y **DESDE EL ESPACIO** se ven como dos segmentos rectangulares con el texto completo, no como dos círculos. El × de cierre sigue redondo, arriba a la derecha. Abrir también la ficha de un espacio y el checklist de la portada para confirmar que sus × siguen redondos.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "Fix the segmented control squashed into circles inside modal headers"
```

---

### Task 2: Módulo de búsqueda con matcher tolerante

El campo de captura promete `Ej: 3 básico b, cubículo 12` y ese texto no encuentra nada: los espacios se llaman `3° Básico B`, y `normalizar()` quita acentos pero no el `°`, sobre un filtro que además exige subcadena exacta. La lógica sale del componente a un módulo puro para poder probarla.

**Files:**
- Create: `lib/red/busqueda.ts`
- Test: `tests/busqueda.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizar(valor: string): string` — minúsculas, sin acentos, sin `°ºª,.;:_-/()` y con espacios colapsados.
  - `calza(nombre: string, consulta: string): boolean` — verdadero si **todas** las palabras de la consulta aparecen en el nombre normalizado, en cualquier orden.
  - `aliasCubiculo(consulta: string): number | null` — reconoce `12`, `c12`, `cub 12`, `cubiculo 12`, `cubículo 12` y devuelve `12`; devuelve `null` si no calza.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/busqueda.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasCubiculo, calza, normalizar } from "../lib/red/busqueda.ts";

test("normalizar quita acentos, grados y puntuación", () => {
  assert.equal(normalizar("3° Básico B"), "3 basico b");
  assert.equal(normalizar("Depto. Enlace"), "depto enlace");
  assert.equal(normalizar("Comedor / Casino"), "comedor casino");
  assert.equal(normalizar("  UTP   E. Media  "), "utp e media");
});

test("calza encuentra el espacio escribiendo sin el grado", () => {
  assert.equal(calza("3° Básico B", "3 basico b"), true);
  assert.equal(calza("3° Básico B", "3 básico b"), true);
});

test("calza acepta las palabras en cualquier orden", () => {
  assert.equal(calza("3° Básico B", "b 3 basico"), true);
  assert.equal(calza("Sala de Multicopiado", "multicopiado sala"), true);
});

test("calza distingue entre secciones", () => {
  assert.equal(calza("3° Básico A", "3 basico b"), false);
  assert.equal(calza("4° Básico B", "3 basico b"), false);
});

test("calza con consulta vacía no calza", () => {
  assert.equal(calza("3° Básico B", ""), false);
  assert.equal(calza("3° Básico B", "   "), false);
});

test("aliasCubiculo reconoce las formas de escribir un cubículo", () => {
  assert.equal(aliasCubiculo("cubiculo 12"), 12);
  assert.equal(aliasCubiculo("cubículo 12"), 12);
  assert.equal(aliasCubiculo("cub 12"), 12);
  assert.equal(aliasCubiculo("cub12"), 12);
  assert.equal(aliasCubiculo("c12"), 12);
  assert.equal(aliasCubiculo("12"), 12);
});

test("aliasCubiculo rechaza lo que no es un cubículo", () => {
  assert.equal(aliasCubiculo("3 basico b"), null);
  assert.equal(aliasCubiculo("cubiculo"), null);
  assert.equal(aliasCubiculo(""), null);
  assert.equal(aliasCubiculo("r2/pp1/15"), null);
});
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `node --experimental-strip-types --test tests/busqueda.test.ts`
Expected: FAIL con `Cannot find module` sobre `../lib/red/busqueda.ts`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/red/busqueda.ts`:

```ts
export const normalizar = (valor: string) => valor
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[°ºª,.;:_\-/()]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const calza = (nombre: string, consulta: string) => {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (!palabras.length) return false;
  const objetivo = normalizar(nombre);
  return palabras.every(palabra => objetivo.includes(palabra));
};

export const aliasCubiculo = (consulta: string) => {
  const limpio = normalizar(consulta).replace(/\s+/g, "");
  const coincidencia = /^(?:cubiculo|cub|c)?(\d{1,3})$/.exec(limpio);
  if (!coincidencia) return null;
  return Number(coincidencia[1]);
};
```

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `node --experimental-strip-types --test tests/busqueda.test.ts`
Expected: PASS, 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/red/busqueda.ts tests/busqueda.test.ts
git commit -m "Add a search matcher that tolerates degree signs and word order"
```

---

### Task 3: Conectar la captura al matcher y avisar cuando no hay coincidencias

Hoy, sin coincidencias, la lista queda vacía y `Enter` no hace nada ni avisa. El usuario no distingue "no existe" de "la app no responde".

**Files:**
- Modify: `app/red/captura.tsx:40-56` (matcher y opciones), `app/red/captura.tsx:122-127` (campo y lista)
- Modify: `app/globals.css` (una regla nueva al final del bloque de captura)

**Interfaces:**
- Consumes: `normalizar`, `calza`, `aliasCubiculo` de `lib/red/busqueda.ts` (Task 2).
- Produces: nada que otras tareas importen.

- [ ] **Step 1: Reemplazar el matcher local por el módulo**

En `app/red/captura.tsx`, borrar la línea 40:

```tsx
  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
```

y agregar al bloque de imports de arriba:

```tsx
import { aliasCubiculo, calza, normalizar } from "../../lib/red/busqueda";
```

Reemplazar `coincidencias` (líneas 41-45) por:

```tsx
  const coincidencias = useMemo(() => {
    const consulta = texto.trim();
    if (!consulta) return [] as Candidato[];
    const numero = aliasCubiculo(consulta);
    const porAlias = numero === null ? [] : candidatos.filter(candidato => candidato.id === `cub:${numero}`);
    const porNombre = candidatos.filter(candidato => calza(candidato.nombre, consulta) && !porAlias.includes(candidato));
    return [...porAlias, ...porNombre].slice(0, 6);
  }, [candidatos, texto]);
```

Reemplazar `coincidenciasPuerto` (líneas 47-54) por:

```tsx
  const coincidenciasPuerto = useMemo(() => {
    const buscado = normalizar(texto).replace(/\s+/g, "");
    if (!buscado) return [] as { id: string; etiqueta: string; estado: string }[];
    return estado.puertos
      .filter(puerto => puerto.n > 0 && normalizar(etiquetaPuerto(estado, puerto.id)).replace(/\s+/g, "").includes(buscado))
      .slice(0, 6)
      .map(puerto => ({ id: puerto.id, etiqueta: etiquetaPuerto(estado, puerto.id), estado: etiquetasEstadoPuerto[puerto.estado] }));
  }, [estado, texto]);
```

`normalizar` ya convierte `/` en espacio, así que quitar los espacios después deja `r2pp115`, y `r2/pp1/15` y `r2 pp1 15` calzan igual contra la etiqueta `R2/PP1 p15` normalizada a `r2 pp1 p15` → `r2pp1p15`. Ojo: la etiqueta lleva la `p` del número de puerto, así que la consulta debe incluirla (`r2/pp1/p15`) o ser un prefijo (`r2pp1`). No agregar lógica extra para eso: queda cubierto porque la lista muestra hasta 6 opciones y el usuario elige con las flechas.

- [ ] **Step 2: Mostrar el aviso de "sin coincidencias"**

En `app/red/captura.tsx`, después del `<input>` y antes del `{opciones.length > 0 && ...}` (línea 122), agregar:

```tsx
            {texto.trim() && !opciones.length && <p className="net-capture-vacio" role="status">Sin coincidencias para «{texto.trim()}». Revisa el nombre o marca el puerto sin uso.</p>}
```

- [ ] **Step 3: Corregir el placeholder que promete la forma con coma**

En la misma línea del `<input>`, reemplazar:

```tsx
placeholder={sentido === "puerto" ? "Ej: 3 básico b, cubículo 12" : "Ej: r2/pp1/15"}
```

por:

```tsx
placeholder={sentido === "puerto" ? "Ej: 3 basico b · cub 12" : "Ej: r2/pp1/p15"}
```

- [ ] **Step 4: Agregar el estilo del aviso**

En `app/globals.css`, inmediatamente después de la regla `.net-capture-ac em{...}` (línea 131), agregar en una línea nueva:

```css
.net-capture-vacio{margin:0;color:#9a6d00;font-size:11px;font-weight:700}
```

- [ ] **Step 5: Verificar en el navegador**

Run: `npm run dev`
Abrir `http://localhost:3000/red` → **Captura rápida**.
Expected:
- escribir `3 basico b` muestra `3° Básico B` en la lista;
- escribir `b 3 basico` muestra lo mismo;
- escribir `cub 12` muestra `Cubículo 12`;
- escribir `xyz` muestra el aviso `Sin coincidencias para «xyz»…` y `Enter` no rompe nada;
- en el sentido **DESDE EL ESPACIO**, escribir `r2/pp1` lista puertos de ese panel.

- [ ] **Step 6: Correr las pruebas y el linter**

Run: `npm test`
Expected: PASS, sin regresiones.
Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/red/captura.tsx app/globals.css
git commit -m "Make the capture field find spaces and report when nothing matches"
```

---

### Task 4: Dos arreglos menores de la captura

Abrir la captura con un puerto seleccionado fija el equipo pero deja el recorrido en el puerto 1, así que el puerto que venías mirando se pierde. Y el resumen del sentido "espacio" tiene el total escrito a mano.

**Files:**
- Modify: `app/red/captura.tsx:21-22` (índice inicial), `app/red/captura.tsx:115` (total escrito a mano)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otras tareas importen.

- [ ] **Step 1: Posicionar el recorrido en el puerto inicial**

En `app/red/captura.tsx`, reemplazar las líneas 21-22:

```tsx
  const [equipoId, setEquipoId] = useState(() => puertoInicial ? estado.puertos.find(puerto => puerto.id === puertoInicial)?.equipo ?? "" : "");
  const [indicePuerto, setIndicePuerto] = useState(0);
```

por:

```tsx
  const [equipoId, setEquipoId] = useState(() => puertoInicial ? estado.puertos.find(puerto => puerto.id === puertoInicial)?.equipo ?? "" : "");
  const [indicePuerto, setIndicePuerto] = useState(() => {
    if (!puertoInicial) return 0;
    const puerto = estado.puertos.find(candidato => candidato.id === puertoInicial);
    if (!puerto) return 0;
    const hermanos = estado.puertos.filter(candidato => candidato.equipo === puerto.equipo).sort((a, b) => a.n - b.n);
    return Math.max(hermanos.findIndex(candidato => candidato.id === puertoInicial), 0);
  });
```

- [ ] **Step 2: Calcular el total en vez de escribirlo a mano**

En `app/red/captura.tsx` línea 115, reemplazar:

```tsx
                : (endpointActual ? `${endpointActual.grupo} · sin puerto asignado` : "Los 101 puntos tienen puerto")}</div>
```

por:

```tsx
                : (endpointActual ? `${endpointActual.grupo} · sin puerto asignado` : `Los ${candidatos.length} puntos tienen puerto`)}</div>
```

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev`
Abrir `http://localhost:3000/red`, vista **RACKS**, clic en el puerto 15 de `R2/PP1` para abrir su ficha, cerrarla con `esc`, y pulsar **Captura rápida**.
Expected: el equipo seleccionado es `R2/PP1` y el puerto grande dice `R2/PP1 p15`, no `p01`.

- [ ] **Step 4: Correr las pruebas y el linter**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/red/captura.tsx
git commit -m "Open the capture on the port that was already selected"
```

---

### Task 5: `trazarCadena` devuelve la ruta cruda y el conjunto alcanzable

El diagrama no puede saber qué aristas encender con los saltos presentados, porque `presentar()` colapsa los puertos consecutivos del mismo equipo: la cadena muestra `R3/SW1 p01 → R2/SW1 p20` y esconde el puerto de uplink real, `R3/SW1 p26`. Además hoy el BFS corta al encontrar el ISP, así que el conjunto alcanzable quedaría a medias.

**Files:**
- Modify: `lib/red/trazado.ts:4` (tipo `Cadena`), `lib/red/trazado.ts:66-107` (`trazarCadena`)
- Test: `tests/trazado.test.ts` (agregar pruebas al final)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: el tipo `Cadena` gana dos campos, que consumen las Tasks 8 y 9:
  - `camino: string[]` — la ruta cruda desde el origen, con los puertos intermedios que `presentar()` colapsa y los nodos `eq:`.
  - `alcanzables: Set<string>` — todos los nodos visitados por el BFS, incluidos los `eq:`.
  - `saltos`, `completa` y `motivo` no cambian de forma.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/trazado.test.ts`:

```ts
test("camino conserva los puertos que los saltos colapsan", () => {
  const cadena = trazarCadena(fixture(), "esp:3-basico-b");
  assert.equal(cadena.camino.includes("pto:R2-SW1-p24"), true);
  assert.equal(cadena.camino.includes("pto:R3-SW1-p28"), true);
  assert.equal(cadena.camino.some(id => id.startsWith("eq:")), true);
  assert.equal(cadena.camino[0], "esp:3-basico-b");
  assert.equal(cadena.camino[cadena.camino.length - 1], "pto:ISP-p0");
});

test("alcanzables cubre todo lo visitado, no solo la ruta", () => {
  const estado = fixture();
  estado.enlaces.push({ id: 6, a: "esp:secretaria", b: "pto:R2-PP1-p15", tipo: "roseta", nota: "" });
  estado.enlaces.push({ id: 7, a: "pto:R2-PP1-p15", b: "pto:R2-SW1-p24", tipo: "patch", nota: "" });
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, true);
  assert.equal(cadena.alcanzables.has("esp:secretaria"), true);
  assert.equal(cadena.camino.includes("esp:secretaria"), false);
});

test("alcanzables excluye el ISP cuando el parcheo no está documentado", () => {
  const estado = fixture();
  estado.enlaces = estado.enlaces.filter(enlace => enlace.id !== 5);
  const cadena = trazarCadena(estado, "esp:3-basico-b");
  assert.equal(cadena.completa, false);
  assert.equal(cadena.alcanzables.has("pto:ISP-p0"), false);
  assert.equal(cadena.alcanzables.has("pto:R3-SW1-p28"), true);
});

test("un endpoint inexistente devuelve camino y alcanzables vacíos", () => {
  const cadena = trazarCadena(fixture(), "esp:no-existe");
  assert.deepEqual(cadena.camino, []);
  assert.equal(cadena.alcanzables.size, 0);
});
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `node --experimental-strip-types --test tests/trazado.test.ts`
Expected: FAIL. Las pruebas nuevas fallan con `Cannot read properties of undefined (reading 'includes')` porque `camino` no existe. Las 10 pruebas anteriores pasan.

- [ ] **Step 3: Agregar los campos al tipo**

En `lib/red/trazado.ts` línea 4, reemplazar:

```ts
export type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string };
```

por:

```ts
export type Cadena = { saltos: Salto[]; completa: boolean; motivo?: string; camino: string[]; alcanzables: Set<string> };
```

- [ ] **Step 4: Agotar el BFS y devolver los campos nuevos**

En `lib/red/trazado.ts`, reemplazar el `return` temprano de la línea 70:

```ts
  if (!existe) return { saltos: [], completa: false, motivo: "El punto de origen no existe." };
```

por:

```ts
  if (!existe) return { saltos: [], completa: false, motivo: "El punto de origen no existe.", camino: [], alcanzables: new Set() };
```

Reemplazar el bucle del BFS (líneas 79-89) por esta versión, que no corta al encontrar el ISP para que `alcanzables` quede completo. El orden del BFS no cambia, así que `destino` sigue siendo el primer puerto de ISP encontrado y el camino resultante es el mismo:

```ts
  while (cola.length && expansiones < TOPE_SALTOS) {
    const actual = cola.shift()!;
    expansiones += 1;
    if (!destino && esDelIsp(estado, actual)) destino = actual;
    for (const vecino of adyacencia.get(actual) ?? []) {
      if (padres.has(vecino)) continue;
      padres.set(vecino, actual);
      profundidades.set(vecino, (profundidades.get(actual) ?? 0) + 1);
      cola.push(vecino);
    }
  }
```

Reemplazar los dos `return` finales (líneas 105-106):

```ts
  if (destino) return { saltos, completa: true };
  return { saltos, completa: false, motivo: motivoIncompleto(estado, origenId, final) };
```

por:

```ts
  const alcanzables = new Set(padres.keys());
  if (destino) return { saltos, completa: true, camino, alcanzables };
  return { saltos, completa: false, motivo: motivoIncompleto(estado, origenId, final), camino, alcanzables };
```

- [ ] **Step 5: Correr las pruebas y confirmar que pasan**

Run: `node --experimental-strip-types --test tests/trazado.test.ts`
Expected: PASS, 14 pruebas. Las 10 originales siguen verdes sin haberlas editado.

- [ ] **Step 6: Correr toda la suite y el linter**

Run: `npm test`
Expected: PASS. `trazado.test.ts`, `modelo.test.ts`, `semilla.test.ts` y `busqueda.test.ts` en verde.
Run: `npm run lint`
Expected: sin errores. Si TypeScript reclama en `app/red/ficha.tsx` o `app/red/page.tsx` por los campos nuevos, no es el caso: agregar campos a un tipo de retorno no rompe a quien lo consume.

- [ ] **Step 7: Commit**

```bash
git add lib/red/trazado.ts tests/trazado.test.ts
git commit -m "Return the raw path and the reachable set from trazarCadena"
```

---

### Task 6: `lib/red/layout.ts` — capas, posiciones y bandeja

El diagrama usa hoy las coordenadas de la semilla, que abarcan unas 8600 × 3000 unidades y obligan a la escala 0.1, donde nada se lee. El layout pasa a calcularse. Como solo 2 de 61 espacios y 0 de 40 cubículos tienen puerto, los 99 puntos sin asignar salen del flujo a una bandeja.

**Files:**
- Create: `lib/red/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `EstadoPuerto`, `EstadoRed`, `TipoEnlace`, `TipoEquipo`, `puertosDeEndpoint` de `lib/red/modelo.ts`.
- Produces, para las Tasks 7, 8 y 9:
  - `capaDeEquipo(tipo: TipoEquipo): number` — `isp` 0, `firewall` y `router` 1, `switch` 2, `patchpanel` 3, `ap` 4.
  - `type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number }` — `x`/`y` **relativos** al nodo.
  - `type Nodo = { id: string; clase: "equipo" | "aparato" | "espacio" | "cubiculo"; etiqueta: string; capa: number; x: number; y: number; w: number; h: number; puertos: PuertoNodo[]; isla: boolean }` — `x`/`y` absolutos.
  - `type Arista = { id: number; a: string; b: string; nodoA: string; nodoB: string; tipo: TipoEnlace }` — `a`/`b` son ids de punto (puerto, espacio o cubículo), para calzar contra `camino`; `nodoA`/`nodoB` son ids de nodo.
  - `type FichaBandeja = { id: string; etiqueta: string; grupo: string }`
  - `type Layout = { nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number }`
  - `construirLayout(estado: EstadoRed): Layout`
  - `anclasDeLayout(layout: Layout): Map<string, { x: number; y: number }>` — posición absoluta de cada id de punto y de cada id de nodo.
  - Constantes exportadas: `ANCHO_PUERTO = 34`, `ALTO_EQUIPO = 62`, `ANCHO_HOJA = 190`, `ALTO_HOJA = 46`, `SEPARACION = 26`, `ALTO_CAPA = 200`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/layout.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture-red.ts";
import semilla from "../lib/red/semilla.json" with { type: "json" };
import { anclasDeLayout, capaDeEquipo, construirLayout } from "../lib/red/layout.ts";
import { puertosDeEndpoint, type EstadoRed } from "../lib/red/modelo.ts";

test("capaDeEquipo ordena los tipos de arriba hacia abajo", () => {
  assert.equal(capaDeEquipo("isp"), 0);
  assert.equal(capaDeEquipo("firewall"), 1);
  assert.equal(capaDeEquipo("router"), 1);
  assert.equal(capaDeEquipo("switch"), 2);
  assert.equal(capaDeEquipo("patchpanel"), 3);
  assert.equal(capaDeEquipo("ap"), 4);
});

test("cada equipo cae en su capa y con el id que esperan los enlaces", () => {
  const layout = construirLayout(fixture());
  const porId = new Map(layout.nodos.map(nodo => [nodo.id, nodo]));
  assert.equal(porId.get("pto:ISP-p0")?.capa, 0);
  assert.equal(porId.get("pto:ISP-p0")?.clase, "aparato");
  assert.equal(porId.get("pto:MIKROTIK-p0")?.capa, 1);
  assert.equal(porId.get("eq:R2-SW1")?.capa, 2);
  assert.equal(porId.get("eq:R3-SW1")?.capa, 2);
  assert.equal(porId.get("eq:R2-PP1")?.capa, 3);
  assert.equal(porId.get("eq:R2-PP1")?.clase, "equipo");
});

test("los equipos con puertos exponen sus puertos dentro de su caja", () => {
  const layout = construirLayout(fixture());
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP1");
  assert.ok(panel);
  assert.deepEqual(panel.puertos.map(puerto => puerto.n), [14, 15, 16]);
  for (const puerto of panel.puertos) {
    assert.ok(puerto.x >= 0, "el puerto empieza dentro de la caja");
    assert.ok(puerto.x + puerto.w <= panel.w, "el puerto termina dentro de la caja");
    assert.ok(puerto.y + puerto.h <= panel.h, "el puerto cabe en alto");
  }
});

test("dos nodos de la misma capa no se solapan", () => {
  const layout = construirLayout(fixture());
  for (const capa of [0, 1, 2, 3, 4]) {
    const fila = layout.nodos.filter(nodo => nodo.capa === capa).sort((a, b) => a.x - b.x);
    for (let indice = 1; indice < fila.length; indice += 1) {
      assert.ok(fila[indice].x >= fila[indice - 1].x + fila[indice - 1].w, `se solapan en la capa ${capa}`);
    }
  }
});

test("un espacio con puerto va al flujo y uno sin puerto va a la bandeja", () => {
  const layout = construirLayout(fixture());
  const ids = layout.nodos.map(nodo => nodo.id);
  assert.equal(ids.includes("esp:3-basico-b"), true);
  assert.equal(ids.includes("esp:4-basico-a"), false);
  const enBandeja = layout.bandeja.map(ficha => ficha.id);
  assert.equal(enBandeja.includes("esp:4-basico-a"), true);
  assert.equal(enBandeja.includes("esp:3-basico-b"), false);
});

test("los cubículos sin puerto van a la bandeja con su grupo", () => {
  const layout = construirLayout(fixture());
  const cubiculo = layout.bandeja.find(ficha => ficha.id === "cub:12");
  assert.equal(cubiculo?.etiqueta, "Cubículo 12");
  assert.equal(cubiculo?.grupo, "Cubículos");
});

test("un espacio en el flujo queda en la última capa", () => {
  const layout = construirLayout(fixture());
  const espacio = layout.nodos.find(nodo => nodo.id === "esp:3-basico-b");
  assert.equal(espacio?.capa, 4);
  assert.equal(espacio?.clase, "espacio");
});

test("las aristas guardan el punto y el nodo de cada extremo", () => {
  const layout = construirLayout(fixture());
  const roseta = layout.aristas.find(arista => arista.a === "esp:3-basico-b" || arista.b === "esp:3-basico-b");
  assert.ok(roseta);
  assert.equal(roseta.tipo, "roseta");
  const nodos = [roseta.nodoA, roseta.nodoB].sort();
  assert.deepEqual(nodos, ["eq:R2-PP1", "esp:3-basico-b"]);
});

test("un equipo desconectado del ISP se marca como isla", () => {
  const estado = fixture();
  estado.equipos.push({ id: "FORTINET", rack: "R2", tipo: "firewall", etiqueta: "Fortinet", modelo: "", puertos: 0, color: "", x: 0, y: 0, nota: "" });
  estado.puertos.push({ id: "pto:FORTINET-p0", equipo: "FORTINET", n: 0, estado: "ocupado", nota: "" });
  const layout = construirLayout(estado);
  assert.equal(layout.nodos.find(nodo => nodo.id === "pto:FORTINET-p0")?.isla, true);
  assert.equal(layout.nodos.find(nodo => nodo.id === "eq:R2-SW1")?.isla, false);
});

test("anclasDeLayout ubica puertos y nodos en coordenadas absolutas", () => {
  const layout = construirLayout(fixture());
  const anclas = anclasDeLayout(layout);
  const panel = layout.nodos.find(nodo => nodo.id === "eq:R2-PP1");
  const puerto = panel?.puertos.find(candidato => candidato.n === 15);
  assert.ok(panel && puerto);
  const ancla = anclas.get("pto:R2-PP1-p15");
  assert.equal(ancla?.x, panel.x + puerto.x + puerto.w / 2);
  assert.equal(ancla?.y, panel.y + puerto.y + puerto.h / 2);
  assert.ok(anclas.has("eq:R2-PP1"));
  assert.ok(anclas.has("esp:3-basico-b"));
});

test("con la semilla real la bandeja contiene todos los puntos sin puerto", () => {
  const estado = { ...semilla, bitacora: [], cubiculos: [] } as unknown as EstadoRed;
  const layout = construirLayout(estado);
  const sinPuerto = estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length);
  assert.equal(layout.bandeja.length, sinPuerto.length);
  assert.ok(layout.bandeja.length > 0);
  assert.equal(layout.nodos.some(nodo => layout.bandeja.some(ficha => ficha.id === nodo.id)), false);
});
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: FAIL con `Cannot find module` sobre `../lib/red/layout.ts`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/red/layout.ts`:

```ts
import { puertosDeEndpoint, type EstadoPuerto, type EstadoRed, type TipoEnlace, type TipoEquipo } from "./modelo.ts";

export const ANCHO_PUERTO = 34;
export const ALTO_EQUIPO = 62;
export const ANCHO_HOJA = 190;
export const ALTO_HOJA = 46;
export const SEPARACION = 26;
export const ALTO_CAPA = 200;

export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = { id: string; clase: ClaseNodo; etiqueta: string; capa: number; x: number; y: number; w: number; h: number; puertos: PuertoNodo[]; isla: boolean };
export type Arista = { id: number; a: string; b: string; nodoA: string; nodoB: string; tipo: TipoEnlace };
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };
export type Layout = { nodos: Nodo[]; aristas: Arista[]; bandeja: FichaBandeja[]; ancho: number; alto: number };

const CAPAS: Record<TipoEquipo, number> = { isp: 0, firewall: 1, router: 1, switch: 2, patchpanel: 3, ap: 4 };
const CAPA_HOJA = 4;
const GRUPOS = { sala: "Salas", oficina: "Oficinas", otro: "Otros" } as const;

export const capaDeEquipo = (tipo: TipoEquipo) => CAPAS[tipo];

const agregarVecino = (mapa: Map<string, string[]>, desde: string, hasta: string) => {
  const vecinos = mapa.get(desde);
  if (vecinos) vecinos.push(hasta);
  else mapa.set(desde, [hasta]);
};

const nodosDeEquipos = (estado: EstadoRed): Nodo[] => estado.equipos.map(equipo => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
  const conPuertos = equipo.puertos > 0;
  const ancho = conPuertos ? Math.max(puertos.length, 1) * ANCHO_PUERTO + 12 : ANCHO_HOJA;
  return {
    id: conPuertos ? `eq:${equipo.id}` : puertos[0]?.id ?? `eq:${equipo.id}`,
    clase: conPuertos ? "equipo" : "aparato",
    etiqueta: conPuertos ? `${equipo.id.replace("-", "/")} · ${equipo.etiqueta}` : equipo.etiqueta,
    capa: capaDeEquipo(equipo.tipo),
    x: 0,
    y: 0,
    w: ancho,
    h: conPuertos ? ALTO_EQUIPO : ALTO_HOJA,
    puertos: conPuertos ? puertos.map((puerto, indice) => ({ id: puerto.id, n: puerto.n, estado: puerto.estado, x: 6 + indice * ANCHO_PUERTO, y: 20, w: ANCHO_PUERTO - 4, h: ALTO_EQUIPO - 28 })) : [],
    isla: false,
  };
});

const nodosDeHojas = (estado: EstadoRed): Nodo[] => {
  const hoja = (id: string, etiqueta: string, clase: ClaseNodo): Nodo => ({ id, clase, etiqueta, capa: CAPA_HOJA, x: 0, y: 0, w: ANCHO_HOJA, h: ALTO_HOJA, puertos: [], isla: false });
  return [
    ...estado.espacios.filter(espacio => puertosDeEndpoint(estado, espacio.id).length).map(espacio => hoja(espacio.id, espacio.nombre, "espacio")),
    ...estado.cubiculos.filter(cubiculo => puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length).map(cubiculo => hoja(`cub:${cubiculo.id}`, `Cubículo ${cubiculo.id}`, "cubiculo")),
  ];
};

const bandejaDe = (estado: EstadoRed): FichaBandeja[] => [
  ...estado.espacios.filter(espacio => !puertosDeEndpoint(estado, espacio.id).length).map(espacio => ({ id: espacio.id, etiqueta: espacio.nombre, grupo: GRUPOS[espacio.categoria] })),
  ...estado.cubiculos.filter(cubiculo => !puertosDeEndpoint(estado, `cub:${cubiculo.id}`).length).map(cubiculo => ({ id: `cub:${cubiculo.id}`, etiqueta: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
];

export const construirLayout = (estado: EstadoRed): Layout => {
  const nodos = [...nodosDeEquipos(estado), ...nodosDeHojas(estado)];

  const nodoDePunto = new Map<string, string>();
  for (const nodo of nodos) {
    nodoDePunto.set(nodo.id, nodo.id);
    for (const puerto of nodo.puertos) nodoDePunto.set(puerto.id, nodo.id);
  }

  const aristas: Arista[] = [];
  for (const enlace of estado.enlaces) {
    const nodoA = nodoDePunto.get(enlace.a);
    const nodoB = nodoDePunto.get(enlace.b);
    if (!nodoA || !nodoB) continue;
    aristas.push({ id: enlace.id, a: enlace.a, b: enlace.b, nodoA, nodoB, tipo: enlace.tipo });
  }

  const vecinos = new Map<string, string[]>();
  for (const arista of aristas) {
    if (arista.nodoA === arista.nodoB) continue;
    agregarVecino(vecinos, arista.nodoA, arista.nodoB);
    agregarVecino(vecinos, arista.nodoB, arista.nodoA);
  }

  const capas = [0, 1, 2, 3, 4];
  const porId = new Map(nodos.map(nodo => [nodo.id, nodo]));
  const centros = new Map<string, number>();
  const filas = capas.map(capa => nodos.filter(nodo => nodo.capa === capa));

  const clave = (nodo: Nodo) => {
    const arriba = (vecinos.get(nodo.id) ?? [])
      .map(id => porId.get(id))
      .filter(vecino => vecino && vecino.capa === nodo.capa - 1)
      .map(vecino => centros.get(vecino!.id) ?? Number.MAX_SAFE_INTEGER);
    return arriba.length ? Math.min(...arriba) : Number.MAX_SAFE_INTEGER;
  };

  let ancho = 0;
  for (const fila of filas) {
    fila.sort((a, b) => clave(a) - clave(b) || (a.id < b.id ? -1 : 1));
    let x = 0;
    for (const nodo of fila) {
      nodo.x = x;
      nodo.y = nodo.capa * ALTO_CAPA;
      centros.set(nodo.id, x + nodo.w / 2);
      x += nodo.w + SEPARACION;
    }
    ancho = Math.max(ancho, Math.max(x - SEPARACION, 0));
  }

  for (const fila of filas) {
    if (!fila.length) continue;
    const anchoFila = fila[fila.length - 1].x + fila[fila.length - 1].w;
    const corrimiento = (ancho - anchoFila) / 2;
    for (const nodo of fila) {
      nodo.x += corrimiento;
      centros.set(nodo.id, nodo.x + nodo.w / 2);
    }
  }

  const raiz = nodos.find(nodo => nodo.capa === 0);
  if (raiz) {
    const vistos = new Set([raiz.id]);
    const cola = [raiz.id];
    while (cola.length) {
      const actual = cola.shift()!;
      for (const vecino of vecinos.get(actual) ?? []) {
        if (vistos.has(vecino)) continue;
        vistos.add(vecino);
        cola.push(vecino);
      }
    }
    for (const nodo of nodos) nodo.isla = !vistos.has(nodo.id);
  }

  return { nodos, aristas, bandeja: bandejaDe(estado), ancho, alto: (capas.length - 1) * ALTO_CAPA + ALTO_EQUIPO };
};

export const anclasDeLayout = (layout: Layout) => {
  const anclas = new Map<string, { x: number; y: number }>();
  for (const nodo of layout.nodos) {
    anclas.set(nodo.id, { x: nodo.x + nodo.w / 2, y: nodo.y + nodo.h / 2 });
    for (const puerto of nodo.puertos) anclas.set(puerto.id, { x: nodo.x + puerto.x + puerto.w / 2, y: nodo.y + puerto.y + puerto.h / 2 });
  }
  return anclas;
};
```

Dos detalles del código anterior que conviene no "corregir":

- El centinela de `clave()` es `MAX_SAFE_INTEGER` y no `Infinity` a propósito. Dos nodos huérfanos restados como `Infinity - Infinity` dan `NaN`, y un comparador que devuelve `NaN` deja el orden a merced del motor. Con un número finito la resta da `0`, el desempate por `id` decide, y el layout es determinista.
- El orden dentro de cada fila se calcula con los centros **antes** de centrar las filas, y el centrado posterior desplaza toda la fila por igual. El orden relativo no cambia, así que no hace falta recalcularlo.

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `node --experimental-strip-types --test tests/layout.test.ts`
Expected: PASS, 11 pruebas.

- [ ] **Step 5: Correr toda la suite y el linter**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/red/layout.ts tests/layout.test.ts
git commit -m "Compute the diagram layout as layers with a tray for unassigned points"
```

---

### Task 7: `diagrama-nodos.tsx` — dibujo SVG

Pieza sin lógica: recibe posiciones y estilos ya resueltos y dibuja. No calcula geometría ni conoce el trazado, así que se puede cambiar la apariencia sin tocar el lienzo.

**Files:**
- Create: `app/red/diagrama-nodos.tsx`
- Modify: `app/globals.css` (reemplaza el bloque de estilos del diagrama)

**Interfaces:**
- Consumes: `Layout`, `Nodo`, `Arista` y `anclasDeLayout` de `lib/red/layout.ts` (Task 6).
- Produces, para la Task 8, el componente `DiagramaNodos` con estas props exactas:

```tsx
export type PropsNodos = {
  layout: Layout;
  escala: number;
  ruta: Set<string>;
  alcance: Set<string>;
  seleccionado: string;
  origen: string;
  corte: string;
  onPunto: (id: string) => void;
  onFicha: (id: string) => void;
};
```

- [ ] **Step 1: Escribir el componente**

Crear `app/red/diagrama-nodos.tsx`:

```tsx
import { useMemo } from "react";
import { anclasDeLayout, type Arista, type Layout, type Nodo } from "../../lib/red/layout";

export type PropsNodos = {
  layout: Layout;
  escala: number;
  ruta: Set<string>;
  alcance: Set<string>;
  seleccionado: string;
  origen: string;
  corte: string;
  onPunto: (id: string) => void;
  onFicha: (id: string) => void;
};

const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#68717e" } as const;

const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const medio = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
};

export default function DiagramaNodos({ layout, escala, ruta, alcance, seleccionado, origen, corte, onPunto, onFicha }: PropsNodos) {
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);
  const tipografia = 13 / escala;

  const nivel = (id: string) => ruta.has(id) ? "ruta" : alcance.has(id) ? "alcance" : "";
  const nivelArista = (arista: Arista) => ruta.has(arista.a) && ruta.has(arista.b) ? "ruta" : alcance.has(arista.a) && alcance.has(arista.b) ? "alcance" : "";

  const clasesNodo = (nodo: Nodo) => ["net-d-nodo", nodo.clase, nivel(nodo.id), nodo.isla ? "isla" : "", seleccionado === nodo.id ? "sel" : "", origen === nodo.id ? "origen" : ""].filter(Boolean).join(" ");

  const cortada = corte ? anclas.get(corte) : undefined;

  return (
    <>
      {layout.aristas.map(arista => {
        const a = anclas.get(arista.a);
        const b = anclas.get(arista.b);
        if (!a || !b) return null;
        return <path key={arista.id} className={`net-d-link ${nivelArista(arista)}`} d={curva(a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={arista.tipo === "uplink" ? 5 : 3} />;
      })}

      {cortada && <g className="net-d-corte" transform={`translate(${cortada.x} ${cortada.y})`}>
        <circle r={13 / escala} />
        <text y={5 / escala} style={{ fontSize: `${tipografia}px` }}>✕</text>
      </g>}

      {layout.nodos.map(nodo => <g key={nodo.id} className={clasesNodo(nodo)} transform={`translate(${nodo.x} ${nodo.y})`}>
        <rect width={nodo.w} height={nodo.h} rx={6} onClick={() => onPunto(nodo.id)} onDoubleClick={() => onFicha(nodo.id)} />
        <text className="net-d-nombre" x={0} y={-8 / escala} style={{ fontSize: `${tipografia}px` }}>{nodo.etiqueta}</text>
        {nodo.puertos.map(puerto => <g key={puerto.id} className={`net-d-pt ${puerto.estado} ${nivel(puerto.id)} ${seleccionado === puerto.id ? "sel" : ""} ${origen === puerto.id ? "origen" : ""}`}>
          <rect x={puerto.x} y={puerto.y} width={puerto.w} height={puerto.h} rx={3} onClick={event => { event.stopPropagation(); onPunto(puerto.id); }} onDoubleClick={event => { event.stopPropagation(); onFicha(puerto.id); }} />
          <text x={puerto.x + puerto.w / 2} y={puerto.y + puerto.h / 2 + 4 / escala} style={{ fontSize: `${Math.min(tipografia, puerto.w * 0.6)}px` }}>{puerto.n}</text>
        </g>)}
      </g>)}
    </>
  );
}
```

La tipografía se divide por la escala para que el texto mida siempre lo mismo en pantalla: el `<g>` del lienzo está escalado, así que `13 / escala` unidades equivalen a 13 px vistos. El número de puerto se limita además a `puerto.w * 0.6` para que no desborde su rectángulo.

- [ ] **Step 2: Reemplazar los estilos del diagrama**

En `app/globals.css`, localizar el bloque de reglas `.net-d-*` (las que hoy estilan `net-d-rack`, `net-d-racklabel`, `net-d-eq`, `net-d-eqlabel`, `net-d-pt`, `net-d-esp`, `net-d-esplabel`, `net-d-link`) y reemplazarlo completo por:

```css
.net-d-link{fill:none;opacity:.18}
.net-d-link.alcance{opacity:.4}
.net-d-link.ruta{opacity:1;stroke-width:6}
.net-d-nodo rect{fill:var(--surface);stroke:#cfd5dc;stroke-width:1.5;cursor:pointer}
.net-d-nodo.equipo>rect{fill:#f4f6f8}
.net-d-nodo.aparato>rect{fill:#eef1f4}
.net-d-nodo.espacio>rect,.net-d-nodo.cubiculo>rect{fill:var(--surface)}
.net-d-nodo.alcance>rect{stroke:#9fb4c9}
.net-d-nodo.ruta>rect{stroke:var(--ink);stroke-width:3}
.net-d-nodo.isla>rect{stroke-dasharray:6 4;stroke:var(--red)}
.net-d-nodo.sel>rect{stroke:var(--ink);stroke-width:3}
.net-d-nodo.origen>rect{stroke:var(--green);stroke-width:3}
.net-d-nombre{fill:var(--ink);font-weight:700;dominant-baseline:auto}
.net-d-nodo.isla .net-d-nombre{fill:var(--red)}
.net-d-pt rect{fill:var(--surface);stroke:#cfd5dc;stroke-width:1}
.net-d-pt.ocupado rect{fill:var(--green);stroke:var(--green)}
.net-d-pt.desconocido rect{fill:#f1f3f5;stroke-dasharray:3 2}
.net-d-pt.dañado rect{fill:#f6dfe2;stroke:var(--red)}
.net-d-pt text{fill:var(--muted);font-family:var(--font-mono);text-anchor:middle;pointer-events:none}
.net-d-pt.ocupado text{fill:#fff}
.net-d-pt.ruta rect{stroke:var(--ink);stroke-width:2.5}
.net-d-pt.sel rect,.net-d-pt.origen rect{stroke:var(--ink);stroke-width:2.5}
.net-d-corte circle{fill:var(--red)}
.net-d-corte text{fill:#fff;text-anchor:middle;font-weight:700;pointer-events:none}
```

- [ ] **Step 3: Confirmar que no quedan referencias a las clases viejas**

Run: `npx --no-install rg -n "net-d-rack|net-d-eq|net-d-esp" app/`
Expected: sin resultados. `app/red/diagrama.tsx` todavía las usa, y se reescribe en la Task 8; si aparecen ahí, es lo esperado y se resuelven en esa tarea.

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: compila. `diagrama-nodos.tsx` todavía no está importado por nadie, así que no cambia la pantalla.
Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/red/diagrama-nodos.tsx app/globals.css
git commit -m "Add the SVG layer that draws diagram nodes, ports and links"
```

---

### Task 8: Reescribir `diagrama.tsx` — lienzo, selección y resaltado

El componente pasa de dibujar sobre coordenadas de la semilla a montar el layout calculado, y gana el resaltado de la ruta hacia el ISP en tres niveles con la barra de cadena.

**Files:**
- Modify: `app/red/diagrama.tsx` (reescritura completa)
- Modify: `app/globals.css` (estilos de la barra de cadena y la bandeja)

**Interfaces:**
- Consumes: `construirLayout` y `anclasDeLayout` de `lib/red/layout.ts` (Task 6); `DiagramaNodos` de `app/red/diagrama-nodos.tsx` (Task 7); `trazarCadena` y `cadenaComoTexto` de `lib/red/trazado.ts`, con los campos `camino` y `alcanzables` de la Task 5; `etiquetaEndpoint` y `EstadoRed` de `lib/red/modelo.ts`.
- Produces, para la Task 9, las props del componente `Diagrama`:

```tsx
type Props = {
  estado: EstadoRed;
  seleccionado: string;
  centrarEn: string;
  onAbrir: (id: string) => void;
  onSeleccionar: (id: string) => void;
  onConectar: (a: string, b: string) => void;
  onCopiar: (texto: string) => void;
};
```

- [ ] **Step 1: Escribir el componente**

Reemplazar el contenido completo de `app/red/diagrama.tsx` por:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiagramaNodos from "./diagrama-nodos";
import { anclasDeLayout, construirLayout } from "../../lib/red/layout";
import { cadenaComoTexto, trazarCadena } from "../../lib/red/trazado";
import { etiquetaEndpoint, type EstadoRed } from "../../lib/red/modelo";

const MARGEN = 90;

type Props = {
  estado: EstadoRed;
  seleccionado: string;
  centrarEn: string;
  onAbrir: (id: string) => void;
  onSeleccionar: (id: string) => void;
  onConectar: (a: string, b: string) => void;
  onCopiar: (texto: string) => void;
};
type Vista = { x: number; y: number; escala: number };

export default function Diagrama({ estado, seleccionado, centrarEn, onAbrir, onSeleccionar, onConectar, onCopiar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, escala: 0.6 });
  const [modo, setModo] = useState<"consultar" | "conectar">("consultar");
  const [origen, setOrigen] = useState("");
  const arrastre = useRef<{ x: number; y: number; vista: Vista } | null>(null);

  const layout = useMemo(() => construirLayout(estado), [estado]);
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);
  const cadena = useMemo(() => trazarCadena(estado, seleccionado), [estado, seleccionado]);

  const ruta = useMemo(() => new Set(cadena.camino), [cadena]);
  const corte = useMemo(() => cadena.completa || !cadena.camino.length ? "" : [...cadena.camino].reverse().find(id => anclas.has(id)) ?? "", [cadena, anclas]);

  const puedeSerOrigen = (id: string) => {
    const puerto = estado.puertos.find(candidato => candidato.id === id);
    if (puerto) return puerto.estado === "libre" || puerto.estado === "desconocido";
    return id.startsWith("esp:") || id.startsWith("cub:");
  };

  const alPunto = (id: string) => {
    if (modo !== "conectar" || !puedeSerOrigen(id)) { onSeleccionar(id); return; }
    if (!origen) { setOrigen(id); return; }
    if (origen === id) { setOrigen(""); return; }
    onConectar(origen, id);
    setOrigen("");
  };

  const ajustar = useCallback(() => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja || !layout.ancho) return;
    const escala = Math.min(caja.width / (layout.ancho + MARGEN * 2), caja.height / (layout.alto + MARGEN * 2));
    setVista({ escala, x: MARGEN * escala, y: MARGEN * escala });
  }, [layout]);

  useEffect(() => { ajustar(); }, [ajustar]);

  useEffect(() => {
    const ancla = anclas.get(centrarEn);
    const caja = contenedor.current?.getBoundingClientRect();
    if (!ancla || !caja || !centrarEn) return;
    setVista(actual => {
      const escala = Math.max(actual.escala, 0.8);
      return { escala, x: caja.width / 2 - ancla.x * escala, y: caja.height / 2 - ancla.y * escala };
    });
  }, [centrarEn, anclas]);

  useEffect(() => {
    if (!origen) return;
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === "Escape") { evento.preventDefault(); setOrigen(""); } };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [origen]);

  const alRodar = (evento: React.WheelEvent) => {
    evento.preventDefault();
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    setVista(actual => {
      const escala = Math.min(Math.max(actual.escala * factor, 0.1), 4);
      const puntero = { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
      return { escala, x: puntero.x - ((puntero.x - actual.x) / actual.escala) * escala, y: puntero.y - ((puntero.y - actual.y) / actual.escala) * escala };
    });
  };

  const alBajar = (evento: React.PointerEvent) => {
    if (evento.button !== 0) return;
    arrastre.current = { x: evento.clientX, y: evento.clientY, vista };
    (evento.currentTarget as Element).setPointerCapture?.(evento.pointerId);
  };
  const alMover = (evento: React.PointerEvent) => {
    if (!arrastre.current) return;
    const inicio = arrastre.current;
    if (Math.abs(evento.clientX - inicio.x) + Math.abs(evento.clientY - inicio.y) < 3) return;
    setVista({ escala: inicio.vista.escala, x: inicio.vista.x + (evento.clientX - inicio.x), y: inicio.vista.y + (evento.clientY - inicio.y) });
  };
  const alSoltar = () => { arrastre.current = null; };

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, typeof layout.bandeja>();
    for (const ficha of layout.bandeja) {
      const grupo = mapa.get(ficha.grupo);
      if (grupo) grupo.push(ficha);
      else mapa.set(ficha.grupo, [ficha]);
    }
    return [...mapa.entries()];
  }, [layout.bandeja]);

  return (
    <div className="net-diagram">
      <div className="net-diagram-bar">
        <div className="net-seg" role="group" aria-label="Modo del diagrama">
          <button className={modo === "consultar" ? "on" : ""} aria-pressed={modo === "consultar"} onClick={() => { setModo("consultar"); setOrigen(""); }}>CONSULTAR</button>
          <button className={modo === "conectar" ? "on" : ""} aria-pressed={modo === "conectar"} onClick={() => setModo("conectar")}>CONECTAR</button>
        </div>
        <div className="net-seg" role="group" aria-label="Zoom">
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.min(actual.escala * 1.25, 4) }))} aria-label="Acercar">+</button>
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.max(actual.escala / 1.25, 0.1) }))} aria-label="Alejar">−</button>
          <button onClick={ajustar}>AJUSTAR A LA VISTA</button>
        </div>
        <p className="net-diagram-hint">{origen
          ? `Conectando desde ${etiquetaEndpoint(estado, origen)} · clic en el destino, esc para cancelar`
          : modo === "conectar"
            ? "Clic en un puerto libre o en una tarjeta de la bandeja para empezar el enlace."
            : "Clic en un nodo resalta su ruta hasta el ISP. Doble clic abre la ficha."}</p>
      </div>

      {seleccionado && <div className="net-diagram-cadena">
        <span className="net-label">{cadena.completa ? "RUTA HASTA EL ISP" : "RUTA INCOMPLETA"}</span>
        <div className="net-diagram-saltos">
          {cadena.saltos.map((salto, indice) => <button key={salto.id} type="button" onClick={() => onSeleccionar(salto.id)}>{indice > 0 && <i aria-hidden="true">→</i>}{salto.etiqueta}</button>)}
        </div>
        {!cadena.completa && <p className="net-diagram-motivo">{cadena.motivo}</p>}
        <button className="secondary" type="button" onClick={() => onCopiar(cadenaComoTexto(cadena))}>Copiar</button>
      </div>}

      <div className={`net-diagram-canvas ${modo === "conectar" ? "conectando" : ""}`} ref={contenedor} onWheel={alRodar} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={alSoltar}>
        <svg role="img" aria-label="Diagrama de la red del colegio">
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
            <DiagramaNodos layout={layout} escala={vista.escala} ruta={ruta} alcance={cadena.alcanzables} seleccionado={seleccionado} origen={origen} corte={corte} onPunto={alPunto} onFicha={onAbrir} />
          </g>
        </svg>
      </div>

      {layout.bandeja.length > 0 && <div className="net-diagram-bandeja">
        <span className="net-label">SIN PUERTO ASIGNADO · {layout.bandeja.length}</span>
        {porGrupo.map(([grupo, fichas]) => <details key={grupo}>
          <summary>{grupo} · {fichas.length}</summary>
          <div className="net-chips">{fichas.map(ficha => <button key={ficha.id} type="button" className={origen === ficha.id ? "on" : ""} onClick={() => alPunto(ficha.id)}>{ficha.etiqueta}</button>)}</div>
        </details>)}
      </div>}
    </div>
  );
}
```

Un comportamiento esperado que puede parecer un defecto: **la caja de un patch panel no se enciende, solo sus puertos.** `construirAdyacencia` en `lib/red/trazado.ts:23` conecta los puertos de un mismo chasis únicamente para los tipos de `conChasis` —`switch`, `router`, `firewall`, `ap`, `isp`— y los patch panels quedan fuera a propósito, porque un panel no cruza señal entre sus puertos. Por eso `camino` nunca contiene `eq:R2-PP1` y la caja del panel no recibe la clase `ruta`. Los puertos del panel sí se encienden, que es la información correcta. No agregar los patch panels a `conChasis` para "arreglarlo": rompería el trazado y la prueba `no cruza un patch panel de un puerto a otro`.

- [ ] **Step 2: Agregar los estilos de la barra de cadena y la bandeja**

En `app/globals.css`, después del bloque `.net-d-*` de la Task 7, agregar:

```css
.net-diagram-cadena{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line);background:#f7f8f9}
.net-diagram-saltos{display:flex;align-items:center;flex-wrap:wrap;gap:2px;flex:1;min-width:0}
.net-diagram-saltos button{border:0;background:none;padding:3px 5px;font:700 11px var(--font-mono);color:var(--ink);cursor:pointer;border-radius:3px}
.net-diagram-saltos button:hover{background:#e6ebf0}
.net-diagram-saltos i{margin-right:5px;color:var(--muted);font-style:normal}
.net-diagram-motivo{margin:0;color:var(--red);font-size:11px;font-weight:700}
.net-diagram-canvas.conectando{cursor:crosshair}
.net-diagram-bandeja{border-top:1px solid var(--line);padding:12px 14px;max-height:210px;overflow:auto}
.net-diagram-bandeja summary{font-size:11px;font-weight:800;padding:6px 0;cursor:pointer}
.net-diagram-bandeja .net-chips button.on{background:var(--green);border-color:var(--green);color:#fff}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: FALLA en `app/red/page.tsx`, porque el diagrama ahora exige las props `onSeleccionar`, `onConectar` y `onCopiar` que todavía no se le pasan. Es lo esperado y lo resuelve la Task 9.

- [ ] **Step 4: Commit**

```bash
git add app/red/diagrama.tsx app/globals.css
git commit -m "Rebuild the diagram as a layered flow with route highlighting"
```

---

### Task 9: Conectar el diagrama a la página

Cierra la cadena: la página le pasa al diagrama la selección, el copiado y la creación de enlaces. `asignarRapido` se generaliza para marcar ocupados los dos extremos cuando ambos son puertos, que es el caso de un parcheo o un uplink creado desde el diagrama.

**Files:**
- Modify: `app/red/page.tsx:98-118` (`asignarRapido`), `app/red/page.tsx:256` (uso de `Diagrama`)

**Interfaces:**
- Consumes: las props de `Diagrama` definidas en la Task 8.
- Produces: nada nuevo. Última tarea.

- [ ] **Step 1: Generalizar `asignarRapido` a cualquier par de puntos**

En `app/red/page.tsx`, reemplazar `asignarRapido` (líneas 98-118) por:

```tsx
  const asignarRapido = (a: string, b: string) => {
    const provisional = -Date.now();
    const texto = `${etiquetaEndpoint(estado, a)} → ${etiquetaEndpoint(estado, b)}`;
    setEstado(actual => ({
      ...actual,
      enlaces: [...actual.enlaces, { id: provisional, a, b, tipo: "roseta", nota: "" }],
      puertos: actual.puertos.map(puerto => (puerto.id === a || puerto.id === b) && puerto.estado === "libre" ? { ...puerto, estado: "ocupado" } : puerto),
    }));
    void (async () => {
      try {
        const response = await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) }, "No fue posible asignar el puerto.");
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
```

El `tipo: "roseta"` del enlace provisional es solo optimismo local para pintar la arista mientras responde el servidor; `POST /api/red/enlaces` recalcula el tipo real con `tipoEnlaceSugerido` y la recarga posterior lo corrige. La captura rápida sigue llamando `asignarRapido(endpointId, puertoId)` y no necesita cambios: los parámetros solo se renombraron.

- [ ] **Step 2: Agregar el copiado reutilizable**

En `app/red/page.tsx`, justo después de `copiarCadenaBuscador` (línea 215), agregar:

```tsx
  const copiarTexto = (texto: string) => void (async () => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Cadena copiada.");
    } catch {
      mostrarAviso("No fue posible copiar la cadena.", "error");
    }
  })();
```

- [ ] **Step 3: Pasarle las props nuevas al diagrama**

En `app/red/page.tsx` línea 256, reemplazar:

```tsx
                  : <Diagrama estado={estado} seleccionado={seleccionado} centrarEn={vista === "diagrama" ? coincidenciaBuscador : ""} onAbrir={setSeleccionado} />}
```

por:

```tsx
                  : <Diagrama estado={estado} seleccionado={seleccionado} centrarEn={vista === "diagrama" ? coincidenciaBuscador : ""} onAbrir={setSeleccionado} onSeleccionar={setSeleccionado} onConectar={asignarRapido} onCopiar={copiarTexto} />}
```

`onAbrir` y `onSeleccionar` apuntan hoy a la misma función porque `seleccionado` gobierna tanto la ficha como el resaltado. Se mantienen separadas porque el diagrama distingue clic simple de doble clic y el día que la ficha deje de abrirse con la selección, solo cambia esta línea.

- [ ] **Step 4: Verificar que compila y pasa el linter**

Run: `npm run build`
Expected: compila sin errores.
Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS. `busqueda.test.ts`, `layout.test.ts`, `trazado.test.ts`, `modelo.test.ts` y `semilla.test.ts` en verde.

- [ ] **Step 6: Verificar el comportamiento completo en el navegador**

Run: `npm run dev`
Abrir `http://localhost:3000/red` y pasar a la vista **DIAGRAMA**.
Expected:
- el diagrama entra con todo visible y los nombres legibles, en cinco filas de arriba hacia abajo: ISP, borde, switches, patch panels, destinos;
- FORTINET y MIKROTIK aparecen con borde rojo punteado, porque están desconectados del ISP;
- bajo el lienzo, la bandeja dice `SIN PUERTO ASIGNADO · 99` con los grupos Salas, Oficinas y Cubículos;
- clic en `UTP E. Básica` resalta su ruta con trazo fuerte, tiñe apenas el resto de lo alcanzable, deja en gris lo inalcanzable, y muestra la marca ✕ roja donde se corta;
- la barra sobre el lienzo muestra la cadena en texto y dice que no llega al ISP; **Copiar** deja el texto en el portapapeles y cada salto centra su nodo;
- doble clic en un nodo abre la ficha;
- en modo **CONECTAR**, clic en una tarjeta de la bandeja la marca en verde, y clic en un puerto libre crea el enlace: aparece el toast, el punto sale de la bandeja y pasa al flujo;
- ese enlace nuevo queda registrado: en la vista **COBERTURA**, bajo `ÚLTIMOS CAMBIOS`, aparece una entrada `enlace-creado` con los dos extremos;
- `esc` cancela una conexión armada;
- en modo **CONSULTAR**, ningún clic crea enlaces;
- clic en un puerto ya `ocupado` en modo **CONECTAR** no arma nada: selecciona y traza, igual que en Consultar.

- [ ] **Step 7: Commit**

```bash
git add app/red/page.tsx
git commit -m "Wire the diagram to the page for selection, copying and linking"
```

---

## Verificación final

- [ ] `npm test` en verde, con los tres archivos de prueba nuevos o ampliados.
- [ ] `npm run lint` sin errores.
- [ ] La captura rápida se abre con el selector de sentido bien dibujado, encuentra `3 basico b` y avisa cuando no hay coincidencias.
- [ ] El diagrama se lee sin zoom, resalta la ruta hacia el ISP en tres niveles y crea enlaces con dos clics.
- [ ] Ningún enlace nuevo en `lib/red/semilla.json`: `git diff --stat` no debe mencionar ese archivo en ningún commit del plan.
