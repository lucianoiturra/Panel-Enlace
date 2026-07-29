# Pestaña Red — Especificación de diseño

**Fecha:** 2026-07-29
**Autor:** Luciano Iturra (Depto. Enlace, Colegio Adventista Buenaventura, RBD 9796)
**Reemplaza a:** `2026-07-29-plataforma-red-cab-design.md` (HTML autocontenido)
**Fuente de datos:** `Estructura Redes CAB.canvas` (levantamiento del 2026-06-06)
**Producto anfitrión:** Panel Enlace (Next.js 16 + Supabase, en producción en Vercel)

---

## 1. Problema

El levantamiento de la red del colegio existe como un canvas de Obsidian. Sirve como dibujo, pero no responde preguntas operativas:

- ¿Qué puerto de qué patch panel sirve a 3° Básico B?
- ¿Qué puertos están libres, ocupados o sin identificar?
- ¿Qué cambié la semana pasada y en qué sala?
- ¿Cuánto del colegio falta por levantar?

El canvas tiene bien mapeado el interior de los racks (92 enlaces patch panel ↔ switch), pero la pata **sala → roseta → puerto no existe**: cero de los 61 espacios está conectado a un puerto. El grupo del canvas lo dice: *"arrastrar y conectar a su puerto"* — quedó pendiente.

Por lo tanto el trabajo principal de la v1 es **capturar esa asignación de forma cómoda** y luego permitir consultarla. El dolor declarado del usuario (asignación de IPs y leases DHCP) no se resuelve aquí: sin el mapa puerto ↔ sala, un registro de IP no tiene dónde colgarse.

## 2. Qué cambia respecto del spec anterior

El spec anterior diseñaba un archivo HTML autocontenido porque no había dónde alojar la app. Hoy sí hay: el Panel Enlace ya está en producción con Next.js 16, Supabase Postgres y Basic auth. Esta versión se acopla a ese producto.

| Del spec anterior | Qué pasa ahora |
| --- | --- |
| §4 HTML autocontenido con datos embebidos | Se cae. Ruta `/red` del proyecto Next existente. |
| §4 File System Access API, JSON gemelo, escritura atómica | Se cae. Persistencia en Supabase, respaldo del proveedor. |
| §4 Modo solo lectura por defecto | Se cae. La Basic auth de `proxy.ts` es la puerta; quien entra, edita — igual que la pestaña Sala. |
| §7.1 Lienzo libre editable (arrastrar enlaces, mover nodos) | Fuera de la v1. La v1 entrega diagrama de solo lectura. |
| §8 git como historial de versiones | Se mantiene para el código; el historial de datos es la bitácora en Postgres. |
| §9 Distribución con URL privada y contraseña | Ya resuelto: Vercel + `APP_USERNAME` / `APP_PASSWORD`. |
| §13 Riesgos 1, 2 y 5 (API, corrupción de archivo, copias divergentes) | Desaparecen. |
| §5 Campo `autor` en bitácora | Se cae: hay una sola credencial compartida, el campo diría siempre lo mismo. |

Lo que se conserva íntegro: el modelo de seis colecciones, la regla de que `enlaces` es la única fuente de conectividad, los `id` estables como activo durable, la bitácora append-only, las reglas de conversión del canvas y sus invariantes.

## 3. Restricciones

| Restricción | Consecuencia de diseño |
| --- | --- |
| Nada puede correr en la red del colegio (sin servidor, sin proceso 24/7) | Sin ping, sin SNMP, sin sondeo. Todo dato de estado es de captura manual. |
| Sin acceso a exportar leases DHCP de MikroTik ni Fortinet | El registro de dispositivos queda para fase 2. |
| Otras personas deben poder consultarlo (dirección, soporte externo, sucesor) | Ya cubierto: URL con Basic auth compartida. |
| Prioridad #1: trazabilidad puerto ↔ sala | El registro IP queda para fase 2. |
| No romper la pestaña Sala, que está en producción | Solo dos cambios acotados en `app/page.tsx`, ambos aditivos. |
| Una sola persona edita a la vez | Sin bloqueo ni edición concurrente. La bitácora deja rastro si dos sesiones se pisan. |

## 4. Alcance

### v1

