const express = require("express");
const createAuthService = require("./services/auth.service");

function createApp(repository, jwtSecret) {
    const app = express();
    const auth = createAuthService(repository, jwtSecret);

    app.use(express.json({ limit: "16kb" }));

    app.get("/health", async (req, res, next) => {
        try {
            await repository.checkHealth();
            res.json({ status: "ok", service: "auth" });
        } catch (err) {
            err.status = 503;
            next(err);
        }
    });

    app.post("/auth/register", async (req, res, next) => {
        try {
            if (req.body && req.body.rol !== undefined && req.body.rol !== "cliente") {
                const err = new Error("El registro publico solo permite el rol cliente");
                err.status = 400;
                throw err;
            }
            res.status(201).json(await auth.register(req.body));
        } catch (err) {
            next(err);
        }
    });

    app.post("/auth/login", async (req, res, next) => {
        try {
            res.json(await auth.login(req.body));
        } catch (err) {
            next(err);
        }
    });

    app.use((req, res) => res.status(404).json({ message: "Ruta no encontrada" }));
    app.use((err, req, res, next) => {
        const status = err.status >= 400 && err.status < 600 ? err.status : 500;
        const message = err.type === "entity.parse.failed" ? "JSON invalido" : err.message;
        console.error({ date: new Date().toISOString(), level: "error", message });
        res.status(status).json({
            error: status >= 500 ? "Servicio no disponible" : message
        });
    });

    return app;
}

module.exports = createApp;
