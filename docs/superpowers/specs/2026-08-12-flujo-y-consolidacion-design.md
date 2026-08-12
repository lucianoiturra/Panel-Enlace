# Diagrama de flujo, aire interno y consolidación de pestañas

Fecha: 2026-08-12
Estado: propuesto

## Problema

Cuatro síntomas, tres causas distintas.

**1. Al texto le falta aire contra el borde de su caja.** `globals.css` tiene hoy
paddings de 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 25, 27 y 28
píxeles conviviendo, elegidos uno por uno a medida que cada bloque se escribía. No
hay escala: hay un historial. Y como cada valor se eligió mirando su propia caja y
nunca el conjunto, los que quedaron bajos —las celdas de `mon-table` a `9px 12px`,
las de `net-table` a `6px 8px`, las filas de espacio a `9px 12px`— dejan el texto
pegado al filo.

**2. En las tarjetas de espacio, el texto se solapa.** `.net-space-card-foot` es un
flex con `justify-content:space-between` y dos hijos —`.net-space-state` y
`.net-space-connection`— que llevan `white-space:nowrap` y conservan el
`min-width:auto` por defecto de un ítem flex. No pueden encoger. En una tarjeta
angosta los dos desbordan su caja y se pintan encima: se lee `MANUAL` montado sobre
`Sin documentar`, y `AUTO` sobre `Wifi Área Financiera`.

El `text-overflow:ellipsis` que `.net-space-connection` declara para defenderse
**nunca funcionó**: está aplicado sobre un contenedor `display:flex`, donde no
tiene efecto. La regla existe, se lee como protección, y no protege nada.

**3. El diagrama de la red desborda la pantalla y se cruza consigo mismo.**
`construirLayout()` reparte una zona por rack, colocadas de izquierda a derecha, y
dentro de cada zona pone los destinos en columnas colgando de su equipo padre. El
ancho del lienzo es la suma de los anchos de las zonas: **cada rack nuevo lo
alarga**, y abrir una tarjeta lo alarga otra vez. Con tres racks el diagrama ya
arranca a escala 0.6 y no cabe. Peor: como las aristas van entre anclas libres, una
cinta puede ir hacia la izquierda, cruzar por encima de dos zonas y volver. Cuando
se destaca un puerto, la ruta iluminada compite con el ruido de todas las demás.

**4. La información de un cubículo vive en dos pestañas.** El plano de SALA dice lo
documentado (`OK` / `!` / `×` / `—` / `∅`) y la tabla «Cubículos vs red viva» de
MONITOREO dice lo vivo (`en línea` / `IP distinta` / `sin verse`). Son dos señales
del mismo objeto y para cruzarlas hay que cambiar de pestaña y buscar el número a
mano.

## Hallazgos en los datos

Medidos contra la base viva de cabserver el 2026-08-12, no deducidos.

**La cadena de uplinks son tres enlaces.** `R1/SW1 ↔ R2/SW1`, `R2/SW1 ↔ R3/SW1`,
`R3/SW1 ↔ R3/SW2`. Los de borde son otros tres: `FORTINET ↔ ISP`,
`FORTINET ↔ R1/SW1` y `AP-cab-enlace ↔ FORTINET`. Todo lo demás —de 78 enlaces— es
patch y roseta dentro de un rack.

Esto decide el diseño del diagrama. Si las capas se calcularan por distancia al ISP
—lo que haría un Sankey de manual— la cadena de uplinks se desplegaría en columnas:
`R1/SW1` a profundidad 2, `R2/SW1` a 3, `R3/SW1` a 4, `R3/SW2` a 5. **Cuatro
columnas de switches hoy, y una más por cada switch que se sume a la cadena.** Es
exactamente el defecto que se viene a arreglar, con otra fórmula. Por eso las capas
son semánticas y fijas, y los uplinks se dibujan *dentro* de una columna.

**El inventario cabe en cuatro columnas.** 25 equipos: 1 ISP, 1 firewall, 1 router,
6 switches, 7 patch panels, 9 AP. Más 52 espacios y 40 cubículos. La columna más
poblada es la de destinos con 92 elementos, y es la que se agrupa.

**El equipo más grande tiene 28 puertos.** A 12 columnas por fila, son 3 filas.
Ninguna tarjeta abierta necesita más.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Espaciado | Escala global de tokens, subiendo un paso donde el texto queda pegado |
| Modelo del diagrama | Flujo por capas + tira del circuito arriba |
| Capas | Semánticas y fijas, **no** por distancia al ISP |
| Agrupación de destinos | Por tipo de espacio |
| Modos del diagrama | CONSULTAR, CONECTAR y ORDENAR se conservan enteros |
| MONITOREO | Se disuelve por completo, en este mismo trabajo |
| Rama | Rama nueva sobre `main`; no se commitea a `main` |

