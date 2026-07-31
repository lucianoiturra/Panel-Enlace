# Racks y equipos: edición completa y una vista que se lea

Fecha: 2026-07-31

## Problema

En **Panel red > Racks** la información está y no se encuentra. Cuatro cosas concretas:

1. **Los racks no se pueden editar.** `net_racks` guarda `nombre`, `ubicacion` y `notas`, pero ninguna ruta los escribe. Lo único que se ve del rack es su nota cruda, y esa nota trae la basura que dejó la conversión del canvas: tres líneas de `relación dibujada en el canvas hacia: ## Salas de clases` en R3, y el segmento IP como texto con asteriscos de markdown sin renderizar.
2. **Los switches y patch panels no se pueden editar.** `POST/PATCH /api/red/recursos` solo acepta `tipo: "espacio" | "ap"`, así que de los 20 equipos sembrados solo los 4 AP tienen formulario. Los 13 switches y patch panels son de solo lectura.
3. **Faltan campos.** No hay marca (hoy va pegada en la etiqueta, `Switch 1 | Cisco`, o dentro del modelo, `TP-Link TL-SG1024S`), no hay segmento IP y no hay IP de gestión.
4. **La vista no usa lo que ya sabe.** `net_equipos.tipo` distingue `switch` de `patchpanel` desde la siembra, pero `vista-racks.tsx` no lo muestra: todos los equipos se dibujan idénticos y distinguirlos depende de leer la sigla del id.

Hay además dos defectos latentes que este trabajo destapa:

- `vista-racks.tsx:16` filtra `equipo.puertos > 0`. Hoy no molesta porque el FORTINET, el MIKROTIK y el ISP tienen `rack = ""`, pero en cuanto se les pueda asignar un rack desaparecerían de la vista sin aviso.
- El diagrama afirma que su orden manual «vale para todos» (`diagrama.tsx:306`), pero la vista de racks lo ignora y ordena por la coordenada `y` heredada del canvas.

## Decisiones

| Decisión | Elegida |
|---|---|
| Alcance | CRUD completo: crear, editar y eliminar racks y equipos |
| Dónde vive el segmento IP | En el rack; cada equipo lleva además su IP de gestión |
| Marca y modelo | Solo en los equipos. El gabinete del rack no los lleva |
| Dónde se edita | Ficha lateral, el mismo cajón que ya usan espacios y puertos |
| Notas heredadas del canvas | Migración de una vez que limpia y conserva lo real |
| Layout de la vista | Tarjeta de identidad a la izquierda, tira de puertos a la derecha |
| Orden de los equipos | Reutiliza `net_orden`, compartido con el diagrama |
| Dónde vive el CRUD | Rutas propias + planificadores puros en `lib/red/inventario.ts` |

## Modelo de datos

Tres columnas nuevas, ninguna existente cambia de tipo ni se borra. Migración `drizzle-pg/0006_*.sql`:

```sql
ALTER TABLE net_racks   ADD COLUMN segmento    TEXT NOT NULL DEFAULT '';
ALTER TABLE net_equipos ADD COLUMN marca       TEXT NOT NULL DEFAULT '';
ALTER TABLE net_equipos ADD COLUMN ip_gestion  TEXT NOT NULL DEFAULT '';
```

En `lib/red/modelo.ts`, `Rack` gana `segmento: string` y `Equipo` gana `marca: string` e `ipGestion: string`.

`segmento` e `ipGestion` son **texto libre**, no CIDR validado. El dato real de hoy es literalmente `por confirmar (detectados: 192.168.20/30/60.x)`; un validador estricto impediría registrar lo que efectivamente se sabe. La interfaz muestra una pista gris no bloqueante cuando el valor no parece un segmento.

### Limpieza de las notas heredadas

Función pura en `lib/red/inventario.ts`:

```ts
limpiarNotaRack(nota: string): { notas: string; segmento: string }
```

