# Legibilidad del diagrama de la red

Fecha: 2026-07-30
Estado: propuesto

## Problema

El diagrama se dibuja, responde al clic y traza la cadena, pero no se entiende.
La causa es una sola y es geométrica.

`construirLayout()` dimensiona cada equipo por sus puertos, a 34 unidades cada
uno. Con los datos actuales eso da **5952 unidades de ancho** en la capa de patch
panels y 5506 en la de switches, contra **862 de alto** en total: un lienzo de 7:1
metido en un viewport de 2.4:1. `ajustar()` calcula
`min(ancho/W, alto/H)` y cae a **escala 0.25**, donde:

- la tipografía pasa a 52 unidades de layout, así que en una hoja de 190 caben
  seis caracteres y las etiquetas se imprimen como `Pro…`, `For…`, `UTP…`;
- el contenido ocupa una franja de ~215 px y sobran ~400 px de blanco arriba y
  abajo;
- las 98 aristas a `opacity:.18` desaparecen;
- los 331 puertos se leen como una barra continua de rayitas, sin que se
  distinga R1 de R2 de R3.

Encima, `isla` pinta en rojo. Como ninguna cadena llega al ISP, medio dibujo sale
rojo y el rojo deja de avisar. Y los ocho colores en uso —cuatro estados de
puerto, cuatro tipos de enlace— no están explicados en ninguna parte.

El recorte de etiquetas de `recortar()` no es el defecto: es el síntoma correcto
de un zoom imposible.

## Hallazgos en los datos

Cuatro hechos medidos sobre `lib/red/semilla.json` que sostienen el diseño.

**El patcheo es 100 % intra-rack.** De los 89 enlaces `patch`, 7 son R1↔R1, 54 son
R2↔R2 y 28 son R3↔R3. Ninguno cruza de rack. Solo dos enlaces van de un rack a
otro, y los dos son uplinks: `R1/SW1 p23 ↔ R2/SW1 p24` y `R2/SW1 p20 ↔ R3/SW1 p26`.
El tercer uplink, `R3/SW1 p28 ↔ R3/SW2 p28`, es interno a R3. Agrupar por rack no
es cosmético: es la estructura real del cableado.

**Los 98 enlaces son 16 pares de equipos.** Agregados por par, el más cargado es
`R2/SW3 ══ R2/PP3` con 24. Dibujar 16 aristas en vez de 98 permite subir la
opacidad hasta que se vean sin que el lienzo se convierta en una maraña.

**Los 24 puertos de R1/PP1 están en `desconocido`, no en `libre`.** Es un dato que la
vista debe mostrar —el panel entero está sin verificar—, pero **no** es la causa de
que las cadenas no lleguen al ISP. La causa es la que ya documentaba el spec
anterior, y se confirma en los datos: `pto:R1-PP1-p23` tiene un único enlace, hacia
`pto:ISP-p0`, y no está parcheado a ningún puerto de switch. Como `patchpanel` no
está en `conChasis` (`lib/red/trazado.ts:7`), los puertos de un panel no se
conectan entre sí, así que el BFS entra a p23 y se queda ahí. Los otros siete
puertos de R1/PP1 sí van a R1/SW1, pero por p23 no se pasa.

**Hay dos APs sin ningún enlace** (Área Financiera, Dirección) y **un patch panel
sin ningún enlace** (R3/PP2, 24 puertos libres). Hoy los tres se dibujan en rojo
en el lienzo sin informar nada.

## Decisiones

| Asunto | Decisión |
|---|---|
| Estructura del lienzo | Tres zonas de rack en el orden de los uplinks, capas dentro de cada zona |
| Crecimiento de los destinos | Se apilan hacia abajo, bajo el equipo del que cuelgan |
| Detalle de los puertos | Tarjeta cerrada por defecto; se abre con un clic, sin umbral de zoom |
| Aristas | Agregadas por par de equipos; se desagregan cuando ambas puntas están resueltas |
| Rótulo de la tarjeta | Solo el código (`R2/SW1`); el nombre completo queda en el `<title>` y en la ficha |
| Rojo | Reservado para fallas; ámbar para falta de información |
| Tipografía | Escala con el diagrama; se borra el escalado inverso y el recorte |
| Encuadre | `ajustar()` ajusta solo al ancho; el alto se navega arrastrando |

