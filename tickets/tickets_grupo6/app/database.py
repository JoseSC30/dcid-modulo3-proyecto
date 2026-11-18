"""Conexión y operaciones básicas con PostgreSQL."""

import psycopg2
from psycopg2.extras import RealDictCursor
from app.config import DATABASE_URL


def get_connection():
    # Abre una conexión nueva; cada operación la cierra al terminar.
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def initialize_database():
    # Crea la tabla propia de Tickets si todavía no existe.
    sql = """
    CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        code VARCHAR(80) UNIQUE NOT NULL,
        order_id VARCHAR(100) NOT NULL,
        event_id VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        event_date VARCHAR(80),
        event_location VARCHAR(200),
        paid BOOLEAN NOT NULL DEFAULT FALSE,
        pdf_path TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def save_ticket(ticket):
    # Guarda únicamente los datos que pertenecen al servicio Tickets.
    sql = """
    INSERT INTO tickets
    (code, order_id, event_id, event_name, event_date,
     event_location, paid, pdf_path)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING *;
    """
    values = (
        ticket["code"], ticket["order_id"], ticket["event_id"],
        ticket["event_name"], ticket.get("event_date"),
        ticket.get("event_location"), ticket["paid"], ticket["pdf_path"]
    )
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)
            result = cur.fetchone()
        conn.commit()
    return result


def find_ticket(code):
    # Busca una entrada por su código único.
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tickets WHERE code = %s", (code,))
            return cur.fetchone()


def list_order_tickets(order_id):
    # Permite recuperar las entradas creadas para una orden.
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM tickets WHERE order_id = %s ORDER BY id",
                (order_id,)
            )
            return cur.fetchall()
