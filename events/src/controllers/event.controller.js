
const eventService = require("../services/event.service");

const controller = {

    getAll(req, res, next) {
        try {
            res.json(eventService.getAll(req.query.status));
        } catch (error) {
            next(error);
        }
    },

    getById(req, res, next) {
        try {
            res.json(eventService.getById(req.params.id));
        } catch (error) {
            next(error);
        }
    },

    create(req, res, next) {
        try {
            const event = eventService.create(req.body);
            res.status(201).json(event);
        } catch (error) {
            next(error);
        }
    },

    update(req, res, next) {
        try {
            res.json(eventService.update(req.params.id, req.body));
        } catch (error) {
            next(error);
        }
    },

    publish(req, res, next) {
        try {
            res.json(eventService.publish(req.params.id));
        } catch (error) {
            next(error);
        }
    },

    cancel(req, res, next) {
        try {
            res.json(eventService.cancel(req.params.id));
        } catch (error) {
            next(error);
        }
    },

    addSector(req, res, next) {
        try {
            const sector = eventService.addSector(
                req.params.id,
                req.body
            );

            res.status(201).json(sector);
        } catch (error) {
            next(error);
        }
    },

    reserve(req, res, next) {
        try {
            const reservation = eventService.reserve(
                req.params.eventId,
                req.params.sectorId,
                req.body
            );

            res.status(200).json(reservation);
        } catch (error) {
            next(error);
        }
    },

    release(req, res, next) {
        try {
            const reservation = eventService.release(
                req.params.eventId,
                req.params.sectorId,
                req.params.orderId
            );

            res.json(reservation);
        } catch (error) {
            next(error);
        }
    }
};

module.exports = controller;