La meta declarada es documentar los 61 espacios y los 40 cubículos, así que la
capa de destinos pasará de 6 a ~105 nodos. A 190 unidades cada uno eso serían
20.000 de ancho: «que todo quepa en pantalla» no vuelve nunca. Por eso la
agregación es el estado por defecto y no una optimización.

## A. Layout por rack

Tres zonas, en el orden en que los uplinks las encadenan —R1 → R2 → R3—, no por
orden de `id`. El recorrido arranca en el rack del equipo que recibe el enlace
`borde` (R1, por `ISP ══ R1/PP1`) y sigue los uplinks hacia afuera. Un rack al que
no se llegue por uplinks va al final, por orden de `id`; hoy no hay ninguno, pero la
regla tiene que estar escrita para que el orden sea siempre determinista.

```
┌ BORDE · SALIDA A INTERNET ─────────────────────────────────────┐
│   ISP        FORTINET ┈┈ MIKROTIK   (sin ruta)                 │
└────────────────────────────────────────────────────────────────┘
        │ borde  →  ╳ R1/PP1 p23 sin parchear a ningún switch
┌ RACK 1 ─────┐        ┌ RACK 2 ───────────────┐      ┌ RACK 3 ──────────────┐
│ R1/SW1 8/24 │ uplink │ R2/SW1  R2/SW2  R2/SW3│uplink│ R3/SW1      R3/SW2   │
│    ×7       │══════▶ │  ×11     ×19     ×24  │═════▶│  ×13    ×12  ×3      │
│ R1/PP1  ┈┈  │        │ R2/PP1  R2/PP2  R2/PP3│      │ R3/PP1  R3/PP2  R3/PP3│
│             │        │ ·UTP E. Básica        │      │         (sin enlaces)│
│             │        │ ·PIE Administrativo   │      │ ·AP Sala de Profesores│
└─────────────┘        └───────────────────────┘      └──────────────────────┘
```

Dentro de cada zona se conservan las capas que ya existen: switches arriba, patch
panels abajo, destinos apilados bajo el equipo del que cuelgan. Los destinos
cuelgan de patch panels (los espacios, por `roseta`) o directamente de switches
(los APs conectados: `R2/SW1 p22`, `R3/SW2 p24`). Crecer a 105 destinos alarga el
dibujo hacia abajo; el ancho se queda en ~1200 unidades de forma permanente, porque
los nombres de sala son cortos y lo que crece es el apilado.

**La banda de borde** aloja al ISP, FORTINET y MIKROTIK, que en los datos tienen
`rack: ""` y estructuralmente son las capas 0 y 1.

**Los dos APs sin enlace salen a la bandeja**, junto a los 99 puntos sin puerto: son
lo mismo —algo que todavía no se conectó— y la bandeja ya es el origen para
conectar. Entran en un grupo propio, `Equipos sin enlace`, al lado de los que ya
existen (`Salas`, `Oficinas`, `Otros`, `Cubículos`). **R3/PP2 se queda en el rack 3**
aunque no tenga enlaces, porque es fierro que está físicamente ahí: se marca, no se
muda.

## B. Nivel de detalle

**Cerrada** es el estado por defecto de toda tarjeta. Muestra **solo el código** del
equipo —`R2/SW1`, `R2/PP2`—, la ocupación (`19/24 ocupados`) y los estados que piden
acción como chips: `4 dañados` en R2/PP2, `24 sin verificar` en R1/PP1.

