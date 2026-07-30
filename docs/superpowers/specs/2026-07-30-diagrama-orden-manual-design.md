# Orden manual de los elementos del diagrama

Fecha: 2026-07-30
Estado: propuesto

## Problema

El diagrama coloca todo por cálculo y no acepta ninguna corrección. `construirLayout()`
decide el orden en cuatro lugares distintos, con cuatro criterios distintos:

| grupo | criterio actual | dónde |
|---|---|---|
| zonas de rack | BFS por uplinks desde el borde, luego alfabético | `ordenDeZonas()`, `lib/red/layout.ts:58` |
| fila 0 (switches y equipos de borde) | alfabético por id | `lib/red/layout.ts:229` |
| fila 1 (patch panels) | alfabético por id | `lib/red/layout.ts:229` |
| pila de destinos | orden de construcción: espacios, cubículos, APs | `destinosDe()`, `lib/red/layout.ts:166` |

Ninguno de los cuatro sabe cómo están dispuestos los fierros en la realidad. El
alfabético por id pone `R2/PP1 R2/PP2 R2/PP3` aunque en el rack estén al revés, y el
BFS de uplinks encadena los racks por topología, no por el recorrido que hace la
persona que revisa el colegio. El resultado se lee bien y no coincide con lo que hay
enfrente, que es justamente lo que el diagrama existe para reflejar.

El spec anterior (`2026-07-30-diagrama-legibilidad-design.md`) dejó fuera de alcance
«arrastrar tarjetas y persistir posiciones, el layout es calculado». Eso sigue en pie:
esto **no** son posiciones libres. El layout sigue calculando toda la geometría —
tamaños, filas, zonas, apilado — y lo único que pasa a ser dato es el **orden dentro
de cada grupo**.

## Decisiones

| Asunto | Decisión |
|---|---|
| Persistencia | Base de datos, tabla propia `net_orden`, compartida por todos |
| Alcance | Racks, switches, patch panels, equipos de borde y destinos |
| Qué **no** se ordena | Las columnas de destinos: siguen a su equipo padre |
| Gesto | Modo ORDENAR con flechas de intercambio, no arrastrar y soltar |
| Respaldo | El orden automático sigue vigente donde no haya orden guardado |
| Bitácora | No se registra: es presentación, no un hecho de la red |

## A. Modelo de datos

Hay cinco cosas ordenables repartidas hoy en tres tablas —`net_racks`, `net_equipos`,
`net_espacios`— más `cubicles`, que pertenece al inventario de la sala de computación y
no tiene por qué cargar con una columna del diagrama. En vez de una columna `orden` en
cada una, una tabla propia:

```sql
create table net_orden (
  id    text primary key,
  orden integer not null
);
```

La clave es el **id del nodo tal como lo usa el layout**, que ya es único y estable en
todo el sistema:

| ordenable | id | ejemplo |
|---|---|---|
| rack | id del rack | `R2` |
| equipo con puertos | `eq:` + id del equipo | `eq:R2-SW1` |
| equipo sin puertos | id de su puerto único | `pto:MIKROTIK-p0` |
| espacio | id del espacio | `esp:secretaria` |
| cubículo | `cub:` + número | `cub:12` |
| AP | id de su puerto | `pto:AP1-p0` |

Un id único para los cinco casos permite una sola tabla, un solo endpoint y un solo
punto de mezcla en el layout. La tabla arranca vacía: sin filas, el diagrama se dibuja
exactamente como hoy.

`leerEstado()` la lee como un diccionario y `EstadoRed` gana un campo:

```ts
export type EstadoRed = { ...; orden: Record<string, number> };
```

Es campo obligatorio, no opcional, para que el compilador obligue a poblarlo en los
seis lugares que hoy construyen un `EstadoRed`: `leerEstado()`, `app/api/red/cadena/route.ts:18`,
`estadoVacio` en `app/red/page.tsx:14`, `tests/fixture-red.ts` y los ayudantes `real()`
de `tests/layout.test.ts:10` y `tests/aristas.test.ts:11`.

## B. Cómo se mezcla con el orden automático

Una sola función pura, que los cuatro puntos de `layout.ts` llaman:

```ts
export const ordenarPor = (orden: Record<string, number>, automatico: string[]): string[] =>
  [...automatico].sort((a, b) =>
    (orden[a] ?? 1000 + automatico.indexOf(a)) - (orden[b] ?? 1000 + automatico.indexOf(b)));
```

La regla en palabras: **manda el orden guardado; lo que no lo tenga va al final, en su
orden automático.** El desplazamiento de 1000 es el que garantiza esa segunda mitad,
porque las filas guardadas se escriben siempre como 0..n-1 y ningún grupo del diagrama
se acerca a mil elementos.

Esto importa por un caso concreto: si mañana se agrega un switch al rack 2, cae al final
de su fila sin desarmar el orden que ya se acomodó a mano. Y si nunca se ordenó ese
grupo, el criterio automático —el BFS de uplinks, el alfabético— sigue mandando entero.
El orden calculado no se reemplaza: pasa a ser el respaldo.

Los cuatro puntos de aplicación:

