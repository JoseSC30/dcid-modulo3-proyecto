# Servicio Tickets - Grupo 6

Microservicio Python/FastAPI para generar y validar entradas de EntradasYa v1.

## Requisitos

- Python 3.10 o superior.
- PostgreSQL.
- Una base de datos llamada `tickets_db`.

## Instalación (Windows PowerShell)

Desde la carpeta `tickets`:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `.env` con las credenciales de tu PostgreSQL. Crea previamente la base `tickets_db`.

## Ejecución

```powershell
uvicorn app.main:app --reload --port 8003
```

Documentación interactiva: http://127.0.0.1:8003/docs

## Endpoints

- `GET /health`: estado del servicio y conexión a PostgreSQL.
- `POST /tickets/generate`: genera una entrada por unidad comprada.
- `GET /tickets/validate/{code}?event_id=ID`: valida existencia, evento y pago.
- `GET /tickets/{code}/download`: descarga el PDF.

## Ejemplo para generar entradas

```json
{
  "order_id": "ORD-100",
  "event_id": "EV-20",
  "event_name": "Concierto de prueba",
  "event_date": "2026-12-20",
  "event_location": "Santa Cruz",
  "quantity": 2,
  "paid": true
}
```

## Contrato de integración pendiente

El PDF del proyecto define que Orders solicita la generación después del pago y que Checkin consulta la validez. No especifica el formato exacto de los JSON ni las rutas. Los endpoints y el JSON de este README son una propuesta inicial para coordinar con los grupos 4 (Orders) y 8 (Checkin), no un contrato confirmado.

Tickets no llama a otros servicios y no registra si una entrada ya fue utilizada. Ese control corresponde a Checkin.
