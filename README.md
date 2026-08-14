# Panel Enlace

Documentación viva del Depto. Enlace del colegio, en tres pestañas:

| Pestaña | Ruta | Qué responde |
| --- | --- | --- |
| SALA | `/` | los 40 computadores de la Sala de Enlace: ip, mac, PIN, estado, checklist, encendido programado |
| RED | `/red` | racks, switches, puertos, espacios, diagrama, cobertura y la trazabilidad puerto ↔ sala hasta el ISP |
| SALUD | `/salud` | si el stack de cabserver está sano ahora |

## El invariante que gobierna la app

> **Los datos vivos nunca sobrescriben los datos documentados.** Se muestran al lado.

Su corolario es el **guardia de frescura** (`MINUTOS_FRESCURA` en
`lib/red/estado-efectivo.ts`, 15 min): si la tabla `mon_devices` está vieja o vacía, la app
muestra el estado escrito a mano y avisa — **no inventa "sin internet"**. Sin ese guardia,
la muerte del sidecar que la llena pintaría 38 cubículos rojos y 21 salas caídas. La falta
de noticias no es una buena noticia, pero tampoco es una caída.

Por la misma razón, un testigo que **desapareció** de NetAlertX se marca
`testigo-desconocido` y cae al estado manual, en vez de declarar caído el espacio: perdimos
el sensor, no el enlace.

## Dónde corre

La app está **autoalojada en cabserver** (Debian, Docker), publicada sólo dentro del
tailnet por Tailscale Serve. No hay nada expuesto a internet.

| Dato | Valor |
| --- | --- |
| Clon desplegado | `/srv/apps/panel-enlace` — **es la única copia**, no hay clon local |
| Compose | `/srv/apps/compose/panel-enlace/docker-compose.yml` |
| URL | `https://cabserver.tail0dd5e7.ts.net:8443` |
| Stack | Next.js 16 · Drizzle · `postgres.js` · Postgres 17 |

Contenedores: `panel-enlace` (web), `panel-db` (Postgres), y `panel-mon-export`, un sidecar
que cada 3 minutos copia la SQLite de NetAlertX a la tabla `mon_devices`.

Antes esto vivía en Vercel + Supabase. Ya no: migró a cabserver el 2026-08-10 para juntarlo
con el monitoreo y sacarlo de internet público. Las migraciones de `drizzle-pg/` son el
registro de esa época — **hoy no se aplican a mano**: el esquema se crea solo por el DDL
(`CREATE TABLE IF NOT EXISTS`) que corre `getDb()` en `db/index.ts`.

## Variables de entorno

Viven en `/srv/apps/compose/panel-enlace/.env` (chmod 600, fuera de git). Plantilla en
`.env.example`.

| Variable | Para qué |
| --- | --- |
| `DB_PASSWORD` | contraseña de Postgres; la consumen también `panel-db` y el sidecar |
| `DATABASE_URL` | cadena de conexión de la app |
| `APP_USERNAME` / `APP_PASSWORD` | el Basic Auth de `proxy.ts` |
| `PIN_ENCRYPTION_KEY` | cifra los PIN de cubículo |

`proxy.ts` protege **todas** las rutas, así que una página o API nueva queda protegida sola.
Si falta cualquiera de las dos credenciales, la app responde 503 a todo y lo registra: el
guardia falla cerrado, no abierto.

`PIN_ENCRYPTION_KEY` tiene que ser larga, secreta y **estable**. Si cambia, los PIN ya
guardados dejan de poder descifrarse; la ficha lo dice con todas sus letras y deja escribir
uno nuevo encima, pero los anteriores no vuelven.

## Compilar y probar

**Node no está instalado en el host de cabserver.** Todo va en contenedor:

```bash
# pruebas de las funciones puras
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "node --experimental-strip-types --test tests/*.test.ts"

# tipos
docker run --rm -v /srv/apps/panel-enlace:/app -w /app node:22-alpine \
  sh -c "npx --no-install tsc --noEmit"

# reconstruir y desplegar
cd /srv/apps/compose/panel-enlace && docker compose up -d --build
```

En una máquina con Node 22 o superior, `npm install && npm run dev` sigue funcionando
apuntando `DATABASE_URL` a cualquier Postgres: el DDL crea el esquema en el primer acceso.

## Convenciones de código

- Lógica pura en `lib/*`, con pruebas `node --test` en `tests/*.test.ts`. Las rutas de
  `app/api/*` son cableado: leen, llaman a la lógica pura y responden.
- Imports lib↔lib **con** extensión `.ts` (tsconfig `allowImportingTsExtensions`);
  imports app→lib **sin** extensión.
- Identificadores y comentarios en **español**. Los comentarios explican el *por qué*,
  nunca el *qué*.

## La pestaña Red

Los datos iniciales salen de `lib/red/semilla.json`, generado desde el canvas con:

```bash
node herramientas/convertir-canvas.mjs
```

La siembra se aplica una sola vez por base, marcada en `app_metadata` con la clave
`red_semilla_version`, e inserta sólo lo que falta: volver a correrla no pisa una asignación
capturada. Los espacios que alguien borra quedan anotados en `red_espacios_borrados` para
que regenerar la semilla no los reviva.

Para verificar la capa de persistencia contra una instancia levantada —siembra, conteos,
reglas de la API y bitácora— hay un script aparte. Escribe y limpia detrás de sí, salvo las
entradas de bitácora, que son append-only:

```bash
APP_USERNAME=... APP_PASSWORD=... node herramientas/verificar-red.mjs https://cabserver.tail0dd5e7.ts.net:8443
```

El orden de trabajo para capturar las asignaciones puerto ↔ espacio está en
[docs/levantamiento-red.md](docs/levantamiento-red.md), y el encendido programado en
[docs/encendido-programado.md](docs/encendido-programado.md).

## Lo que corre fuera de Docker

`ops/` versiona los scripts del host y sus unidades de systemd: el colector de salud, el
Wake-on-LAN, los avisos por Telegram y el respaldo de la base. **Editar la copia del repo no
cambia la que corre** — se instalan con los `instalar-*.sh` y se comparan con `sha256sum`
contra `/usr/local/sbin/`.

## Comandos

```bash
npm run dev
npm run build
npm run lint
npm test        # build + pruebas de las funciones puras
```
