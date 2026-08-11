# Auto-estado por testigo en RED — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la pestaña RED muestre el estado real de cada espacio —derivado de la presencia de su dispositivo testigo— en vez del estado que alguien tecleó hace semanas.

**Architecture:** una función pura nueva (`lib/red/estado-efectivo.ts`) fusiona el `EstadoRed` de `/api/red` con las ubicaciones vivas de `/api/monitoreo/ubicaciones` y devuelve un `EstadoRed` derivado en el que `espacio.estado` ya es el estado efectivo. Todo lo que hoy lee `espacio.estado` (lista, diagrama, cobertura, chips, buscador) queda consistente sin tocarse. El estado automático no se persiste nunca: se recalcula en cada render, así que quitar el testigo devuelve intacto el valor manual.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript 5.9, Drizzle + postgres.js, `node --test` con `--experimental-strip-types`.

## Global Constraints

- Imports lib↔lib con extensión `.ts`; imports app→lib sin extensión (`tsconfig` usa `allowImportingTsExtensions`).
- Lógica pura en `lib/red/*`, con test en `tests/*.test.ts`. Nada de lógica de estado en los componentes.
- Textos de interfaz en español, con tilde. Comentarios solo donde expliquen un *porqué* no obvio.
- Suite completa: `npm test` (corre `next build` + todos los tests). Para iterar, `node --experimental-strip-types --test tests/<archivo>.test.ts`.
- CSS en `app/globals.css`, estilo compacto de una línea por regla, como el resto del archivo.
- No se persiste el estado automático en `net_espacios.estado`. Las escrituras siguen siendo del estado manual.
- Umbral de frescura de los datos de red: 15 minutos.

---

### Task 1: La regla del estado efectivo

**Files:**
- Create: `lib/red/estado-efectivo.ts`
- Create: `tests/estado-efectivo.test.ts`
- Modify: `lib/red/modelo.ts:18` (tipo `Espacio`)
- Modify: `tests/fixture-red.ts:27-29`, `tests/agrupar.test.ts:7-8`

**Interfaces:**
- Consumes: `EspacioVivo` de `lib/red/estado-ubicacion.ts` (ya existe: `{ id, nombre, categoria, estadoManual, testigoMac, estadoVivo, testigoPresente }`).
- Produces: `OrigenEstado`, `EspacioEfectivo`, `RedEfectiva`, `MINUTOS_FRESCURA`, `datosFrescos(refrescado, ahora?)`, `estadoEfectivo(espacio, vivo, frescos)`, `aplicarEstadoVivo(estado, vivos, frescos)`.

- [ ] **Step 1: Agregar `testigoMac` al tipo `Espacio`**

En `lib/red/modelo.ts`, línea 18, la columna ya existe en `net_espacios` y `/api/red` ya la devuelve (hace `select()` completo); solo falta declararla:

```ts
export type Espacio = { id: string; nombre: string; ubicacion: string; categoria: CategoriaEspacio; estado: EstadoEspacio; x: number; y: number; nota: string; testigoMac: string };
```

- [ ] **Step 2: Completar los dos constructores de prueba que rompe el campo nuevo**

En `tests/agrupar.test.ts` línea 7-8:

```ts
const espacio = (id: string, nombre: string, categoria: string, estado: Espacio["estado"] = "sin-verificar"): Espacio =>
  ({ id, nombre, ubicacion: "", categoria, estado, x: 0, y: 0, nota: "", testigoMac: "" });
```

En `tests/fixture-red.ts`, los tres espacios:

```ts
  espacios: [
    { id: "esp:3-basico-b", nombre: "3° Básico B", ubicacion: "", categoria: "sala", estado: "sin-verificar", x: -3560, y: 432, nota: "", testigoMac: "" },
    { id: "esp:4-basico-a", nombre: "4° Básico A", ubicacion: "", categoria: "sala", estado: "sin-verificar", x: -3560, y: 300, nota: "", testigoMac: "" },
    { id: "esp:secretaria", nombre: "Secretaría", ubicacion: "", categoria: "oficina", estado: "sin-verificar", x: -3560, y: -600, nota: "", testigoMac: "" },
  ],
```

- [ ] **Step 3: Escribir el test que falla**

