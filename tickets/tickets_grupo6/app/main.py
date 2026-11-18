"""Punto de entrada de la API Tickets."""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from app.database import initialize_database, get_connection, find_ticket
from app.schemas import GenerateTicketsRequest
from app.ticket_service import generate_for_order


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializa la tabla al arrancar el servicio.
    initialize_database()
    yield


app = FastAPI(
    title="EntradasYa - Tickets",
    description="Servicio de generación y validación de entradas.",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/health")
def health():
    # Comprueba que la API puede conectarse a PostgreSQL.
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"service": "tickets", "status": "ok", "database": "connected"}
    except Exception:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")


@app.post("/tickets/generate")
def generate_tickets(data: GenerateTicketsRequest):
    # Orders invoca este endpoint únicamente después del pago aprobado.
    try:
        tickets = generate_for_order(data)
        return {
            "message": "Entradas generadas",
            "tickets": [
                {
                    "code": row["code"],
                    "event_id": row["event_id"],
                    "event_name": row["event_name"],
                    "paid": row["paid"],
                    "download_url": f'/tickets/{row["code"]}/download'
                }
                for row in tickets
            ]
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception:
        # No se exponen detalles internos ni credenciales al cliente.
        raise HTTPException(status_code=500, detail="No se pudieron generar las entradas")


@app.get("/tickets/validate/{code}")
def validate_ticket(code: str, event_id: str):
    # Checkin consulta si el código existe y pertenece al evento indicado.
    ticket = find_ticket(code)
    if not ticket:
        return {"exists": False, "valid": False, "reason": "Código inexistente"}

    if ticket["event_id"] != event_id:
        return {"exists": True, "valid": False, "reason": "Entrada de otro evento"}

    if not ticket["paid"]:
        return {"exists": True, "valid": False, "reason": "Entrada no pagada"}

    # No se marca como usada: el control de ingresos pertenece a Checkin.
    return {
        "exists": True,
        "valid": True,
        "event_id": ticket["event_id"],
        "event_name": ticket["event_name"]
    }


@app.get("/tickets/{code}/download")
def download_ticket(code: str):
    # Devuelve el PDF guardado localmente si el código existe.
    ticket = find_ticket(code)
    if not ticket:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")

    pdf_path = Path(ticket["pdf_path"])
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="PDF no encontrado")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{code}.pdf"
    )
