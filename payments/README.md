# Servicio Payments

## A. Descripción general

Payments es el microservicio de pagos simulados de EntradasYa. Recibe solicitudes de pago, aplica reglas deterministas, registra cada transacción en su propia base de datos PostgreSQL y evita que una misma orden genere dos pagos.

No procesa dinero real, no se conecta a pasarelas externas y no depende de Auth, Events ni Orders para instalarse, ejecutarse o probarse. Orders se integrará después mediante HTTP/JSON.

Responsabilidades implementadas:

- Procesar pagos simulados con `CARD`, `QR`, `BANK_TRANSFER` y `WALLET`.
- Aprobar o rechazar pagos según reglas deterministas.
- Registrar transacciones con monto, moneda, método, estado, referencia, datos no sensibles del comprador y fechas.
- Garantizar una sola transacción por orden mediante `UNIQUE`, bloqueos transaccionales de PostgreSQL y verificación de idempotencia.
- Exponer endpoints internos de consulta y health check.

Tecnologías:

- Node.js 20 o superior.
- Express 5.
- PostgreSQL con `pg`.
- `jsonwebtoken` preparado para la futura validación JWT.
- `dotenv`.
- `node:test`.

### Reglas de la simulación

| Método | Regla |
| --- | --- |
| `CARD` | Requiere `card`. El número debe tener entre 13 y 19 dígitos, pasar Luhn, tener vencimiento futuro y CVV válido. Si termina en `0000`, el pago es rechazado con `CARD_DECLINED`. Los demás se aprueban. |
| `QR` | Se aprueba después de validar la solicitud. No acepta `card`. |
| `BANK_TRANSFER` | Se aprueba después de validar la solicitud. No acepta `card`. |
| `WALLET` | Se aprueba después de validar la solicitud. No acepta `card`. |

Tarjetas ficticias útiles:

- Aprobada: `4111111111111111`.
- Aprobada Mastercard: `5555555555554444`.
- Rechazada por terminar en `0000`: `4000000000020000`.

Solo se conservan los últimos cuatro dígitos y la marca. Nunca se guardan ni se registran en logs el número completo, el CVV ni el secreto JWT.

## B. Requisitos previos

- Node.js 20 o superior y npm.
- PostgreSQL 14 o superior en ejecución.
- Acceso a PostgreSQL con permisos para crear la base de datos o esquema.
- `psql` es opcional, pero recomendado para crear la base de datos.

No se necesita Docker, Redis, RabbitMQ ni servicios externos.

## C. Instalación

Desde la raíz del repositorio:

```bash
cd payments
npm install
```

Copiar el archivo de ejemplo:

```bash
copy .env.example .env
```

En macOS o Linux:

```bash
cp .env.example .env
```

Generar un secreto JWT seguro y colocarlo en `JWT_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Crear el usuario y la base de datos en PostgreSQL:

```sql
CREATE USER payments_user WITH PASSWORD 'password';
CREATE DATABASE payments_db OWNER payments_user;
```

También puede hacerse desde la terminal:

```bash
psql -U postgres -c "CREATE USER payments_user WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE payments_db OWNER payments_user;"
```

Ajustar `DATABASE_URL` en `.env` si usó otro usuario, contraseña, host o puerto.

Crear la tabla, los índices y el trigger:

```bash
npm run db:init
```

Iniciar el servicio:

```bash
npm start
```

Para reinicio automático durante desarrollo:

```bash
npm run dev
```

Comprobar que responde:

```bash
curl http://localhost:3002/health
```

Con PostgreSQL disponible, la respuesta es:

```json
{
  "status": "ok",
  "service": "payments"
}
```

Si PostgreSQL no está disponible, el servicio arranca pero `/health` responde `503` con `DATABASE_UNAVAILABLE`.

## D. Variables de entorno

| Variable | Obligatoria | Ejemplo | Propósito |
| --- | --- | --- | --- |
| `PORT` | No | `3002` | Puerto HTTP. Valor por defecto: `3002`. Debe ser un entero entre 1 y 65535. |
| `DATABASE_URL` | Sí | `postgresql://payments_user:password@localhost:5432/payments_db` | Cadena de conexión a `payments_db`. |
| `JWT_SECRET` | Sí | `cambiar-por-una-clave-aleatoria-de-al-menos-32-bytes` | Clave HS256 compartida futura con Auth. Debe tener al menos 32 bytes. |

El archivo `.env` real está ignorado por Git. La configuración se valida al iniciar; si falta una variable obligatoria, el proceso termina con un error claro.

`JWT_SECRET` es exigido por la configuración, pero las rutas actuales no requieren token. El middleware `createJwtMiddleware` queda disponible para activarse cuando se acuerde la integración con Auth.

