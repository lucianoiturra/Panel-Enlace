# Plataforma de Red CAB — Especificación de diseño

**Fecha:** 2026-07-29
**Autor:** Luciano Iturra (Depto. Enlace, Colegio Adventista Buenaventura, RBD 9796)
**Fuente de datos:** `Estructura Redes CAB.canvas` (levantamiento del 2026-06-06)

---

## 1. Problema

El levantamiento de la red del colegio existe hoy como un canvas de Obsidian. Sirve como dibujo, pero no responde preguntas operativas:

- ¿Qué puerto de qué patch panel sirve a 3° Básico B?
- ¿Qué puertos están libres, ocupados o sin identificar?
- ¿Qué cambié la semana pasada y en qué sala?
- ¿Cuánto del colegio falta por levantar?

El dolor declarado del usuario es la asignación de IPs y los leases DHCP. Ese problema **no se resuelve en la v1**: sin el mapa puerto ↔ sala, un registro de IP no tiene dónde colgarse. La v1 construye ese mapa.

### Hallazgo que define el alcance

El canvas tiene bien mapeado el **interior de los racks** (92 enlaces patch panel ↔ switch), pero la pata **sala → roseta → puerto de patch panel no existe**: cero de los 61 espacios está conectado a un puerto. El grupo del canvas lo dice: *"arrastrar y conectar a su puerto"* — quedó pendiente.

Por lo tanto la plataforma no es solo un visor. Su trabajo principal es **capturar esa asignación de forma cómoda** y luego permitir consultarla.

## 2. Restricciones (definidas por el usuario)

| Restricción | Consecuencia de diseño |
| --- | --- |
| Nada puede correr en la red (sin servidor, sin proceso 24/7) | Todo ocurre en el navegador. Sin ping, sin SNMP, sin API. |
| Sin acceso a exportar leases DHCP de MikroTik ni Fortinet | Todo dato de estado es de captura manual. |
| Otras personas deben poder consultarlo (dirección, soporte externo, sucesor) | Modo solo lectura, y el archivo debe funcionar sin instalar nada. |
| Prioridad #1: trazabilidad puerto ↔ sala | El registro IP queda para fase 2. |
| El diagrama debe ser un lienzo libre, con enlaces creados arrastrando | Nodos movibles con posiciones persistidas; SVG con paneo y zoom. |

## 3. Alcance

### v1 — Documentación y diagrama

1. Lienzo interactivo con los 3 racks, sus equipos y los 61 espacios, en el layout heredado del canvas.
2. Crear y borrar enlaces arrastrando una línea entre puertos, o entre un puerto y un espacio.
3. Trazado de cadena completa: sala → puerto de panel → puerto de switch → uplink → borde.
4. Vista de espacios con semáforo de conectividad y vista de cobertura del levantamiento.
5. Bitácora automática de cada edición.
6. Guardado en archivo real, con respaldo JSON gemelo.
7. Modo solo lectura para quien solo consulta.

### Fuera de alcance v1

Registro de IPs, DHCP, leases, VLANs, ping, SNMP, alertas, multiusuario simultáneo, edición concurrente. Ver §10 para cómo la v1 deja la puerta abierta a monitoreo sin rediseño.

## 4. Arquitectura

**Un archivo HTML autocontenido**, con HTML, CSS, JavaScript y los datos embebidos en el mismo archivo.

Los datos van embebidos y no en un JSON aparte porque un HTML abierto como `file://` no puede leer archivos vecinos: el navegador bloquea `fetch` a rutas locales. Embeberlos hace que el archivo funcione al abrirlo de cualquier forma — doble click, desde Drive, desde un hosting — sin instalar ni configurar nada.

**Guardar** reescribe ese mismo archivo mediante la File System Access API, y además escribe un `red-cab.json` gemelo junto a él. La app no lee el JSON: existe para respaldo, para que `git diff` sea legible y para migrar los datos el día que se use una herramienta con servidor.

