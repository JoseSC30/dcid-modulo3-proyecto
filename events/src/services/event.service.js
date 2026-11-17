
const eventRepository = require("../repositories/event.repository");

const eventService = {
    getAll(estado) {
        const eventos = eventRepository.getAll();

        if (estado) {
            return eventos.filter(evento => evento.estado === estado);
        }

        return eventos.filter(evento => evento.estado === "publicado");
    },

    getById(id) {
        const evento = eventRepository.getById(id);

        if (!evento) {
            throw new Error("Evento no encontrado");
        }

        return evento;
    },

    create(datos) {
        if (!datos.nombre || !datos.fecha || !datos.lugar) {
            throw new Error("Nombre, fecha y lugar son obligatorios");
        }

        return eventRepository.create({
            ...datos,
            estado: "borrador",
            sectores: []
        });
    },

    update(id, datos) {
        this.getById(id);

        return eventRepository.update(id, datos);
    },

    publish(id) {
        const evento = this.getById(id);

        if (!evento.sectores || evento.sectores.length === 0) {
            throw new Error("El evento necesita al menos un sector");
        }

        return eventRepository.update(id, {
            estado: "publicado"
        });
    },

    cancel(id) {
        this.getById(id);

        return eventRepository.update(id, {
            estado: "cancelado"
        });
    },

    addSector(id, datos) {
        this.getById(id);

        if (!datos.nombre || datos.precio == null || !datos.cupo_total) {
            throw new Error("Nombre, precio y cupo_total son obligatorios");
        }

        return eventRepository.addSector(id, {
            ...datos,
            cupos_disponibles: datos.cupo_total
        });
    },

    reserve(eventId, sectorId, datos) {
        const evento = this.getById(eventId);

        if (evento.estado !== "publicado") {
            throw new Error("El evento no está publicado");
        }

        return eventRepository.reserve(eventId, sectorId, datos);
    },

    release(eventId, sectorId, orderId) {
        return eventRepository.release(eventId, sectorId, orderId);
    }
};

module.exports = eventService;