---

## 1 · Escala de espaciado

En `:root` de `app/globals.css`:

```css
--esp-1:4px; --esp-2:8px; --esp-3:12px; --esp-4:16px; --esp-5:24px; --esp-6:32px;
```

Las tres reglas que deciden qué token va dónde:

- Una caja con borde o fondo propio: `--esp-4` horizontal, `--esp-3` vertical como
  mínimo.
- Una celda de tabla: `--esp-3 --esp-4`.
- Un contenedor grande —drawer, modal, sección de página—: `--esp-5`.

Los cambios que el ojo va a notar, que son los que el problema pide:

| Selector | Hoy | Queda |
| --- | --- | --- |
| `.mon-table th,td` | `9px 12px` | `--esp-3 --esp-4` |
| `.net-table th` | `7px 8px` | `--esp-2 --esp-3` |
| `.net-table td` | `6px 8px` | `--esp-2 --esp-3` |
| `.net-space-row` | `9px 12px` | `--esp-3 --esp-4` |
| `.net-space-card` | `12px` | `--esp-4` |
| `.net-card` | `9px 10px` | `--esp-3 --esp-4` |
| `.wol-linea` | `13px 16px` | `--esp-4 --esp-5` |
| `.net-rack-head` | `13px 15px` | `--esp-4 --esp-5` |
| `.net-chip` | `3px 8px` | `--esp-1 --esp-3` |
| `.net-eq-id`, `.net-eq-puertos` | `9px 11px` | `--esp-3 --esp-4` |

**La excepción, que es la parte importante de esta sección.** Quedan **fuera** del
barrido los elementos cuyo tamaño *es* su geometría, porque subirles el padding
rompe una cuadrícula: `.station` (58px de alto, 10 por fila, es el plano de la
sala), `.net-pt` y `.net-strip` (la tira de puertos), `.wol-dias button` (36×36),
`.brand-mark`, `.icon-button`, `.task-check`, `.task-delete` y los mínimos de 44px
de `@media(pointer:coarse)`. Se listan explícitamente en un comentario del CSS para
que el próximo barrido no se los lleve por delante.

Alcance: solo `app/globals.css`. Cero cambios en TSX.

## 2 · El solapamiento de las tarjetas de espacio

El arreglo ataca la causa —dos hijos que no encogen— y de paso repara el ellipsis
que nunca funcionó.

**`.net-space-card-foot` pasa de flex a grid de una columna.** Estado arriba,
conexión abajo, `gap:var(--esp-2)`. Dos elementos que ya no comparten fila no
pueden solaparse a ningún ancho, y la tarjeta gana la altura que ya tenía de sobra
(`min-height:116px` para tres líneas de contenido).

**El texto de la conexión se envuelve en su propio `<span>`.** En
`app/red/vista-espacios.tsx:70-75`, `conexion()` devuelve hoy el texto suelto
dentro del contenedor flex. Pasa a:

```tsx
<span className="net-space-connection documented">
  <i aria-hidden="true">↳</i>
  <span className="net-space-connection-texto">{datos.conexion}</span>
</span>
```

y el truncado (`min-width:0; overflow:hidden; text-overflow:ellipsis;
white-space:nowrap`) se muda del contenedor flex al `<span>` interior, que sí es un
contexto donde `text-overflow` aplica.

**`.net-space-state` recibe `flex-wrap:wrap` y `min-width:0`**, para que la
insignia `AUTO`/`MANUAL` caiga bajo el chip de estado en vez de empujarlo.

**En la vista lista**, entre 1000px y 760px, `.net-space-row` sufre lo mismo con
menos margen: las columnas `Estado` y `Conexión` comparten una rejilla de anchos
`minmax()` que no reserva lo suficiente. Recibe el mismo `<span>` interior y
`min-width:0` en las celdas.

**Criterio de aceptación:** una tarjeta de espacio a 250px de ancho —el mínimo de
`grid-template-columns:repeat(auto-fit,minmax(250px,1fr))`— con el nombre más largo
del inventario y una conexión documentada, no solapa ningún texto.

## 3 · El diagrama pasa a ser un flujo por capas

### Las capas

Cuatro, semánticas y fijas, de izquierda a derecha:

| Capa | Qué contiene |
| --- | --- |
| `borde` | `isp`, `firewall`, `router` |
| `switches` | `tipo === "switch"` |
| `patch` | `tipo === "patchpanel"` |
| `destinos` | espacios, cubículos y AP con enlace |

Los AP van siempre a `destinos`, incluido `AP-cab-enlace`, que cuelga directo del
FORTINET. Su cinta salta de `borde` a `destinos` por encima de dos columnas: es
larga, pero va hacia adelante, y refleja el hecho real de que ese AP no pasa por
ningún switch.

Una arista siempre va de una capa a otra posterior, o se queda dentro de una capa.
**Ninguna cinta va hacia atrás.** Es lo que elimina la mayor parte del ruido de hoy.

Las aristas intra-capa —los tres uplinks switch↔switch— se dibujan por un riel
vertical al costado izquierdo de su columna, no por el medio del lienzo, para que la
cadena `R1/SW1 → R2/SW1 → R3/SW1 → R3/SW2` se lea como una cadena y no como tres
cables sueltos.

Los racks no desaparecen: sobreviven como **subgrupos rotulados dentro de la
columna** (`RACK 2 · SALA ENLACE`), que es donde el patcheo real ocurre —los tres
racks son 100 % intra-rack salvo los tres uplinks.

### El ancho no cambia nunca

Es la propiedad que arregla el problema de fondo, y se consigue con una regla:

> Cada columna reserva de entrada el ancho de su tarjeta más ancha **abierta**,
> calculado desde los datos y no desde qué esté abierto en este momento.

Con `COLUMNAS_PUERTO = 12` y `ANCHO_PUERTO` bajando de 34 a **24**, una tarjeta
abierta mide `12·24 + 16 = 304` en vez de los 424 de hoy. Achicar la celda de puerto
es el precio de que la columna pueda reservar su ancho máximo sin desbordar; a 24
unidades una celda todavía admite dos dígitos a 11px de mono con holgura.

El lienzo queda en torno a 1250 unidades de ancho —borde ~160,
switches 304, patch 304, destinos 300, más los canales entre columnas— contra los
1420 del `shell`. Cabe a escala 1.

Abrir un equipo **solo empuja hacia abajo a sus vecinos de columna**. `ajustar()`
deja de pelear con un lienzo que cambia de forma bajo sus pies, y el zoom deja de
ser obligatorio para leer una etiqueta.

### El orden vertical

Dos capas de decisión, en este orden:

1. **`estado.orden` manda.** El orden manual que ya existe se aplica con el
   `ordenarPor()` de `lib/red/layout.ts:46`, sin cambios.
2. **Baricentro para el resto.** Cada nodo sin orden manual se posiciona en la
   media de las `y` de sus vecinos de la capa anterior, y se itera 2-3 pasadas. Es
   la heurística estándar de Sugiyama para reducir cruces, y es determinista: el
   mismo estado da siempre el mismo dibujo.

### Los 92 destinos

Se agrupan **por tipo de espacio** —la categoría que ya vive en la base y que
`etiquetaCategoria()` ya resuelve— más dos grupos propios: `Cubículos` (40) y
`Puntos de acceso Wi-Fi`.

- Colapsados por defecto, con su contador.
- Colapsado, las cintas de sus miembros se agregan en una sola, de grosor
  proporcional al número de miembros conectados.
- Al aislar un circuito, **el grupo que contiene el destino se abre solo**, igual
  que hoy `equiposDeRuta` abre las tarjetas de la ruta
  (`app/red/diagrama.tsx:66-69`).

### La tira del circuito

Encima del lienzo, a todo el ancho: el recorrido completo del punto seleccionado,
del ISP al destino, en chips con el puerto de cada salto. Ya existe: es
`gruposCadena` (`app/red/diagrama.tsx:48`) alimentado por `trazarCircuito()`. Sube
de ser una línea entre el lienzo y los controles a ser el encabezado del diagrama,
y se mantiene legible aunque el lienzo esté alejado.

### Lo que se conserva sin tocar

CONSULTAR, CONECTAR y ORDENAR siguen enteros, incluido arrastrar una punta para
reenlazar. Sale barato porque **el layout no participa de la interacción**:
`alPunto`, `tomarPunta` y `soltarPunta` solo consultan el mapa `anclas`
(`id → {x,y}`), que el flujo publica igual que el layout actual. Lo único que cambia
es la orientación de las flechas de ORDENAR, que pasan de horizontales a verticales
porque el orden dentro de una columna ahora es vertical.