**Riesgo y mitigación:** reescribir el archivo que contiene la app y los datos a la vez significa que un fallo al guardar puede dañar ambos. Mitigaciones: el JSON gemelo se escribe **antes** de reescribir el HTML; el guardado es atómico (se compone el contenido completo en memoria y se escribe de una vez); y la carpeta queda bajo git.

**Verificación previa obligatoria:** la File System Access API debe comprobarse funcionando con el archivo abierto como `file://` **antes** de construir la interfaz. Si Chrome/Edge no la habilitan en ese origen, el fallback es: los datos siguen en memoria + `localStorage` como copia de trabajo, y "Guardar" descarga el HTML y el JSON para reemplazarlos a mano. La interfaz no cambia; solo cambia la implementación de la capa de guardado, que queda detrás de un único módulo `almacenamiento`.

### Modos

- **Solo lectura** (por defecto al abrir): navegar, buscar, trazar, filtrar. Sin botones de edición. Nadie corrompe datos por accidente.
- **Edición**: se activa con un botón *Editar* explícito. Con File System Access API disponible, el botón pide el archivo destino y solo entra en modo edición si se concede la escritura. Con el fallback, el botón entra en modo edición de inmediato y muestra un aviso permanente de que los cambios viven en el navegador hasta que se descarguen. Habilita arrastrar enlaces, mover nodos, editar estados y notas.

El campo `autor` de la bitácora se toma de un dato configurable en la app (iniciales o nombre), guardado junto al resto del estado. Si está vacío, la entrada se registra sin autor.

## 5. Modelo de datos

Un objeto JSON con seis colecciones. Los `id` son estables y son el activo durable del proyecto: la interfaz HTML es desechable, los datos no.

```json
{
  "version": 1,
  "actualizado": "2026-07-29",
  "origen": "Estructura Redes CAB.canvas (2026-06-06)",

  "racks": [
    { "id": "R1", "nombre": "Rack 1 — Sala Enlace", "ubicacion": "Sala Enlace",
      "x": -1120, "y": -320, "w": 2320, "h": 1180, "notas": [] }
  ],

  "equipos": [
    { "id": "R1-SW1", "rack": "R1", "tipo": "switch",
      "etiqueta": "Switch Gigabit 24p Smart", "modelo": "TP-Link TL-SG1024S",
      "puertos": 24, "color": "#e08a3c", "x": -580, "y": 280, "nota": "" }
  ],

  "puertos": [
    { "id": "R1-SW1-p7", "equipo": "R1-SW1", "n": 7,
      "estado": "ocupado", "nota": "" }
  ],

  "espacios": [
    { "id": "esp-3-basico-a", "nombre": "3° Básico A", "categoria": "sala",
      "estado": "operativo", "x": -3560, "y": 432, "nota": "" }
  ],

  "enlaces": [
    { "id": "enl-001", "a": "R2-PP1-p14", "b": "R2-SW1-p11",
      "tipo": "patch", "nota": "" }
  ],

  "bitacora": [
    { "fecha": "2026-07-29T14:03:00-04:00", "tipo": "enlace-creado",
      "objetivo": "enl-001", "antes": null,
      "despues": "R2-PP1-p14 ↔ R2-SW1-p11", "nota": "", "autor": "LI" }
  ]
}
```

### Reglas del modelo

- **`enlaces` es la única fuente de conectividad.** Ningún puerto ni espacio guarda su contraparte. Evita el estado duplicado que se desincroniza.
- Los extremos `a` y `b` de un enlace son un `id` de puerto o un `id` de espacio. Un enlace espacio↔puerto representa la roseta de esa sala.
- **Rosetas múltiples por sala** se modelan como varios enlaces al mismo espacio, cada uno con su `nota` (`"roseta 2"`, `"roseta junto a la pizarra"`). No se crea una entidad `roseta`: agrega complejidad sin agregar respuestas.
- `equipos.tipo`: `switch` · `patchpanel` · `router` · `firewall` · `ap` · `isp`. Los tipos sin puertos (`isp`, `firewall`, `router`, `ap`) tienen `puertos: 0` y se enlazan como nodo completo.
- `puertos.estado`: `libre` · `ocupado` · `desconocido` · `dañado`. `ocupado` es derivable de `enlaces`; se guarda de todas formas porque un puerto puede estar ocupado por algo aún no identificado.
- `espacios.estado`: `operativo` · `solo-wifi` · `sin-internet` · `sin-verificar`.
- `espacios.categoria`: `sala` · `oficina` · `otro`.
- `bitacora` es **append-only**. Nunca se edita ni se reordena.

