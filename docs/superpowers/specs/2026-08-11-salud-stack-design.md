# Salud del stack en Panel-Enlace

Fecha: 2026-08-11

## Problema

Panel-Enlace ya no solo documenta: decide. Desde el auto-estado por testigo, la
pestaña RED pinta 21 espacios con lo que dice `mon_devices`, y `mon_devices` la
llena un sidecar (`panel-mon-export`) que puede morir sin ruido. El guardia de 15
minutos evita que esa muerte se convierta en 21 salas "sin internet" falsas, pero
solo hace eso: calla. Nadie se entera de que el monitoreo dejó de monitorear.

El resto del stack está peor. Para saber si el `pg_dump` diario corrió, si el disco
externo sigue montado, cuánta RAM queda o si AdGuard responde, hay que entrar por
SSH y correr media docena de comandos. Es decir: solo lo sabe quien tiene la llave
del servidor, y solo cuando se acuerda de mirar.

El caso que motivó esto apareció mientras se escribía este spec: el disco USB de
respaldo se desconectó el 2026-08-11 a las 12:44. El respaldo de esa noche iba a
fallar y no había ningún mecanismo que lo dijera.

## Decisiones

| Decisión | Elegida |
|---|---|
| Cómo llegan los datos del host | Script + timer systemd en el host, no sidecar |
| `docker.sock` dentro de contenedores | No, en ninguno |
| Dónde vive el juicio | En TypeScript (`lib/salud/evaluar.ts`), no en el shell |
| Qué escribe el script | Hechos crudos: bytes, epoch, booleanos |
| Dónde se ve | Pestaña `/salud` + punto de color en la nav |
| Historia | No se guarda: solo la última medición |
| Alertas | Fuera de alcance; `/salud` muestra, no avisa |
| n8n | No cuenta como contenedor esperado (está detenido a pedido) |

### Por qué host y no sidecar

El patrón del proyecto es el sidecar (`panel-mon-export`, `panel-backup`), y romperlo
necesita justificación. Son tres razones:

1. Un sidecar que vea `docker ps` necesita `docker.sock` montado, y el socket de
   Docker equivale a root en el host. No vale la pena para una lista de contenedores.
2. Solo el host puede leer el estado del propio `respaldo-cabserver.timer`. Es la
   señal más valiosa del conjunto y un contenedor no la alcanza.
3. RAM: quedan ~2 GB. Un timer corre 2 segundos y muere; un contenedor alpine
   permanente no.

El costo es que la pieza vive fuera de `docker-compose.yml` y se vuelve invisible.
Se compensa documentándola en `servicios-cabserver.md`, junto al timer de respaldo
que ya sigue este mismo patrón.

### Por qué el script no escribe juicios

`salud-cabserver.sh` escribe `2013265920`, nunca `"ok"`. Los umbrales viven en una
función pura con test, por las mismas razones que `estado-efectivo.ts`: se pueden
discutir leyendo una tabla, cambiar sin tocar el servidor, y probar sin un servidor.
Un umbral escondido en un `if` de bash no se testea ni se revisa.

## Arquitectura

Tres piezas, en el orden en que viaja el dato:

```
host: salud-cabserver.sh  --(docker exec -i panel-db psql)-->  mon_salud
                                                                   |
                                            app: /api/salud  <-----+
                                                     |
                                     evaluar.ts (puro) --> /salud + punto en nav
```

### 1. Host

- `/usr/local/sbin/salud-cabserver.sh`, root, solo lectura del sistema.
- `salud-cabserver.timer`: cada 5 minutos, `Persistent=false`.
- Escribe con `docker exec -i panel-db psql -U panel -d panel`. Esa conexión entra
  por el socket local del contenedor y **no pide contraseña**, así que el script no
  necesita leer el `.env` ni guardar credenciales.
- Una sola transacción: `BEGIN; TRUNCATE mon_salud; INSERT ...; COMMIT;`. O queda la
  foto completa o queda la anterior; nunca media foto.

Herramientas verificadas presentes en el host: `dig`, `curl`, `findmnt`, `stat`,
`systemctl`, `docker`, `python3`.

### 2. Tabla

```sql
CREATE TABLE IF NOT EXISTS mon_salud (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL DEFAULT '',
  numero     DOUBLE PRECISION,
  medido_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

El DDL va en `db/index.ts`, junto al de `mon_devices`, siguiendo el mismo estilo
idempotente. `clave` usa prefijos: `docker.*`, `host.*`, `backup.*`, `servicio.*`.

Como toda la tabla se reescribe junta, `max(medido_at)` sirve de latido del propio
colector.

### 3. App

| Archivo | Qué hace |
|---|---|
| `lib/salud/evaluar.ts` | Función pura: hechos + ahora → estados |
| `tests/salud.test.ts` | Tabla de casos, un caso por umbral |
| `app/api/salud/route.ts` | Lee `mon_salud` y `mon_devices`, devuelve lo evaluado |
| `app/salud/page.tsx` | Los cuatro bloques |
| `app/punto-salud.tsx` | Cliente: pide `/api/salud`, pinta el punto |
| `app/nav-secciones.tsx` | Cuarta pestaña + el punto |
| `db/index.ts`, `db/schema.ts` | DDL y tipos de `mon_salud` |

## La regla

```ts
evaluarSalud(hechos: HechoSalud[], frescuraMonitoreo: Date | null, ahora: Date)
  → { peor: Estado; bloques: BloqueSalud[] }