1. Pestaña **Red** en `/red`, dentro del mismo panel, con las dos secciones (`SALA` · `RED`) en la barra superior.
2. Importación del canvas a Supabase: 3 racks, 13 equipos con puertos, 324 puertos, 61 espacios, 92 enlaces internos.
3. Los 40 cubículos de la Sala de Enlace entran al modelo como endpoints enlazables (`cub:N`).
4. Captura de asignaciones puerto ↔ endpoint por teclado, en los dos sentidos.
5. Trazado de cadena completa: espacio o cubículo → puerto de panel → puerto de switch → uplink → borde → ISP.
6. Cuatro vistas: Espacios, Racks, Cobertura, Diagrama (solo lectura).
7. Buscador que traza y copia la cadena como texto plano.
8. Bitácora automática de cada cambio de datos.

### Fuera de alcance v1

Lienzo editable (arrastrar para crear enlaces, mover nodos, guardar o restaurar layout), registro de IPs, DHCP, leases, VLANs, ping, SNMP, alertas, multiusuario simultáneo, modo solo lectura, autor en bitácora.

La vista **Diagrama** es la pieza más cara de la pestaña y la única que se puede cortar sin romper nada más: si hay que recortar el alcance, se entrega sin ella y la pestaña sigue completa.

## 5. Arquitectura

Un solo proyecto, una sola base, una sola puerta de acceso. La pestaña Red es una ruta más.

```text
app/nav-secciones.tsx          las dos pestañas SALA · RED
app/red/page.tsx               shell: carga, rail de estados, segmentado, cajón
app/red/vista-espacios.tsx     grilla de los 61 espacios
app/red/vista-racks.tsx        tiras de puertos + formato lista
app/red/vista-cobertura.tsx    avance del levantamiento
app/red/diagrama.tsx           SVG solo lectura con el layout del canvas
app/red/ficha.tsx              cajón de espacio · puerto · cubículo
app/red/captura.tsx            modal de captura con toggle de sentido
lib/red/modelo.ts              tipos, ids con prefijo, resolución de endpoints
lib/red/trazado.ts             trazarCadena() — función pura
lib/red/semilla.json           salida del conversor, commiteada
app/api/red/route.ts           GET estado · PUT espacio/puerto
app/api/red/enlaces/route.ts   POST · DELETE enlaces
herramientas/convertir-canvas.mjs
tests/trazado.test.ts
tests/modelo.test.ts
```

La pestaña nace repartida en módulos, y no en un archivo como la Sala, porque `app/page.tsx` ya está en 362 líneas densas y esta pestaña es más grande. Cada módulo recibe estado y funciones por props; el estado y las llamadas de red viven solo en `app/red/page.tsx`.

### Cambios en el código que ya está en producción

Los dos son aditivos y de bajo riesgo:

1. **`app/page.tsx`, barra superior:** insertar `<NavSecciones activa="sala" />` junto a la marca.
2. **`app/page.tsx`, cajón de la ficha:** una línea de solo lectura `RED · R1/PP1 p07 → R1/SW1 p07 → MikroTik → Fortinet → ISP` con enlace a la ficha del cubículo en `/red`, o `RED · sin puerto asignado` si no tiene. Sin controles de edición nuevos en esta pestaña.

Para (2) **no se toca la carga de la Sala**: la línea se pide al abrir el cajón, con `GET /api/red/cadena?endpoint=cub:12`, que devuelve solo esa cadena. Mientras responde, la línea muestra un guion. Así el `GET /api/room` mantiene su costo actual y la pestaña Sala sigue abriendo igual de rápido aunque las tablas `net_*` estén vacías.

### Estilo

Se reutiliza `app/globals.css` y sus clases (`.topbar`, `.shell`, `.status-rail`, `.status-filter`, `.room-surface`, `.drawer`, `.modal`, `.toast`, `.field-error`). Las clases nuevas de la pestaña Red van al mismo archivo con prefijo `net-`. Tipografías, colores y densidad son las que ya existen: la pestaña Red no introduce un lenguaje visual propio.

## 6. Modelo de datos

Seis tablas nuevas con prefijo `net_`, en el estilo del schema actual: `text` para ids y estados, `snake_case` en Postgres, camelCase en TypeScript, sin foreign keys duras — igual que `checklist_results` y `station_tasks`.

