const express = require("express");
const createPaymentController = require("../controllers/payment.controller");

function createPaymentRoutes(repository) {
    const router = express.Router();
    const controller = createPaymentController(repository);

    router.post("/", controller.process);
    router.get("/order/:orderId", controller.getByOrderId);
    router.get("/:id", controller.getById);

    return router;
}

module.exports = createPaymentRoutes;
