# Diagrama interactivo y arreglo de la captura rápida

Fecha: 2026-07-29
Estado: aprobado

## Problema

Tres asuntos sobre la pestaña Red, verificados en el código y en los datos.

**La captura rápida no se puede usar.** Dos defectos independientes:

1. `.drawer-head button,.modal-head button{width:34px;height:34px;border-radius:50%}`
   en `app/globals.css:16` está pensado para el botón × de cierre, pero alcanza a
   todo botón dentro de `.modal-head`, incluidos los dos del `.net-seg` de sentido.
   Se dibujan como círculos de 34 px con el texto cortado: los dos discos que dicen
   «DESI EL».
2. El campo promete `Ej: 3 básico b, cubículo 12` y ese texto no encuentra nada.
   Los espacios se llaman `3° Básico B`; `normalizar()` en `app/red/captura.tsx:40`
   quita acentos pero no el `°`, y el filtro es un `includes` sobre el nombre
   completo. Escribir el propio ejemplo de la app deja la lista vacía y `Enter` no
   hace nada ni avisa.

**El diagrama no se lee y no permite editar.** `app/red/diagrama.tsx` dibuja los
324 puertos como rectángulos sin número, sobre las coordenadas de la semilla que
abarcan unas 8600 × 3000 unidades. `ajustar()` cae a escala 0.1, donde ningún
texto es legible. El clic solo abre la ficha: no se puede crear un enlace.

**La cadena hacia el ISP existe pero no se ve en el diagrama.** `trazarCadena()`
en `lib/red/trazado.ts:66` ya recorre la red hasta el ISP y devuelve los saltos;
el diagrama nunca la invoca.

## Hallazgos en los datos

Dos hechos que condicionan el diseño.

**Ninguna cadena llega al ISP.** `pto:ISP-p0` tiene un solo enlace, hacia
`pto:R1-PP1-p23`, y ese puerto de patch panel no está parcheado a ningún switch.
Los patch panels no están en `conChasis`, así que sus puertos no se conectan entre
sí: el BFS no puede terminar en el ISP desde ningún origen. FORTINET y MIKROTIK
están enlazados solo entre ellos, como isla. Es un hueco del levantamiento, no un
defecto de código.

Por eso la cadena de ejemplo termina en `R1/PP1 p01`: al no haber ruta al ISP,
`trazarCadena` cae en `masLejano()`, que devuelve el nodo más lejano por número de
saltos. Ese nodo es arbitrario y no tiene relación con la salida a internet.

**Casi nada está asignado.** De 61 espacios, solo `esp:utp-e-basica` y
`esp:pie-administrativo` tienen puerto. De 40 cubículos, ninguno. Hay 4 APs
conectados. El diagrama actual dibuja 99 cajas sueltas al lado de la red.

Consecuencia de diseño: el flujo conectado es pequeño —1 ISP, 2 equipos de borde,
6 switches, 7 patch panels y 6 hojas— y cabe legible sin zoom. Los 99 puntos sin
puerto no pertenecen al flujo y salen a una bandeja aparte, que además sirve como
origen para conectar.

## Decisiones

| Asunto | Decisión |
|---|---|
| Layout | Calculado por capas, ignorando las coordenadas de la semilla |
| Crear enlace | Clic en el origen, clic en el destino |
| Hueco hacia el ISP | Solo se muestra; no se inventa cableado |
| Ruta cortada | Se ilumina todo lo alcanzable, en dos niveles de intensidad |
| Buscador de captura | Se arregla el matcher; una asignación por vez |

Sobre el resaltado: desde cualquier sala el conjunto alcanzable es prácticamente
toda la trama conmutada, así que encenderlo entero a intensidad plena iluminaría
el diagrama completo. Se resuelve en dos niveles —la ruta fuerte, el resto del
alcance tenue— para conservar las dos lecturas en una sola vista.

## A. Captura rápida

**Choque CSS.** `.modal-head button` pasa a `.modal-head > button`. El × es hijo
directo del `.modal-head`; el `.net-seg` va anidado dentro del primer `<div>`, así
que deja de heredar la forma circular. Se revisan los demás usos de `.modal-head`
y `.drawer-head` para confirmar que ninguno dependía del selector amplio.

