# Auto-estado por testigo en la pestaña RED

Fecha: 2026-08-11

## Problema

La pestaña MONITOREO ya deriva el estado de internet de cada espacio en tiempo real:
si la MAC testigo del espacio (`net_espacios.testigo_mac` — el AP de la sala, o un
equipo fijo) aparece presente en `mon_devices`, el espacio está operativo; si no,
está sin internet. Pero ese cálculo vive encerrado en MONITOREO.

La pestaña RED —la que se usa para trabajar— sigue mostrando el estado que alguien
tecleó a mano en la ficha. Con 52 espacios documentados, ese estado envejece: hoy
hay 11 en `sin-verificar` y varios `operativo` que nadie volvió a mirar. El
objetivo original del monitoreo era justamente que RED dejara de mentir.

De los 52 espacios, 21 ya tienen testigo asignado. Los 31 restantes no tienen
ningún dispositivo permanente que los delate, y seguirán siendo manuales.

## Decisiones

| Decisión | Elegida |
|---|---|
| Auto vs manual | El vivo **reemplaza** al manual donde hay testigo |
| Espacios sin testigo | Siguen 100 % manuales, sin cambios |
| Alcance | Todo RED: lista, ficha, chips de filtro, Diagrama y Cobertura |
| Selector manual con testigo | Deshabilitado; se recupera quitando el testigo |
| Asignar testigo | También desde la ficha del espacio en RED (hoy solo en MONITOREO) |
| Datos de red viejos | Se cae al estado manual, con aviso — nunca inventa "sin internet" |
| MONITOREO | Se queda como está; sigue siendo la vista tabla de los 52 |

## La regla

Función pura, sin fechas implícitas ni acceso a red:

```ts
estadoEfectivo(espacio, presentes, frescos) → { estado, origen, testigoPresente }
```

| Condición | `estado` | `origen` |
|---|---|---|
| `testigoMac` vacío | el manual guardado | `manual` |
| datos de red no frescos | el manual guardado | `manual` |
| testigo presente en `mon_devices` | `operativo` | `auto` |
| testigo ausente | `sin-internet` | `auto` |

`frescos` es un booleano que calcula quien llama: `refrescado` a menos de 15 minutos
y al menos una fila en `mon_devices`. El guardia importa más de lo que parece: el
sidecar `panel-mon-export` puede morir sin ruido, y sin esta condición RED pintaría
21 salas "sin internet" que están perfectas. Una alarma falsa de ese tamaño quema
la confianza en la pestaña entera.

Las MAC se comparan normalizadas con `normalizarMac` de `reconciliacion.ts`, igual
que hace `estado-ubicacion.ts`.

## Dónde se calcula

`app/red/page.tsx` pide `/api/red` y `/api/monitoreo/ubicaciones` en paralelo, y pasa
el resultado por `aplicarEstadoVivo(estado, vivo)`, que devuelve un `EstadoRed`
derivado donde **`espacio.estado` ya es el efectivo**, más tres campos nuevos por
espacio: `estadoManual`, `origen` y `testigoPresente`.

La consecuencia es que `VistaEspacios`, `Diagrama`, `VistaCobertura`, el buscador y
los contadores de los chips siguen leyendo `espacio.estado` sin tocarse, y no pueden
contradecirse entre sí. El número que muestre el chip «Sin internet» es el mismo
conjunto de espacios que el diagrama pinta en rojo, por construcción.

Las escrituras no cambian de destino: `guardarCampos` sigue mandando el estado
manual a `net_espacios.estado`. El estado automático **no se persiste nunca**; se
calcula en cada render. Así, quitar el testigo devuelve intacto lo que había escrito
a mano.

Si `/api/monitoreo/ubicaciones` falla, RED se dibuja con los estados manuales y
muestra el aviso. La pestaña nunca depende del monitoreo para funcionar.

## Cambios en el código

**Nuevo `lib/red/estado-efectivo.ts`**

- `type OrigenEstado = "auto" | "manual"`
- `type EspacioEfectivo = Espacio & { estadoManual: EstadoEspacio; origen: OrigenEstado; testigoPresente: boolean }`
- `type RedEfectiva = Omit<EstadoRed, "espacios"> & { espacios: EspacioEfectivo[] }`
- `estadoEfectivo(...)` y `aplicarEstadoVivo(estado, vivo)`