## E. Endpoints

Todas las respuestas de error tienen la forma:

```json
{
  "error": "Mensaje para el cliente",
  "code": "CODIGO_DEL_ERROR"
}
```

### `GET /health`

Comprueba el proceso y la conexión con PostgreSQL.

- Parámetros: ninguno.
- Headers: ninguno.

Respuesta exitosa (`200`):

```json
{
  "status": "ok",
  "service": "payments"
}
```

Respuesta sin persistencia (`503`):

```json
{
  "error": "No fue posible conectar con la base de datos de pagos",
  "code": "DATABASE_UNAVAILABLE"
}
```

### `POST /payments`

Procesa y registra un pago.

- Header obligatorio: `Content-Type: application/json`.
- Cuerpo:

```json
{
  "order_id": "1001",
  "amount": 50,
  "currency": "BOB",
  "description": "Entradas Concierto",
  "payment_method": "CARD",
  "payment_reference": "REF-1001",
  "buyer": {
    "name": "Ana Perez",
    "email": "ana@example.com",
    "document_type": "CI",
    "document_number": "1234567",
    "phone": "+59171234567"
  },
  "card": {
    "number": "4111111111111111",
    "expiry": "12/30",
    "cvv": "123",
    "holder": "Ana Perez"
  }
}
```

Campos:

| Campo | Obligatorio | Regla |
| --- | --- | --- |
| `order_id` | Sí | Texto sin espacios de 1 a 64 caracteres o entero positivo. Se normaliza a texto. |
| `amount` | Sí | Número o texto positivo con hasta dos decimales. Se responde como texto con dos decimales. |
| `currency` | Sí | Solo `BOB`, sin distinción de mayúsculas. |
| `description` | No | Hasta 255 bytes. Por defecto: `Pago de la orden {order_id}`. |
| `payment_method` | Sí | `CARD`, `QR`, `BANK_TRANSFER` o `WALLET`. |
| `payment_reference` | No | 3 a 100 caracteres alfanuméricos, `.`, `_`, `-` o `:`. Por defecto: `PAY-{order_id}`. |
| `buyer.name` | Sí | 2 a 100 bytes. |
| `buyer.email` | Sí | Formato de correo válido, hasta 254 bytes. Se normaliza a minúsculas. |
| `buyer.document_type` | No | `CI`, `NIT`, `RUC` o `PASAPORTE`. Debe enviarse con `document_number`. |
| `buyer.document_number` | No | 4 a 20 caracteres alfanuméricos o guiones. |
| `buyer.phone` | No | 7 a 15 dígitos con `+` opcional. |
| `card` | Solo para `CARD` | Objeto con `number`, `expiry`, `cvv` y `holder` opcional. Está prohibido en otros métodos. |

Respuesta de pago aprobado nuevo (`201`):

```json
{
  "transaction": {
    "transaction_id": "7c9e6679-7425-4bd9-9ae7-4a1b1a9a1234",
    "order_id": "1001",
    "amount": "50.00",
    "currency": "BOB",
    "description": "Entradas Concierto",
    "payment_method": "CARD",
    "payment_reference": "REF-1001",
    "status": "approved",
    "failure_code": null,
    "failure_message": null,
    "card_last4": "1111",
    "card_brand": "VISA",
    "buyer": {
      "name": "Ana Perez",
      "email": "ana@example.com",
      "document_type": "CI",
      "document_number": "1234567",
      "phone": "+59171234567"
    },
    "created_at": "2026-11-17T13:00:00.000Z",
    "updated_at": "2026-11-17T13:00:00.000Z"
  },
  "replayed": false
}
```

Respuesta de pago rechazado nuevo (`200`):

```json
{
  "transaction": {
    "transaction_id": "7c9e6679-7425-4bd9-9ae7-4a1b1a9a1235",
    "order_id": "1002",
    "amount": "50.00",
    "currency": "BOB",
    "description": "Pago de la orden 1002",
    "payment_method": "CARD",
    "payment_reference": "PAY-1002",
    "status": "rejected",
    "failure_code": "CARD_DECLINED",
    "failure_message": "Tarjeta rechazada por la regla de prueba terminada en 0000",
    "card_last4": "0000",
    "card_brand": "VISA",
    "buyer": {
      "name": "Ana Perez",
      "email": "ana@example.com",
      "document_type": null,
      "document_number": null,
      "phone": null
    },
    "created_at": "2026-11-17T13:01:00.000Z",
    "updated_at": "2026-11-17T13:01:00.000Z"
  },
  "replayed": false
}
```

