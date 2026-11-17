
const eventos = [
    {
        id: 1,
        nombre: "Concierto de Rock",
        fecha: "2027-05-20T20:00:00",
        lugar: "La Paz - Teatro al Aire Libre",
        imagen: "rock.jpg",
        descripcion: "Gran concierto de rock nacional",
        estado: "publicado",
        sectores: [
            {
                id: 1,
                nombre: "General",
                precio: 50,
                cupo_total: 100,
                cupos_disponibles: 100
            },
            {
                id: 2,
                nombre: "VIP",
                precio: 150,
                cupo_total: 30,
                cupos_disponibles: 30
            }
        ]
    },
    {
        id: 2,
        nombre: "Feria Tecnologica",
        fecha: "2027-06-15T09:00:00",
        lugar: "Campo Ferial Chuquiago Marka",
        imagen: "feria.jpg",
        descripcion: "Feria de tecnologia e innovacion",
        estado: "borrador",
        sectores: [
            {
                id: 3,
                nombre: "General",
                precio: 20,
                cupo_total: 200,
                cupos_disponibles: 200
            }
        ]
    }
];

const reservas = [];

let siguienteIdEvento = 3;
let siguienteIdSector = 4;

const repository = {

    getAll() {
        return eventos;
    },

    getById(id) {
        return eventos.find(evento => evento.id === Number(id));
    },

    create(datos) {
        const evento = {
            id: siguienteIdEvento++,
            ...datos,
            estado: "borrador",
            sectores: []
        };

        eventos.push(evento);
        return evento;
    },

    update(id, datos) {
        const evento = this.getById(id);

        if (!evento) return null;

        Object.assign(evento, datos);
        return evento;
    },

    addSector(eventoId, datos) {
        const evento = this.getById(eventoId);

        if (!evento) return null;

        const sector = {
            id: siguienteIdSector++,
            nombre: datos.nombre,
            precio: datos.precio,
            cupo_total: datos.cupo_total,
            cupos_disponibles: datos.cupo_total
        };

        evento.sectores.push(sector);
        return sector;
    },

    getSector(eventoId, sectorId) {
        const evento = this.getById(eventoId);

        if (!evento) return null;

        return evento.sectores.find(
            sector => sector.id === Number(sectorId)
        ) || null;
    },

    getReservation(id_orden) {
        return reservas.find(
            reserva => reserva.id_orden === String(id_orden)
        );
    },

    reserve(eventoId, sectorId, datos) {
        const sector = this.getSector(eventoId, sectorId);

        if (!sector) {
            throw new Error("Sector no encontrado");
        }

        const id_orden = String(datos.id_orden || "");
        const cantidad = Number(datos.cantidad);

        if (!id_orden || !Number.isInteger(cantidad) || cantidad < 1) {
            throw new Error("Datos de reserva inválidos");
        }

        if (this.getReservation(id_orden)) {
            throw new Error("Esta orden ya tiene una reserva");
        }

        if (sector.cupos_disponibles < cantidad) {
            throw new Error("No hay suficientes cupos disponibles");
        }

        sector.cupos_disponibles -= cantidad;

        const reserva = {
            id_orden,
            evento_id: Number(eventoId),
            sector_id: Number(sectorId),
            cantidad,
            estado: "reservada"
        };

        reservas.push(reserva);
        return reserva;
    },

    release(eventoId, sectorId, id_orden) {
        const reserva = this.getReservation(id_orden);

        if (!reserva ||
            reserva.evento_id !== Number(eventoId) ||
            reserva.sector_id !== Number(sectorId)) {
            throw new Error("Reserva no encontrada");
        }

        if (reserva.estado === "liberada") {
            return reserva;
        }

        const sector = this.getSector(eventoId, sectorId);

        if (!sector) {
            throw new Error("Sector no encontrado");
        }

        sector.cupos_disponibles += reserva.cantidad;
        reserva.estado = "liberada";

        return reserva;
    }
};

module.exports = repository;