`EspacioEfectivo` extiende `Espacio`, así que `RedEfectiva` sigue siendo asignable a
`EstadoRed`: los componentes que no necesitan el origen no cambian de tipo.

**`lib/red/modelo.ts`** — `Espacio` gana `testigoMac: string`. La columna ya existe y
`/api/red` ya la devuelve (hace `select()` completo); solo falta declararla. Rompe
dos constructores de prueba (`tests/fixture-red.ts`, el helper de
`tests/agrupar.test.ts`) que hay que completar.

**`app/api/monitoreo/ubicaciones/route.ts`** — el GET devuelve además `refrescado`
(el `refreshedAt` de la primera fila de `mon_devices`), igual que ya hace
`app/api/monitoreo/route.ts`. Es el único cambio de API.

**`app/red/page.tsx`** — estado nuevo para el payload de ubicaciones, carga en
paralelo, `useMemo` con `aplicarEstadoVivo`, y pasar el estado derivado a las vistas.
Refresco automático del endpoint de ubicaciones cada 90 s (es una sola consulta
pequeña); el botón ↻ recarga las dos cosas.

**`app/red/vista-espacios.tsx`** — junto al badge de estado, una etiqueta chica
`auto` / `manual`, con `title` que explica el porqué («testigo 3c:cd:… presente»).
En fila y en tarjeta.

**`app/red/ficha.tsx`** — bloque «Estado en vivo»: selector de testigo con los
candidatos de `mon_devices` (mismo desplegable de MONITOREO), presencia actual, y
botón **Quitar testigo y volver a manual**. El selector de estado manual queda
deshabilitado mientras haya testigo, con el motivo escrito al lado — un control
apagado sin explicación se lee como un bug.

**Filtro nuevo** en la fila de filtros de Espacios: `Origen: Todos | Auto | Manual`.
Responde a «¿qué me falta automatizar?», que es la pregunta natural con 31 espacios
sin testigo.

**`app/globals.css`** — estilos de la etiqueta de origen y del bloque de la ficha,
en la misma familia que `.net-space-status`.

## Pruebas

`tests/estado-efectivo.test.ts` con `node --test`, sobre la función pura:

- sin testigo → manual, `origen: "manual"`
- testigo presente → `operativo`, `origen: "auto"`
- testigo ausente → `sin-internet`, `origen: "auto"`
- datos no frescos con testigo ausente → manual (el caso que evita la alarma falsa)
- testigo escrito en mayúsculas o con guiones → se normaliza igual
- `aplicarEstadoVivo` conserva el resto del `EstadoRed` sin tocar

## Límites conocidos

**Se pierden dos matices.** Un espacio con testigo ya no puede mostrar `Solo Wi-Fi`
ni `Sin verificar`: la presencia de un AP no distingue eso. Hoy afecta a cuatro
espacios que están en `solo-wifi` y además tienen testigo (Psicología Básica,
Recepción, Dirección, Fonoaudiología). Pasarán a leerse `operativo` o `sin-internet`.
El valor manual no se borra —sigue en la base y vuelve al quitar el testigo—, pero
deja de verse. Quien necesite conservar el matiz, quita el testigo.

**Testigos compartidos.** `3c:cd:57:72:61:1f` es testigo de cuatro espacios
(Recepción, Capellanía, Coordinador SEP, Secretaría Financiera) y
`00:5f:67:0d:5f:db` de tres (Convivencia Escolar, Psicología Media, 3° Básico A).
Esos grupos se moverán siempre juntos: es correcto —comparten AP— pero conviene
saberlo antes de leer «cuatro oficinas cayeron a la vez» como cuatro fallas.

**Testigos que son PC.** NetAlertX marca presencia con ARP cada 5 minutos. Donde el
testigo es un computador y no un AP, de noche y en vacaciones marcará
`sin-internet` porque el equipo está apagado. El auto-estado es fiable en horario de
clases.

## Fuera de alcance

- Persistir el estado automático en `net_espacios.estado`.
- Historial de caídas por espacio (requiere una tabla de eventos, no una foto).
- Navegación por PC con datos de AdGuard: es la v1.1, sobre otra página.