- **Zonas.** `ordenDeZonas()` devuelve `[ZONA_BORDE, ...racks]`; la mezcla se aplica solo
  a `racks`. La zona de borde queda siempre arriba: es la salida a internet y no es un
  rack que se pueda mover.
- **Fila 0 y fila 1.** Reemplazan el `sort((a, b) => (a.id < b.id ? -1 : 1))` de
  `layout.ts:229`. El grupo es por zona y por fila: un switch se intercambia con otro
  switch del mismo rack, nunca con uno de otro rack ni con un patch panel. La fila la
  sigue decidiendo `filaDeEquipo()` a partir del tipo del equipo, y el rack lo sigue
  decidiendo `equipo.rack`: ninguno de los dos es cosa del usuario, porque son el fierro
  físico y no el dibujo.
- **Pila de destinos.** Se aplica a cada columna por separado, dentro de la pila que
  cuelga de un mismo equipo padre.

Las columnas de destinos **siguen ordenándose por la `x` de su equipo padre**
(`layout.ts:248`), sin orden propio. Es lo que hace que mover un switch arrastre consigo
su bloque de salas y que las líneas no se crucen; darle orden propio a la columna
permitiría dejarla lejos de su equipo y el dibujo perdería justamente lo que lo hace
legible.

## C. Los grupos, expuestos a la interfaz

Para dibujar las flechas, la vista necesita saber, para un nodo, con quiénes se puede
intercambiar y en qué posición está. Eso lo calcula el layout y lo publica:

```ts
export type Layout = { ...; grupos: string[][] };
```

Cada entrada es un grupo ordenable ya ordenado: la lista de racks, la fila 0 de cada
zona, la fila 1 de cada zona, y la pila de cada equipo padre. La vista arma un índice
`Map<id, { grupo, indice }>` y con eso decide qué flechas dibujar y qué lista mandar al
guardar.

Ese reparto —el layout es dueño de los grupos, la vista solo los consume— es lo que
permite probar el reordenamiento sin montar la vista, y evita que `diagrama-nodos.tsx`
tenga que reproducir las reglas de zona y fila para adivinar quién es vecino de quién.

## D. Guardado

`PUT /api/red/orden` con `{ ids: string[] }`: la lista completa del grupo afectado,
escrita como 0..n-1 en una transacción. Se manda el grupo entero y no el par
intercambiado, porque así la operación es idempotente y se autocorrige sola si alguna
escritura anterior quedó a medias.

Validación en el endpoint, siguiendo el estilo de `app/api/red/route.ts`: lista no vacía,
máximo 200 ids, cada id string de a lo más 120 caracteres, sin repetidos. No se valida
que los ids existan: la tabla es un diccionario de presentación y una fila huérfana —un
equipo que se borró— no rompe nada, porque `ordenarPor()` solo consulta los ids que el
layout le pasa.

`DELETE /api/red/orden` vacía la tabla y devuelve el diagrama al orden automático. Va
detrás de una confirmación nativa, como el borrado de verificaciones en `app/page.tsx:292`.

**El movimiento se ve al instante y recién después se guarda**, siguiendo el patrón de
`asignarRapido()` en `app/red/page.tsx:122`: se actualiza `estado.orden` en memoria, se
manda el `PUT`, y si falla se restaura el diccionario anterior, se avisa con el toast y
se recarga. Sin optimismo cada flecha costaría un viaje de ida y vuelta más una recarga
completa del estado, y acomodar un rack son diez o quince clics seguidos.

No se escribe en `net_bitacora`. La bitácora registra hechos de la red —un enlace creado,
un puerto que cambió de estado—; cómo se dibuja el diagrama no es uno.

## E. La interacción

Un tercer botón **ORDENAR** junto a CONSULTAR y CONECTAR, en el grupo que ya existe en
`app/red/diagrama.tsx:195`. Las flechas se dibujan **solo en ese modo**: el resto del
tiempo el diagrama se ve igual que hoy, sin controles encima de las tarjetas.

Dentro del modo, desplazar, hacer zoom, seleccionar un nodo, abrir una tarjeta y abrir la
ficha con doble clic siguen funcionando igual. Lo único que se apaga es crear y mover
enlaces, que es lo propio de CONECTAR.

Los controles, todos con el mismo gesto de intercambiar con el vecino:

| elemento | control | intercambia con |
|---|---|---|
| rack | `◀ ▶` a la derecha del título de la zona | el rack vecino |
| switch, patch panel, equipo de borde | `◀ ▶` en una píldora sobre la tarjeta | el equipo vecino de su fila, en su rack |
| destino | `▲ ▼` a la derecha de la ficha | el destino vecino de su columna |

Al primero de un grupo no se le dibuja `◀` y al último no se le dibuja `▶`, en vez de
mostrarlas apagadas: el diagrama ya está denso y una flecha que no hace nada es ruido.
La zona de borde no lleva flechas de rack.

**RESTABLECER ORDEN** aparece en la barra solo en modo ORDENAR, deshabilitado cuando no
hay nada guardado.