## 6. Conversión inicial desde el canvas

Script Node de un solo uso: `herramientas/convertir-canvas.js`. Lee el `.canvas` y emite el estado inicial.

### Reglas

| Elemento del canvas | Se convierte en |
| --- | --- |
| Grupo con "Rack" en el label | `rack` |
| Grupo de patch panel o switch | `equipo`, con `puertos` leído del label ("24 puertos", "24p") |
| Nodo de texto que es solo un número 1–28 | `puerto` de su grupo contenedor |
| Nodo dentro de "Salas de clases" u "Oficinas y otros espacios" | `espacio` |
| Color del nodo de espacio (1 rojo / 3 amarillo / 4 verde / sin color) | `estado`: `sin-internet` / `solo-wifi` / `operativo` / `sin-verificar` |
| Nodo de archivo `.md` de Fortinet, MikroTik, ISP | `equipo` de borde |
| Nodo de texto que parte con `## AP` | `equipo` tipo `ap` |
| Edge entre dos nodos de puerto | `enlace` tipo `patch`, o `uplink` si cruza dos switches |
| Edge de puerto al nodo "Desconocido" | puerto con `estado: "desconocido"`, nota `"destino desconocido según canvas"` |
| Coordenadas `x`/`y` de cada nodo | posición inicial en el lienzo |

Pertenencia al contenedor se resuelve por caja: un nodo pertenece al grupo más pequeño que lo contiene por completo. Esta regla ya se validó contra el canvas real y reproduce los conteos de abajo.

Puertos nominales que el canvas no etiquetó (16 en el patch panel de Rack 1, 4 en el panel de Rack 2 @y1840) se crean con `estado: "desconocido"` y nota `"sin etiquetar en el levantamiento"`. Se crean los 324 puertos nominales, no solo los 304 dibujados: un puerto que existe físicamente pero no está documentado es información, no ausencia de información.

### Invariantes — el conversor falla si no se cumplen

| Invariante | Valor esperado |
| --- | --- |
| Racks | 3 |
| Equipos con puertos | 13 (7 patch panels, 3 TP-Link 24p, 3 Cisco 28p) |
| Puertos nominales creados | 324 |
| Puertos etiquetados en el canvas | 304 |
| Puertos marcados `desconocido` por falta de etiqueta | 20 |
| Puertos con destino "Desconocido" | 8 |
| Enlaces puerto ↔ puerto | 92 |
| Espacios | 61 |
| Espacios `operativo` / `solo-wifi` / `sin-internet` / `sin-verificar` | 20 / 7 / 7 / 27 |
| Enlaces espacio ↔ puerto | 0 |

Ese último cero es el punto de partida del trabajo real.

### Casos del canvas que no se convierten automáticamente

Se registran como entradas iniciales en `bitacora` con tipo `revisar`, para que aparezcan en la vista Cobertura:

- 3 edges desde el grupo Rack 1 hacia puertos 1, 2 y 3 de su patch panel, sin significado claro.
- Edges de grupo a notas de texto ("## Salas de clases", "## Rosetas 3 en pared") — pasan a `racks.notas`, no a enlaces.
- Segmento IP de los 3 racks marcado "por confirmar" en el canvas (detectados 192.168.20/30/60.x).
- Patch panel Cat5e de Rack 3, 24 puertos, "nada conectado".

## 7. Vistas

### 7.1 Lienzo (principal)

SVG con un grupo transformado para paneo y zoom.

