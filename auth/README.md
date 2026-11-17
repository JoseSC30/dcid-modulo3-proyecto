# Servicio Auth

## Descripción

Microservicio encargado del registro e inicio de sesión de los usuarios de
EntradasYa. Guarda las contraseñas protegidas y entrega un token JWT al iniciar
sesión.

## Tecnologías

- Node.js y Express.js
- PostgreSQL
- JavaScript

## Requisitos

- Node.js 20 o superior y npm.
- PostgreSQL instalado y en ejecución.

## Instalación

Desde la carpeta `auth`:

```bash
npm install
```

Crear la base de datos en PostgreSQL, si aún no existe:

```sql
CREATE DATABASE auth_db;
```

## Configuración

Copiar `.env.example` a `.env` y completar:

- `PORT`: puerto del servicio. Por defecto, 3001.
- `DATABASE_URL`: conexión a la base `auth_db`, con el usuario y contraseña de PostgreSQL.
- `JWT_SECRET`: clave secreta para firmar los tokens.

Generar una clave segura con este comando y colocar el resultado en `JWT_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No compartir el archivo `.env` ni subirlo al repositorio. Después, crear la
tabla de usuarios:

```bash
npm run db:init
```

## Ejecución

Modo desarrollo:

```bash
npm run dev
```

Modo normal:

```bash
npm start
```

## Chequeo de salud

GET http://localhost:3001/health

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "auth"
}
```

Si no puede consultar la base de datos, devuelve el estado 503.

## Endpoints

| Método | URL | Descripción |
| --- | --- | --- |
| GET | http://localhost:3001/health | Verifica el servicio y la base de datos. |
| POST | http://localhost:3001/auth/register | Registra un cliente. |
| POST | http://localhost:3001/auth/login | Inicia sesión y entrega un token. |

Ejemplo de registro:

```json
{
  "nombre": "Ana",
  "correo": "ana@example.com",
  "password": "clave-segura"
}
```

Para iniciar sesión se envían `correo` y `password`. La respuesta contiene
`token` y `usuario`; el token incluye el id y rol del usuario y dura una hora.
La contraseña debe tener entre 8 y 128 bytes y el correo no puede repetirse.

El registro público crea usuarios con rol `cliente`. Para crear un
`organizador` o `portero`, ejecutar `npm run user:create` en una terminal
privada y responder las preguntas. La contraseña será visible al escribirla.

Los demás servicios deberán verificar el token con el mismo `JWT_SECRET`,
el algoritmo HS256 y su fecha de expiración. Por ahora, el servicio de eventos
todavía no verifica tokens ni restringe sus operaciones por rol.

## Pruebas

```bash
npm test
```
