const readline = require("node:readline/promises");
const config = require("./config");
const createUserRepository = require("./repositories/user.repository");
const createAuthService = require("./services/auth.service");

async function main() {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    const repository = createUserRepository(config.databaseUrl);
    try {
        const nombre = await input.question("Nombre: ");
        const correo = await input.question("Correo: ");
        const password = await input.question("Contrasena (visible en pantalla): ");
        const rol = await input.question("Rol (organizador o portero): ");
        if (!["organizador", "portero"].includes(rol)) {
            throw new Error("El rol debe ser organizador o portero");
        }
        const user = await createAuthService(repository, config.jwtSecret).register({ nombre, correo, password }, rol);
        console.log("Usuario creado:", user);
    } finally {
        input.close();
        await repository.close();
    }
}

main().catch(err => {
    console.error("No se pudo crear el usuario:", err.message);
    process.exitCode = 1;
});