También se conservan: la bandeja de «sin puerto asignado» (74 puntos), el marcado
`sinRuta` de lo que no alcanza al ISP, la insignia de corte de cadena, la leyenda y
el modo pantalla completa.

### Archivos

| Archivo | Qué pasa |
| --- | --- |
| `lib/red/flujo.ts` | **nuevo**, puro: `EstadoRed` + abiertas → columnas, bloques, nodos, cintas, anclas |
| `tests/flujo.test.ts` | **nuevo** |
| `app/red/diagrama.tsx` | `construirLayout` → `construirFlujo`; la tira del circuito sube a encabezado |
| `app/red/diagrama-nodos.tsx` | dibuja columnas, bloques y cintas en vez de zonas y filas |
| `lib/red/aristas.ts` | se le añade el grosor agregado por par |
| `lib/red/layout.ts` | se retiran `construirLayout`, `anclasDeLayout`, `ordenDeZonas`, `destinosDe`; **sobreviven** `ordenarPor` (lo usa `inventario.ts:2`), `anchoDeTexto`, `codigoDeEquipo`, `resumenDePuertos` y las constantes de geometría |
| `tests/layout.test.ts` | se poda a lo que sobrevive |
| `app/globals.css` | `.net-d-zona` → `.net-d-columna` y `.net-d-bloque`; cintas |

---

## 4 · MONITOREO se disuelve

Al terminar, la pestaña no existe y cada dato vive en un solo lugar.
`app/nav-secciones.tsx` baja a tres pestañas y `/monitoreo` redirige a `/`. **Las
dos APIs se conservan** (`/api/monitoreo` y `/api/monitoreo/ubicaciones`): cambian
de consumidor, no de contrato.

### 4.1 · Cubículos vs red viva → SALA

**`lib/red/estado-cubiculo.ts`**, nuevo y puro, espejo exacto de
`estado-efectivo.ts`: cruza `Station[]` con `FilaCubiculo[]` y devuelve un
`CubiculoEfectivo` con `estadoVivo`, `ipReal`, `ultimaConexion` y `vistoHace`. La
regla de oro se hereda sin cambios: **lo vivo nunca sobrescribe lo documentado**,
solo se muestra al lado.

SALA pide `/api/monitoreo` en paralelo a `/api/room`, con su propio ciclo de 90 s
—el sidecar vuelca cada 3 minutos— mientras el de la sala sigue en 120 s. Los dos
ciclos ya respetan la regla de no refrescar con la ficha abierta.

Tres lugares en la interfaz:

- **El plano.** Cada puesto gana un punto redondo a la derecha con el estado vivo.
  El chip cuadrado de la izquierda sigue siendo el documentado. Son dos señales
  distintas de dos fuentes distintas y nunca se pisan ni se mezclan en un color.
- **El rail.** Una fila nueva bajo la de estados documentados: `en línea`,
  `IP distinta`, `sin verse`, `sin MAC`, con la marca de tiempo del último volcado.
  Los contadores filtran el plano igual que los documentados.
- **La ficha.** Un bloque `RED VIVA` con estado, IP documentada contra IP real,
  MAC, nombre que reporta NetAlertX y hace cuánto se vio.

**Guardia de frescura, no negociable.** Si `mon_devices` está vacía o su volcado
tiene más de 15 minutos, **no se pinta ni un punto** y el rail dice «sin datos de
red viva». Es el mismo guardia que RED ya aplica (`datosFrescos`), y existe por un
modo de falla real y documentado: los hallazgos B1 y B2 de
`revision-panel-enlace.md` describen dos formas en que el sidecar deja la tabla en
cero. Sin este guardia, un sidecar caído pinta 38 cubículos en rojo y manda a
alguien a revisar una sala que está bien.

### 4.2 · Estado por ubicación se borra; el testigo ya está en RED

**Corrección al diseño, hecha al leer el código antes de planificar: aquí no hay
nada que mudar. Ya está mudado.** El trabajo del 2026-08-11 lo dejó hecho:

- `app/red/page.tsx:103` ya pide `/api/monitoreo/ubicaciones`.
- `app/red/page.tsx:435-436` ya calcula `datosFrescos` y aplica `aplicarEstadoVivo`.
- `app/red/ficha.tsx:167-186` ya tiene el selector de dispositivo testigo, con sus
  candidatos, su explicación de qué decide el estado y su botón «Quitar testigo».
- `app/red/page.tsx:165` ya tiene el `PUT` que lo guarda.