Descarta las líneas que empiezan con `relación dibujada en el canvas hacia:` y la línea del `**Segmento IP:**`, y conserva el resto. Resultado sobre los datos actuales:

| Rack | Antes | Después |
|---|---|---|
| R1 | `Rack 1 — **Segmento IP:** por confirmar (detectados: …)` | nota vacía |
| R2 | dos líneas de canvas + segmento + `**Puertos identificados:** - UTP → R2/P1 D19 - PIE Básica → R2/P1 D18` | conserva los puertos identificados |
| R3 | tres líneas de canvas + segmento | nota vacía |

`segmento` queda **en blanco**, no en `"por confirmar"`: la semilla no contiene un segmento real que migrar, y un campo vacío que se puede llenar es más honesto que uno con una frase que no es una IP. La pista de los segmentos detectados sobrevive dentro de la nota del rack cuando la hay.

Se ejecuta una sola vez dentro de `sembrarRed`, guardada por la clave `red_notas_racks_v1` en `app_metadata`, igual que `red_semilla_version` y `red_espacios_borrados`. Corre así tanto en desarrollo como en producción, donde el DDL automático está apagado.

La misma función se aplica en `herramientas/convertir-canvas.mjs`, que es lo que genera la basura en la línea 157, para que regenerar la semilla no la reintroduzca.

**Fuera de alcance a propósito:** partir automáticamente las etiquetas existentes (`Switch 1 | Cisco` → etiqueta + marca). Son 13 equipos, van a tener formulario, y quien opera sabe la marca real mejor que una regla que adivine.

## Planificadores puros

Todo lo que puede destruir datos se decide en `lib/red/inventario.ts`, sin tocar la base, siguiendo el patrón que ya usa `planEliminarEspacio`:

| Función | Devuelve |
|---|---|
| `limpiarNotaRack(nota)` | `{ notas, segmento }` |
| `planEliminarRack(estado, id)` | `{ ok, equipos[], puertos[], enlaces[] }` o `{ ok: false, error }` |
| `planEliminarEquipo(estado, id)` | `{ ok, puertos[], enlaces[] }` o `{ ok: false, error }` |
| `planCambioPuertos(estado, id, total)` | `{ ok, crear: number[], borrar: string[] }` o `{ ok: false, error }` |
| `codigoRack(existentes)` | `"R4"` |
| `codigoEquipo(rack, tipo, existentes)` | `"R3-SW3"`, `"R1-PP2"` |
| `pareceSegmento(valor)` / `pareceIp(valor)` | `boolean`, solo para la pista gris |

### La regla del cambio de cantidad de puertos

- **Subir** de 24 a 28 crea los cuatro faltantes en estado `libre`. Siempre permitido.
- **Bajar** de 24 a 12 procede solo si los puertos 13 al 24 no tienen enlaces. Si alguno tiene, la operación falla con `409` nombrándolos: *«No se puede bajar a 12 puertos: R3/SW1 p18 y p22 conservan conexiones. Quítalas primero.»*
- **Cruzar el cero** en cualquier sentido reemplaza el punto de conexión: pasar de 0 a N borra el endpoint único `pto:{id}-p0` y crea `p1…pN`; pasar de N a 0 borra `p1…pN` y crea `p0`. En ambos casos aplica la misma regla: si el punto que desaparece tiene enlaces, la operación se rechaza.

El criterio es el que ya rige en `app/api/red/route.ts:59` para no marcar libre un puerto enlazado: **la aplicación nunca borra una conexión como efecto colateral de otra cosa.** Un borrado explícito de equipo o de rack sí las arrastra, pero pasa por un diálogo con el conteo exacto.

## API

Dos rutas nuevas. Se separan de `/api/red/recursos` —que ya tiene 184 líneas y tres métodos— porque sumarle dos entidades con cascada de puertos y cambio de cantidad la dejaría sobre las 400 líneas.

