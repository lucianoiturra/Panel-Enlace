# Panel Enlace

Panel de control para el levantamiento y seguimiento de los 40 computadores de la Sala de Enlace.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

Sin variables adicionales, el desarrollo local usa `local.db`, un archivo SQLite ignorado por Git.

## Despliegue en Vercel

1. Crea una base de datos en [Turso](https://turso.tech/) y obtén su URL y token.
2. Importa este repositorio en Vercel como un proyecto Next.js.
3. Configura estas variables en **Settings > Environment Variables** para Production y Preview:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
PIN_ENCRYPTION_KEY=...
APP_USERNAME=...
APP_PASSWORD=...
EQUIPMENT_REFERENCE_JSON=[...]
```

`PIN_ENCRYPTION_KEY` debe ser una cadena secreta larga y estable. No la cambies después de guardar PINs, porque los valores existentes dejarían de poder descifrarse.

`APP_USERNAME` y `APP_PASSWORD` protegen tanto el panel como sus API mediante el acceso privado del navegador. En Vercel son obligatorias; usa valores largos que no compartas en GitHub.

`EQUIPMENT_REFERENCE_JSON` es opcional. Permite cargar el inventario inicial sin publicar IP, MAC ni PINs en GitHub. Debe ser un arreglo JSON con objetos que incluyan `id`, `ip`, `mac`, `studentPin`, `adminPin` y, opcionalmente, `noComputer`.

No es necesario configurar comandos especiales en Vercel: el proyecto usa `npm run build` y las funciones de Next.js crean las tablas iniciales automáticamente en el primer acceso.

## Comandos

```bash
npm run dev
npm run build
npm run lint
```
