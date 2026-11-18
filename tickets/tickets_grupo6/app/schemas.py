"""Esquemas de entrada y salida de la API."""

from pydantic import BaseModel, Field


class GenerateTicketsRequest(BaseModel):
    # Datos que Orders debe enviar después de confirmar el pago.
    order_id: str
    event_id: str
    event_name: str
    event_date: str | None = None
    event_location: str | None = None
    quantity: int = Field(gt=0, le=6)
    paid: bool


class TicketResponse(BaseModel):
    code: str
    event_id: str
    event_name: str
    paid: bool
    download_url: str