| Ruta | Comportamiento |
|---|---|
| `POST /api/red/racks` | `{ nombre, ubicacion, segmento, notas }` → id `R{n}` con el primer número libre. `400` si falta el nombre. |
| `PATCH /api/red/racks` | `{ id, nombre, ubicacion, segmento, notas }`. `404` si no existe. |
| `DELETE /api/red/racks?id=…` | Ejecuta `planEliminarRack`: borra sus equipos, los puertos de esos equipos, los enlaces de esos puertos y las filas de `net_orden` involucradas. `404` si no existe. |
| `POST /api/red/equipos` | `{ rack, tipo, etiqueta, marca, modelo, ipGestion, puertos, nota }` → id `{rack}-{sigla}{n}`, y crea `p1…pN` o el endpoint único `p0`. |
| `PATCH /api/red/equipos` | Los mismos campos menos `rack`. Si `puertos` cambia, aplica `planCambioPuertos`; `409` con el detalle si no procede. |
| `DELETE /api/red/equipos?id=…` | Ejecuta `planEliminarEquipo`: borra sus puertos, los enlaces de esos puertos y su fila de `net_orden`. |

Siglas por tipo para el id: `SW` switch, `PP` patchpanel, `RT` router, `FW` firewall, `AP` ap, `ISP` isp. Un equipo sin rack usa `{SIGLA}-{slug}`, que es el patrón que ya siguen los AP sembrados (`AP-sala-de-profesores`).

### Los AP se consolidan en `/api/red/equipos`

Un AP es una fila de `net_equipos` como cualquier otro equipo. Si `/api/red/equipos` lo maneja y `/api/red/recursos` conserva su rama `ap`, quedan dos rutas escribiendo la misma tabla con validaciones distintas: la vieja sin marca ni IP de gestión, la nueva con ellas.

`/api/red/recursos` pierde su rama `ap` y queda solo con `espacio`. El diálogo «Agregar elemento» y la sección de datos de la ficha apuntan a la ruta nueva cuando el elemento es un AP. Los AP ganan gratis marca e IP de gestión, que es justamente parte de lo pedido.

`ubicacion` de un AP se sigue guardando en `net_equipos.nota`, como hoy; no se agrega columna para eso.

Ninguna de las dos rutas exige header de confirmación. Ese mecanismo existe para `DELETE /api/red/enlaces?todos=1`, que arrasa sin apuntar a nada; acá el borrado va dirigido a un id concreto y la confirmación vive en el diálogo, como en `eliminar-espacio.tsx`.

**Bitácora:** reutiliza los tipos `recurso-creado` / `recurso-editado` / `recurso-borrado` que ya existen y que la ficha ya sabe mostrar, con el detalle en `nota` (*«Datos del rack»*, *«Switch agregado»*, *«Puertos: 24 → 28»*). No se agregan seis tipos nuevos para algo que el historial ya renderiza.

### Limitación consciente: un equipo no cambia de rack

El id del equipo está incrustado en el id de cada uno de sus puertos (`pto:R1-SW1-p1`) y en cada fila de `net_enlaces` que los referencia. Reescribirlo obligaría a una cascada sobre puertos, enlaces y bitácora, y dejaría el historial apuntando a ids que ya no existen. Un equipo que de verdad cambia de rack se borra y se vuelve a crear.

`PATCH /api/red/equipos` ignora el campo `rack` si viene, y la ficha muestra el rack como dato fijo, no como selector.

## Vista de racks

Cada equipo pasa a una fila de dos columnas: tarjeta de identidad de 206 px a la izquierda, tira de puertos a la derecha. Los datos quedan alineados en la misma columna y se leen de corrido hacia abajo. Bajo 900 px la tarjeta se apila sobre la tira, para que los 28 puertos de un switch no se compriman.

**Encabezado del rack:** nombre y ubicación, el segmento IP y los contadores como chips, la nota ya limpia como párrafo, y un botón «Editar rack».