El código solo, y no el rótulo completo, porque los rótulos reales de la semilla no
caben: `R2/SW1 · Switch 1 | Gigabit 24p Smart` pide 321 unidades, y con esos anchos
el layout cerrado da 2090 y la escala de ajuste 0.67 — la misma ilegibilidad de hoy
con otra forma. Con el código solo, cada tarjeta parte de un mínimo de 120
unidades, el total baja a **~1200** y la escala de ajuste sube a **~1.1**. Dentro de
una zona rotulada `RACK 2 · Sala Enlace`, el `R2/` ya es redundante y el modelo del
equipo no aporta a la lectura del cableado. El rótulo completo sigue en el `<title>`
del nodo —que ya existe— y en la ficha, que abre con doble clic.

El ancho de una columna es el mayor entre su tarjeta y el destino más ancho que
cuelga de ella, porque los destinos se apilan debajo: `PIE Administrativo` pide 181
unidades y su columna se ensancha a eso.

**Abierta** muestra los puertos numerados en rejilla de **12 por fila**, como el
serigrafiado de un panel: 1-12 arriba, 13-24 abajo. Los switches de 28 puertos
ocupan tres filas, 12 + 12 + 4, con la última fila alineada a la izquierda; el
ancho de la tarjeta no depende de cuántos puertos tenga. Abierta mide 424 unidades
de ancho en vez de 830, así que abrir varias no reconstruye el problema. Con las 13
tarjetas abiertas a la vez el lienzo llega a ~3300 —bastante menos que los 5952 de
hoy— y solo si el usuario lo pide.

Cuatro reglas:

- **Abrir es explícito, no por umbral de zoom.** Un umbral obliga a inventar un
  número y hace que el dibujo se reorganice solo mientras se hace zoom, que
  desorienta. Un clic es predecible.
- **Se pueden abrir varias a la vez.** Enlazar puerto a puerto exige ver las dos
  puntas. El estado es un `Set<string>` de ids de equipo, con un `cerrar todo` en
  la barra. Ninguna abierta al cargar.
- **El reflow es local.** Los racks son columnas independientes: abrir una tarjeta
  de R2 no mueve ninguna tarjeta de R1 ni de R3. Dentro de la zona solo bajan los
  destinos de esa columna.
- **En modo conectar, el clic en una tarjeta cerrada la abre** en vez de
  seleccionarla; ahí el objetivo siempre es un puerto, nunca el chasis.

## C. Aristas

Al nivel general, una arista por par de equipos, con la cuenta escrita (`×24`) y
grosor `2 + log₂(n)` acotado a 2–7 unidades. Los 98 enlaces se dibujan como 16
aristas.

Un par **se desagrega cuando las dos puntas están resueltas**, donde «resuelta»
significa abierta o sin rejilla que abrir. Un destino —espacio, cubículo, AP— no
tiene puertos que mostrar, así que su borde de tarjeta ya es el punto correcto al
que llegar: con el panel abierto, la roseta apunta a `p19` en un extremo y al borde
de `UTP E. Básica` en el otro. Entre dos equipos con rejilla, en cambio, hace falta
que ambos estén abiertos; media desagregación dejaría líneas llegando a un borde de
tarjeta sin puerto al que apuntar.

Las aristas intra-rack conservan la curva vertical actual. Los uplinks entre racks
se dibujan como una línea horizontal a la altura de la fila de switches, entrando y
saliendo por el costado de la zona, en vez de una curva que atraviese las tarjetas.

## D. Color

El reparto pasa a tener un significado por familia, con los tokens que ya existen
en `app/globals.css`.

| Marca | Significa | Token |
|---|---|---|
| Relleno azul | Puerto ocupado | `--green` #294f7c |
| Blanco con borde | Puerto libre | `--surface` / `--line` |
| Punteado ámbar | Sin verificar | `--warning` #986900 |
| Relleno rojo | Dañado | `--red` #a33442 |
| Borde punteado ámbar | Sin ruta al ISP | `--warning` |

**Ámbar es falta de información; rojo es una falla.** Hoy `isla` es rojo y, como nada
llega al ISP, el rojo aparece en la mitad del dibujo. Con este reparto los únicos
rojos del lienzo con los datos actuales son los 4 puertos dañados de R2/PP2.