- **Nodo movible = el equipo completo**, no cada puerto. Un patch panel es un nodo que dibuja su fila de 24 puertos adentro; los puertos son anclas de conexión y se mueven con su equipo. Los 304 puertos como nodos sueltos es justo lo que hace frágil al canvas actual. Espacios y APs sí son nodos individuales movibles. Los racks son contenedores arrastrables con su contenido.
- **Crear enlace:** se arrastra desde un puerto (o desde el borde de un espacio) y se suelta sobre el destino. Durante el arrastre los destinos válidos se resaltan y los inválidos se atenúan. Soltar sobre un puerto ya enlazado pide confirmación de reemplazo. Soltar en vacío cancela.
- **Enlaces:** curvas Bézier, color según tipo. Click en un enlace lo selecciona: borrar, cambiar tipo, agregar nota.
- **Colores:** estado del puerto y semáforo del espacio, heredando el código de color del canvas.
- **Contra el desorden**, riesgo propio del lienzo libre: botón *Ajustar a la vista*, buscador que centra y resalta el nodo escrito, y *Restaurar layout* que devuelve todo a las coordenadas originales del canvas.

### 7.2 Barra de comando

Sobre el lienzo. Se escribe `3 básico B` o `R2/PP1/14` y se obtiene:

- La cadena completa trazada: `3° Básico B → roseta → R2/PP1 p14 → R2/SW1 p11 → uplink R3/SW1 → MikroTik → Fortinet → ISP`.
- Botón para copiar esa cadena como texto plano, para pegarla en un ticket o un WhatsApp.
- Enter centra el nodo en el lienzo.

### 7.3 Espacios

Grilla de los 61 espacios con su semáforo y un distintivo *sin puerto asignado*. Filtros por estado, categoría y rack. Click abre el espacio en el lienzo.

### 7.4 Cobertura

Tablero del avance del levantamiento, no del estado de la red:

- Espacios con puerto asignado, de 61.
- Puertos por estado y por rack.
- Lista de pendientes: espacios sin asignar, puertos sin etiqueta, puertos con destino desconocido, y los casos `revisar` de §6.

### 7.5 Asignación masiva por teclado

Modo secundario, dentro del lienzo. Se elige un puerto, se escribe el nombre del espacio con autocompletado sobre los 61 ya cargados, Enter asigna y salta al puerto siguiente. Arrastrar es cómodo para diagnosticar y corregir; para cargar 61 espacios de una sentada se necesita el teclado. Cuesta poco porque llama a la misma función `crearEnlace()` que el arrastre.

## 8. Persistencia e historial

- **Guardar** escribe el JSON gemelo y luego reescribe el HTML con los datos embebidos.
- **Cada cambio de datos escribe una entrada en `bitacora`** automáticamente: tipo, objetivo, valor anterior, valor nuevo, fecha. El usuario no tiene que anotar nada aparte. La ficha de un puerto o espacio muestra su historial filtrado de esa bitácora.
- **Los cambios de layout no van a la bitácora.** Mover un nodo, hacer zoom o panear es presentación, no dato: se persiste la posición pero no se registra el evento. De lo contrario un rato acomodando el diagrama sepulta el historial útil.
- **Aviso de cambios sin guardar** al intentar cerrar la pestaña.
- **git sobre la carpeta** es el historial de versiones real, con posibilidad de volver atrás. La bitácora responde "qué pasó con este puerto"; git responde "cómo estaba todo el martes". Son capas distintas y ambas hacen falta.

## 9. Distribución

Decisión del usuario: **URL privada con contraseña** — repo privado en GitHub más despliegue estático protegido (Cloudflare Pages con Access, o Netlify con contraseña de sitio).

Esto es una **fase de despliegue posterior, no parte de la v1**. El archivo autocontenido funciona igual servido por HTTP que abierto localmente, así que publicar no cambia nada del diseño; solo se agrega cuando la documentación ya valga la pena compartir.

**Advertencia de seguridad, registrada:** este documento es el mapa completo de la red interna del colegio — equipos, modelos, topología y, en fase 2, direccionamiento IP. Alojarlo fuera del colegio, incluso protegido, entrega ese mapa a un tercero y cualquier falla en la protección lo expone. Antes de publicar hay que confirmar que la protección de acceso está activa, y evaluar si la política del colegio lo permite. La alternativa sin exposición es entregar el archivo por la carpeta compartida institucional.