**Insignia de tipo** en cada tarjeta, con sigla y color: `SW` azul, `PP` gris, `AP` verde, `RT` ámbar, `FW` rojo, `ISP` oscuro. La sigla acompaña al color y no lo reemplaza, porque `PRODUCT.md` pide estados comprensibles sin depender exclusivamente del color. Una leyenda al pie del rack.

**Los huecos se muestran**, en gris y cursiva: *sin registrar*, *modelo pendiente*, *sin IP de gestión*. Lo que falta por levantar se ve sin abrir nada.

**El filtro `puertos > 0` desaparece.** La vista muestra todo equipo cuyo `rack` coincide con el activo. Los de cero puertos —firewall, router, ISP— se dibujan con su tarjeta y un «punto único · sin puertos numerados» en lugar de tira.

**Botones de alta:** `+ RACK` en el selector de racks; `+ Agregar equipo a este rack` al final de la lista.

**La vista LISTA** gana columnas de tipo, marca y modelo. Sin eso quedaría siendo la mitad de útil que TIRAS.

### Orden de los equipos

El mecanismo ya existe y no se está usando. `net_orden` guarda orden manual por id, y `ordenarPor(orden, automatico)` en `lib/red/layout.ts:46` ya lo resuelve con respaldo automático.

- `VistaRacks` ordena con `ordenarPor(estado.orden, automatico)`, donde `automatico` es el orden por `y` que usa hoy. Lo que nunca se movió a mano conserva su posición actual.
- Flechas **↑ ↓** en la tarjeta de identidad, que llaman al mismo `PUT /api/red/orden` que ya usa el diagrama, con los ids de los equipos de ese rack.
- Se guarda en segundo plano con actualización optimista, sin recargar el estado completo, siguiendo el comentario de `page.tsx:200-202`: acomodar un rack son diez o quince clics seguidos.
- Un equipo nuevo se agrega **al final** del rack, no al principio.

El orden queda compartido entre la vista de racks y el diagrama, que es lo que el diagrama ya prometía. En consecuencia, el confirmar de «restablecer orden» en `page.tsx:217` deja de decir «el orden automático del diagrama» y pasa a nombrar las dos vistas.

## Fichas

**Ficha de rack:** nombre, ubicación, segmento IP, nota, la lista de sus equipos como accesos directos a sus fichas, bitácora, y zona de precaución con el conteo exacto de equipos, puertos y conexiones que se pierden al eliminar.

**Ficha de equipo:** tipo (selector), nombre, marca, modelo, IP de gestión, cantidad de puertos, nota, rack como dato fijo, bitácora y zona de precaución. El error `409` del cambio de puertos se muestra tal cual, nombrando los puertos con conexión.

Ambas se abren en el cajón lateral que ya existe (`ficha.tsx`), desde el botón «Editar rack» y desde la tarjeta de identidad de cada equipo.

## Pruebas

`tests/inventario.test.ts`, funciones puras sin base de datos, como el resto de la suite:

- `limpiarNotaRack` con las tres notas reales de la semilla: R1 y R3 quedan vacías, R2 conserva sus puertos identificados; el segmento sale vacío en los tres.
- `planCambioPuertos` subiendo, bajando sobre puertos libres, bajando sobre puertos enlazados (error nombrándolos), y cruzando el cero en ambos sentidos.
- `planEliminarRack` y `planEliminarEquipo` contando puertos y enlaces arrastrados sobre el fixture existente.
- `codigoEquipo` generando el siguiente correlativo sin chocar con los ids existentes, con y sin rack.
- El orden de `VistaRacks`: respeta `estado.orden` cuando hay, cae al orden por `y` cuando no.

Las pruebas existentes que tocan las formas de `Rack` y `Equipo` —`tests/fixture-red.ts`, `semilla.test.ts`, `layout.test.ts`— necesitan los campos nuevos para seguir compilando.

## Documentación

`README.md` lista las migraciones de la pestaña Red en orden; hay que agregar `0006_*.sql` a esa lista.
