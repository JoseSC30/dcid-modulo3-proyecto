const express = require("express");
const createPaymentRoutes = require("./routes/payment.routes");
const { createHttpError, errorHandler } = require("./middleware/error.middleware");
const { log } = require("./logger");

function createApp(repository) {
    const app = express();

    app.disable("x-powered-by");
    app.use(express.json({ limit: "32kb" }));

    app.get("/health", async (req, res, next) => {
        try {
            await repository.checkHealth();
            res.json({ status: "ok", service: "payments" });
        } catch (err) {
            log("error", "Health check de PostgreSQL fallido", {
                code: err.code || null
            });
            next(createHttpError(
                503,
                "No fue posible conectar con la base de datos de pagos",
                "DATABASE_UNAVAILABLE"
            ));
        }
    });

    app.use("/payments", createPaymentRoutes(repository));

    app.use((req, res) => {
        res.status(404).json({ error: "Ruta no encontrada", code: "NOT_FOUND" });
    });

    app.use(errorHandler);

    return app;
}

module.exports = createApp;