```ts
net_racks     id text pk · nombre · ubicacion · x int · y int · w int · h int · notas text
net_equipos   id text pk · rack text · tipo · etiqueta · modelo · puertos int · color · x int · y int · nota text
net_puertos   id text pk · equipo text · n int · estado · nota text
net_espacios  id text pk · nombre · categoria · estado · x int · y int · nota text
net_enlaces   id serial pk · a text · b text · tipo · nota text · created_at text
net_bitacora  id serial pk · fecha text · tipo · objetivo text · antes text · despues text · nota text
```

Índices: `unique (a, b)` en `net_enlaces`, más un índice por `a` y otro por `b`; índice por `equipo` en `net_puertos`; índice por `objetivo` en `net_bitacora`.

### Ids de endpoint con prefijo

```text
pto:R2-PP1-p14      puerto de patch panel o de switch
esp:3-basico-b      uno de los 61 espacios
cub:12              cubículo de la Sala de Enlace (fila existente en cubicles, 1–40)
```

`net_enlaces.a` y `.b` guardan cualquiera de los tres. **No se crea tabla de cubículos**: son los 40 que ya están en producción, y trazar la cadena del cubículo 12 hasta el ISP es resolver un prefijo. Un prefijo nuevo (`disp:` para dispositivos en fase 2) entra sin migración.

Los enlaces se guardan en **orden canónico** — el id menor como `a` — para que el índice único atrape el duplicado en los dos sentidos.

### Vocabularios

- `net_equipos.tipo`: `switch` · `patchpanel` · `router` · `firewall` · `ap` · `isp`. Los tipos sin puertos numerados (`isp`, `firewall`, `router`, `ap`) llevan `puertos: 0` y se enlazan como nodo completo: el conversor les crea un único puerto sintético `pto:<equipo>-p0` para que **todo enlace una siempre dos puertos** y el trazado no necesite un caso especial. Ese puerto no se dibuja como casilla ni entra en los conteos de cobertura.
- `net_puertos.estado`: `libre` · `ocupado` · `desconocido` · `dañado`.
- `net_espacios.estado`: `operativo` · `solo-wifi` · `sin-internet` · `sin-verificar`.
- `net_espacios.categoria`: `sala` · `oficina` · `otro`.
- `net_enlaces.tipo`: `patch` (panel ↔ switch) · `uplink` (switch ↔ switch) · `roseta` (puerto ↔ espacio o cubículo) · `borde` (entre equipos de borde).
- `net_bitacora.tipo`: `enlace-creado` · `enlace-borrado` · `estado-espacio` · `estado-puerto` · `nota` · `revisar`.

### Reglas del modelo

- **`net_enlaces` es la única fuente de conectividad.** Ningún puerto, espacio ni cubículo guarda su contraparte.
- **Rosetas múltiples por sala** son varios enlaces al mismo espacio, cada uno con su `nota` (`"roseta 2"`, `"roseta junto a la pizarra"`). No existe entidad `roseta`.
- `net_puertos.estado = ocupado` es derivable de los enlaces, pero se guarda igual: un puerto puede estar ocupado por algo aún no identificado.
- **`net_bitacora` es append-only.** Nunca se edita ni se reordena. La entrada se escribe en la misma ruta de API que hace el cambio, así que no hay forma de modificar datos sin dejar rastro.
- Las coordenadas `x`/`y` se importan y se conservan porque el diagrama las usa, pero en la v1 no se editan: no hay guardar ni restaurar layout, y el layout nunca entra a la bitácora.

### Contratos de API

```text
GET    /api/red                          → { racks, equipos, puertos, espacios, enlaces, bitacora, cubiculos }
GET    /api/red/cadena?endpoint=cub:12   → { saltos, completa, motivo? }
PUT    /api/red                          { tipo: "espacio"|"puerto", id, estado?, nota? }
POST   /api/red/enlaces                  { a, b, tipo?, nota? }
DELETE /api/red/enlaces?id=N
```