**Teclado.** Cada flecha es un elemento enfocable con `role="button"`, `tabIndex={0}` y
etiqueta explícita —«Mover Switch 1 a la izquierda»—, activable con Enter o espacio, como
ya lo hacen las tarjetas y los puertos en `diagrama-nodos.tsx`.

Reordenar mueve el nodo de lugar en el DOM y el navegador suelta el foco, así que el foco
se devuelve a mano: cada flecha lleva un `data-flecha="<id>:<delta>"` y, después de
redibujar, se vuelve a enfocar la misma. Sin eso, encadenar dos movimientos con el teclado
obliga a tabular de nuevo hasta el botón, que es justo lo que se quiere evitar cuando hay
que acomodar un rack entero.

## F. Archivos

| archivo | cambio |
|---|---|
| `db/schema.ts` | tabla `netOrden` |
| `drizzle-pg/0003_*.sql` | migración generada con `npm run db:generate` |
| `app/api/red/orden/route.ts` | nuevo: `PUT` y `DELETE` |
| `app/api/red/route.ts` | `leerEstado()` incluye `orden` |
| `app/api/red/cadena/route.ts` | `orden: {}` en el estado que arma |
| `lib/red/modelo.ts` | `EstadoRed.orden` |
| `lib/red/layout.ts` | `ordenarPor()`, los cuatro puntos de aplicación, `Layout.grupos` |
| `app/red/diagrama.tsx` | modo ORDENAR, `mover()`, RESTABLECER |
| `app/red/diagrama-nodos.tsx` | dibujo de las flechas |
| `app/red/page.tsx` | `reordenar()` optimista, `restablecerOrden()`, `estadoVacio` |
| `app/globals.css` | estilos de la píldora de flechas |
| `tests/fixture-red.ts` | `orden: {}` |
| `tests/layout.test.ts` | casos nuevos |
| `tests/aristas.test.ts` | `orden: {}` en su ayudante `real()` |

`lib/red/siembra.ts` no se toca: la tabla arranca vacía y esa ausencia es exactamente el
orden automático de hoy.

## G. Pruebas

TDD con el runner del proyecto (`node --test`, `npm test`).

`tests/layout.test.ts`:

- `ordenarPor()` con el diccionario vacío devuelve el orden automático intacto;
- con orden guardado para todo el grupo, manda el guardado;
- un id sin orden guardado va después de todos los que sí lo tienen, y entre ellos
  conserva su orden automático;
- las zonas salen en el orden guardado y `ZONA_BORDE` sigue primero aunque tenga fila;
- dos switches del mismo rack se intercambian y ningún patch panel se mueve;
- un orden guardado para un id que ya no existe no altera el resto;
- `layout.grupos` contiene un grupo con los racks, uno por fila con equipos de cada
  zona y uno por pila de destinos, y ningún id aparece en dos grupos;
- al mover un equipo, la columna de destinos que cuelga de él se mueve con él, porque
  las columnas siguen ordenándose por la `x` del padre.

Sobre ese último punto, un detalle de la mecánica que la prueba tiene que respetar: las
columnas se **ordenan** por la `x` del padre, pero se **colocan** con un cursor que
avanza desde el borde de la zona, así que solo se mueven cuando cambia su orden
relativo. En los datos de hoy la columna de los espacios cuelga de `R2/PP1` y la del AP
de `R2/SW1`, y ambos equipos arrancan en la misma `x`: intercambiar dos switches entre
sí no cambia ese orden relativo y no mueve nada. Quien escriba la prueba tiene que mover
`R2/PP1` dentro de su fila, que sí lo cambia.

Verificación manual: abrir `/red` → DIAGRAMA → ORDENAR, mover un rack a la derecha y
recargar la página para confirmar que el orden quedó; intercambiar dos patch panels de un
mismo rack y ver que sus salas los siguen; subir una sala dentro de su pila; volver a
CONSULTAR y comprobar que no quedó ninguna flecha dibujada; RESTABLECER ORDEN y ver el
diagrama volver al orden por uplinks.

## Fuera de alcance

- Arrastrar y soltar tarjetas. El gesto es de intercambio con el vecino.
- Posiciones libres: coordenadas x/y propias por tarjeta. El layout sigue calculando toda
  la geometría; lo único que es dato es el orden.
- Mover un equipo de fila o de rack. La fila sale del tipo del equipo y el rack de
  `equipo.rack`: cambiarlos desde el diagrama haría que dejara de reflejar el fierro real.
- Orden propio para las columnas de destinos, independiente de su equipo padre.
- Ordenar la bandeja de «sin puerto asignado», que se agrupa por categoría.
- Historial o deshacer del reordenamiento. RESTABLECER vuelve al automático y desde ahí
  se rehace.

## Errores

Los del guardado los maneja el toast de `app/red/page.tsx`, como el resto de las
mutaciones: si el `PUT` falla, el diccionario `orden` vuelve a su valor anterior, el
diagrama se redibuja en la posición previa y el mensaje explica que el cambio no se
guardó. Si la tabla `net_orden` no existe todavía —migración sin correr— `leerEstado()`
falla como cualquier otra consulta y la vista muestra el banner de error de carga que ya
existe.
