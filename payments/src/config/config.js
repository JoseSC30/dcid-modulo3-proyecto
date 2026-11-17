require("dotenv").config({ quiet: true });

function readPort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT debe ser un numero entero entre 1 y 65535");
    }
    return port;
}

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio");
}

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes");
}

module.exports = {
    port: readPort(process.env.PORT || 3002),
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET
};
