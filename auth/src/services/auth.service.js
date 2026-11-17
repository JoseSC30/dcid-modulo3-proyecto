const crypto = require("node:crypto");
const { promisify } = require("node:util");
const jwt = require("jsonwebtoken");

const scrypt = promisify(crypto.scrypt);
const roles = ["cliente", "organizador", "portero"];

function error(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function validateCredentials(datos, requireName) {
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        throw error(400, "Datos invalidos");
    }

    if (requireName && (typeof datos.nombre !== "string" ||
        !datos.nombre.trim() || datos.nombre.trim().length > 100)) {
        throw error(400, "El nombre es obligatorio y debe tener hasta 100 caracteres");
    }

    if (typeof datos.correo !== "string" || datos.correo.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) {
        throw error(400, "Correo invalido");
    }

    if (typeof datos.password !== "string" ||
        Buffer.byteLength(datos.password, "utf8") < 8 ||
        Buffer.byteLength(datos.password, "utf8") > 128) {
        throw error(400, "La contrasena debe tener entre 8 y 128 bytes");
    }
}

function createAuthService(repository, jwtSecret) {
    return {
        async register(datos, rol = "cliente") {
            validateCredentials(datos, true);
            if (!roles.includes(rol)) {
                throw error(400, "Rol invalido");
            }

            const salt = crypto.randomBytes(16);
            const hash = await scrypt(datos.password, salt, 64);
            try {
                return await repository.create({
                    nombre: datos.nombre.trim(),
                    correo: datos.correo.trim().toLowerCase(),
                    passwordHash: `${salt.toString("hex")}:${hash.toString("hex")}`,
                    rol
                });
            } catch (err) {
                if (err.code === "23505") {
                    throw error(409, "El correo ya esta registrado");
                }
                throw err;
            }
        },

        async login(datos) {
            validateCredentials(datos, false);
            const user = await repository.findByEmail(datos.correo.trim().toLowerCase());
            if (!user) {
                throw error(401, "Credenciales invalidas");
            }

            const [saltHex, hashHex] = user.password_hash.split(":");
            const expected = Buffer.from(hashHex, "hex");
            const actual = await scrypt(datos.password, Buffer.from(saltHex, "hex"), 64);
            if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
                throw error(401, "Credenciales invalidas");
            }

            const usuario = { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol };
            const token = jwt.sign({ id: user.id, rol: user.rol }, jwtSecret, {
                algorithm: "HS256",
                expiresIn: "1h"
            });
            return { token, usuario };
        }
    };
}

module.exports = createAuthService;