- `cubiculos` es una proyección mínima de `cubicles`: `id`, `status`, `ip`, `mac`, `inventoryCode`. **Nunca devuelve PINs**, ni cifrados ni descifrados.
- `GET /api/red/cadena` existe solo para la línea de red del cajón de la Sala: trazado de un endpoint, sin devolver el estado completo.
- `bitacora` devuelve las últimas 200 entradas, orden descendente, para no inflar la carga (~70 KB en total).
- Las lecturas del `GET` se ejecutan **en secuencia**, no con `Promise.all`, por el transaction pooler con `max: 1` — el mismo motivo documentado en `app/api/room/route.ts:49`.
- `POST /api/red/enlaces` valida: los dos endpoints existen (`pto:` en `net_puertos`, `esp:` en `net_espacios`, `cub:` entre 1 y 40 en `cubicles`), `a ≠ b`, y no hay duplicado en ninguno de los dos órdenes. Normaliza a orden canónico antes de insertar.
- **Reemplazar el destino de un puerto no es una operación de la API.** La UI detecta el conflicto con el estado que ya tiene en memoria, pide confirmación y envía `DELETE` y luego `POST`. Dos entradas de bitácora, que es exactamente lo que pasó.
- Cada `PUT`, `POST` y `DELETE` escribe su entrada de bitácora en la misma transacción lógica que el cambio.

### `trazarCadena()` — la función pura

Firma: `trazarCadena(estado, endpointId) → { saltos: Salto[], completa: boolean, motivo?: string }`.

El grafo se arma con los enlaces **más la adyacencia interna del equipo**: en un `switch`, `router`, `firewall`, `ap` o `isp` todos los puertos están conectados entre sí por el chasis. En un `patchpanel` **no**: un panel solo puentea cada puerto entre su frente y su fondo, y eso ya lo representa el propio nodo del puerto con sus dos enlaces. Sin esta regla la cadena se corta al llegar al switch y nunca alcanza el uplink.

Recorrido: BFS desde el endpoint de origen buscando un equipo de tipo `isp`. Los vecinos se ordenan por id para que el resultado sea determinista. Los saltos internos por chasis se colapsan a un solo nodo por equipo al presentar la cadena, de modo que el resultado se lee así:

```text
3° Básico B → roseta → R2/PP1 p14 → R2/SW1 p11 → R3/SW1 p24 → MikroTik → Fortinet → ISP
```

Si no hay camino al ISP, devuelve el camino recorrido con `completa: false` y un `motivo` legible (`"el puerto no tiene enlaces"`, `"la cadena termina en R2/SW3 sin uplink"`). Guardia obligatoria de visitados y tope de saltos: los uplinks entre switches pueden formar ciclos y la función **no debe colgarse ni repetir nodos**.

## 7. Importación desde el canvas

`herramientas/convertir-canvas.mjs`, Node puro sin dependencias. Lee `Estructura Redes CAB.canvas` y emite `lib/red/semilla.json`. Se corre a mano cuando el canvas cambia, no en cada build.

### Reglas de conversión

| Elemento del canvas | Se convierte en |
| --- | --- |
| Grupo con "Rack" en el label | `rack` |
| Grupo de patch panel o switch | `equipo`, con `puertos` leído del label ("24 puertos", "24p") |
| Nodo de texto que es solo un número 1–28 | `puerto` de su grupo contenedor |
| Nodo dentro de "Salas de clases" u "Oficinas y otros espacios" | `espacio` |
| Color del nodo de espacio (1 rojo / 3 amarillo / 4 verde / sin color) | `estado`: `sin-internet` / `solo-wifi` / `operativo` / `sin-verificar` |
| Nodo de archivo `.md` de Fortinet, MikroTik o ISP | `equipo` de borde (`firewall`, `router`, `isp`) |
| Nodo de texto que parte con `## AP` | `equipo` tipo `ap` |
| Edge entre dos nodos de puerto | `enlace` tipo `patch`, o `uplink` si cruza dos switches |
| Edge de puerto al nodo "Desconocido" | puerto con `estado: "desconocido"`, nota `"destino desconocido según canvas"` |
| Coordenadas `x`/`y` de cada nodo | posición para el diagrama |

Pertenencia al contenedor se resuelve por caja: un nodo pertenece al grupo más pequeño que lo contiene por completo. La regla está validada contra el canvas real y reproduce los conteos de abajo.

Los puertos nominales que el canvas no etiquetó (16 en el panel de Rack 1, 4 en el panel de Rack 2 @y1840) se crean con `estado: "desconocido"` y nota `"sin etiquetar en el levantamiento"`. Se crean los 324 nominales, no solo los 304 dibujados: un puerto que existe físicamente pero no está documentado es información, no ausencia de información.

### Casos que el spec anterior no contemplaba

Medidos en el canvas real y resueltos explícitamente:

