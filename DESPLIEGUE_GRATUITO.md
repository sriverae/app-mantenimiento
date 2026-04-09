# Despliegue de prueba: Vercel + Render + PostgreSQL + Cloudinary

Esta guía deja la aplicación lista para una prueba gratuita sin depender de que tu PC esté encendida.

## Arquitectura recomendada

- `Frontend`: Vercel
- `Backend`: Render Web Service
- `Base de datos`: PostgreSQL administrado (`DATABASE_URL`)
- `Fotos`: Cloudinary

## 1. Preparar PostgreSQL

Puedes usar cualquier PostgreSQL administrado que te entregue una `DATABASE_URL`.

Ejemplos:

- Render Postgres
- Neon Postgres

La aplicación ya convierte automáticamente:

- `postgres://...`
- `postgresql://...`

a:

- `postgresql+asyncpg://...`

Así que no tienes que editar la cadena manualmente.

## 2. Crear Cloudinary

Necesitas estos tres datos:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Opcional:

- `CLOUDINARY_FOLDER=maintenance-app/tasks`

Si no configuras Cloudinary, las fotos seguirán yéndose a `uploads/` local. Para Render eso no conviene, porque el disco es efímero.

## 3. Desplegar backend en Render

El repositorio ya trae [`render.yaml`](./render.yaml).

Puedes crear el servicio desde Render apuntando a este repositorio, o usar la configuración como referencia manual.

Variables mínimas del backend:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `API_BASE_URL`
- `ALLOWED_ORIGINS`

Variables recomendadas:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER`

Valores ejemplo:

```env
DATABASE_URL=postgresql://usuario:clave@host:5432/base?sslmode=require
JWT_SECRET_KEY=pon-aqui-una-clave-larga-y-segura
API_BASE_URL=https://tu-backend.onrender.com
ALLOWED_ORIGINS=http://localhost:3000,https://tu-frontend.vercel.app
CLOUDINARY_CLOUD_NAME=xxxx
CLOUDINARY_API_KEY=xxxx
CLOUDINARY_API_SECRET=xxxx
CLOUDINARY_FOLDER=maintenance-app/tasks
```

Comando de inicio:

```bash
uvicorn api:app --host 0.0.0.0 --port $PORT
```

## 4. Desplegar frontend en Vercel

En Vercel:

1. Importa el repositorio.
2. Configura `Root Directory = frontend`.
3. Define la variable:

```env
REACT_APP_API_URL=https://tu-backend.onrender.com
```

El proyecto ya incluye [`frontend/vercel.json`](./frontend/vercel.json) para que las rutas de React Router funcionen al recargar.

## 5. Confirmar CORS

En Render, `ALLOWED_ORIGINS` debe incluir:

- tu URL de Vercel
- `http://localhost:3000` si seguirás desarrollando localmente

Ejemplo:

```env
ALLOWED_ORIGINS=http://localhost:3000,https://maintenance-app.vercel.app
```

## 6. Primer arranque esperado

Al iniciar con una base vacía:

- se crean las tablas automáticamente
- se crea el usuario inicial `admin / Admin1234!`

Después del primer ingreso, cambia la contraseña.

## 7. Qué queda listo con estos cambios

- PostgreSQL en vez de SQLite local
- fotos en Cloudinary en vez de disco local
- frontend desacoplado del backend local
- rutas React compatibles con Vercel
- backend listo para Render sin tocar código adicional

## 8. Recomendación para la prueba

Para una prueba simple:

1. Sube backend a Render.
2. Conecta `DATABASE_URL` de PostgreSQL.
3. Configura Cloudinary.
4. Sube frontend a Vercel.
5. Carga `REACT_APP_API_URL`.
6. Inicia sesión y valida:
   - login
   - documentos compartidos
   - fotos
   - PDF
   - importaciones

## 9. Qué no hace automáticamente

Esto no migra tu `db.sqlite3` local hacia PostgreSQL. Para poblar el entorno nuevo puedes:

- volver a cargar catálogos con las importaciones Excel
- exportar y migrar datos luego en una segunda etapa

Si quieres, el siguiente paso es dejarte un checklist exacto para publicar tu instancia de prueba en Render y Vercel en menos de una hora.
