const config = require("./config/config");
const createPaymentRepository = require("./repositories/payment.repository");
const createApp = require("./app");
const { log } = require("./logger");

async function main() {
    const repository = createPaymentRepository(config.databaseUrl);

    try {
        await repository.checkHealth();
        log("info", "Conexion con PostgreSQL verificada");
    } catch (err) {
        log("error", "No se pudo conectar con PostgreSQL al iniciar", {
            code: err.code || null
        });
    }

    const app = createApp(repository);
    const server = app.listen(config.port, () => {
        log("info", `Servicio payments ejecutandose en puerto ${config.port}`);
    });

    server.on("error", err => {
        log("error", "No se pudo iniciar el servidor de payments", {
            code: err.code || null
        });
        process.exitCode = 1;
    });

    let closing = false;
    async function shutdown(signal) {
        if (closing) {
            return;
        }
        closing = true;
        log("info", `Senal ${signal} recibida; cerrando servicio payments`);

        server.close(async err => {
            try {
                await repository.close();
            } catch (closeError) {
                log("error", "No se pudo cerrar el pool de PostgreSQL", {
                    code: closeError.code || null
                });
            }

            if (err) {
                log("error", "No se pudo cerrar el servidor de payments", {
                    code: err.code || null
                });
            }

            process.exit(err ? 1 : 0);
        });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(err => {
    log("error", "No se pudo iniciar payments", { code: err.code || null });
    process.exitCode = 1;
});
