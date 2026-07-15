# Panel Enlace

Panel de control para el levantamiento y seguimiento de los 40 computadores de la Sala de Enlace.

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

No es necesario configurar comandos especiales en Vercel: el proyecto usa `npm run build` y las funciones de Next.js crean las tablas iniciales automáticamente en el primer acceso. La migración PostgreSQL inicial también está disponible en `drizzle-pg/`.

## Comandos

```bash
npm run dev
npm run build
npm run lint
```