Los cuatro tipos de enlace conservan su color salvo uno: **`borde` deja de ser gris**
—el color más débil para el enlace más importante— y pasa a `--ink`, el trazo más
pesado del dibujo. `uplink` sigue en `--orange`, `patch` en `--green`, `roseta` en
`--ok`.

La opacidad se invierte respecto de hoy:

| Situación | Opacidad |
|---|---|
| Nada seleccionado | 0.5 — se ve la trama entera |
| En la ruta | 1, con más grosor |
| Alcanzable | 0.5 |
| Fuera de alcance | 0.12, solo cuando hay algo seleccionado |

Seleccionar **apaga lo que no viene al caso**, en vez de que el estado normal sea
invisible. Nótese que «nada seleccionado» y «alcanzable» comparten el 0.5: no son
dos niveles, es el mismo nivel de base. En el CSS eso es una clase
`sel-activa` en el `<g>` raíz que baja `.net-d-link` a 0.12, sobre la que `.alcance`
vuelve a 0.5 y `.ruta` a 1. Sin selección la clase no está y todo queda en 0.5, con
una sola regla en vez de recalcular la opacidad por arista.

**Leyenda fija** de una línea bajo el lienzo, con los cuatro estados de puerto, los
cuatro tipos de enlace y las dos marcas (sin ruta, corte). No se esconde detrás de
un clic: es la clave de todo el código de color.

## E. Tipografía y encuadre

**Se borra el escalado inverso.** Hoy `tipografia = 13 / escala` mantiene el texto a
13 px de pantalla, y eso es la raíz del recorte: a escala 0.25 el texto ocupa 52
unidades de layout y no cabe en un nodo de 190. El texto pasa a medir **15 unidades
fijas** y a escalar con el diagrama, como en un mapa.

El número sale de la cuenta al revés: el lienzo mide ~1530 px de ancho, el layout
cerrado ~1200 unidades más los 180 de margen, así que la escala de ajuste queda en
**~1.1** y 15 unidades se dibujan a ~16 px. Legible sin tocar el zoom, que es todo
lo que se le pide.

Con eso, el ancho de una tarjeta se calcula desde su texto:
`max(120, largo × 15 × 0.55 + 16)`, usando la misma aproximación de 0.55 em por
carácter que ya está en el código, pero al revés. Sin DOM, determinista y
comprobable en una prueba. **`recortar()` se elimina de
`app/red/diagrama-nodos.tsx`** y `ANCHO_CARACTER` se muda a `lib/red/layout.ts`,
donde ahora dimensiona en vez de recortar.

**`ajustar()` ajusta solo al ancho**, acotado a 0.55–1.15 y centrado
horizontalmente. En vertical **centra si el dibujo cabe y lo pega arriba si no
cabe**: con los datos de hoy el contenido mide ~370 unidades y sobra alto, así que
centrarlo evita el blanco desbalanceado; cuando los destinos crezcan dejará de
caber y entonces empezar por la banda del ISP es lo correcto. El diagrama se lee de
arriba hacia abajo, así que crecer en alto y navegar arrastrando es natural; crecer
en ancho no lo era. El pan y el zoom actuales no cambian.

## F. Estructura

`construirLayout(estado)` pasa a `construirLayout(estado, abiertas)`: una función
pura del estado **y** del conjunto de tarjetas abiertas. El reflow local deja de ser
una mutación imperativa y es un recálculo.

| archivo | responsabilidad | estado |
|---|---|---|
| `lib/red/layout.ts` | zonas de rack, tarjetas, geometría, bandeja | se reescribe |
| `lib/red/aristas.ts` | agregación y desagregación de enlaces | nuevo |
| `app/red/diagrama.tsx` | lienzo: pan, zoom, modos, selección, abiertas | se amplía |
| `app/red/diagrama-nodos.tsx` | dibujo SVG de tarjetas, puertos y aristas | se amplía |
| `app/red/diagrama-leyenda.tsx` | la tira de leyenda | nuevo |

