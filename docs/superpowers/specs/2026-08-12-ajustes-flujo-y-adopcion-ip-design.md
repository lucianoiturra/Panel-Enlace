# Ajustes al flujo, sangría del contenido y adopción de IP reales

Fecha: 2026-08-12
Estado: propuesto

Addendum de `2026-08-12-flujo-y-consolidacion-design.md`, escrito después de ver el
resultado desplegado. Dos de los tres puntos son correcciones a ese trabajo; el
tercero es la funcionalidad que aquel spec dejó explícitamente fuera de alcance.

## 1 · El diagrama: cuatro arreglos

### 1.1 · El baricentro nunca ordenó la última columna · defecto

`ordenarPorBaricentro()` se aplica solo en la rama de equipos de `construirFlujo`
(`lib/red/flujo.ts:356`). Los grupos de destino se recorren con
`for (const [grupo, lista] of porGrupo)`, y un `Map` itera en orden de inserción, que
aquí es el orden en que salieron los espacios de la base.

**La columna con más cruces es exactamente la que quedó sin ordenar.** Se ve en el
despliegue: «Salas talleres» está arriba de todo alimentado desde `R3/PP1`, que está
abajo de todo, y su cinta cruza el lienzo entero.

Arreglo: los grupos de destino se ordenan por la media de las `y` de los equipos que
los alimentan, con el mismo `ordenarPorBaricentro` y la misma regla de que
`estado.orden` manda por encima. Es la corrección de mayor efecto de este addendum.

### 1.2 · Los rótulos de columna se pisan

`BORDE · SALIDA A INTERNET` mide más que su columna —~160 unidades— e invade
`SWITCHES`. Dos cambios:

- `TITULO_CAPA.borde` pasa de `"Borde · salida a internet"` a `"Borde"`. Las otras
  tres ya caben.
- El rótulo se recorta al ancho de su columna en vez de confiar en que quepa: si
  `anchoDeTexto(titulo) > columna.w`, se trunca con `…`. Un rótulo que no cabe es un
  dato de entrada posible, no un accidente: los tipos de espacio son renombrables
  desde la interfaz.

### 1.3 · Los equipos vacíos ocupan el mejor espacio

`R2/SW3 0/28`, `R2/PP2 0/24`, `R2/PP3 0/24` y `R3/PP2 0/24` están arriba de su bloque
empujando hacia abajo a los que sí tienen cableado. Dentro de un bloque, un equipo con
cero puertos ocupados va **al final**. El orden manual sigue mandando por encima.

### 1.4 · El peso lo fija el tipo, no la cantidad

Hoy `grosorDeCinta(cuenta)` solo mira cuántos enlaces resume la cinta. Por eso nueve
rosetas de sala se dibujan más gruesas que el uplink que las alimenta, y el ojo lee las
capilares como si fueran la espina dorsal. La jerarquía está al revés.

El grosor y la opacidad pasan a salir del **tipo de enlace**, y la cantidad solo modula
dentro de la banda de su tipo:

| Tipo | Grosor base | Máximo | Opacidad |
| --- | --- | --- | --- |
| `borde` | 5 | 7 | 1 |
| `uplink` | 4.5 | 6.5 | 0.95 |
| `patch` | 2 | 4 | 0.55 |
| `roseta` | 1.2 | 2.4 | 0.3 |

`grosor = min(máximo, base + log2(max(cuenta,1)) · 0.5)`.

**La opacidad va como `stroke-opacity` en el `<path>`, no como `opacity` en el `<g>`.**
El grupo ya lleva la opacidad que gobierna el aislamiento de circuito
(`.net-d-lienzo.sel-activa .net-d-link` a `.07`, y `.ruta` a `1`); ponerla en el mismo
sitio haría que una roseta de la ruta iluminada siguiera al 30 % y la ruta dejaría de
verse. Son dos ejes distintos y tienen que vivir en dos propiedades distintas.

## 2 · Sangría del contenido

La escala de espaciado del trabajo anterior dio aire **dentro** de las cajas, pero
`.shell` no tiene padding horizontal: el texto queda exactamente en el extremo de las
líneas divisorias, que es lo que se sigue viendo pegado al filo.

- `.shell` recibe `padding-inline: var(--esp-5)`.
- Los elementos cuya regla debe seguir llegando de borde a borde —`.room-surface`
  (su `border-top` de 2px), `.status-rail`, `.net-navigation-bar`, `.net-space-filters`,
  `.net-space-controls`, `.net-space-list-head`— reciben el patrón de sangrado
  completo: `margin-inline: calc(var(--esp-5) * -1); padding-inline: var(--esp-5)`. El
  borde de un elemento abarca su caja de padding, así que la línea sale a todo el
  ancho y el texto queda adentro.