Un pago rechazado se registra y devuelve con `2xx`. No es un error técnico.

Respuesta de solicitud repetida compatible (`200`): la misma estructura, con `replayed: true` y el `transaction_id` original.

Códigos posibles:

| Código | Situación |
| --- | --- |
| `201` | Transacción nueva aprobada. |
| `200` | Transacción nueva rechazada o resultado previo reutilizado. |
| `400` | Datos inválidos o JSON malformado. |
| `409` | La orden ya existe con datos incompatibles. |
| `503` | PostgreSQL no disponible. |
| `500` | Error interno no esperado. |

Códigos de error usados por el servicio:

| Código | Significado |
| --- | --- |
| `INVALID_JSON` | El cuerpo no es JSON válido. |
| `VALIDATION_ERROR` | Una regla de validación no se cumplió. |
| `DUPLICATE_ORDER_CONFLICT` | Misma orden, datos diferentes. |
| `DATABASE_UNAVAILABLE` | Fallo de conexión o persistencia. |
| `INTERNAL_ERROR` | Error no esperado. |
| `TRANSACTION_NOT_FOUND` | No existe la transacción consultada. |
| `NOT_FOUND` | Ruta inexistente. |
| `TOKEN_REQUIRED` / `TOKEN_INVALID` | Códigos del middleware JWT preparado para integración futura. |

### `GET /payments/:id`

Consulta una transacción por `transaction_id`, que debe ser UUID.

Respuesta (`200`):

```json
{
  "transaction": {
    "transaction_id": "7c9e6679-7425-4bd9-9ae7-4a1b1a9a1234"
  }
}
```

El objeto `transaction` contiene todos los campos mostrados en `POST /payments`.

Códigos: `200`, `400` si el UUID es inválido, `404` si no existe, `503` si falla PostgreSQL.

### `GET /payments/order/:orderId`

Consulta la transacción asociada a una orden.

Ejemplo: `GET /payments/order/1001`.

Códigos: `200`, `400` si `orderId` es inválido, `404` si no existe, `503` si falla PostgreSQL.

### Idempotencia

Una orden solo puede tener una transacción. La restricción `UNIQUE (order_id)` y un bloqueo `pg_advisory_xact_lock` por orden evitan duplicados incluso con solicitudes simultáneas.

Se reutiliza el resultado previo cuando coinciden estos campos: `order_id`, `amount`, `currency`, `description`, `payment_method`, `payment_reference`, `buyer.name`, `buyer.email`, `buyer.document_type`, `buyer.document_number`, `buyer.phone`, `card_last4` y `card_brand`.

Si alguno de esos campos cambia, se responde `409 DUPLICATE_ORDER_CONFLICT` y la transacción original no se modifica. El número completo de tarjeta, el CVV y la fecha de vencimiento no se almacenan, por lo que no forman parte de la comparación.

## F. Pruebas manuales con Postman y cURL

Use `http://localhost:3002` como base. En Windows PowerShell, reemplace `curl` por `curl.exe`.

### Health check

```bash
curl -i http://localhost:3002/health
```

### Pago aprobado

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1001","amount":50,"currency":"BOB","description":"Entradas Concierto","payment_method":"CARD","payment_reference":"REF-1001","buyer":{"name":"Ana Perez","email":"ana@example.com","document_type":"CI","document_number":"1234567","phone":"+59171234567"},"card":{"number":"4111111111111111","expiry":"12/30","cvv":"123","holder":"Ana Perez"}}'
```

Guarde el `transaction_id` de la respuesta para la siguiente consulta.

### Pago rechazado

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1002","amount":50,"currency":"BOB","description":"Entradas Concierto","payment_method":"CARD","payment_reference":"REF-1002","buyer":{"name":"Ana Perez","email":"ana@example.com","document_type":"CI","document_number":"1234567","phone":"+59171234567"},"card":{"number":"4000000000020000","expiry":"12/30","cvv":"123","holder":"Ana Perez"}}'
```

### Consultar transacción por ID

Reemplace `TRANSACTION_ID` por el valor obtenido:

```bash
curl -i http://localhost:3002/payments/TRANSACTION_ID
```

### Consultar transacción por orden

```bash
curl -i http://localhost:3002/payments/order/1001
```

### Repetir la misma orden

Envíe exactamente el mismo cuerpo del pago aprobado. La respuesta debe ser `200` y `"replayed": true`.

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1001","amount":50,"currency":"BOB","description":"Entradas Concierto","payment_method":"CARD","payment_reference":"REF-1001","buyer":{"name":"Ana Perez","email":"ana@example.com","document_type":"CI","document_number":"1234567","phone":"+59171234567"},"card":{"number":"4111111111111111","expiry":"12/30","cvv":"123","holder":"Ana Perez"}}'
```

### Datos inválidos

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1003","amount":0,"currency":"BOB","payment_method":"CARD","buyer":{"name":"Ana Perez","email":"ana@example.com"},"card":{"number":"4111111111111111","expiry":"12/30","cvv":"123"}}'
```

