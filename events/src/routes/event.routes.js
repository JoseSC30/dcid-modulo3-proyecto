
const express = require("express");
const router = express.Router();

const controller = require("../controllers/event.controller");

// Eventos
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id/publish", controller.publish);
router.patch("/:id/cancel", controller.cancel);

// Sectores
router.post("/:id/sectors", controller.addSector);

// Reservas
router.post(
    "/:eventId/sectors/:sectorId/reservations",
    controller.reserve
);

router.patch(
    "/:eventId/sectors/:sectorId/reservations/:orderId/release",
    controller.release
);

module.exports = router;