## 10. Puerta abierta al monitoreo (fase 2+)

No se implementa nada de monitoreo en la v1. Lo que la v1 hace para no bloquearlo:

- **`id` estables para puertos, equipos y espacios.** Cualquier dato futuro — una IP, una MAC, una medición, un lease — se cuelga de esos `id` sin tocar el modelo existente.
- **`enlaces` como única fuente de conectividad**, lo que permite calcular el camino de un dispositivo hasta el borde: base de cualquier diagnóstico posterior.
- **Capa de datos separada de la de dibujo.** El JSON no depende del HTML. Migrar a NetBox, phpIPAM o una app con servidor es un script de transformación, no un rediseño.
- **`bitacora` append-only con tipos**, lista para recibir eventos generados por una máquina y no solo por una persona.

Cuando exista una máquina que pueda quedar encendida, el camino natural es una colección `dispositivos` (nombre, MAC, IP, espacio, puerto) más detección de conflictos de IP, y después importación de leases. Nada de eso requiere cambiar lo de la v1.

## 11. Verificación

Sin framework de pruebas: el proyecto es un archivo y un script.

- **Conversor:** falla con código de salida distinto de cero si algún invariante de §6 no se cumple. Se corre una vez, pero el invariante documenta el levantamiento medido y detecta si el canvas cambió bajo los pies.
- **App con `?test=1`:** ejecuta aserciones de las funciones puras y muestra los resultados en pantalla.
  - `trazarCadena()` desde un espacio conocido devuelve la cadena esperada hasta el borde.
  - `trazarCadena()` sobre un puerto sin enlaces no lanza excepción y reporta cadena incompleta.
  - `crearEnlace()` rechaza extremos inexistentes, rechaza un enlace de un puerto a sí mismo, y rechaza duplicar un enlace existente.
  - `borrarEnlace()` deja el modelo sin referencias huérfanas.
  - Round-trip: serializar el estado y volver a cargarlo produce un estado idéntico.
  - Todo cambio de datos deja exactamente una entrada nueva en `bitacora`; mover un nodo no deja ninguna.
- **Manual:** el arrastre, el zoom y la detección de destino se prueban a mano; automatizarlos cuesta más de lo que rinde en este proyecto.

## 12. Entregables

```text
Red CAB.html                      # la plataforma, autocontenida, con datos embebidos
red-cab.json                      # respaldo legible de los datos
herramientas/convertir-canvas.js  # conversión inicial, un solo uso
Estructura Redes CAB.canvas       # el dibujo original, se conserva como referencia histórica
README.md                         # cómo abrirlo, cómo editar, cómo guardar, cómo respaldar
```

La carpeta todavía no es un repositorio git. Hay que inicializarlo: es la mitad de la estrategia de historial y la base de la distribución elegida.

## 13. Riesgos asumidos

| Riesgo | Mitigación |
| --- | --- |
| La File System Access API no funciona en `file://` | Se verifica antes de construir la interfaz. Fallback a descarga, detrás del módulo `almacenamiento`. |
| Reescribir el HTML daña app y datos a la vez | JSON gemelo se escribe primero; escritura atómica; git. |
| El lienzo libre se desordena o se pierde un nodo de vista | Ajustar a la vista, buscador que centra, restaurar layout original. |
| El levantamiento queda a medias y la plataforma no rinde | La vista Cobertura hace visible el avance y lo que falta; los 61 espacios sin asignar no se pueden ignorar. |
| Dos personas editan copias distintas del archivo | v1 es de un solo editor. El modo lectura para los demás lo hace explícito. |
| El dolor original (IPs y leases) sigue sin resolverse tras la v1 | Declarado desde el inicio. La v1 construye la base sobre la que la fase 2 se puede colgar. |

## 14. Decisiones pendientes de confirmar con el usuario

- Cuántas rosetas hay por sala en la práctica: el modelo soporta varias, pero el conteo real solo aparece al levantar.
- El segmento IP de cada rack sigue "por confirmar" en el canvas. No bloquea la v1; sí bloquea la fase 2.