**Buscador.** `normalizar()` quita acentos y además `°`, comas, puntos y guiones.
El filtro pasa de subcadena a «todas las palabras presentes, en cualquier orden»,
de modo que `3 basico b` y `b 3 basico` encuentran `3° Básico B`. Se agregan
`cub 12`, `cubiculo 12` y `c12` como alias del cubículo 12. Sin coincidencias, el
campo muestra `Sin coincidencias para «xyz»` en lugar de dejar la lista vacía y
descartar el `Enter` en silencio. El placeholder deja de prometer la forma
combinada con coma.

**Dos arreglos menores.** Abrir la captura con un puerto seleccionado posiciona el
recorrido en ese puerto: hoy `puertoInicial` fija el equipo pero `indicePuerto`
queda en 0. Y el texto `Los 101 puntos tienen puerto` se calcula desde el estado en
vez de estar escrito a mano.

Fuera de alcance: rehacer el flujo de captura, la asignación combinada de espacio
y cubículo en un solo `Enter`.

## B. Diagrama: capas y bandeja

El layout se calcula desde el estado. Cinco capas de arriba hacia abajo, que es el
sentido de la ruta hacia el proveedor:

```
                    ┌─────┐
                    │ ISP │                          capa 0
                    └──┬──┘
                  R1/PP1 p23                         capa 1: borde
                       ╳  falta parcheo
     ┌────────┬────────┴───────┬────────┐
   R1/SW1   R2/SW1   R2/SW2   R3/SW1 …               capa 2: switches
     │        │        │        │
   R1/PP1   R2/PP1   R2/PP2   R3/PP1 …               capa 3: patch panels
     │        │                 │
  UTP E.Bás. PIE Adm.        AP wifi …               capa 4: destinos

┌─ SIN PUERTO ASIGNADO · 99 ──────────────────────┐
│ 1°A  1°B  2°A  2°B  3°A  3°B  Kinder A  …       │   bandeja
│ Cub 1  Cub 2  Cub 3  …                          │
└─────────────────────────────────────────────────┘
```

La capa se deriva del tipo de equipo: `isp` → 0; `firewall` y `router` → 1;
`switch` → 2; `patchpanel` → 3; espacios, cubículos y `ap` → 4. Dentro de cada capa
los nodos se ordenan por la posición horizontal de su vecino de la capa anterior, y
los que no tienen vecino arriba van al final por orden de `id`. Es un criterio
estable y suficiente para estas cinco capas; no se implementa un algoritmo de
reducción de cruces.

FORTINET y MIKROTIK se dibujan como isla aparte, que es lo que son en los datos.
Cada equipo dibuja sus puertos con el número visible. Las etiquetas usan escala
inversa al zoom, de modo que los nombres se leen a cualquier acercamiento. Los
puntos sin puerto salen del lienzo y entran a la bandeja, agrupados por categoría.

Fuera de alcance: arrastrar nodos y persistir posiciones. El layout es calculado,
así que las posiciones no son dato del usuario.

## C. Interacción

Un solo estado de selección gobierna el resaltado y la creación de enlaces.

**Seleccionar y resaltar.** Clic simple en cualquier nodo —puerto, espacio,
cubículo o equipo— lo selecciona y dibuja la ruta hacia el ISP en tres niveles:

- **ruta**: trazo fuerte sobre las aristas y nodos del camino;
- **alcance**: tinte tenue en lo alcanzable que no está en la ruta;
- **fuera de alcance**: gris.

Donde la ruta se interrumpe va una marca de corte. Sobre el lienzo, una barra fija
muestra la cadena en texto (`R3/PP1 p01 → R3/SW1 p01 → …`), con el botón *Copiar*
que ya existe en el buscador, y el motivo cuando no llega al ISP. Cada salto de la
barra es clicable y centra ese nodo.

**Conectar.** Modo *Consultar / Conectar* en la barra, con *Consultar* por defecto
para no crear enlaces por accidente al explorar. En modo Conectar, el primer clic
sobre un origen válido —un puerto `libre` o `desconocido`, o una tarjeta de la
bandeja— arma la conexión y dibuja una línea punteada hacia el cursor; el segundo
clic la cierra. Mientras está armada, los destinos inválidos se atenúan y `esc`
cancela.

