# Edición de racks y equipos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD completo de racks y equipos, con marca, modelo, segmento IP e IP de gestión, y una vista de racks donde switch y patch panel se distinguen y se pueden ordenar.

**Architecture:** Tres columnas nuevas en tablas existentes. Toda la lógica destructiva vive en funciones puras en `lib/red/inventario.ts` y se prueba sin base de datos; dos rutas delgadas (`/api/red/racks`, `/api/red/equipos`) las ejecutan dentro de una transacción. La vista pasa a filas de dos columnas y reutiliza el orden manual de `net_orden` que el diagrama ya guarda.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM 0.45 sobre Postgres, TypeScript 5.9, `node --test` con `--experimental-strip-types`.

## Global Constraints

- Español en todo el código: nombres de variables, funciones, campos y mensajes de error. Comentarios solo donde explican un *porqué* que el código no dice.
- `npm test` corre `npm run build` primero. Para iterar rápido use `node --experimental-strip-types --test tests/inventario.test.ts`.
- Los ids de puerto son `pto:{equipo}-p{n}` **sin cero a la izquierda** (`pto:R1-SW1-p10`). El cero a la izquierda es solo de la *etiqueta* (`R1/SW1 p10`), que produce `etiquetaPuerto`.
- La aplicación **nunca** borra una conexión como efecto colateral de otra operación. Solo un borrado explícito de equipo o rack las arrastra, y siempre tras un diálogo con el conteo.
- Ninguna migración altera ni borra columnas existentes: solo `ADD COLUMN … NOT NULL DEFAULT ''`.
- Las respuestas de error de las rutas usan `noStoreJson({ error }, { status })` y el `catch` usa `apiErrorResponse`, como el resto de `app/api/red/`.
- Cada tarea termina con commit. La rama es `racks-edicion`.

---

### Task 1: Modelo de datos, migración y fixture

**Files:**
- Modify: `db/schema.ts:57-79`
- Create: `drizzle-pg/0006_racks_equipos.sql`
- Modify: `lib/red/modelo.ts:15-16`
- Modify: `tests/fixture-red.ts:4-14`
- Modify: `README.md:44-47`

**Interfaces:**
- Consumes: nada.
- Produces: `Rack` gana `segmento: string`; `Equipo` gana `marca: string` e `ipGestion: string`. Todas las tareas siguientes dependen de estos campos.

- [ ] **Step 1: Agregar las columnas al schema**

En `db/schema.ts`, dentro de `netRacks` después de `ubicacion`:

```ts
  segmento: text("segmento").notNull().default(""),
```

Dentro de `netEquipos`, después de `etiqueta`:

```ts
  marca: text("marca").notNull().default(""),
```

y después de `modelo`:

```ts
  ipGestion: text("ip_gestion").notNull().default(""),
```

- [ ] **Step 2: Escribir la migración**

Crear `drizzle-pg/0006_racks_equipos.sql`:

```sql
ALTER TABLE "net_racks" ADD COLUMN "segmento" text DEFAULT '' NOT NULL;
ALTER TABLE "net_equipos" ADD COLUMN "marca" text DEFAULT '' NOT NULL;
ALTER TABLE "net_equipos" ADD COLUMN "ip_gestion" text DEFAULT '' NOT NULL;
```

- [ ] **Step 3: Extender los tipos**

En `lib/red/modelo.ts` reemplazar las dos líneas de tipo:

```ts
export type Rack = { id: string; nombre: string; ubicacion: string; segmento: string; x: number; y: number; w: number; h: number; notas: string };
export type Equipo = { id: string; rack: string; tipo: TipoEquipo; etiqueta: string; marca: string; modelo: string; ipGestion: string; puertos: number; color: string; x: number; y: number; nota: string };
```

- [ ] **Step 4: Actualizar el fixture**

En `tests/fixture-red.ts`, agregar `segmento: ""` a los dos racks, y `marca` + `ipGestion` a los cinco equipos. Use valores que sirvan luego para probar:

```ts
  racks: [
    { id: "R2", nombre: "Rack 2 | Sala Enlace", ubicacion: "Sala Enlace", segmento: "192.168.20.0/24", x: -1440, y: 1240, w: 2640, h: 1560, notas: "" },
    { id: "R3", nombre: "Rack 3 | Sala de Profesores", ubicacion: "Sala de Profesores", segmento: "", x: 2360, y: 920, w: 2880, h: 1480, notas: "" },
  ],
  equipos: [
    { id: "R2-PP1", rack: "R2", tipo: "patchpanel", etiqueta: "Patch Panel 3Z", marca: "", modelo: "24 puertos UTP Cat6", ipGestion: "", puertos: 24, color: "", x: -1034, y: 1400, nota: "" },
    { id: "R2-SW1", rack: "R2", tipo: "switch", etiqueta: "Switch 1 | Gigabit 24p Smart", marca: "TP-Link", modelo: "TL-SG1024S", ipGestion: "192.168.20.2", puertos: 24, color: "3", x: -580, y: 1600, nota: "" },
    { id: "R3-SW1", rack: "R3", tipo: "switch", etiqueta: "Switch 1 | Cisco", marca: "Cisco", modelo: "", ipGestion: "", puertos: 28, color: "#c44a4a", x: 2894, y: 1300, nota: "" },
    { id: "MIKROTIK", rack: "R2", tipo: "router", etiqueta: "MikroTik", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "4", x: -522, y: 21, nota: "" },
    { id: "ISP", rack: "R2", tipo: "isp", etiqueta: "Proveedores de Servicios de Internet", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "4", x: -115, y: -280, nota: "" },
  ],
```

- [ ] **Step 5: Verificar que todo compila y las pruebas siguen pasando**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `node --experimental-strip-types --test tests/*.test.ts`
Expected: todas pasan. Si `semilla.test.ts` falla porque `semilla.json` no trae los campos nuevos, eso es correcto y se resuelve en el Step 6.

- [ ] **Step 6: Sembrar los campos nuevos sin romper la semilla**

`semilla.json` no trae `segmento`, `marca` ni `ipGestion`, y `sembrarRed` inserta los objetos tal cual. Como las columnas tienen `DEFAULT ''`, Postgres las rellena y no hay que tocar el JSON. Confirme que `lib/red/siembra.ts:47-48` sigue compilando: Drizzle acepta un insert sin las columnas que tienen default.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Documentar la migración**

En `README.md`, en el párrafo de la pestaña Red, agregar `0006_racks_equipos.sql` a la lista de migraciones que hay que aplicar en orden.

- [ ] **Step 8: Commit**

```bash
git add db/schema.ts drizzle-pg/0006_racks_equipos.sql lib/red/modelo.ts tests/fixture-red.ts README.md
git commit -m "Agrega segmento IP, marca e IP de gestión al modelo"
```

---

### Task 2: `limpiarNotaRack` y la limpieza de una vez