- `ISP.md → puerto 23` de un patch panel: el borde **ya está conectado a un puerto** → enlace real de tipo `borde`, no nota.
- `Fortinet.md → MikroTik.md` → enlace de tipo `borde` entre sus puertos sintéticos `p0`.
- `grupo Rack 2 → grupo Administrativo` → no es enlace: pasa a `net_racks.notas`.
- 4 nodos `## AP` (Área Financiera, Dirección, Multicopiado, Sala de Profesores) → equipos tipo `ap` con `puertos: 0`.
- 3 nodos `.md` de documentación (Capacitación TI, Plan de trabajo, Estado Conectividad) y 4 imágenes o planos → notas, o se ignoran. Nunca equipos.
- 3 edges del grupo Rack 1 hacia los puertos 1, 2 y 3 de su panel, sin significado claro → entrada `revisar` en la bitácora.
- Los 3 nodos de segmento IP marcados "por confirmar" (detectados 192.168.20/30/60.x) → `net_racks.notas` y una entrada `revisar` por rack.
- Las dos asignaciones documentadas solo como texto en la nota de pendientes — `UTP E. Básica → R2/PP1 p19` y `PIE Administrativo → R2/PP1 p18` — se importan como enlaces `roseta` con nota `"según el canvas, sin verificar en terreno"`, más una entrada `revisar` cada una para que aparezcan en Cobertura hasta que se confirmen.

### Invariantes — el conversor falla con código ≠ 0 si no se cumplen

Los diez están medidos contra el canvas real del 2026-06-06 y pasan hoy:

| Invariante | Valor esperado |
| --- | --- |
| Racks | 3 |
| Equipos con puertos | 13 (7 patch panels, 3 TP-Link 24p, 3 Cisco 28p) |
| Puertos nominales creados | 324 |
| Puertos etiquetados en el canvas | 304 |
| Puertos `desconocido` por falta de etiqueta | 20 |
| Puertos con destino "Desconocido" | 8 |
| Enlaces puerto ↔ puerto | 92 |
| Espacios | 61 |
| Espacios `operativo` / `solo-wifi` / `sin-internet` / `sin-verificar` | 20 / 7 / 7 / 27 |
| Enlaces espacio ↔ puerto en el canvas | 0 |

Ese último cero es el punto de partida. Con las dos asignaciones que llegan desde la nota de pendientes, la v1 arranca con **2 de 101 endpoints asignados** (61 espacios + 40 cubículos), las dos marcadas como sin verificar: **99 sin puerto**.

### Siembra

La semilla se aplica una vez, marcada en `app_metadata` con la clave `red_semilla_version` (hash SHA-256 del archivo) — el mismo patrón de `equipment_reference_version` en `app/api/room/route.ts:22`. Inserta con `ON CONFLICT DO NOTHING`, así que **reimportar el canvas nunca pisa una asignación capturada**.

`lib/red/semilla.json` se commitea al repo privado, y lo sensible (PINs, IPs de cubículos) sigue entrando por variables de entorno como hoy. Ojo con un detalle a resolver antes de implementar: **`Estructura Redes CAB.canvas` está en la carpeta pero no versionado**. Si el conversor tiene que poder correr de nuevo desde otra máquina, el canvas también debe entrar al repo; si se prefiere no subir el dibujo original, la semilla pasa a ser la única copia versionada del levantamiento y el canvas queda como respaldo local.

## 8. Vistas

### 8.1 Barra superior

Dos secciones junto a la marca, `SALA` y `RED`, con subrayado en la activa. Son rutas reales (`/` y `/red`): cada vista se puede marcar como favorito y compartir por enlace.

### 8.2 Rail de estados

Siempre visible en `/red`, con la anatomía del rail de la Sala. Cuatro contadores de espacios por estado que filtran al hacer clic (20 operativo · 7 solo WiFi · 7 sin internet · 27 sin verificar) y al lado la línea de pendientes, calculada sobre el estado real: al importar dice `99 sin puerto · 20 puertos sin etiqueta · 8 destinos desconocidos`.

### 8.3 Espacios

Grilla de los 61 con su semáforo y su puerto asignado, o el distintivo *sin puerto*. Filtros por estado, categoría y rack, más el buscador. `Sala Computación` muestra "40 cubículos" y enlaza a la pestaña Sala.

