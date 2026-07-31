# Espacios: eliminar, ordenar, agrupar y tipos administrables

Fecha: 2026-07-31

## Problema

En **Panel red > Espacios** hoy solo se pueden crear y editar espacios. Faltan tres cosas:

1. No hay forma de eliminar un espacio creado por error o que dejó de existir.
2. Con 61 espacios la grilla es una lista plana ordenada por nombre; no se puede ordenar ni agrupar.
3. El tipo de espacio es una unión fija en el código (`"sala" | "oficina" | "otro"`), así que no se pueden registrar laboratorios, bodegas, gimnasios ni nada que no esté previsto.

## Decisiones

| Decisión | Elegida |
|---|---|
| Dónde vive el borrado | Zona de precaución al final de la ficha del espacio |
| Espacio con conexiones | Se borra en cascada, avisando cuántas se pierden |
| `esp:sala-computacion` | Protegida: ancla los cubículos en la tarjeta y el diagrama |
| Administración de tipos | Crear, renombrar y eliminar; los tres base no se borran |
| Dónde se crean los tipos | Diálogo «Administrar tipos» desde la barra de Espacios |
| Orden y agrupación | Selector «Ordenar por» + interruptor «Agrupar por tipo», independientes |

## Modelo de datos

Tabla nueva:

```sql
CREATE TABLE net_categorias (
  id     TEXT PRIMARY KEY,          -- slug: "sala", "laboratorio"
  nombre TEXT NOT NULL DEFAULT '',  -- etiqueta visible
  orden  INTEGER NOT NULL DEFAULT 0,
  fija   BOOLEAN NOT NULL DEFAULT FALSE
);
```

`net_espacios.categoria` ya es `TEXT` sin restricción, así que los 61 espacios sembrados (31 `sala`, 30 `oficina`) siguen siendo válidos sin migrar datos.

En `lib/red/modelo.ts`:

- `CategoriaEspacio` pasa de unión literal a `string`.
- Se agrega `type Categoria = { id: string; nombre: string; orden: number; fija: boolean }`.
- `EstadoRed` gana `categorias: Categoria[]`.
- `categoriasEspacio` (el arreglo fijo) desaparece; se reemplaza por `CATEGORIAS_BASE`, que solo define las semillas.

### Espacios borrados y la siembra

`sembrarRed` reinserta `semilla.espacios` con `onConflictDoNothing` cada vez que cambia el hash de `semilla.json`. Sin protección, un espacio sembrado que el usuario borre reaparece la próxima vez que alguien regenere el canvas.

Los ids borrados se guardan en `app_metadata` bajo la clave `red_espacios_borrados` (arreglo JSON) y `sembrarRed` los filtra, tanto en `espacios` como en los `enlaces` que los referencian. No requiere tabla nueva.

## API

| Ruta | Comportamiento |
|---|---|
| `GET /api/red` | `EstadoRed` incluye `categorias`, ordenadas por `orden` y luego `nombre`. |
| `DELETE /api/red/recursos?tipo=espacio&id=…` | Borra el espacio, sus enlaces, libera los puertos que quedan sin uso, limpia su fila de `net_orden`, registra el id como borrado y deja entrada `recurso-borrado` en bitácora. `409` para `esp:sala-computacion`, `404` si ya no existe. |
| `POST /api/red/categorias` | `{ nombre }` → crea con slug único derivado del nombre. `409` si el nombre ya existe. |
| `PATCH /api/red/categorias` | `{ id, nombre }` → renombra (el slug no cambia). |
| `DELETE /api/red/categorias?id=…&reasignar=…` | Borra el tipo y mueve sus espacios a `reasignar`. `409` si es fija; `400` si está en uso y `reasignar` falta o es inválido. |

`categoriaValida` en `recursos/route.ts` deja de comparar contra el arreglo fijo y valida contra `net_categorias`, con respaldo a `sala`.

## Lógica pura y pruebas

Siguiendo las pruebas existentes (`node:test` sobre funciones de `lib/`):

- `lib/red/agrupar.ts` — `ordenarEspacios(espacios, criterio, categorias)` y `agruparPorTipo(espacios, categorias)`. Puras. → `tests/agrupar.test.ts`
- `planEliminarEspacio(estado, id)` en `modelo.ts` — devuelve `{ ok: true, enlaces, puertosALiberar }` o `{ ok: false, error }`. La ruta solo ejecuta el plan, igual que `validarEnlace` hoy. → `tests/modelo.test.ts`
- `slugCategoria(nombre)` y `etiquetaCategoria(estado, id)` en `modelo.ts`. → `tests/modelo.test.ts`

`tests/fixture-red.ts` gana el campo `categorias`.

## Interfaz

- **`app/red/tipos-espacio.tsx`** (nuevo) — diálogo modal abierto desde la barra de Espacios. Lista los tipos con el conteo de espacios de cada uno; permite renombrar en línea, eliminar (con selector de reasignación cuando está en uso) y agregar uno nuevo al pie. Los tipos `fija` no muestran botón de eliminar.
- **`app/red/eliminar-espacio.tsx`** (nuevo) — diálogo de confirmación con el patrón de `limpiar-conexiones.tsx`: bloque «Sí se elimina» / «Se conserva». Sin confirmación escrita; es un espacio, no toda la red.
- **`app/red/vista-espacios.tsx`** — recibe `categorias`, `orden` (`nombre` | `tipo` | `estado`) y `agrupar`. Cuando agrupa, inserta encabezados `TIPO · n` entre las grillas. Cada tarjeta muestra su tipo cuando no está agrupada.
- **`app/red/ficha.tsx`** — el selector de Tipo se alimenta de `estado.categorias`; se agrega al final una «Zona de precaución» con el botón de eliminar, solo para espacios y deshabilitada para la sala de computación.
- **`app/red/nuevo-recurso.tsx`** — recibe `categorias` por prop.
- **`app/red/page.tsx`** — estado de `orden`, `agrupar`, diálogos nuevos, y los manejadores `eliminarEspacio`, `crearCategoria`, `renombrarCategoria`, `eliminarCategoria`.

El orden y la agrupación viven en estado del componente, no se persisten.

## Esquema en dos lugares

El proyecto mantiene el DDL idempotente de `db/index.ts` (desarrollo) y las migraciones de `drizzle-pg/` (producción). La tabla nueva y las filas base se agregan en ambos; la migración se genera con `npm run db:generate`.

## Fuera de alcance

- Eliminar puntos de acceso: la ruta `recursos` los maneja, pero el pedido fue sobre espacios.
- Reordenar tipos a mano: `orden` se asigna al crear y no se edita.
- Persistir la preferencia de orden y agrupación entre sesiones.
