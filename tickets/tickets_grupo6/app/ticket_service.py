"""Lógica para crear entradas, QR y documentos PDF."""

import io
import secrets
import string
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from app.config import PDF_DIR
from app.database import save_ticket, list_order_tickets


def create_unique_code():
    # Genera un código aleatorio fácil de copiar y difícil de adivinar.
    alphabet = string.ascii_uppercase + string.digits
    return "ENT-" + "".join(secrets.choice(alphabet) for _ in range(16))


def create_pdf(ticket):
    # El QR contiene el código; Checkin lo consultará en Tickets.
    qr_image = qrcode.make(ticket["code"])
    qr_buffer = io.BytesIO()
    qr_image.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)

    # El nombre del archivo se basa en el código único.
    pdf_path = PDF_DIR / f'{ticket["code"]}.pdf'
    document = canvas.Canvas(str(pdf_path), pagesize=A4)

    # Escribe los datos básicos del evento en el PDF.
    document.setFont("Helvetica-Bold", 18)
    document.drawString(60, 780, "ENTRADAYA - ENTRADA")
    document.setFont("Helvetica", 12)
    document.drawString(60, 735, f'Evento: {ticket["event_name"]}')
    document.drawString(60, 710, f'Fecha: {ticket.get("event_date") or "No especificada"}')
    document.drawString(60, 685, f'Lugar: {ticket.get("event_location") or "No especificado"}')
    document.drawString(60, 650, f'Código: {ticket["code"]}')

    # Inserta la imagen QR en el documento.
    document.drawImage(
        ImageReader(qr_buffer), 60, 470, width=150, height=150,
        preserveAspectRatio=True, mask="auto"
    )
    document.setFont("Helvetica", 9)
    document.drawString(60, 440, "Conserve esta entrada para el ingreso al evento.")
    document.save()
    return str(pdf_path)


def generate_for_order(data):
    # No se emiten entradas si Orders no informa que el pago fue aprobado.
    if not data.paid:
        raise ValueError("No se pueden generar entradas para una orden no pagada.")

    # Evita duplicar entradas si Orders repite la misma solicitud.
    existing = list_order_tickets(data.order_id)
    if existing:
        return existing

    created = []
    for _ in range(data.quantity):
        # Prepara los datos de una entrada individual.
        ticket = {
            "code": create_unique_code(),
            "order_id": data.order_id,
            "event_id": data.event_id,
            "event_name": data.event_name,
            "event_date": data.event_date,
            "event_location": data.event_location,
            "paid": data.paid,
            "pdf_path": ""
        }

        # Genera el PDF y guarda su ruta en la base de datos.
        ticket["pdf_path"] = create_pdf(ticket)
        created.append(save_ticket(ticket))

    return created