### 8.4 Racks

Tiras de puertos por equipo — 7 patch panels y 6 switches — con color por estado y el número de puerto legible. Un botón cambia a formato lista: la tabla densa de 324 filas agrupadas por rack y equipo, con puerto, estado, destino y cadena. Clic en un puerto abre su ficha en cualquiera de los dos formatos.

### 8.5 Cobertura

Tablero del avance del levantamiento, no del estado de la red:

- Endpoints con puerto asignado, de 101.
- Puertos por estado y por rack.
- Lista de pendientes: espacios sin asignar, cubículos sin asignar, 20 puertos sin etiquetar, 8 con destino desconocido, y las entradas `revisar` de la importación.
- Los últimos 50 cambios de la bitácora.

### 8.6 Diagrama

SVG de solo lectura con el layout heredado del canvas: un grupo transformado para paneo y zoom, *ajustar a la vista*, y el buscador que centra y resalta el nodo. Los equipos se dibujan como un nodo con su fila de puertos adentro; espacios y APs son nodos individuales. Clic en cualquier nodo abre su ficha. Nada se mueve ni se edita.

### 8.7 Ficha en cajón

Tres variantes según el endpoint:

- **Espacio:** semáforo editable, categoría, nota, puertos asignados con su nota de roseta, cadena trazada, y bitácora filtrada.
- **Puerto:** equipo y rack, estado editable, nota, destino, cadena, y bitácora filtrada.
- **Cubículo:** su puerto y cadena, IP y MAC de solo lectura (ya viven en la pestaña Sala), y enlace a su ficha completa en `/`.

Todas llevan botón *copiar cadena como texto plano*, para pegarla en un ticket o un WhatsApp.

### 8.8 Captura

Modal, con la anatomía del diálogo de checklist que ya existe.

- Sentido por defecto **puerto → destino**: recorre un panel puerto por puerto y solo pide el destino. Es el orden que ocurre con el tester en la mano.
- Toggle al sentido inverso **destino → puerto**: recorre la cola de pendientes y pide el puerto. Es el orden que ocurre caminando salas.
- Autocompletado sobre los 101 endpoints, con aviso cuando el destino ya está en otro puerto.
- `Enter` asigna y avanza · `Tab` salta · *marcar sin uso* deja el puerto `libre` y avanza · `Ctrl+Z` deshace la última · `Esc` sale.
- Contador de progreso de la sesión y lista de lo asignado con *deshacer* por fila.
- **La fila avanza de inmediato y se revierte con toast si el guardado falla.** El resto de la app guarda y después actualiza el estado local; acá el ritmo es el punto de la herramienta.

### 8.9 Buscador

Un campo sobre la vista. Se escribe `3 básico b`, `r2/pp1/14` o `cub 12` y devuelve la cadena trazada con el botón de copiar. `Enter` abre la ficha, y en la vista Diagrama además centra el nodo. **Sin sintaxis de escritura:** el buscador no asigna ni borra nada.

## 9. Errores, estados y accesibilidad

Se copia el patrón de la pestaña Sala, que ya está resuelto: banner de error con *reintentar* cuando la carga falla, toasts de éxito y error, `aria-invalid` con mensaje bajo el campo, deshacer con temporizador donde aplica, foco visible, navegación por teclado, y estados que no dependen solo del color. Sin objetivo formal de WCAG, igual que `PRODUCT.md`.

## 10. Verificación

Hoy `npm test` es `next build`. Pasa a `next build` más `node --experimental-strip-types --test tests`, verificado en el Node 22.14 de este equipo: corre archivos `.ts` sin transpilar ni instalar nada. Requiere agregar `"allowImportingTsExtensions": true` al `tsconfig.json`, que es legal con `noEmit: true`.

- **Conversor:** falla con código ≠ 0 si algún invariante de §7 no se cumple. Se corre pocas veces, pero el invariante documenta el levantamiento medido y detecta si el canvas cambió bajo los pies.
- **`trazarCadena()`:** desde un espacio conocido devuelve la cadena esperada hasta el ISP; sobre un puerto sin enlaces reporta `completa: false` sin lanzar; con un ciclo de uplinks **no se cuelga ni repite nodos**; los saltos por chasis se colapsan a un nodo por equipo.
- **`crearEnlace()`:** rechaza endpoints inexistentes, un endpoint contra sí mismo, y el duplicado en cualquiera de los dos órdenes.
- **`borrarEnlace()`:** no deja referencias huérfanas.
- **Resolución de prefijos** `pto:` / `esp:` / `cub:`, y round-trip semilla → estado → semilla.
- **A mano:** el pan y zoom del diagrama, y el ritmo real del modal de captura.

