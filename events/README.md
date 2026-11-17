# Servicio Events

## Descripción
Microservicio encargado de administrar eventos, sectores, precios y cupos disponibles de la plataforma EntradasYa.

## Tecnologías
- Node.js
- Express.js
- JavaScript

## Requisitos
- Node.js instalado.
- npm instalado.

## Instalación

```bash
npm install
```

## Configuración

Variable de entorno:

- PORT: puerto del servicio. Por defecto 3000.

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

GET http://localhost:3000/health

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "events"
}
```

## Endpoints 
Método	URL completa
GET	    http://localhost:3000/health
GET	    http://localhost:3000/events
GET	    http://localhost:3000/events?estado=borrador
GET	    http://localhost:3000/events?estado=cancelado
GET	    http://localhost:3000/events/1
POST	  http://localhost:3000/events
PUT	    http://localhost:3000/events/1
PATCH	  http://localhost:3000/events/1/publish
PATCH  	http://localhost:3000/events/1/cancel
POST	  http://localhost:3000/events/2/sectors
POST	  http://localhost:3000/events/1/sectors/1/reservations
PATCH	  http://localhost:3000/events/1/sectors/1/reservations/ORD001/release