Respuesta esperada: `400` con `code: VALIDATION_ERROR`.

### Otros métodos de pago

QR:

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1004","amount":35.50,"currency":"BOB","payment_method":"QR","payment_reference":"REF-1004","buyer":{"name":"Luis Mora","email":"luis@example.com"}}'
```

BANK_TRANSFER:

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1005","amount":80,"currency":"BOB","payment_method":"BANK_TRANSFER","payment_reference":"REF-1005","buyer":{"name":"Luis Mora","email":"luis@example.com"}}'
```

WALLET:

```bash
curl -i -X POST http://localhost:3002/payments \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1006","amount":25,"currency":"BOB","payment_method":"WALLET","payment_reference":"REF-1006","buyer":{"name":"Luis Mora","email":"luis@example.com"}}'
```

### Postman

1. Crear una colección `Payments`.
2. Definir la variable `base_url` con `http://localhost:3002`.
3. Crear las peticiones `GET {{base_url}}/health`, `POST {{base_url}}/payments`, `GET {{base_url}}/payments/order/1001` y `GET {{base_url}}/payments/{{transaction_id}}`.
4. En el POST, seleccionar `Body > raw > JSON` y pegar uno de los cuerpos anteriores.
5. Después de un pago aprobado, copiar `transaction.transaction_id` en la variable `transaction_id`.
6. Repetir el POST sin cambios para comprobar `"replayed": true`.

## G. Pruebas automatizadas

```bash
npm test
```

El comando usa `node:test` y un repositorio falso en memoria, por lo que no necesita PostgreSQL.

Escenarios cubiertos:

- Health check disponible y no disponible.
- Pago aprobado y consulta por ID y por orden.
- Pago rechazado por tarjeta terminada en `0000`.
- Métodos `QR`, `BANK_TRANSFER` y `WALLET`.
- Rechazo de `card` en métodos que no son `CARD`.
- Campos obligatorios, correo, documento, importe negativo, cero, inválido, moneda, Luhn, vencimiento y JSON malformado.
- Transacción inexistente e ID inválido.
- Solicitud repetida compatible y incompatible.
- Dos solicitudes simultáneas para la misma orden.
- Errores de lectura y escritura traducidos a `503`.
- Verificación del middleware JWT con un token HS256.

Para comprobar la restricción real de PostgreSQL, ejecute `npm run db:init`, inicie el servicio y repita dos veces el cURL del pago aprobado. Debe existir una sola fila:

```sql
SELECT order_id, status, amount FROM payments WHERE order_id = '1001';
```

## H. Base de datos

El servicio usa únicamente `payments_db`. No accede a las bases de Auth, Events ni Orders.

`schema.sql` crea la tabla `payments`:

| Campo | Tipo | Restricción |
| --- | --- | --- |
| `id` | `BIGINT` | Identidad, clave primaria interna. |
| `transaction_id` | `UUID` | Único, generado por Payments. |
| `order_id` | `VARCHAR(64)` | Único; garantiza un pago por orden. |
| `amount` | `NUMERIC(12,2)` | Mayor que cero. |
| `currency` | `VARCHAR(3)` | Solo `BOB`. |
| `description` | `VARCHAR(255)` | Opcional. |
| `payment_method` | `VARCHAR(20)` | `CARD`, `QR`, `BANK_TRANSFER`, `WALLET`. |
| `payment_reference` | `VARCHAR(100)` | Referencia de la operación. |
| `status` | `VARCHAR(20)` | `approved` o `rejected`. |
| `failure_code` | `VARCHAR(50)` | Obligatorio si `status = rejected`. |
| `failure_message` | `VARCHAR(255)` | Obligatorio si `status = rejected`. |
| `card_last4` | `CHAR(4)` | Solo últimos cuatro dígitos. |
| `card_brand` | `VARCHAR(20)` | Marca detectada. |
| `buyer_name` | `VARCHAR(100)` | Obligatorio. |
| `buyer_email` | `VARCHAR(254)` | Obligatorio. |
| `buyer_document_type` | `VARCHAR(20)` | Opcional. |
| `buyer_document_number` | `VARCHAR(30)` | Opcional. |
| `buyer_phone` | `VARCHAR(20)` | Opcional. |
| `request_fingerprint` | `CHAR(64)` | Hash de los datos compatibles de idempotencia. |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación. |
| `updated_at` | `TIMESTAMPTZ` | Fecha de actualización. |