En modo Conectar, el clic sobre algo que no puede ser origen —un puerto `ocupado`
o `dañado`, un equipo sin puertos— se comporta igual que en Consultar: selecciona
y traza. El resaltado no depende del modo, y la selección previa se conserva
mientras hay una conexión armada.

La creación reutiliza `asignarRapido()` de `app/red/page.tsx:98`, así que hereda el
guardado optimista, el toast de error, el reintento de carga y el registro en
bitácora sin código de red nuevo. La validación sigue siendo la del servidor en
`app/api/red/enlaces/route.ts`.

**Doble clic abre la ficha**, que es lo que hoy hace el clic simple. El clic simple
queda para seleccionar y trazar, que es la acción frecuente.

## D. Trazado

`trazarCadena()` devuelve dos campos nuevos:

- `camino: string[]` — la ruta cruda, con los puertos intermedios que `presentar()`
  colapsa y los nodos `eq:`. Sin ella el diagrama no puede saber qué aristas
  encender: la cadena presentada muestra `R3/SW1 p01 → R2/SW1 p20` y oculta el
  puerto de uplink real, `R3/SW1 p26`.
- `alcanzables: Set<string>` — para el tinte tenue. Sale del BFS que ya se ejecuta.

`saltos`, `completa` y `motivo` no cambian, así que la ficha, el buscador y sus
pruebas siguen iguales.

`masLejano()` se mantiene. La vista de flujo no lo usa —usa `alcanzables` y la
marca de corte— y modificarlo alteraría el texto que hoy muestran la ficha y el
buscador, que no es parte de este trabajo.

**No se tocan los datos.** El ISP queda dibujado como nodo huérfano, con la marca
de corte en `R1/PP1 p23`. Cuando el parcheo real se verifique en el rack, se
documenta con el mismo clic-clic del diagrama y las cadenas se completan solas.

## E. Estructura

`app/red/diagrama.tsx` tiene hoy 145 líneas que mezclan pan/zoom, geometría y
dibujo. Sumarle capas, resaltado y conexión lo volvería inmanejable, así que se
separa en tres piezas con un límite claro:

| archivo | responsabilidad | depende de |
|---|---|---|
| `lib/red/layout.ts` | puro: estado → nodos, aristas, capas y bandeja | `modelo.ts` |
| `app/red/diagrama.tsx` | lienzo: pan, zoom, modos, eventos, selección | `layout.ts`, `trazado.ts` |
| `app/red/diagrama-nodos.tsx` | dibujo SVG de nodos y aristas | `layout.ts` |

`layout.ts` no toca el DOM y se puede probar directamente. `diagrama-nodos.tsx`
recibe posiciones y estilos ya resueltos: no calcula geometría ni conoce el
trazado.

## F. Pruebas

TDD, con el runner que ya usa el proyecto (`node --test`, `npm test`).

`tests/layout.test.ts` (nuevo):

- cada equipo cae en la capa que le corresponde por tipo;
- dos nodos de la misma capa no se solapan;
- los 99 puntos sin puerto van a la bandeja y ninguno queda en el flujo;
- los espacios con puerto sí quedan en el flujo, bajo su patch panel;
- FORTINET y MIKROTIK quedan como isla, sin arista hacia el ISP.

`tests/trazado.test.ts` (ampliación):

- `camino` incluye los puertos que `presentar()` colapsa, con el uplink real;
- `alcanzables` no contiene `pto:ISP-p0` con los datos actuales;
- `saltos`, `completa` y `motivo` no cambian de forma.

Verificación manual: abrir la captura y comprobar que el `.net-seg` se ve como
segmentos y no como círculos; escribir `3 basico b` y ver `3° Básico B`; escribir
`xyz` y ver el aviso; en el diagrama, seleccionar `UTP E. Básica` y ver la ruta
resaltada con la marca de corte; en modo Conectar, asignar un espacio de la bandeja
a un puerto libre y confirmar que aparece en la bitácora.

## Errores

Los errores de red ya los maneja `conGuardado()` y el toast de `page.tsx`; el
diagrama no agrega manejo propio. Si un enlace falla, el optimismo se revierte
como hoy. Si `trazarCadena` recibe un origen inexistente, devuelve cadena vacía con
motivo, y la barra muestra ese motivo sin resaltar nada.