**Files:**
- Create: `lib/red/inventario.ts`
- Create: `tests/inventario.test.ts`
- Modify: `lib/red/siembra.ts`
- Modify: `herramientas/convertir-canvas.mjs:157`

**Interfaces:**
- Consumes: `Rack` del Task 1.
- Produces: `limpiarNotaRack(nota: string): { notas: string; segmento: string }` y `pareceSegmento(valor: string): boolean`.

**Contexto que el implementador necesita.** Las tres notas reales en `lib/red/semilla.json`:

```
R1: "Rack 1 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)"
R2: "relación dibujada en el canvas hacia: Administrativo\nRack 2 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x) **Puertos identificados:** - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18"
R3: "relación dibujada en el canvas hacia: ## Salas de clases\nrelación dibujada en el canvas hacia: ## Rosetas\nrelación dibujada en el canvas hacia: ## Sala de clases\nRack 3 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)"
```

**Lo importante:** en R2 el segmento y los puertos identificados están en la **misma línea**. Filtrar líneas completas perdería el único dato real que hay en las tres notas. Hay que recortar dentro de la línea.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/inventario.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { limpiarNotaRack, pareceSegmento } from "../lib/red/inventario.ts";

test("limpiarNotaRack deja vacías las notas que solo traían canvas y segmento", () => {
  const r1 = limpiarNotaRack("Rack 1 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)");
  assert.equal(r1.notas, "");
  assert.equal(r1.segmento, "");

  const r3 = limpiarNotaRack([
    "relación dibujada en el canvas hacia: ## Salas de clases",
    "relación dibujada en el canvas hacia: ## Rosetas",
    "relación dibujada en el canvas hacia: ## Sala de clases",
    "Rack 3 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x)",
  ].join("\n"));
  assert.equal(r3.notas, "");
  assert.equal(r3.segmento, "");
});

test("limpiarNotaRack conserva los puertos identificados que comparten línea con el segmento", () => {
  const r2 = limpiarNotaRack([
    "relación dibujada en el canvas hacia: Administrativo",
    "Rack 2 — **Segmento IP:** por confirmar (detectados: 192.168.20/30/60.x) **Puertos identificados:** - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18",
  ].join("\n"));
  assert.equal(r2.notas, "Puertos identificados: - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18");
  assert.equal(r2.segmento, "");
});

test("limpiarNotaRack extrae el segmento cuando de verdad es uno", () => {
  const nota = limpiarNotaRack("Rack 4 — **Segmento IP:** 192.168.40.0/24");
  assert.equal(nota.segmento, "192.168.40.0/24");
  assert.equal(nota.notas, "");
});

test("limpiarNotaRack no toca una nota escrita a mano", () => {
  const nota = limpiarNotaRack("Gabinete mural con llave. La llave está en conserjería.");
  assert.equal(nota.notas, "Gabinete mural con llave. La llave está en conserjería.");
  assert.equal(nota.segmento, "");
});