```

`Estado = "ok" | "atencion" | "falla" | "sin-datos"`.

Pura: sin `Date.now()` adentro, sin acceso a red, sin leer la base. Los umbrales son
constantes con nombre al principio del archivo.

### Guardia del colector

Antes de evaluar nada del host: si `max(medido_at)` tiene más de **15 minutos** —tres
ciclos perdidos del timer— todas las señales del host devuelven `sin-datos`, no `ok`
ni `falla`. La página dice "no sé nada del servidor desde hace X". El error que hay
que evitar es el mismo que en RED: pintar verde por falta de noticias, o pintar rojo
media escuela porque murió el mensajero.

`sin-datos` cuenta como `atencion` para el punto de la nav. Que el colector muera
importa, pero no es lo mismo que un respaldo perdido.

### Umbrales

| Señal | Clave | `atencion` | `falla` |
|---|---|---|---|
| Frescura de `mon_devices` | (no pasa por el script) | > 6 min | > 15 min |
| Contenedores esperados | `docker.<nombre>` | — | falta, `unhealthy` o `restarting` |
| RAM disponible | `host.ram_disponible` | < 500 MB | < 200 MB |
| Uso de `/` | `host.disco_uso` | > 85 % | > 95 % |
| `pg_dump` del panel | `backup.pgdump_edad` | > 26 h | > 50 h, o 0 bytes |
| Montaje del USB | `backup.usb_montado` | — | `false` |
| Copia en el USB | `backup.usb_edad` | > 26 h | > 50 h |
| Timer de respaldo | `backup.timer_estado` | — | `failed` |
| AdGuard (DNS real) | `servicio.adguard_dns` | — | no resuelve en 3 s |
| NetAlertX, Vaultwarden | `servicio.*` | — | no responde en 3 s |
| Tailscale | `servicio.tailscale` | — | no `Running` |

Las 26 h de los respaldos dan margen a un ciclo diario que se atrasó; las 50 h
significan que se perdieron dos noches seguidas.

### Contenedores esperados

`vaultwarden`, `netalertx`, `adguard`, `panel-enlace`, `panel-db`, `panel-backup`,
`panel-mon-export`. Siete.

`n8n` queda fuera a propósito. Está detenido por decisión, no por falla; incluirlo
dejaría `/salud` en rojo permanente y un rojo permanente no se lee, se ignora. Si
algún día vuelve, se agrega a la lista.

### AdGuard se prueba resolviendo, no respondiendo

Los demás servicios se prueban con un `curl` al puerto. AdGuard no: se prueba con
`dig @127.0.0.1 example.com`. Que la interfaz web conteste no prueba que resuelva
consultas, y cuando los 40 PCs lo tengan de DNS primario, lo único que importa es si
resuelve. Un AdGuard con la web viva y el DNS muerto deja a la escuela sin navegar.

## Pantalla

`/salud`, cuatro bloques en el orden en que importan:

1. **Monitoreo** — frescura de `mon_devices`, cuántos espacios están cayendo a manual.
2. **Servidor** — contenedores, RAM, disco.
3. **Respaldos** — `pg_dump`, montaje del USB, última copia, estado del timer.
4. **Servicios** — AdGuard, NetAlertX, Vaultwarden, Tailscale.

Cada fila: nombre, punto de color con la palabra al lado, y el valor en lenguaje
humano — "hace 3 min", "1,9 GB libres", "8 % usado", "desconectado desde las 12:44".
El color nunca va solo: siempre lleva palabra, para que se lea sin distinguir colores.

Encabezado con "medido hace X" y botón de refrescar, como `/monitoreo`.

Sin gráficos: no se guarda historia, así que no hay nada que graficar.

**El punto en la nav** (`app/punto-salud.tsx`) muestra el peor estado del conjunto.
Componente cliente, un fetch al montar, sin polling — la nav está en las tres páginas
y no vale la pena una petición cada 30 segundos para algo que cambia cada 5 minutos.
Si el fetch falla, el punto no se pinta: la nav nunca se rompe por culpa de `/salud`.

## Fuera de alcance

- **No avisa.** Sin correo, sin ntfy, sin Telegram. Ese es el paso siguiente y
  merece su propia decisión: es lo que convierte a `/salud` en algo que funciona
  cuando nadie está mirando.
- **No guarda historia.** Ni gráficos, ni uptime, ni "cuántas veces falló". La
  pregunta que responde es "¿está sano ahora?".
- **No arregla nada.** No reinicia contenedores ni monta discos: solo lee.
- **No toca SMART ni temperatura.** Se puede sumar después con la misma cañería.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El colector muere y la página miente en verde | Guardia de 15 min → `sin-datos` |
| El script rompe con `set -e` y deja la tabla vacía | Todo va en una transacción; si falla, queda la foto anterior y envejece a la vista |
| Una sonda lenta cuelga el timer | `timeout 3` en cada `curl` y `dig`; `TimeoutStartSec` en el service |
| La pieza del host se olvida | Documentada en `servicios-cabserver.md`, junto al timer de respaldo |
| `/salud` queda en rojo crónico y se ignora | Por eso n8n no cuenta, y por eso `sin-datos` no es `falla` |

## Verificación

- `npm test` verde, con los casos de umbral de `evaluarSalud`.
- Con el timer corriendo: `/salud` muestra los 7 contenedores en verde.
- Deteniendo `panel-mon-export` a mano: el bloque Monitoreo pasa a `falla` a los 15
  min y RED muestra su aviso de datos viejos. Se vuelve a levantar después.
- Con el USB desconectado (estado real al escribir esto): Respaldos muestra
  "desconectado" en rojo.
- Matando el timer: a los 15 min todo el host queda en `sin-datos`, no en verde.
