const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const config = require("./config");

async function main() {
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    try {
        const schema = await fs.readFile(path.join(__dirname, "..", "schema.sql"), "utf8");
        await client.query(schema);
        console.log("Tabla de usuarios lista");
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error("No se pudo inicializar la base de datos:", err.message);
    process.exitCode = 1;
});
