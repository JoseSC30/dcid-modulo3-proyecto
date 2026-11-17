require("dotenv").config();

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio");
}

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes");
}

module.exports = {
    port: process.env.PORT || 3001,
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET
};