Entonces la sección «Estado por ubicación» de MONITOREO no se muda: **es una copia
redundante y se borra con la pestaña**, sin escribir una línea en RED.

Lo único que queda por hacer de este punto es un arreglo de una línea que la
mudanza habría traído de todos modos: **el selector de testigo de la ficha guarda
en el `onChange` del `<select>`** (`app/red/ficha.tsx:179`), así que rozar el
desplegable reescribe de dónde sale el estado del espacio sin confirmación —el
hallazgo U7 de la revisión, que sobrevivió a la mudanza. Pasa a ser un campo con
**botón Guardar explícito**: el `<select>` solo cambia un estado local y el `PUT`
sale al presionar el botón.

### 4.3 · Sin documentar → SALUD

La tabla de MAC vivas que no están en ningún cubículo pasa a SALUD como un bloque
más, con su contador.

> **Objeción registrada, decidida en contra.** «Equipos vivos sin documentar» es
> levantamiento pendiente, no salud del servidor; encaja mejor junto a Cobertura en
> RED, que es donde vive «lo que falta documentar». Se planteó y se decidió llevarlo
> a SALUD igual. Queda escrito acá para que la próxima persona sepa que fue una
> elección y no un descuido.

---

## Errores y estados degradados

| Situación | Qué se ve |
| --- | --- |
| `/api/monitoreo` falla en SALA | El plano documentado normal, sin puntos vivos, y una línea «sin datos de red viva» en el rail. El plano nunca se bloquea por la capa viva. |
| `mon_devices` vacía o con más de 15 min | Idéntico al anterior. Nunca se infiere «apagado» de la ausencia de datos. |
| El estado no tiene ISP | La capa `borde` queda vacía y todos los nodos quedan `sinRuta`. El layout debe tolerar columnas vacías sin colapsar el ancho. |
| Un equipo sin puertos en una capa con rejilla | Se dibuja como aparato (`clase:"aparato"`), como hoy. |
| Guardar el testigo falla | El error aparece bajo el campo, el valor previo se restituye, la ficha no se cierra. |

## Pruebas

`node --test` sobre lo puro, siguiendo el patrón de `tests/`:

**`tests/flujo.test.ts`**

- cada tipo de equipo cae en su capa
- el ancho del lienzo es idéntico con todo cerrado y con todo abierto
- ninguna arista va de una capa a otra anterior
- los uplinks quedan marcados como intra-capa
- el baricentro produce menos cruces que el orden alfabético sobre la topología real
- `estado.orden` manda sobre el baricentro
- un estado sin ISP no lanza y deja todo `sinRuta`

**`tests/estado-cubiculo.test.ts`**

- el cruce por MAC coincide con `reconciliar()`
- un volcado de más de 15 minutos devuelve todos los estados vivos en nulo
- `mon_devices` vacía devuelve lo mismo, no «sin verse»
- un cubículo sin MAC documentada nunca queda «sin verse»

El CSS no lleva prueba automatizada. Verificación manual a **1440 / 1000 / 760 /
375 px**, más el criterio de aceptación de la sección 2.

## Fuera de alcance

- **Botón «Adoptar IP real»** en la ficha del cubículo. Cierra el lazo del drift de
  DHCP en un clic, necesita endpoint de escritura y entrada en bitácora, y es una
  funcionalidad nueva y no un arreglo de interfaz. Queda escrito como extensión
  natural de este trabajo.
- Cualquier arreglo de los hallazgos B1-B14 de `revision-panel-enlace.md`. El
  guardia de frescura de 4.1 los **tolera**; no los arregla.
- Tema oscuro, tipografía, paleta. La escala de espaciado no toca colores.

## Riesgos

**El diagrama es una reescritura, no un retoque.** `construirLayout` es el corazón
de la pestaña RED y tiene tres consumidores. La mitigación es que `lib/red/flujo.ts`
nace con sus pruebas antes que sus consumidores, y que la interacción (`anclas`) no
cambia de contrato.

**La escala de espaciado toca casi todo el CSS de una app sin pruebas visuales.**
La mitigación es la lista explícita de exclusiones y que el cambio es mecánico: un
valor por otro, sin cambiar propiedades.

**Disolver MONITOREO toca cuatro pantallas a la vez.** Es lo que se decidió, contra
la alternativa de hacerlo en dos tiempos. El plan debe ordenarlo para que cada
mudanza quede verificable por separado antes de borrar la pestaña, y la pestaña se
borra al final y no al principio.