En móvil (`max-width:600px`) la sangría baja a `var(--esp-3)`: a 375px, 24 por lado se
come el 13 % del ancho útil.

## 3 · Adoptar las IP reales

Lo que el spec anterior dejó fuera, ahora en alcance y en su forma revisable.

### 3.1 · La interfaz

Cuando `resumen["ip-distinta"] > 0`, el contador de ese estado en el rail vivo de SALA
se vuelve accionable y abre un modal **Adoptar IP reales**:

- Una fila por cubículo en drift: número, `IP documentada → IP real`, y un check.
- Todos vienen marcados; se desmarca lo que no se quiera tocar.
- El pie dice cuántos se van a actualizar y el botón lo repite: «Adoptar 12 IP».

Se ve exactamente qué va a cambiar antes de que cambie. Es el mismo criterio que ya
usa `LimpiarConexiones`: nombrar lo que se va a perder antes de perderlo.

### 3.2 · El endpoint

`POST /api/room/adoptar-ip`, cuerpo `{ cambios: { id: number; ipEsperada: string }[] }`.

Cuatro guardias, y cada uno existe por una razón concreta:

1. **El servidor recalcula la reconciliación.** No confía en ninguna IP que venga del
   cliente: el cuerpo solo dice *qué cubículos* adoptar, nunca *qué valor*. El valor
   sale de `mon_devices` en el mismo request.
2. **Frescura.** Si el volcado tiene más de `MINUTOS_FRESCURA`, la petición se rechaza
   con 409 y un mensaje que lo dice. Adoptar IP de un volcado viejo escribiría en la
   documentación una foto de hace horas.
3. **Concurrencia optimista por fila.** Solo se actualizan los cubículos cuya `ip`
   sigue siendo `ipEsperada`. Los que cambiaron mientras el modal estaba abierto se
   omiten y se informan. Es el equivalente por lote del control de versión que la ficha
   ya tiene.
4. **Una transacción.** Un fallo a mitad de camino no puede dejar media sala reescrita.

Respuesta: `{ actualizados: number[]; omitidos: { id: number; motivo: string }[] }`, y
la interfaz lo dice con esas palabras en vez de un «listo» genérico.

### 3.3 · Bitácora

Los 40 cubículos no tienen bitácora propia —es el hallazgo U8 de
`revision-panel-enlace.md`—, así que se usa la que ya existe: `net_bitacora`, con
`objetivo = "cub:N"`. La ficha de cubículo de RED ya filtra su historial por ese
`objetivo`, de modo que la entrada aparece sola donde tiene que aparecer, sin tocar
esa pantalla.

Se agrega `"ip-adoptada"` a `TipoBitacora`, con `antes` = IP documentada y `despues` =
IP real. Una entrada por cubículo, dentro de la misma transacción.

**Esto no cierra U8.** Sigue sin haber bitácora de cubículos para el resto de los
campos; lo que hace es no abrir un agujero nuevo.

## Errores y estados degradados

| Situación | Qué pasa |
| --- | --- |
| Volcado con más de 15 min al presionar Adoptar | 409, el modal muestra el motivo y no aplica nada |
| Un cubículo dejó de estar en drift mientras el modal estaba abierto | se omite y se informa por su número |
| Otro operador cambió esa IP a mano mientras tanto | se omite: `ipEsperada` ya no coincide |
| Ningún cubículo en drift | el contador del rail no es accionable |

## Pruebas

`tests/flujo.test.ts` gana:

- los grupos de destino quedan ordenados por el baricentro de sus padres
- un rótulo más largo que su columna se trunca
- un equipo con cero puertos ocupados queda al final de su bloque
- el orden manual sigue mandando sobre las tres reglas anteriores
- `grosorDeCinta("roseta", 9) < grosorDeCinta("uplink", 1)` — la prueba que fija la
  jerarquía y que falla hoy

`tests/adoptar-ip.test.ts`, nuevo, sobre la función pura que decide qué se aplica:

- solo se adoptan los que están en `ip-distinta`
- un cubículo cuya `ip` ya no es `ipEsperada` se omite con motivo
- un volcado viejo no adopta nada
- la IP que se escribe sale siempre de `mon_devices`, nunca del cuerpo del request

La sangría y el peso de las líneas no llevan prueba automatizada: verificación manual
a 1440 / 1000 / 760 / 375 px.

## Fuera de alcance

- **Ruteo ortogonal por canales** (la opción B de la conversación). Se descartó por
  ahora: los cuatro arreglos de la sección 1 explican la mayor parte del desorden, y
  el ruteo se puede montar encima después sin rehacer nada.
- Bitácora propia de cubículos (U8).
