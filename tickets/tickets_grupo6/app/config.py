"""Configuración del microservicio Tickets."""

import os
from pathlib import Path

# Lee la conexión desde el entorno; no guardamos credenciales en el código.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/tickets_db"
)

# Carpeta local donde se almacenan los PDF.
PDF_DIR = Path(os.getenv("PDF_DIR", "storage/pdf"))
PDF_DIR.mkdir(parents=True, exist_ok=True)

# Puerto configurable para ejecutar el servicio.
PORT = int(os.getenv("PORT", "8003"))