## 11. Despliegue

`db/index.ts:110` salta el DDL cuando corre en Vercel, así que **las seis tablas `net_*` no se crean solas en producción**. Van como migración en `drizzle-pg/`, generada con `npm run db:generate`, y se aplican en Supabase antes de publicar la pestaña. En local siguen naciendo con `ensureSchema()`.

No hay variables de entorno nuevas. No hay servicios nuevos. El despliegue es el `git push` de siempre más la migración aplicada una vez.

## 12. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El levantamiento queda a medias y la pestaña no rinde | Cobertura y el rail muestran los 99 endpoints pendientes en cada carga; no se pueden ignorar |
| Las tablas `net_*` no existen en producción y la pestaña falla al abrir | Migración en `drizzle-pg/` como paso explícito de despliegue, antes de publicar |
| Reimportar el canvas pisa asignaciones ya capturadas | Siembra idempotente por marca de versión, con `ON CONFLICT DO NOTHING` |
| Un cambio en la pestaña Red rompe la pestaña Sala | Solo dos cambios aditivos en `app/page.tsx`; el resto son archivos nuevos |
| La carga crece hasta molestar | Bitácora limitada a 200 entradas en el `GET`; si crece, se pagina |
| El mapa completo de la red interna vive en un hosting externo | Ya es la situación de la pestaña Sala. Basic auth es la única puerta. Queda registrado para revisarlo con la política del colegio; no bloquea la v1 |
| El dolor original (IPs y leases) sigue sin resolverse tras la v1 | Declarado desde el inicio. Los 40 cubículos ya traen IP y MAC: la fase 2 nace con 40 dispositivos reales |

## 13. Puerta abierta a la fase 2

No se implementa monitoreo. Lo que la v1 hace para no bloquearlo:

- **Ids estables con prefijo.** `disp:` para dispositivos entra sin migración ni cambio de modelo.
- **`net_enlaces` como única fuente de conectividad**, lo que permite calcular el camino de cualquier endpoint hasta el borde: base de todo diagnóstico posterior.
- **Bitácora tipada y append-only**, lista para recibir eventos generados por una máquina y no solo por una persona.
- **Los 40 cubículos ya son endpoints con IP y MAC.** La colección `dispositivos` de la fase 2 no nace vacía.
- **Capa de datos separada del dibujo.** Migrar a NetBox o phpIPAM sería un script de transformación sobre las tablas, no un rediseño.

El camino natural: `net_dispositivos` (nombre, MAC, IP, endpoint, puerto), detección de conflictos de IP, y después importación de leases cuando exista una máquina que pueda quedar encendida. Nada de eso requiere cambiar lo de la v1. El lienzo editable del spec anterior también entra aquí: las coordenadas ya están guardadas.

## 14. Decisiones tomadas

Registradas en el brainstorming del 2026-07-29, con maquetas en `docs/superpowers/specs/2026-07-29-pestana-red-maquetas/`:

| Decisión | Elegido |
| --- | --- |
| Alcance de la v1 | Documentación primero: captura, consulta y diagrama de solo lectura. Lienzo editable a fase 2 |
| Unión entre pestañas | Los 40 cubículos son endpoints enlazables ya en la v1 |
| Navegación | Pestañas `SALA` · `RED` en la barra superior, sobre rutas reales |
| Interior de la pestaña | Espejo de la anatomía de la Sala, con las tiras de puertos para la vista Racks y su formato lista |
| Captura | Modal puerto → destino con toggle al sentido inverso; buscador sin sintaxis de escritura |

## 15. Pendientes de confirmar con el usuario

- Cuántas rosetas hay por sala en la práctica: el modelo soporta varias, pero el conteo real solo aparece al levantar.
- El segmento IP de cada rack sigue "por confirmar" en el canvas (detectados 192.168.20/30/60.x). No bloquea la v1; sí bloquea la fase 2.
- Si los 40 cubículos cuelgan del panel de Rack 1, del de Rack 2, o de los dos: se resuelve al capturar.
