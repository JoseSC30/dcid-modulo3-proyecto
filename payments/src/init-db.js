const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const config = require("./config/config");
const { log } = require("./logger");

async function main() {
    const client = new Client({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 5000
    });

    await client.connect();
    log("info", "Conexion PostgreSQL establecida para inicializar payments");

    try {
        const schema = await fs.readFile(path.join(__dirname, "..", "schema.sql"), "utf8");
        await client.query(schema);
        log("info", "Esquema de payments aplicado correctamente");
    } finally {
        await client.end();
    }
}

main().catch(err => {
    log("error", "No se pudo inicializar la base de datos de payments", {
        code: err.code || null
    });
    process.exitCode = 1;
});
