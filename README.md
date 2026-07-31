# Panel Enlace

Panel de control del Depto. Enlace, con dos secciones: el levantamiento y seguimiento de los
40 computadores de la Sala de Enlace, y la documentación de la red del colegio —racks,
puertos, espacios y la trazabilidad puerto ↔ sala hasta el ISP.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

Para desarrollo local, copia `.env.example` a `.env.local` y usa la cadena de conexión de tu proyecto Supabase.

## Despliegue en Vercel

1. Crea un proyecto en [Supabase](https://supabase.com/) y abre **Connect**.
2. Importa este repositorio en Vercel como un proyecto Next.js.
3. Configura estas variables en **Settings > Environment Variables** para Production y Preview:

```text
DATABASE_URL=postgresql://...
PIN_ENCRYPTION_KEY=...
APP_USERNAME=...
APP_PASSWORD=...
EQUIPMENT_REFERENCE_JSON=[...]
```

`PIN_ENCRYPTION_KEY` debe ser una cadena secreta larga y estable. No la cambies después de guardar PINs, porque los valores existentes dejarían de poder descifrarse.

En `DATABASE_URL`, usa la conexión **Transaction pooler** de Supabase (puerto `6543`), recomendada para funciones serverless como las de Vercel. La contraseña debe ir codificada para URL si contiene caracteres especiales.

`APP_USERNAME` y `APP_PASSWORD` protegen tanto el panel como sus API mediante el acceso privado del navegador. En Vercel son obligatorias; usa valores largos que no compartas en GitHub.

`EQUIPMENT_REFERENCE_JSON` es opcional. Permite cargar el inventario inicial sin publicar IP, MAC ni PINs en GitHub. Debe ser un arreglo JSON con objetos que incluyan `id`, `ip`, `mac`, `studentPin`, `adminPin` y, opcionalmente, `noComputer`.

No es necesario configurar comandos especiales en Vercel: el proyecto usa `npm run build`. En desarrollo local las tablas se crean solas en el primer acceso, pero **en producción no**: `getDb()` salta el DDL cuando corre en Vercel, así que las migraciones de `drizzle-pg/` hay que aplicarlas en Supabase (SQL Editor o `psql`).

### Pestaña Red

Las seis tablas `net_*` vienen en `drizzle-pg/0001_robust_ultimatum.sql`. Después aplica
`drizzle-pg/0002_nostalgic_tarot.sql`, `0003_certain_jean_grey.sql`,
`0004_silly_black_crow.sql`, `0005_melodic_rhodey.sql` y `0006_racks_equipos.sql`.
Ejecuta las migraciones en orden en Supabase antes de publicar, por lo dicho arriba
sobre el DDL en Vercel.

Los datos iniciales vienen de `lib/red/semilla.json`, generado desde el canvas con:

```bash
node herramientas/convertir-canvas.mjs
```

La siembra se aplica una sola vez, marcada en `app_metadata` con la clave
`red_semilla_version`, e inserta solo lo que falta: volver a correrla no pisa asignaciones
capturadas.

Para verificar la capa de persistencia contra una instancia levantada —siembra, conteos,
reglas de la API y bitácora— hay un script aparte. Escribe y limpia detrás de sí, salvo las
entradas de bitácora, que son append-only:

```bash
APP_USERNAME=... APP_PASSWORD=... node herramientas/verificar-red.mjs https://tu-app.vercel.app
```

El orden de trabajo para capturar las asignaciones puerto ↔ espacio está en
[docs/levantamiento-red.md](docs/levantamiento-red.md).

## Comandos

```bash
npm run dev
npm run build
npm run lint
npm test        # build + pruebas de las funciones puras
```