Crear `tests/estado-efectivo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarEstadoVivo, datosFrescos, estadoEfectivo, MINUTOS_FRESCURA } from "../lib/red/estado-efectivo.ts";
import type { EspacioVivo } from "../lib/red/estado-ubicacion.ts";
import type { Espacio } from "../lib/red/modelo.ts";
import { fixture } from "./fixture-red.ts";

const espacio = (id: string, estado: Espacio["estado"], testigoMac = ""): Espacio =>
  ({ id, nombre: id, ubicacion: "", categoria: "sala", estado, x: 0, y: 0, nota: "", testigoMac });

const vivo = (id: string, estadoVivo: EspacioVivo["estadoVivo"], testigoMac = ""): EspacioVivo =>
  ({ id, nombre: id, categoria: "sala", estadoManual: "sin-verificar", testigoMac, estadoVivo, testigoPresente: estadoVivo === "operativo" });

test("sin testigo se queda con el estado manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "solo-wifi"), vivo("esp:1", "sin-testigo"), true);
  assert.equal(salida.estado, "solo-wifi");
  assert.equal(salida.origen, "manual");
  assert.equal(salida.testigoPresente, false);
});

test("testigo presente manda: operativo y origen auto", () => {
  const salida = estadoEfectivo(espacio("esp:1", "sin-verificar", "1c:83:41:aa:bb:cc"), vivo("esp:1", "operativo", "1c:83:41:aa:bb:cc"), true);
  assert.equal(salida.estado, "operativo");
  assert.equal(salida.origen, "auto");
  assert.equal(salida.testigoPresente, true);
});

test("testigo ausente es sin-internet, y el manual queda guardado aparte", () => {
  const salida = estadoEfectivo(espacio("esp:1", "solo-wifi", "1c:83:41:aa:bb:cc"), vivo("esp:1", "sin-internet", "1c:83:41:aa:bb:cc"), true);
  assert.equal(salida.estado, "sin-internet");
  assert.equal(salida.origen, "auto");
  assert.equal(salida.estadoManual, "solo-wifi");
});

// El sidecar panel-mon-export puede morir sin ruido. Sin este guardia, RED
// pintaría 21 salas "sin internet" que están perfectas.
test("con datos viejos no se inventa nada: vuelve al manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "operativo", "1c:83:41:aa:bb:cc"), vivo("esp:1", "sin-internet", "1c:83:41:aa:bb:cc"), false);
  assert.equal(salida.estado, "operativo");
  assert.equal(salida.origen, "manual");
});

test("un espacio sin fila viva se queda manual", () => {
  const salida = estadoEfectivo(espacio("esp:1", "sin-verificar", "1c:83:41:aa:bb:cc"), undefined, true);
  assert.equal(salida.estado, "sin-verificar");
  assert.equal(salida.origen, "manual");
});

test("datosFrescos mide contra el umbral y rechaza basura", () => {
  const ahora = Date.parse("2026-08-11T12:00:00Z");
  const hace = (minutos: number) => new Date(ahora - minutos * 60_000).toISOString();
  assert.equal(datosFrescos(hace(MINUTOS_FRESCURA - 1), ahora), true);
  assert.equal(datosFrescos(hace(MINUTOS_FRESCURA + 1), ahora), false);
  assert.equal(datosFrescos(null, ahora), false);
  assert.equal(datosFrescos("no es una fecha", ahora), false);
});

test("aplicarEstadoVivo conserva el resto del EstadoRed intacto", () => {
  // `fixture` es una fábrica, no un valor: devuelve un EstadoRed nuevo.
  const red = fixture();
  const vivos: EspacioVivo[] = [vivo("esp:secretaria", "sin-internet", "1c:83:41:aa:bb:cc")];
  const salida = aplicarEstadoVivo(red, vivos, true);
  assert.equal(salida.espacios.length, red.espacios.length);
  assert.equal(salida.espacios.find(item => item.id === "esp:secretaria")?.estado, "sin-internet");
  assert.equal(salida.espacios.find(item => item.id === "esp:3-basico-b")?.origen, "manual");
  assert.deepEqual(salida.enlaces, red.enlaces);
  assert.deepEqual(salida.puertos, red.puertos);
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `node --experimental-strip-types --test tests/estado-efectivo.test.ts`
Expected: FAIL — `Cannot find module '../lib/red/estado-efectivo.ts'`

- [ ] **Step 5: Escribir la implementación mínima**

Crear `lib/red/estado-efectivo.ts`:

```ts
import type { EspacioVivo } from "./estado-ubicacion.ts";
import type { Espacio, EstadoRed } from "./modelo.ts";

