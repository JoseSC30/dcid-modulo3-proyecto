const { Pool } = require("pg");

function createUserRepository(databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    pool.on("error", err => {
        console.error({ date: new Date().toISOString(), level: "error", message: err.message });
    });

    return {
        async checkHealth() {
            await pool.query("SELECT 1 FROM users LIMIT 1");
        },

        async findByEmail(correo) {
            const result = await pool.query(
                "SELECT id, nombre, correo, password_hash, rol FROM users WHERE correo = $1",
                [correo]
            );
            return result.rows[0] || null;
        },

        async create({ nombre, correo, passwordHash, rol }) {
            const result = await pool.query(
                "INSERT INTO users (nombre, correo, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, correo, rol",
                [nombre, correo, passwordHash, rol]
            );
            return result.rows[0];
        },

        async close() {
            await pool.end();
        }
    };
}

module.exports = createUserRepository;