test("pareceSegmento acepta CIDR y rechaza el resto", () => {
  assert.equal(pareceSegmento("192.168.30.0/24"), true);
  assert.equal(pareceSegmento("10.0.0.0/8"), true);
  assert.equal(pareceSegmento("192.168.20/30/60.x"), false);
  assert.equal(pareceSegmento("por confirmar"), false);
  assert.equal(pareceSegmento("999.1.1.1/24"), false);
  assert.equal(pareceSegmento(""), false);
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: FAIL — `Cannot find module '../lib/red/inventario.ts'`.

- [ ] **Step 3: Implementar**

Crear `lib/red/inventario.ts`:

```ts
import type { EstadoRed } from "./modelo.ts";

const LINEA_CANVAS = /^relación dibujada en el canvas hacia:/i;

// El segmento y los puertos identificados pueden venir en la misma línea:
// "Rack 2 — **Segmento IP:** por confirmar (…) **Puertos identificados:** …".
// Por eso se recorta el fragmento del segmento en vez de descartar la línea:
// descartarla se llevaría el único dato real que dejó el levantamiento.
const FRAGMENTO_SEGMENTO = /(?:rack\s*\d+\s*[—-]\s*)?\*\*segmento ip:\*\*([^*]*)/i;

export const pareceSegmento = (valor: string) => {
  const limpio = valor.trim();
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(limpio);
  if (!partes) return false;
  const octetos = partes.slice(1, 5).map(Number);
  return octetos.every(octeto => octeto <= 255) && Number(partes[5]) <= 32;
};

export const pareceIp = (valor: string) => {
  const limpio = valor.trim();
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(limpio);
  return Boolean(partes) && partes!.slice(1, 5).map(Number).every(octeto => octeto <= 255);
};

export const limpiarNotaRack = (nota: string): { notas: string; segmento: string } => {
  let segmento = "";
  const lineas = (nota ?? "").split("\n").map(linea => {
    const encontrado = FRAGMENTO_SEGMENTO.exec(linea);
    if (!encontrado) return linea;
    const candidato = (encontrado[1] ?? "").trim();
    if (!segmento && pareceSegmento(candidato)) segmento = candidato.trim();
    return linea.replace(FRAGMENTO_SEGMENTO, " ");
  });

  const notas = lineas
    .filter(linea => !LINEA_CANVAS.test(linea.trim()))
    .map(linea => linea.replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { notas, segmento };
};
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: PASS, 5 pruebas.

- [ ] **Step 5: Conectar la limpieza de una vez en la siembra**

En `lib/red/siembra.ts`, agregar la constante junto a las que ya existen (línea 9-10):

```ts
const NOTAS = "red_notas_racks_v1";
```

Agregar la importación:

```ts
import { limpiarNotaRack } from "./inventario.ts";
```

Y una función nueva, llamada desde `sembrarRed` **después** del bloque de siembra, fuera del `return` temprano. Como `sembrarRed` retorna antes cuando la versión coincide, la limpieza va en su propia transacción, invocada desde `GET /api/red`:

```ts
// Corre una sola vez y es independiente de la versión de la semilla: la
// siembra retorna temprano cuando ya está aplicada, y esta limpieza tiene
// que ocurrir igual en una base que ya venía sembrada.
export async function limpiarNotasRacks(db: Db) {
  await db.transaction(async (tx) => {
    const [marca] = await tx.select().from(appMetadata).where(eq(appMetadata.key, NOTAS)).limit(1);
    if (marca?.value === "1") return;

    for (const rack of await tx.select().from(netRacks)) {
      const { notas, segmento } = limpiarNotaRack(rack.notas);
      if (notas === rack.notas && (!segmento || segmento === rack.segmento)) continue;
      await tx.update(netRacks)
        .set({ notas, ...(segmento && !rack.segmento ? { segmento } : {}) })
        .where(eq(netRacks.id, rack.id));
    }

    await tx.insert(appMetadata).values({ key: NOTAS, value: "1" })
      .onConflictDoUpdate({ target: appMetadata.key, set: { value: "1" } });
  });
}
```

En `app/api/red/route.ts`, dentro de `GET`, llamarla justo después de `sembrarRed`:

```ts
    await sembrarRed(db);
    await limpiarNotasRacks(db);
```

y agregar `limpiarNotasRacks` a la importación de `siembra`.

- [ ] **Step 6: Arreglar el conversor para que no reintroduzca la basura**

En `herramientas/convertir-canvas.mjs:157`, la línea que empuja la nota es la que genera el problema:

```js
    if (notas) notas.push(`relación dibujada en el canvas hacia: ${texto.split("\n")[0]}`);
```

Borrarla junto con el `const notas = notasRack.get(idRack(grupo));` de la línea 155 si queda sin uso. Las líneas 161-165, que capturan el texto del segmento, se conservan: siguen siendo el origen legítimo del dato, y ahora `limpiarNotaRack` sabe interpretarlo.

Run: `node herramientas/convertir-canvas.mjs`
Expected: `lib/red/semilla.json` se regenera sin ninguna línea `relación dibujada en el canvas hacia:`.

Verifique con la herramienta Grep sobre `lib/red/semilla.json` buscando `relación dibujada`: no debe haber coincidencias.

- [ ] **Step 7: Correr toda la suite**

Run: `node --experimental-strip-types --test tests/*.test.ts`
Expected: todas pasan. `semilla.test.ts` puede necesitar ajuste si afirma algo sobre las notas; corríjalo para reflejar la semilla limpia.

- [ ] **Step 8: Commit**

```bash
git add lib/red/inventario.ts tests/inventario.test.ts lib/red/siembra.ts app/api/red/route.ts herramientas/convertir-canvas.mjs lib/red/semilla.json
git commit -m "Limpia las notas heredadas del canvas y extrae el segmento IP"
```

---

### Task 3: Identidad de racks y equipos

**Files:**
- Modify: `lib/red/inventario.ts`
- Modify: `tests/inventario.test.ts`

**Interfaces:**
- Consumes: `pareceSegmento` del Task 2, `slugificar` e `idDisponible` de `lib/red/modelo.ts`.
- Produces: `SIGLAS`, `etiquetasTipoEquipo`, `codigoRack(existentes: Set<string>): string`, `codigoEquipo(rack: string, tipo: TipoEquipo, etiqueta: string, existentes: Set<string>): string`, `idPuerto(equipo: string, n: number): string`, `enumerar(items: string[]): string`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/inventario.test.ts`:

```ts
import { codigoEquipo, codigoRack, enumerar, idPuerto } from "../lib/red/inventario.ts";

test("codigoRack toma el primer número libre", () => {
  assert.equal(codigoRack(new Set(["R1", "R2", "R3"])), "R4");
  assert.equal(codigoRack(new Set(["R1", "R3"])), "R2");
  assert.equal(codigoRack(new Set()), "R1");
});

test("codigoEquipo numera por rack y por tipo sin chocar", () => {
  const existentes = new Set(["R3-PP1", "R3-PP2", "R3-SW1"]);
  assert.equal(codigoEquipo("R3", "patchpanel", "Patch Panel 3Z", existentes), "R3-PP3");
  assert.equal(codigoEquipo("R3", "switch", "Switch 2", existentes), "R3-SW2");
  assert.equal(codigoEquipo("R1", "switch", "Switch 1", existentes), "R1-SW1");
});

test("codigoEquipo sin rack usa la sigla y el nombre", () => {
  assert.equal(codigoEquipo("", "ap", "AP Biblioteca", new Set()), "AP-ap-biblioteca");
  assert.equal(codigoEquipo("", "firewall", "Fortinet borde", new Set()), "FW-fortinet-borde");
});

test("codigoEquipo sin rack no pisa un id existente", () => {
  assert.equal(codigoEquipo("", "ap", "AP Biblioteca", new Set(["AP-ap-biblioteca"])), "AP-ap-biblioteca-2");
});

test("idPuerto no rellena con ceros", () => {
  assert.equal(idPuerto("R1-SW1", 1), "pto:R1-SW1-p1");
  assert.equal(idPuerto("R1-SW1", 10), "pto:R1-SW1-p10");
  assert.equal(idPuerto("MIKROTIK", 0), "pto:MIKROTIK-p0");
});

test("enumerar arma listas legibles en español", () => {
  assert.equal(enumerar(["p18"]), "p18");
  assert.equal(enumerar(["p18", "p22"]), "p18 y p22");
  assert.equal(enumerar(["p18", "p22", "p24"]), "p18, p22 y p24");
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: FAIL — los símbolos no existen.

- [ ] **Step 3: Implementar**

Agregar a `lib/red/inventario.ts` (y extender la importación de `./modelo.ts` con `idDisponible`, `slugificar` y `type TipoEquipo`):

```ts
export const SIGLAS: Record<TipoEquipo, string> = {
  switch: "SW",
  patchpanel: "PP",
  router: "RT",
  firewall: "FW",
  ap: "AP",
  isp: "ISP",
};

export const etiquetasTipoEquipo: Record<TipoEquipo, string> = {
  switch: "Switch",
  patchpanel: "Patch panel",
  router: "Router",
  firewall: "Firewall",
  ap: "Punto de acceso",
  isp: "Enlace externo",
};

export const idPuerto = (equipo: string, n: number) => `pto:${equipo}-p${n}`;

export const enumerar = (items: string[]) => items.length <= 1
  ? items.join("")
  : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

export const codigoRack = (existentes: Set<string>) => {
  for (let numero = 1; numero < 1000; numero += 1) {
    if (!existentes.has(`R${numero}`)) return `R${numero}`;
  }
  return `R${Date.now()}`;
};

// Con rack, el código es correlativo por tipo dentro de ese rack (R3-SW2) porque
// es lo que se lee en la etiqueta física del equipo. Sin rack no hay correlativo
// que tenga sentido, así que se cae al patrón que ya usan los AP sembrados.
export const codigoEquipo = (rack: string, tipo: TipoEquipo, etiqueta: string, existentes: Set<string>) => {
  const sigla = SIGLAS[tipo];
  if (!rack) return idDisponible(`${sigla}-${slugificar(etiqueta, sigla.toLowerCase())}`, existentes);
  for (let numero = 1; numero < 1000; numero += 1) {
    const candidato = `${rack}-${sigla}${numero}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return `${rack}-${sigla}${Date.now()}`;
};
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: PASS, 11 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/red/inventario.ts tests/inventario.test.ts
git commit -m "Agrega generación de códigos de rack y equipo"
```

---

### Task 4: `planCambioPuertos`

**Files:**
- Modify: `lib/red/inventario.ts`
- Modify: `tests/inventario.test.ts`

**Interfaces:**
- Consumes: `idPuerto`, `enumerar` del Task 3; `etiquetaPuerto` de `lib/red/modelo.ts`.
- Produces: `type PlanCambioPuertos = { ok: true; crear: number[]; borrar: string[] } | { ok: false; error: string }` y `planCambioPuertos(estado: EstadoRed, equipoId: string, total: number): PlanCambioPuertos`.

**La regla, en una frase:** los números destino son `[0]` cuando el total es cero y `1…total` en cualquier otro caso. Lo que sobra se borra, lo que falta se crea, y si algo de lo que sobra conserva enlaces la operación se rechaza. Esa formulación cubre sola el cruce del cero, que es el caso que se olvida.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/inventario.test.ts` (extender importaciones con `planCambioPuertos`, `fixture` y `type EstadoRed`).

**Importante:** el fixture es deliberadamente *escaso* —a `R2-PP1` le declara 24 puertos pero solo trae tres filas, p14 a p16—, así que no sirve para probar esta función: cualquier cambio pediría crear los veintiún puertos que faltan y las aserciones quedarían ilegibles. Estas pruebas construyen un equipo completo:

```ts
// Un switch con sus puertos completos, y enlaces sobre los que se indiquen.
const conPuertos = (total: number, conectados: number[] = []): EstadoRed => {
  const estado = fixture();
  estado.equipos = [{ id: "SW", rack: "R2", tipo: "switch", etiqueta: "Switch", marca: "", modelo: "", ipGestion: "", puertos: total, color: "", x: 0, y: 0, nota: "" }];
  estado.puertos = Array.from({ length: total }, (_, indice) => ({
    id: `pto:SW-p${indice + 1}`, equipo: "SW", n: indice + 1, estado: "libre" as const, nota: "",
  }));
  estado.enlaces = conectados.map((n, indice) => ({
    id: indice + 1, a: `pto:SW-p${n}`, b: "esp:secretaria", tipo: "roseta" as const, nota: "",
  }));
  return estado;
};

// Un equipo sin puertos numerados: solo su punto único p0.
const conPuntoUnico = (conectado: boolean): EstadoRed => {
  const estado = fixture();
  estado.equipos = [{ id: "FW", rack: "R2", tipo: "firewall", etiqueta: "Fortinet", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "", x: 0, y: 0, nota: "" }];
  estado.puertos = [{ id: "pto:FW-p0", equipo: "FW", n: 0, estado: "libre", nota: "" }];
  estado.enlaces = conectado ? [{ id: 1, a: "pto:FW-p0", b: "esp:secretaria", tipo: "borde", nota: "" }] : [];
  return estado;
};

test("planCambioPuertos crea los que faltan al subir", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 26);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [25, 26]);
  assert.deepEqual(plan.borrar, []);
});

test("planCambioPuertos borra los sobrantes libres al bajar", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 22);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.borrar, ["pto:SW-p23", "pto:SW-p24"]);
  assert.deepEqual(plan.crear, []);
});

test("planCambioPuertos rechaza bajar sobre puertos con conexiones", () => {
  const plan = planCambioPuertos(conPuertos(24, [18, 22]), "SW", 12);
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /p18 y p22/);
  assert.match(plan.error, /conservan conexiones/);
});

test("planCambioPuertos pasa de punto único a puertos numerados", () => {
  const plan = planCambioPuertos(conPuntoUnico(false), "FW", 4);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [1, 2, 3, 4]);
  assert.deepEqual(plan.borrar, ["pto:FW-p0"]);
});

test("planCambioPuertos no descarta un punto único que conserva conexiones", () => {
  const plan = planCambioPuertos(conPuntoUnico(true), "FW", 4);
  assert.equal(plan.ok, false);
});

test("planCambioPuertos vuelve a punto único al bajar a cero", () => {
  const plan = planCambioPuertos(conPuertos(2), "SW", 0);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, [0]);
  assert.deepEqual(plan.borrar, ["pto:SW-p1", "pto:SW-p2"]);
});

test("planCambioPuertos valida el rango y el equipo", () => {
  assert.equal(planCambioPuertos(conPuertos(24), "NO-EXISTE", 8).ok, false);
  assert.equal(planCambioPuertos(conPuertos(24), "SW", -1).ok, false);
  assert.equal(planCambioPuertos(conPuertos(24), "SW", 97).ok, false);
});

test("planCambioPuertos sin cambios no hace nada", () => {
  const plan = planCambioPuertos(conPuertos(24), "SW", 24);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.crear, []);
  assert.deepEqual(plan.borrar, []);
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: FAIL — `planCambioPuertos` no existe.

- [ ] **Step 3: Implementar**

Agregar a `lib/red/inventario.ts` (extender la importación de `./modelo.ts` con `etiquetaPuerto` y `type EstadoRed`):

```ts
export const MAXIMO_PUERTOS = 96;

export type PlanCambioPuertos =
  | { ok: true; crear: number[]; borrar: string[] }
  | { ok: false; error: string };

export const planCambioPuertos = (estado: EstadoRed, equipoId: string, total: number): PlanCambioPuertos => {
  const equipo = estado.equipos.find(candidato => candidato.id === equipoId);
  if (!equipo) return { ok: false, error: "Ese equipo ya no existe." };
  if (!Number.isInteger(total) || total < 0 || total > MAXIMO_PUERTOS) {
    return { ok: false, error: `La cantidad de puertos debe ser un número entre 0 y ${MAXIMO_PUERTOS}.` };
  }

  // Un equipo sin puertos numerados conserva igual un punto de conexión, p0, para
  // poder enlazarlo. Por eso el destino nunca es la lista vacía.
  const destino = total === 0 ? [0] : Array.from({ length: total }, (_, indice) => indice + 1);
  const numerosDestino = new Set(destino);
  const actuales = estado.puertos.filter(puerto => puerto.equipo === equipoId);
  const existentes = new Set(actuales.map(puerto => puerto.n));

  const borrar = actuales.filter(puerto => !numerosDestino.has(puerto.n)).map(puerto => puerto.id).sort();
  const crear = destino.filter(numero => !existentes.has(numero));

  const conEnlaces = borrar.filter(id => estado.enlaces.some(enlace => enlace.a === id || enlace.b === id));
  if (conEnlaces.length) {
    const nombres = conEnlaces.map(id => etiquetaPuerto(estado, id).split(" ").pop() ?? id);
    return {
      ok: false,
      error: `No se puede dejar el equipo en ${total} puertos: ${enumerar(nombres)} ${conEnlaces.length === 1 ? "conserva conexiones" : "conservan conexiones"}. Quítalas primero.`,
    };
  }

  return { ok: true, crear, borrar };
};
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: PASS, 19 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/red/inventario.ts tests/inventario.test.ts
git commit -m "Agrega el plan de cambio de cantidad de puertos"
```

---

### Task 5: `planEliminarEquipo` y `planEliminarRack`

**Files:**
- Modify: `lib/red/inventario.ts`
- Modify: `tests/inventario.test.ts`

**Interfaces:**
- Consumes: `EstadoRed`.
- Produces: `planEliminarEquipo(estado, id): { ok: true; puertos: string[]; enlaces: number[] } | { ok: false; error: string }` y `planEliminarRack(estado, id): { ok: true; equipos: string[]; puertos: string[]; enlaces: number[] } | { ok: false; error: string }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/inventario.test.ts`:

```ts
test("planEliminarEquipo arrastra sus puertos y los enlaces de esos puertos", () => {
  const plan = planEliminarEquipo(fixture(), "R2-PP1");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.puertos, ["pto:R2-PP1-p14", "pto:R2-PP1-p15", "pto:R2-PP1-p16"]);
  // El enlace 1 va del espacio al p14 y el 2 del p14 al switch: los dos caen.
  assert.deepEqual(plan.enlaces.sort((a, b) => a - b), [1, 2]);
});

test("planEliminarEquipo rechaza un id que no existe", () => {
  const plan = planEliminarEquipo(fixture(), "NO-EXISTE");
  assert.equal(plan.ok, false);
});

test("planEliminarRack arrastra equipos, puertos y enlaces del rack completo", () => {
  const plan = planEliminarRack(fixture(), "R2");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.equipos.sort(), ["ISP", "MIKROTIK", "R2-PP1", "R2-SW1"]);
  assert.equal(plan.puertos.length, 7);
  // Los cinco enlaces del fixture tocan algún puerto de R2.
  assert.deepEqual(plan.enlaces.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("planEliminarRack rechaza un rack que no existe", () => {
  assert.equal(planEliminarRack(fixture(), "R9").ok, false);
});

test("planEliminarRack de un rack vacío no arrastra nada", () => {
  const estado = fixture();
  estado.racks.push({ id: "R4", nombre: "Rack 4", ubicacion: "", segmento: "", x: 0, y: 0, w: 0, h: 0, notas: "" });
  const plan = planEliminarRack(estado, "R4");
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(plan.equipos, []);
  assert.deepEqual(plan.puertos, []);
  assert.deepEqual(plan.enlaces, []);
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: FAIL — los planes no existen.

- [ ] **Step 3: Implementar**

Agregar a `lib/red/inventario.ts`:

```ts
export type PlanEliminarEquipo =
  | { ok: true; puertos: string[]; enlaces: number[] }
  | { ok: false; error: string };

export type PlanEliminarRack =
  | { ok: true; equipos: string[]; puertos: string[]; enlaces: number[] }
  | { ok: false; error: string };

const arrastreDeEquipos = (estado: EstadoRed, equipos: string[]) => {
  const deEste = new Set(equipos);
  const puertos = estado.puertos.filter(puerto => deEste.has(puerto.equipo)).map(puerto => puerto.id).sort();
  const afectados = new Set(puertos);
  const enlaces = estado.enlaces
    .filter(enlace => afectados.has(enlace.a) || afectados.has(enlace.b))
    .map(enlace => enlace.id);
  return { puertos, enlaces };
};

export const planEliminarEquipo = (estado: EstadoRed, id: string): PlanEliminarEquipo => {
  if (!estado.equipos.some(equipo => equipo.id === id)) return { ok: false, error: "Ese equipo ya no existe." };
  return { ok: true, ...arrastreDeEquipos(estado, [id]) };
};

export const planEliminarRack = (estado: EstadoRed, id: string): PlanEliminarRack => {
  if (!estado.racks.some(rack => rack.id === id)) return { ok: false, error: "Ese rack ya no existe." };
  const equipos = estado.equipos.filter(equipo => equipo.rack === id).map(equipo => equipo.id).sort();
  return { ok: true, equipos, ...arrastreDeEquipos(estado, equipos) };
};
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: PASS, 24 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/red/inventario.ts tests/inventario.test.ts
git commit -m "Agrega los planes de eliminación de equipo y de rack"
```

---

### Task 6: Ruta `/api/red/racks`

**Files:**
- Create: `app/api/red/racks/route.ts`

**Interfaces:**
- Consumes: `codigoRack`, `planEliminarRack` de `lib/red/inventario.ts`; `leerEstado` de `app/api/red/route.ts`.
- Produces: `POST` devuelve `{ id }` con status 201; `PATCH` y `DELETE` devuelven `{ ok: true }`.

- [ ] **Step 1: Escribir la ruta**

Crear `app/api/red/racks/route.ts`:

```ts
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netEquipos, netOrden, netPuertos, netRacks } from "../../../../db/schema";
import { leerEstado } from "../route";
import { codigoRack, planEliminarRack } from "../../../../lib/red/inventario";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type Payload = { id?: string; nombre?: string; ubicacion?: string; segmento?: string; notas?: string };

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const camposDe = (payload: Payload) => ({
  nombre: limpiar(payload.nombre, 120),
  ubicacion: limpiar(payload.ubicacion, 160),
  segmento: limpiar(payload.segmento, 64),
  notas: limpiar(payload.notas, 500),
});

export async function POST(request: Request) {
  try {
    const campos = camposDe(await readJson<Payload>(request));
    if (!campos.nombre) return noStoreJson({ error: "Escribe un nombre para el rack." }, { status: 400 });

    const db = await getDb();
    const id = await db.transaction(async (tx) => {
      const existentes = new Set((await tx.select({ id: netRacks.id }).from(netRacks)).map(fila => fila.id));
      const nuevo = codigoRack(existentes);
      await tx.insert(netRacks).values({ ...campos, id: nuevo, x: 0, y: 0, w: 0, h: 0 });
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-creado", objetivo: nuevo,
        antes: "", despues: campos.nombre, nota: "Rack agregado",
      });
      return nuevo;
    });
    return noStoreJson({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el rack.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const id = limpiar(payload.id, 120);
    const campos = camposDe(payload);
    if (!id) return noStoreJson({ error: "Falta el identificador del rack." }, { status: 400 });
    if (!campos.nombre) return noStoreJson({ error: "El nombre no puede quedar vacío." }, { status: 400 });

    const db = await getDb();
    const existe = await db.transaction(async (tx) => {
      const [actual] = await tx.select().from(netRacks).where(eq(netRacks.id, id)).limit(1);
      if (!actual) return false;
      await tx.update(netRacks).set(campos).where(eq(netRacks.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-editado", objetivo: id,
        antes: actual.nombre, despues: campos.nombre, nota: "Datos del rack",
      });
      return true;
    });
    if (!existe) return noStoreJson({ error: "Ese rack ya no existe." }, { status: 404 });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el rack.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = limpiar(new URL(request.url).searchParams.get("id"), 120);
    if (!id) return noStoreJson({ error: "Falta el identificador del rack." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const plan = planEliminarRack(estado, id);
      if (!plan.ok) return { error: plan.error, status: 404 } as const;

      const nombre = estado.racks.find(rack => rack.id === id)?.nombre ?? id;
      if (plan.enlaces.length) await tx.delete(netEnlaces).where(inArray(netEnlaces.id, plan.enlaces));
      if (plan.puertos.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.puertos));
      if (plan.equipos.length) {
        await tx.delete(netEquipos).where(inArray(netEquipos.id, plan.equipos));
        await tx.delete(netOrden).where(inArray(netOrden.id, plan.equipos));
      }
      await tx.delete(netOrden).where(eq(netOrden.id, id));
      await tx.delete(netRacks).where(eq(netRacks.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-borrado", objetivo: id, antes: nombre, despues: "",
        nota: `Rack eliminado con ${plan.equipos.length} equipos y ${plan.enlaces.length} conexiones`,
      });
      return { ok: true, ...plan } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el rack.");
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/red/racks/route.ts
git commit -m "Agrega la ruta de racks con alta, edición y borrado en cascada"
```

---

### Task 7: Ruta `/api/red/equipos` y consolidación de los AP

**Files:**
- Create: `app/api/red/equipos/route.ts`
- Modify: `app/api/red/recursos/route.ts`

**Interfaces:**
- Consumes: `codigoEquipo`, `idPuerto`, `planCambioPuertos`, `planEliminarEquipo`, `MAXIMO_PUERTOS`.
- Produces: `POST` devuelve `{ id, endpointId }` con 201, donde `endpointId` es el puerto que la ficha debe abrir (`p1`, o `p0` si el equipo no tiene puertos numerados).

- [ ] **Step 1: Escribir la ruta**

Crear `app/api/red/equipos/route.ts`. Los campos aceptados son `rack`, `tipo`, `etiqueta`, `marca`, `modelo`, `ipGestion`, `puertos`, `nota`. `PATCH` **ignora `rack`**: el id del equipo está incrustado en el de cada puerto y en `net_enlaces`, y reescribirlo dejaría la bitácora apuntando a ids muertos.

```ts
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { netBitacora, netEnlaces, netEquipos, netOrden, netPuertos, netRacks } from "../../../../db/schema";
import { leerEstado } from "../route";
import { MAXIMO_PUERTOS, codigoEquipo, idPuerto, planCambioPuertos, planEliminarEquipo } from "../../../../lib/red/inventario";
import { tiposEquipo, type TipoEquipo } from "../../../../lib/red/modelo";
import { apiErrorResponse, noStoreJson, readJson } from "../../../../lib/api-response";

type Payload = {
  id?: string; rack?: string; tipo?: string; etiqueta?: string;
  marca?: string; modelo?: string; ipGestion?: string; puertos?: number; nota?: string;
};

const limpiar = (valor: unknown, maximo: number) =>
  typeof valor === "string" ? valor.trim().slice(0, maximo) : "";

const datosDe = (payload: Payload) => ({
  etiqueta: limpiar(payload.etiqueta, 120),
  marca: limpiar(payload.marca, 80),
  modelo: limpiar(payload.modelo, 120),
  ipGestion: limpiar(payload.ipGestion, 64),
  nota: limpiar(payload.nota, 500),
});

const tipoDe = (valor: unknown): TipoEquipo | "" =>
  tiposEquipo.includes(valor as TipoEquipo) ? valor as TipoEquipo : "";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const datos = datosDe(payload);
    const tipo = tipoDe(payload.tipo);
    const rack = limpiar(payload.rack, 120);
    const puertos = Number(payload.puertos ?? 0);
    if (!tipo) return noStoreJson({ error: "Tipo de equipo inválido." }, { status: 400 });
    if (!datos.etiqueta) return noStoreJson({ error: "Escribe un nombre para el equipo." }, { status: 400 });
    if (!Number.isInteger(puertos) || puertos < 0 || puertos > MAXIMO_PUERTOS) {
      return noStoreJson({ error: `La cantidad de puertos debe ser un número entre 0 y ${MAXIMO_PUERTOS}.` }, { status: 400 });
    }

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      if (rack) {
        const [existe] = await tx.select({ id: netRacks.id }).from(netRacks).where(eq(netRacks.id, rack)).limit(1);
        if (!existe) return { error: "Ese rack no existe.", status: 400 } as const;
      }
      const existentes = new Set((await tx.select({ id: netEquipos.id }).from(netEquipos)).map(fila => fila.id));
      const id = codigoEquipo(rack, tipo, datos.etiqueta, existentes);

      // Un equipo nuevo va al final del rack: la vista ordena por y cuando no hay
      // orden manual, y con y = 0 cada equipo agregado se colaría en primer lugar.
      const hermanos = await tx.select({ y: netEquipos.y }).from(netEquipos).where(eq(netEquipos.rack, rack));
      const y = hermanos.reduce((mayor, fila) => Math.max(mayor, fila.y), 0) + 1;

      await tx.insert(netEquipos).values({ ...datos, id, rack, tipo, puertos, color: "", x: 0, y });

      const numeros = puertos === 0 ? [0] : Array.from({ length: puertos }, (_, indice) => indice + 1);
      await tx.insert(netPuertos).values(numeros.map(n => ({
        id: idPuerto(id, n), equipo: id, n, estado: "libre" as const, nota: "",
      })));

      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-creado", objetivo: idPuerto(id, numeros[0]),
        antes: "", despues: datos.etiqueta, nota: `${tipo} agregado`,
      });
      return { ok: true, id, endpointId: idPuerto(id, numeros[0]) } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible agregar el equipo.");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Payload>(request);
    const id = limpiar(payload.id, 120);
    const datos = datosDe(payload);
    const tipo = tipoDe(payload.tipo);
    if (!id) return noStoreJson({ error: "Falta el identificador del equipo." }, { status: 400 });
    if (!tipo) return noStoreJson({ error: "Tipo de equipo inválido." }, { status: 400 });
    if (!datos.etiqueta) return noStoreJson({ error: "El nombre no puede quedar vacío." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const actual = estado.equipos.find(equipo => equipo.id === id);
      if (!actual) return { error: "Ese equipo ya no existe.", status: 404 } as const;

      const puertos = payload.puertos === undefined ? actual.puertos : Number(payload.puertos);
      const plan = planCambioPuertos(estado, id, puertos);
      if (!plan.ok) return { error: plan.error, status: 409 } as const;

      if (plan.borrar.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.borrar));
      if (plan.crear.length) {
        await tx.insert(netPuertos).values(plan.crear.map(n => ({
          id: idPuerto(id, n), equipo: id, n, estado: "libre" as const, nota: "",
        })));
      }

      // El rack no se toca a propósito: reescribirlo obligaría a renombrar los
      // puertos, los enlaces que los referencian y la bitácora.
      await tx.update(netEquipos).set({ ...datos, tipo, puertos }).where(eq(netEquipos.id, id));

      const entradas = [{
        fecha: new Date().toISOString(), tipo: "recurso-editado", objetivo: idPuerto(id, actual.puertos === 0 ? 0 : 1),
        antes: actual.etiqueta, despues: datos.etiqueta, nota: "Datos del equipo",
      }];
      if (puertos !== actual.puertos) {
        entradas.push({
          fecha: new Date().toISOString(), tipo: "recurso-editado", objetivo: idPuerto(id, puertos === 0 ? 0 : 1),
          antes: String(actual.puertos), despues: String(puertos), nota: "Cantidad de puertos",
        });
      }
      await tx.insert(netBitacora).values(entradas);
      return { ok: true } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "No fue posible guardar el equipo.");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = limpiar(new URL(request.url).searchParams.get("id"), 120);
    if (!id) return noStoreJson({ error: "Falta el identificador del equipo." }, { status: 400 });

    const db = await getDb();
    const outcome = await db.transaction(async (tx) => {
      const estado = await leerEstado(tx);
      const plan = planEliminarEquipo(estado, id);
      if (!plan.ok) return { error: plan.error, status: 404 } as const;

      const nombre = estado.equipos.find(equipo => equipo.id === id)?.etiqueta ?? id;
      if (plan.enlaces.length) await tx.delete(netEnlaces).where(inArray(netEnlaces.id, plan.enlaces));
      if (plan.puertos.length) await tx.delete(netPuertos).where(inArray(netPuertos.id, plan.puertos));
      await tx.delete(netOrden).where(eq(netOrden.id, id));
      await tx.delete(netEquipos).where(eq(netEquipos.id, id));
      await tx.insert(netBitacora).values({
        fecha: new Date().toISOString(), tipo: "recurso-borrado", objetivo: id, antes: nombre, despues: "",
        nota: `Equipo eliminado con ${plan.puertos.length} puertos y ${plan.enlaces.length} conexiones`,
      });
      return { ok: true, ...plan } as const;
    });
    if ("error" in outcome) return noStoreJson({ error: outcome.error }, { status: outcome.status });
    return noStoreJson(outcome);
  } catch (error) {
    return apiErrorResponse(error, "No fue posible eliminar el equipo.");
  }
}
```

- [ ] **Step 2: Quitar la rama `ap` de `/api/red/recursos`**

En `app/api/red/recursos/route.ts`:

- `type TipoRecurso` pasa a `"espacio"`.
- En `POST` y `PATCH`, la validación de tipo pasa a `payload.tipo === "espacio" ? payload.tipo : ""`.
- Borrar de `POST` todo el bloque desde `const existentes = new Set((await tx.select({ id: netEquipos.id })…` hasta el `return { id: endpointId };` — es la rama del AP.
- Borrar de `PATCH` el bloque equivalente que actualiza `netEquipos`.
- Quitar de `Payload` el campo `modelo`, y de las importaciones `netEquipos` y `netPuertos` si quedan sin uso.

El archivo baja de 184 a unas 120 líneas y queda con una sola entidad.

- [ ] **Step 3: Verificar que compila y no quedaron importaciones muertas**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/red/equipos/route.ts app/api/red/recursos/route.ts
git commit -m "Agrega la ruta de equipos y consolida los AP en ella"
```

---

### Task 8: Orden compartido de los equipos

**Files:**
- Modify: `lib/red/inventario.ts`
- Modify: `tests/inventario.test.ts`
- Modify: `app/red/page.tsx:216-221`

**Interfaces:**
- Consumes: `ordenarPor` de `lib/red/layout.ts:46`.
- Produces: `equiposDeRack(estado: EstadoRed, rack: string): Equipo[]`, ya ordenados y sin el filtro de puertos.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `tests/inventario.test.ts`:

```ts
test("equiposDeRack cae al orden por y cuando no hay orden manual", () => {
  const ids = equiposDeRack(fixture(), "R2").map(equipo => equipo.id);
  assert.deepEqual(ids, ["ISP", "MIKROTIK", "R2-PP1", "R2-SW1"]);
});

test("equiposDeRack respeta el orden manual guardado", () => {
  const estado = fixture();
  estado.orden = { "R2-SW1": 0, "R2-PP1": 1 };
  const ids = equiposDeRack(estado, "R2").map(equipo => equipo.id);
  assert.deepEqual(ids.slice(0, 2), ["R2-SW1", "R2-PP1"]);
});

test("equiposDeRack incluye los equipos sin puertos numerados", () => {
  const ids = equiposDeRack(fixture(), "R2").map(equipo => equipo.id);
  assert.ok(ids.includes("MIKROTIK"));
  assert.ok(ids.includes("ISP"));
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: FAIL — `equiposDeRack` no existe.

- [ ] **Step 3: Implementar**

Agregar a `lib/red/inventario.ts` (importar `ordenarPor` de `./layout.ts` y `type Equipo` de `./modelo.ts`):

```ts
// Sin el filtro de puertos que tenía la vista: un firewall o un router asignados
// a un rack tienen cero puertos numerados y desaparecían de la pantalla.
export const equiposDeRack = (estado: EstadoRed, rack: string): Equipo[] => {
  const delRack = estado.equipos.filter(equipo => equipo.rack === rack);
  const automatico = [...delRack].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id)).map(equipo => equipo.id);
  const porId = new Map(delRack.map(equipo => [equipo.id, equipo]));
  return ordenarPor(estado.orden, automatico)
    .map(id => porId.get(id))
    .filter((equipo): equipo is Equipo => Boolean(equipo));
};
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test tests/inventario.test.ts`
Expected: PASS, 27 pruebas.

- [ ] **Step 5: Corregir el texto del confirmar de restablecer orden**

En `app/red/page.tsx:217`, el texto ya no es cierto: el orden manda en las dos vistas.

```ts
    if (!window.confirm("¿Volver al orden automático? Se pierde el orden que definiste a mano en el diagrama y en los racks.")) return;
```

- [ ] **Step 6: Commit**

```bash
git add lib/red/inventario.ts tests/inventario.test.ts app/red/page.tsx
git commit -m "Comparte el orden manual entre el diagrama y la vista de racks"
```

---

### Task 9: La vista de racks

**Files:**
- Modify: `app/red/vista-racks.tsx` (reescritura completa)
- Modify: `app/globals.css` (o el archivo de estilos donde viven las clases `net-*`; localícelo con Grep sobre `net-strip`)

**Interfaces:**
- Consumes: `equiposDeRack`, `SIGLAS`, `etiquetasTipoEquipo` de `lib/red/inventario.ts`.
- Produces: `VistaRacks` gana props `onEditarRack: (id: string) => void`, `onEditarEquipo: (id: string) => void`, `onNuevoRack: () => void`, `onNuevoEquipo: (rack: string) => void`, `onReordenar: (ids: string[]) => void`.

- [ ] **Step 1: Reescribir el componente**

Estructura de `VistaRacks`, en filas de dos columnas:

1. Barra de racks con los botones existentes más `+ RACK` que llama a `onNuevoRack`.
2. Encabezado del rack: etiqueta `RACK {id}`, nombre grande, ubicación, chips de `segmento` (o `SEGMENTO IP · sin registrar` en clase `vacio` cuando está vacío), conteo de equipos y de puertos ocupados sobre el total, nota limpia como `<p>`, y botón «Editar rack» que llama a `onEditarRack`.
3. Una `<section className="net-eq-fila">` por equipo de `equiposDeRack(estado, rackActivo)`:
   - Tarjeta izquierda `net-eq-id`, clicable, que llama a `onEditarEquipo(equipo.id)`: insignia `<span className={"net-tag " + equipo.tipo}>{SIGLAS[equipo.tipo]}</span>`, código `equipo.id.replace("-", "/")`, etiqueta, `marca` y `modelo` unidos por `·`, `ipGestion`, y la ocupación. Cada campo vacío se dibuja como `<small className="falta">sin modelo</small>` en lugar de omitirse.
   - Flechas `↑ ↓` con `aria-label={"Subir " + equipo.etiqueta}`, deshabilitadas en los extremos, que llaman a `onReordenar` con el arreglo completo de ids del rack con ese equipo movido una posición.
   - Columna derecha: la tira de puertos igual que hoy cuando `equipo.puertos > 0`; cuando es 0, un `<span className="net-endpoint">` con el texto `punto único · sin puertos numerados` que abre el `p0` con `onAbrir`.
4. `+ Agregar equipo a este rack` al final, que llama a `onNuevoEquipo(rackActivo)`.
5. Leyenda de las seis siglas al pie.

La vista LISTA gana tres columnas —TIPO, MARCA, MODELO— en el `<thead>` y en la fila de grupo de cada equipo, y su `colSpan` sube de 4 a 7.

El movimiento de una flecha se calcula así:

```ts
const mover = (id: string, delta: number) => {
  const ids = equipos.map(equipo => equipo.id);
  const desde = ids.indexOf(id);
  const hasta = desde + delta;
  if (desde < 0 || hasta < 0 || hasta >= ids.length) return;
  const movido = [...ids];
  [movido[desde], movido[hasta]] = [movido[hasta], movido[desde]];
  onReordenar(movido);
};
```

- [ ] **Step 2: Escribir los estilos**

Agregar las clases al archivo de estilos, junto a las `net-*` existentes:

```css
.net-eq-fila { display: grid; grid-template-columns: 206px 1fr; border: 1px solid var(--line); border-bottom: none; }
.net-eq-fila:last-of-type { border-bottom: 1px solid var(--line); }
.net-eq-id { background: #f7f8fa; border-right: 1px solid var(--line); padding: 10px 12px; text-align: left; }
.net-eq-id small.falta { color: #b9bfc7; font-style: italic; }
.net-tag { display: inline-block; min-width: 32px; text-align: center; padding: 2px 5px; font-size: 9.5px; letter-spacing: .1em; color: #fff; }
.net-tag.switch { background: #2d4d73; }
.net-tag.patchpanel { background: #8a93a0; }
.net-tag.ap { background: #3f7d63; }
.net-tag.router { background: #b0762e; }
.net-tag.firewall { background: #a4483f; }
.net-tag.isp { background: #33404f; }
.net-endpoint { display: inline-block; border: 1px dashed #c3cad3; color: #68727f; padding: 5px 11px; font-size: 11px; }
.net-chip.vacio { color: #a8b0ba; border-style: dashed; font-style: italic; }

@media (max-width: 900px) {
  .net-eq-fila { grid-template-columns: 1fr; }
  .net-eq-id { border-right: none; border-bottom: 1px solid var(--line); }
}
```

Si los nombres de variables CSS (`--line`) no existen en el proyecto, use el color literal que ya usan los bordes de `.net-pt`.

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev`

Abra `/red`, pestaña RACKS. Compruebe: las insignias SW y PP se distinguen, el segmento aparece en el encabezado, las flechas mueven los equipos y el orden persiste al recargar, y en el diagrama el mismo orden se refleja.

- [ ] **Step 4: Commit**

```bash
git add app/red/vista-racks.tsx app/globals.css
git commit -m "Reorganiza la vista de racks en tarjeta de identidad y tira de puertos"
```

---

### Task 10: Fichas de rack y de equipo

**Files:**
- Create: `app/red/ficha-rack.tsx`
- Create: `app/red/ficha-equipo.tsx`
- Modify: `app/red/page.tsx`
- Modify: `app/red/nuevo-recurso.tsx`
- Modify: `app/red/ficha.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la interfaz completa de edición.

- [ ] **Step 1: Crear `ficha-rack.tsx`**

Cajón lateral con la misma estructura que `ficha.tsx` (`useDialogFocus`, `drawer open`, `drawer-head`, `drawer-body`). Campos: nombre, ubicación, segmento IP (con pista gris `no parece un segmento; se guarda igual` cuando `!pareceSegmento(valor) && valor`), nota. Lista de sus equipos como botones que llaman a `onAbrirEquipo`. Bitácora filtrada por `objetivo === rack.id`. Zona de precaución con el conteo de `planEliminarRack`.

- [ ] **Step 2: Crear `ficha-equipo.tsx`**

Igual, con: selector de tipo (`tiposEquipo` con `etiquetasTipoEquipo`), nombre, marca, modelo, IP de gestión (pista con `pareceIp`), cantidad de puertos, nota. El rack se muestra como dato fijo, no como selector, con el texto: *«El rack no se puede cambiar: el código del equipo está en el id de cada puerto y de cada conexión.»* Zona de precaución con el conteo de `planEliminarEquipo`. El error 409 del cambio de puertos se muestra en un `<p role="alert">`.

- [ ] **Step 3: Cablear `page.tsx`**

Agregar estado `rackEnFicha`, `equipoEnFicha`, `nuevoRackAbierto`, `nuevoEquipoEn`, `rackPorEliminar`, `equipoPorEliminar`; y los handlers `guardarRack`, `crearRack`, `eliminarRack`, `guardarEquipo`, `crearEquipo`, `eliminarEquipo`, todos vía `conGuardado` como los que ya existen. Pasar a `VistaRacks` las cinco props nuevas del Task 9, y `onReordenar={reordenar}` reutilizando el handler que ya existe en la línea 203.

- [ ] **Step 4: Apuntar los AP a la ruta nueva**

En `nuevo-recurso.tsx` la opción «Punto de acceso» pasa a enviar a `/api/red/equipos` con `{ tipo: "ap", etiqueta, marca, modelo, ipGestion, nota: ubicacion, puertos: 0 }`. En `ficha.tsx`, la sección de datos del AP usa la misma ruta vía `PATCH` y suma los campos marca e IP de gestión.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — sin errores.
Run: `npm run lint` — sin errores.
Run: `npm test` — build y pruebas pasan.

En el navegador: cree un rack, agréguele un switch de 8 puertos, súbalo a 12, bájelo a 4, conecte un puerto y compruebe que bajar por debajo de él da el error nombrando el puerto. Edite un AP y verifique que guarda marca e IP de gestión. Elimine el rack de prueba y confirme el conteo del diálogo.

- [ ] **Step 6: Commit**

```bash
git add app/red/ficha-rack.tsx app/red/ficha-equipo.tsx app/red/page.tsx app/red/nuevo-recurso.tsx app/red/ficha.tsx
git commit -m "Agrega las fichas de rack y de equipo con edición completa"
```