// De dónde salió el estado que se muestra: del testigo en la red (auto) o de lo
// que alguien escribió en la ficha (manual).
export type OrigenEstado = "auto" | "manual";

export type EspacioEfectivo = Espacio & {
  estadoManual: Espacio["estado"];
  origen: OrigenEstado;
  testigoPresente: boolean;
};

// EspacioEfectivo extiende Espacio, así que una RedEfectiva sigue sirviendo
// donde se espera un EstadoRed: los componentes que no usan el origen no
// cambian de tipo.
export type RedEfectiva = Omit<EstadoRed, "espacios"> & { espacios: EspacioEfectivo[] };

export const MINUTOS_FRESCURA = 15;

export function datosFrescos(refrescado: string | null, ahora = Date.now()): boolean {
  if (!refrescado) return false;
  const marca = new Date(refrescado).getTime();
  if (Number.isNaN(marca)) return false;
  return ahora - marca <= MINUTOS_FRESCURA * 60_000;
}

// `auto` guarda la fila viva en vez de un booleano para que TypeScript la
// estreche: con un boolean aparte, `vivo` seguiría siendo posiblemente
// undefined dentro del ternario.
export function estadoEfectivo(espacio: Espacio, vivo: EspacioVivo | undefined, frescos: boolean): EspacioEfectivo {
  const auto = frescos && vivo && vivo.estadoVivo !== "sin-testigo" ? vivo : null;
  return {
    ...espacio,
    estado: auto ? (auto.estadoVivo === "operativo" ? "operativo" : "sin-internet") : espacio.estado,
    estadoManual: espacio.estado,
    origen: auto ? "auto" : "manual",
    testigoPresente: auto ? auto.testigoPresente : false,
  };
}