Índices:

- `UNIQUE` implícito sobre `transaction_id`.
- `UNIQUE` implícito sobre `order_id`.
- `idx_payments_created_at` para consultas recientes.
- `idx_payments_status` para filtrar por resultado.
- `idx_payments_payment_reference` para buscar por referencia.

El trigger `trg_payments_updated_at` actualiza `updated_at` antes de cualquier `UPDATE`.

Inicialización:

```bash
npm run db:init
```

El script lee `schema.sql` y puede ejecutarse varias veces sin duplicar objetos.

## I. Integración futura con Orders

El contrato siguiente es una propuesta pendiente de coordinación con el responsable de Orders.

Orders deberá enviar un `POST` HTTP/JSON a `http://payments:3002/payments` con un `order_id` estable. En caso de timeout o duda, debe reenviar exactamente la misma solicitud; Payments devolverá la transacción original sin cobrar dos veces.

Solicitud propuesta:

```json
{
  "order_id": "2001",
  "amount": 120,
  "currency": "BOB",
  "description": "Reserva de entradas",
  "payment_method": "QR",
  "payment_reference": "ORDER-2001-PAY",
  "buyer": {
    "name": "Ana Perez",
    "email": "ana@example.com",
    "document_type": "CI",
    "document_number": "1234567",
    "phone": "+59171234567"
  }
}
```

Respuesta propuesta:

```json
{
  "transaction": {
    "transaction_id": "7c9e6679-7425-4bd9-9ae7-4a1b1a9a1234",
    "order_id": "2001",
    "amount": "120.00",
    "currency": "BOB",
    "description": "Reserva de entradas",
    "payment_method": "QR",
    "payment_reference": "ORDER-2001-PAY",
    "status": "approved",
    "failure_code": null,
    "failure_message": null,
    "card_last4": null,
    "card_brand": null,
    "buyer": {
      "name": "Ana Perez",
      "email": "ana@example.com",
      "document_type": "CI",
      "document_number": "1234567",
      "phone": "+59171234567"
    },
    "created_at": "2026-11-17T13:00:00.000Z",
    "updated_at": "2026-11-17T13:00:00.000Z"
  },
  "replayed": false
}
```

Orders debe interpretar `201` como pago nuevo aprobado, `200` como pago rechazado o repetido, `409` como conflicto de datos y `503` como indisponibilidad temporal de Payments.

### Protección futura del acceso interno

Cuando se acuerde la integración, se montará `createJwtMiddleware(config.jwtSecret)` sobre el router de Payments. El middleware:

- Exige el header `Authorization: Bearer <token>`.
- Verifica tokens HS256 con el mismo `JWT_SECRET` que Auth.
- No realiza llamadas a Auth.
- Rechaza tokens ausentes con `401 TOKEN_REQUIRED` e inválidos con `401 TOKEN_INVALID`.

No se activa actualmente para que Payments funcione de forma independiente.

## J. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `Cannot find module 'express'` | Dependencias no instaladas. | Ejecutar `npm install` dentro de `payments`. |
| `DATABASE_URL es obligatorio` | Falta `.env`. | Copiar `.env.example` a `.env` y completarlo. |
| `JWT_SECRET debe tener al menos 32 bytes` | Secreto corto o ausente. | Generar uno con el comando de la sección C. |
| `ECONNREFUSED` al iniciar | PostgreSQL no está corriendo o el puerto es incorrecto. | Iniciar PostgreSQL y revisar `DATABASE_URL`. |
| Código PostgreSQL `28P01` | Usuario o contraseña incorrectos. | Corregir las credenciales en `.env`. |
| `relation "payments" does not exist` | Esquema no aplicado. | Ejecutar `npm run db:init`. |
| `EADDRINUSE` | El puerto ya está ocupado. | Cambiar `PORT` en `.env`. |
| `400 VALIDATION_ERROR` | Un campo no cumple las reglas. | Revisar la tabla de campos y el mensaje de error. |
| `400 INVALID_JSON` | Cuerpo malformado. | Enviar JSON válido y `Content-Type: application/json`. |
| `409 DUPLICATE_ORDER_CONFLICT` | Misma orden con datos diferentes. | Enviar los datos originales o usar otro `order_id`. |
| `503 DATABASE_UNAVAILABLE` | Fallo de PostgreSQL. | Revisar conexión, permisos y `npm run db:init`. |
| Pruebas fallidas | Node.js anterior a 20. | Actualizar Node.js y ejecutar `npm test` nuevamente. |