El corte entre `layout.ts` y `aristas.ts` es geometría contra enlaces. Hoy
`layout.ts` tiene 146 líneas; sumarle zonas, dimensionado por texto y agregación lo
llevaría a ~300 y a dos responsabilidades sin relación.

Un detalle que sostiene el resaltado: **`anclasDeLayout` resuelve el ancla de un
puerto de tarjeta cerrada al centro de la tarjeta.** `trazarCadena()` devuelve un
`camino` de ids de puerto, así que sin esa caída la ruta no ilumina nada en el
estado por defecto, que es todo cerrado.

**No se toca el modelo de datos ni la API.** `trazarCadena()`, `lib/red/modelo.ts`,
`app/api/red/*` y la semilla quedan igual. Todo el cambio es de presentación.

## G. Pruebas

TDD con el runner del proyecto (`node --test`, `npm test`).

`tests/layout.test.ts` (se amplía el existente):

- las zonas salen en el orden de los uplinks (R1, R2, R3), no por `id`;
- con todo cerrado, el ancho total no pasa de 1400 unidades;
- abrir una tarjeta de R2 no cambia la `x` de ninguna tarjeta de R1 ni de R3;
- una tarjeta cerrada mide al menos el ancho de su código y nunca menos de 120;
- una columna se ensancha al destino más ancho que cuelga de ella;
- una tarjeta abierta mide 12 columnas, tenga 24 o 28 puertos;
- los 2 APs sin enlace van a la bandeja y R3/PP2 se queda en el rack 3 marcado;
- FORTINET y MIKROTIK quedan en la banda de borde, marcados sin ruta;
- el ancla de un puerto de tarjeta cerrada cae en el centro de la tarjeta.

`tests/aristas.test.ts` (nuevo):

- los 98 enlaces de la semilla se agregan a 16 aristas;
- el par `R2/SW3 ══ R2/PP3` lleva cuenta 24;
- con ambas puntas abiertas, ese par se desagrega en 24 aristas puerto a puerto;
- entre dos equipos con rejilla, una punta abierta y la otra cerrada sigue agregada;
- con el panel abierto, la roseta hacia un espacio sí se desagrega, porque el
  espacio no tiene rejilla que abrir.

`tests/trazado.test.ts`: sin cambios. `camino`, `alcanzables`, `saltos`, `completa`
y `motivo` no cambian de forma, así que la ficha y el buscador siguen iguales.

Verificación manual: abrir `/red` → DIAGRAMA y comprobar que la escala de ajuste
queda cerca de 0.85 con las etiquetas enteras; seleccionar UTP E. Básica y ver la
ruta resaltada, con las tarjetas cerradas, terminando en la marca de corte; abrir
R2/PP2 y ver sus 4 puertos dañados en rojo, y R1/PP1 con sus 24 punteados en
ámbar; en modo conectar, abrir un panel y asignarle un espacio de la bandeja.

## Fuera de alcance

- Arrastrar tarjetas y persistir posiciones. El layout es calculado.
- Minimapa y exportación del diagrama.
- Reducción de cruces con un algoritmo real; el orden por vecino de la capa
  anterior se conserva.
- Umbral de zoom que abra tarjetas automáticamente.
- Tocar los datos de la semilla. El hueco hacia el ISP —`R1/PP1 p23` sin parchear— y
  los 24 puertos sin verificar de ese panel se muestran como lo que son; se
  resuelven verificando el rack y registrando el parcheo con el clic-clic que ya
  existe, no editando el JSON.
- Cambiar `conChasis` para que los patch panels puentearan sus propios puertos.
  Sería inventar cableado: un panel no conecta p23 con p01 por sí solo.

## Errores

Sin manejo propio. Los errores de red los siguen manejando `conGuardado()` y el
toast de `app/red/page.tsx`; si un enlace falla, el optimismo se revierte como hoy.
Si `trazarCadena` recibe un origen inexistente, la barra muestra el motivo sin
resaltar nada.