export function aplicarEstadoVivo(estado: EstadoRed, vivos: EspacioVivo[], frescos: boolean): RedEfectiva {
  const porId = new Map(vivos.map(item => [item.id, item]));
  return { ...estado, espacios: estado.espacios.map(espacio => estadoEfectivo(espacio, porId.get(espacio.id), frescos)) };
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `node --experimental-strip-types --test tests/estado-efectivo.test.ts tests/agrupar.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add lib/red/estado-efectivo.ts tests/estado-efectivo.test.ts lib/red/modelo.ts tests/fixture-red.ts tests/agrupar.test.ts
git commit -m "feat(red): regla de estado efectivo por testigo"
```

---

### Task 2: La API expone cuán frescos son los datos

**Files:**
- Modify: `app/api/monitoreo/ubicaciones/route.ts:9-31` (el `GET`)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `GET /api/monitoreo/ubicaciones` devuelve `{ ubicaciones, resumen, candidatos, refrescado }`, donde `refrescado` es `string | null` (ISO). La Task 3 lo pasa por `datosFrescos`.

- [ ] **Step 1: Agregar `refrescado` a la respuesta**

En `app/api/monitoreo/ubicaciones/route.ts`, después de calcular `candidatos`, replicar lo que ya hace `app/api/monitoreo/route.ts:41`:

```ts
    // Todas las filas se reescriben juntas en cada ciclo del sidecar, así que
    // cualquiera sirve como marca de tiempo del volcado.
    const refrescado = vivos.length ? vivos[0].refreshedAt : null;
    return noStoreJson({ ubicaciones, resumen, candidatos, refrescado });
```

- [ ] **Step 2: Verificar contra la base real**

Run: `npm run build`
Expected: compila sin errores de tipos.

Luego, con la app corriendo en cabserver (o `npm run dev` local apuntando a la base), comprobar que el campo viaja:

```bash
curl -s -u "$APP_USERNAME:$APP_PASSWORD" https://cabserver.tail0dd5e7.ts.net:8443/api/monitoreo/ubicaciones | head -c 300
```

Expected: el JSON incluye `"refrescado":"2026-...Z"`.

- [ ] **Step 3: Commit**

```bash
git add app/api/monitoreo/ubicaciones/route.ts
git commit -m "feat(monitoreo): la API de ubicaciones informa su marca de tiempo"
```

---

### Task 3: RED consume el estado vivo

**Files:**
- Modify: `app/red/page.tsx:23` (estado vacío), `:42-75` (estados), `:89-105` (carga), `:356-361` (efecto inicial), `:465-475` (cabecera), `:547-555` (paso a las vistas)

**Interfaces:**
- Consumes: `aplicarEstadoVivo`, `datosFrescos`, `RedEfectiva` de Task 1; el campo `refrescado` de Task 2.
- Produces: dentro de `PaginaRed`, la constante `redEfectiva: RedEfectiva` que reemplaza a `estado` en todo lo que se pasa hacia abajo, y el estado `ubic: DatosUbic | null` que la Task 6 necesita para el desplegable de testigos.

- [ ] **Step 1: Declarar el tipo del payload y los estados nuevos**

Arriba del componente, junto a `estadoVacio`:

```ts
type CandidatoTestigo = { mac: string; ip: string; name: string; vendor: string; present: boolean };
type DatosUbic = { ubicaciones: EspacioVivo[]; candidatos: CandidatoTestigo[]; refrescado: string | null };
```

Imports nuevos:

```ts
import { aplicarEstadoVivo, datosFrescos } from "../../lib/red/estado-efectivo";
import type { EspacioVivo } from "../../lib/red/estado-ubicacion";
```

Dentro del componente, junto a los demás `useState`:

```ts
  const [ubic, setUbic] = useState<DatosUbic | null>(null);
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "auto" | "manual">("todos");
```

- [ ] **Step 2: Cargar las ubicaciones sin que puedan romper la pestaña**

Agregar esta función junto a `cargar`. Va aparte a propósito: si el monitoreo falla, RED tiene que seguir dibujándose con los estados manuales.

```ts
  const cargarVivo = async () => {
    try {
      const response = await fetch("/api/monitoreo/ubicaciones", { cache: "no-store" });
      if (!response.ok) throw new Error("sin monitoreo");
      setUbic(await response.json() as DatosUbic);
    } catch {
      setUbic(null);
    }
  };
```

En `cargar`, después de `setEstado(...)`, disparar la otra carga en paralelo sin esperarla:

```ts
      setEstado(await response.json() as EstadoRed);
      void cargarVivo();
```

- [ ] **Step 3: Refrescar el estado vivo solo, cada 90 segundos**

Junto a los demás `useEffect`:

```ts
  // Los datos de red se mueven cada 3 minutos (sidecar) y la consulta es una
  // sola tabla chica: refrescarla sola sale mucho más barato que recargar
  // toda la red.
  useEffect(() => {
    const intervalo = window.setInterval(() => void cargarVivo(), 90_000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Calcular la red efectiva y usarla en todo**

Después de `conteosConexion`:

```ts
  const frescos = useMemo(() => datosFrescos(ubic?.refrescado ?? null), [ubic]);
  const redEfectiva = useMemo(() => aplicarEstadoVivo(estado, ubic?.ubicaciones ?? [], frescos), [estado, ubic, frescos]);
```

Ahora reemplazar `estado` por `redEfectiva` **solo** en lectura de espacios y en lo que se pasa a las vistas:

- `conteos` y `conteosCategorias`: `redEfectiva.espacios` en vez de `estado.espacios`.
- `espaciosVisibles`: iterar `redEfectiva.espacios`; el resto del cuerpo del filtro queda igual.
- `<VistaEspacios ... categorias={redEfectiva.categorias} cubiculos={redEfectiva.cubiculos} />`
- `<VistaRacks estado={redEfectiva} ... />`, `<VistaCobertura estado={redEfectiva} ... />`, `<Diagrama estado={redEfectiva} ... />`
- `<Ficha estado={redEfectiva} ... />`

No tocar: `guardarCampos`, `guardarRecurso`, `eliminarEspacio` ni ninguna otra escritura. Siguen apuntando al estado manual.

- [ ] **Step 5: Aplicar el filtro de origen**

Dentro del `filter` de `espaciosVisibles`, junto a los demás filtros:

```ts
      if (filtroOrigen !== "todos" && espacio.origen !== filtroOrigen) return false;
```

Agregar `filtroOrigen` a las dependencias del `useMemo`, y sumarlo a `hayFiltrosEspacios` y a `limpiarFiltrosEspacios`:

```ts
  const hayFiltrosEspacios = filtro !== "todos" || filtroConexion !== "todos" || filtroCategoria !== "todos" || filtroOrigen !== "todos" || Boolean(consulta.trim());
```

```ts
    setFiltroOrigen("todos");
```

Y su píldora en el bloque de filtros activos, junto a las otras:

```tsx
                {filtroOrigen !== "todos" && <button type="button" onClick={() => setFiltroOrigen("todos")}>Origen: {filtroOrigen === "auto" ? "Automático" : "Manual"} <i aria-hidden="true">×</i></button>}
```

- [ ] **Step 6: Fila de filtro nueva y aviso de datos viejos**

Dentro de `<section id="filtros-espacios">`, después de la fila «Documentación»:

```tsx
              <div className="net-filter-row">
                <span className="net-filter-label">Origen</span>
                <div className="net-filter-chips connection">
                  <button type="button" className={filtroOrigen === "todos" ? "on" : ""} aria-pressed={filtroOrigen === "todos"} onClick={() => setFiltroOrigen("todos")}>Todos <strong>{redEfectiva.espacios.length}</strong></button>
                  <button type="button" className={filtroOrigen === "auto" ? "on" : ""} aria-pressed={filtroOrigen === "auto"} onClick={() => setFiltroOrigen("auto")}>Automático <strong>{conteosOrigen.auto}</strong></button>
                  <button type="button" className={filtroOrigen === "manual" ? "on" : ""} aria-pressed={filtroOrigen === "manual"} onClick={() => setFiltroOrigen("manual")}>Manual <strong>{conteosOrigen.manual}</strong></button>
                </div>
              </div>
```

Con su conteo, junto a `conteosConexion`:

```ts
  const conteosOrigen = useMemo(() => {
    const auto = redEfectiva.espacios.filter(espacio => espacio.origen === "auto").length;
    return { auto, manual: redEfectiva.espacios.length - auto };
  }, [redEfectiva]);
```

En la cabecera, junto al `date-chip` que ya existe:

```tsx
<div className="date-chip"><span>DATOS DE RED</span><b>{ubic ? (frescos ? "en vivo" : "desactualizados") : "sin conexión"}</b></div>
```

Y el aviso, arriba del `workspace-head`, solo cuando hay testigos asignados pero los datos no sirven:

```tsx
        {ubic && !frescos && <div className="error-banner" role="status"><span>Los datos de red no se refrescan hace más de {MINUTOS_FRESCURA} minutos: los espacios con testigo vuelven a mostrar su estado manual. Revisa el contenedor <b>panel-mon-export</b>.</span></div>}
```

Importar `MINUTOS_FRESCURA` junto a las otras funciones de `estado-efectivo`.

- [ ] **Step 7: Verificar que compila y que la suite sigue verde**

Run: `npm test`
Expected: `next build` OK y todos los tests PASS.

- [ ] **Step 8: Commit**

```bash
git add app/red/page.tsx
git commit -m "feat(red): la pestana usa el estado efectivo por testigo"
```

---

### Task 4: Que se vea de dónde salió cada estado

**Files:**
- Modify: `lib/red/agrupar.ts:13`, `:25`, `:44` (hacer genéricos el orden y la agrupación)
- Modify: `app/red/vista-espacios.tsx:5` (imports), `:9-21` (Props), `:52-57` (badge)
- Modify: `app/globals.css:510` (después de la regla de `.net-space-status.sin-verificar`)

**Interfaces:**
- Consumes: `EspacioEfectivo` de Task 1; el `redEfectiva` que Task 3 ya pasa a este componente.
- Produces: `ordenarEspacios<T extends Espacio>(espacios: T[], criterio, categorias): T[]` y `agruparPorTipo<T extends Espacio>(espacios: T[], categorias): GrupoEspacios<T>[]`.

- [ ] **Step 1: Hacer genéricos `ordenarEspacios` y `agruparPorTipo`**

Sin esto no compila: hoy devuelven `Espacio[]`, así que al pasar por ellas los espacios pierden `origen` y `testigoPresente` justo antes de que la lista los necesite. Tres firmas en `lib/red/agrupar.ts`:

```ts
export type GrupoEspacios<T extends Espacio = Espacio> = { id: string; nombre: string; espacios: T[] };
```

```ts
export const ordenarEspacios = <T extends Espacio>(espacios: T[], criterio: CriterioOrden, categorias: Categoria[]): T[] => {
```

```ts
export const agruparPorTipo = <T extends Espacio>(espacios: T[], categorias: Categoria[]): GrupoEspacios<T>[] => {
```

Los cuerpos no cambian: solo filtran y ordenan. `porNombre` sigue tipado sobre `Espacio` y acepta cualquier `T`.

Run: `node --experimental-strip-types --test tests/agrupar.test.ts`
Expected: PASS sin tocar el test — el genérico se infiere como `Espacio`.

- [ ] **Step 2: Cambiar el tipo de los espacios que recibe**

En `app/red/vista-espacios.tsx`, en los imports y en `Props`:

```ts
import type { EspacioEfectivo } from "../../lib/red/estado-efectivo";
```

```ts
  espacios: EspacioEfectivo[];
```

Y cambiar `Espacio` por `EspacioEfectivo` en las firmas de `datosDe`, `estado`, `conexion`, `fila`, `tarjeta` y `contenido`. `agruparPorTipo` y `ordenarEspacios` siguen aceptándolos: `EspacioEfectivo` extiende `Espacio`.

- [ ] **Step 3: Agregar la etiqueta de origen al badge**

Reemplazar la función `estado` (línea 52):

```tsx
  const estado = (espacio: EspacioEfectivo) => (
    <span className="net-space-state">
      <span className={`net-space-status ${espacio.estado}`}>
        <i aria-hidden="true" />
        {etiquetasEstadoEspacio[espacio.estado]}
      </span>
      <small
        className={`net-space-origin ${espacio.origen}`}
        title={espacio.origen === "auto"
          ? `Automático: el testigo ${espacio.testigoMac} está ${espacio.testigoPresente ? "presente" : "ausente"} en la red.`
          : "Manual: lo escribiste en la ficha. Asígnale un testigo para que se actualice solo."}
      >{espacio.origen === "auto" ? "auto" : "manual"}</small>
    </span>
  );
```

El `title` es lo que evita que la etiqueta se lea como ruido: dice cuál testigo y por qué.

- [ ] **Step 4: Estilos**

En `app/globals.css`, justo después de la línea 510:

```css
.net-space-state{display:inline-flex;align-items:center;gap:6px;min-width:0}
.net-space-origin{border-radius:3px;padding:2px 5px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:#eef2f6;color:var(--muted)}
.net-space-origin.auto{background:#e8eefc;color:#2a4d9b}
```

- [ ] **Step 5: Verificar en pantalla**

Run: `npm run dev` y abrir `http://localhost:3000/red`
Expected: los 21 espacios con testigo muestran la etiqueta `auto` en azul; los 31 restantes, `manual` en gris. Pasar el mouse por encima muestra la explicación.

- [ ] **Step 6: Commit**

```bash
git add app/red/vista-espacios.tsx app/globals.css
git commit -m "feat(red): etiqueta de origen del estado en la lista de espacios"
```

---

### Task 5: La ficha administra el testigo

**Files:**
- Modify: `app/red/ficha.tsx:9-22` (Props), `:163` (selector de estado)
- Modify: `app/red/page.tsx` (pasar props nuevas a `Ficha`, y la función que guarda el testigo)
- Modify: `app/globals.css` (bloque `.net-testigo`)

**Interfaces:**
- Consumes: `EspacioEfectivo` y `RedEfectiva` de Task 1; `ubic.candidatos` del estado que declaró Task 3.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Función para guardar el testigo en `page.tsx`**

Junto a las otras escrituras. Reutiliza el `PUT` que ya existe para MONITOREO:

```ts
  const guardarTestigo = (id: string, testigoMac: string) => conGuardado(async () => {
    await pedir("/api/monitoreo/ubicaciones", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, testigoMac }) }, "No fue posible guardar el testigo.");
    await cargarVivo();
  }, testigoMac ? "Testigo asignado." : "Testigo quitado: el espacio vuelve a estado manual.");
```

Y pasarla a la ficha, junto a los candidatos:

```tsx
<Ficha key={fichaAbierta} estado={redEfectiva} endpointId={fichaAbierta} cadena={cadenaFicha} guardando={guardando} candidatosTestigo={ubic?.candidatos ?? []} onGuardarTestigo={guardarTestigo} onCerrar={...} ... />
```

- [ ] **Step 2: Props nuevas en la ficha**

```ts
type CandidatoTestigo = { mac: string; ip: string; name: string; vendor: string; present: boolean };

type Props = {
  estado: RedEfectiva;
  endpointId: string;
  cadena: Cadena;
  guardando: boolean;
  candidatosTestigo: CandidatoTestigo[];
  onGuardarTestigo: (id: string, testigoMac: string) => Promise<void>;
  onCerrar: () => void;
  onGuardarCampos: (cambios: { estado?: string; nota?: string }) => Promise<void>;
  onGuardarRecurso: (cambios: RecursoNuevo & { id: string }) => Promise<void>;
  onCrearEnlace: (puertoId: string, nota: string) => Promise<void>;
  onBorrarEnlace: (id: number) => Promise<void>;
  onEliminarEspacio: (id: string) => void;
};
```

Con `import type { RedEfectiva } from "../../lib/red/estado-efectivo";` y recibiendo las dos props nuevas en la desestructuración.

- [ ] **Step 3: Reemplazar el selector de estado del espacio**

Sustituir la línea 163 por un bloque que explica por qué el control está apagado. Un `select` deshabilitado sin motivo se lee como un bug:

```tsx
        {espacio && <section className="net-testigo" aria-label="Estado del espacio">
          <label>Estado
            <select value={espacio.estado} disabled={guardando || espacio.origen === "auto"} onChange={event => void onGuardarCampos({ estado: event.target.value })}>
              {estadosEspacio.map(valor => <option key={valor} value={valor}>{etiquetasEstadoEspacio[valor]}</option>)}
            </select>
          </label>
          {espacio.origen === "auto"
            ? <p className="net-pista">Lo decide el testigo <b>{espacio.testigoMac}</b>, ahora {espacio.testigoPresente ? "presente" : "ausente"} en la red. Para escribirlo a mano, quítale el testigo.</p>
            : espacio.testigoMac
              ? <p className="net-pista">Tiene testigo asignado, pero los datos de red no están frescos: manda el estado manual.</p>
              : <p className="net-pista">Sin testigo: este estado lo escribes tú y no se actualiza solo.</p>}
          <label>Dispositivo testigo
            <select value={espacio.testigoMac} disabled={guardando} onChange={event => void onGuardarTestigo(espacio.id, event.target.value)}>
              <option value="">— sin testigo (estado manual) —</option>
              {espacio.testigoMac && !candidatosTestigo.some(candidato => candidato.mac === espacio.testigoMac) && <option value={espacio.testigoMac}>{espacio.testigoMac} (no visto)</option>}
              {candidatosTestigo.map(candidato => <option key={candidato.mac} value={candidato.mac}>{`${candidato.ip} · ${candidato.vendor || "?"}${candidato.present ? "" : " (ausente)"}`}</option>)}
            </select>
          </label>
          {espacio.testigoMac && <button className="secondary" type="button" disabled={guardando} onClick={() => void onGuardarTestigo(espacio.id, "")}>Quitar testigo y volver a manual</button>}
        </section>}
```

- [ ] **Step 4: Estilos del bloque**

En `app/globals.css`, junto a las reglas de la ficha:

```css
.net-testigo{display:flex;flex-direction:column;gap:9px;border:1px solid var(--line);border-radius:6px;padding:11px}
.net-testigo .net-pista{margin:0;color:var(--muted);font-size:11px;line-height:1.45}
```

- [ ] **Step 5: Probar el ciclo completo a mano**

Run: `npm run dev`, abrir `/red`, abrir la ficha de **Templo** (tiene testigo `bc:fc:e7:34:78:78`).

Expected:
1. El selector de Estado está deshabilitado y la pista nombra la MAC.
2. «Quitar testigo y volver a manual» → la lista pasa a `manual`, el selector se habilita y reaparece el estado que estaba guardado.
3. Volver a asignar el mismo testigo desde el desplegable → vuelve a `auto`.

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: build OK, todos los tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/red/ficha.tsx app/red/page.tsx app/globals.css
git commit -m "feat(red): administrar el testigo desde la ficha del espacio"
```

---

### Task 6: Desplegar en cabserver y verificar con datos reales

**Files:**
- Modify: ninguno. Es despliegue del clon `/srv/apps/panel-enlace`.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la pestaña andando en <https://cabserver.tail0dd5e7.ts.net:8443/red>.

- [ ] **Step 1: Copiar los archivos al clon del servidor**

```bash
SSH="/c/Program Files/Git/usr/bin/ssh.exe"
SCP="/c/Program Files/Git/usr/bin/scp.exe"
"$SCP" lib/red/estado-efectivo.ts lib/red/modelo.ts cabserver:/srv/apps/panel-enlace/lib/red/
"$SCP" tests/estado-efectivo.test.ts tests/fixture-red.ts tests/agrupar.test.ts cabserver:/srv/apps/panel-enlace/tests/
"$SCP" app/red/page.tsx app/red/ficha.tsx app/red/vista-espacios.tsx cabserver:/srv/apps/panel-enlace/app/red/
"$SCP" app/globals.css cabserver:/srv/apps/panel-enlace/app/
"$SCP" app/api/monitoreo/ubicaciones/route.ts cabserver:/srv/apps/panel-enlace/app/api/monitoreo/ubicaciones/
```

- [ ] **Step 2: Reconstruir la imagen**

```bash
"$SSH" cabserver "cd /srv/apps/compose/panel-enlace && docker compose up -d --build"
```

Expected: build sin errores y `panel-enlace` levantado. Si el build muere por memoria (quedan ~2 GB), parar `n8n` no ayuda —ya está detenido—; reintentar con `docker compose build --no-cache` en un momento sin uso.

- [ ] **Step 3: Verificar contra la red real**

```bash
"$SSH" cabserver "docker ps --format '{{.Names}} {{.Status}}'"
```

Expected: `panel-enlace` con `Up` reciente.

Abrir <https://cabserver.tail0dd5e7.ts.net:8443/red> y comprobar, con los datos de hoy:

1. 21 espacios con etiqueta `auto`, 31 con `manual` (el filtro Origen los cuenta).
2. Los cuatro espacios que estaban en `solo-wifi` **con** testigo (Psicología Básica, Recepción, Dirección, Fonoaudiología) ahora leen `operativo` o `sin internet`.
3. Recepción, Capellanía, Coordinador SEP y Secretaría Financiera muestran el mismo estado: comparten el AP `3c:cd:57:72:61:1f`.
4. El chip «Sin internet» y el Diagrama coinciden en qué espacios están en rojo.
5. Parar el sidecar y ver que el guardia funciona:

```bash
"$SSH" cabserver "docker stop panel-mon-export"
# esperar a que refrescado envejezca 15 min, recargar /red:
# aparece el aviso y todos vuelven a 'manual'
"$SSH" cabserver "docker start panel-mon-export"
```

- [ ] **Step 4: Actualizar la documentación del HomeLAB**

En `Documents/Ciudadella/HomeLAB/pendientes-cabserver.md`, marcar **Llevar el auto-estado a la pestaña RED** como hecho con fecha, y anotar en `servicios-cabserver.md` que la pestaña RED muestra estado efectivo por testigo.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-11-auto-estado-red-design.md docs/superpowers/plans/2026-08-11-auto-estado-red.md
git commit -m "docs(red): spec y plan del auto-estado por testigo"
```

---

## Notas para quien ejecute

- **No persistir el estado automático.** Es la decisión que sostiene todo lo demás: el valor manual tiene que sobrevivir intacto para que quitar el testigo sea reversible.
- **El guardia de frescura no es paranoia.** El sidecar `panel-mon-export` copia la SQLite de NetAlertX cada 3 minutos por `docker cp`; si el contenedor muere, `mon_devices` queda congelada y sin el guardia RED declararía caída media escuela.
- **Testigos que son PC.** Donde el testigo no es un AP, de noche marcará `sin-internet` porque el equipo está apagado. Es correcto y esperado; no es un bug que haya que "arreglar" con un caso especial.
