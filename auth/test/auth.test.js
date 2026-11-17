const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const createApp = require("../src/app");
const createAuthService = require("../src/services/auth.service");

const secret = "un-secreto-de-prueba-de-mas-de-32-bytes";

function createRepository() {
    const users = [];
    return {
        users,
        async checkHealth() {},
        async findByEmail(correo) {
            return users.find(user => user.correo === correo) || null;
        },
        async create({ nombre, correo, passwordHash, rol }) {
            if (users.some(user => user.correo === correo)) {
                const err = new Error("duplicate");
                err.code = "23505";
                throw err;
            }
            const user = { id: String(users.length + 1), nombre, correo, password_hash: passwordHash, rol };
            users.push(user);
            return { id: user.id, nombre, correo, rol };
        }
    };
}

test("registro, inicio de sesion y verificacion independiente del JWT", async t => {
    const repository = createRepository();
    const server = createApp(repository, secret).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function post(path, body) {
        const response = await fetch(base + path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    }

    const health = await fetch(base + "/health");
    assert.deepEqual(await health.json(), { status: "ok", service: "auth" });

    const datos = { nombre: " Ana ", correo: " Ana@Example.com ", password: "clave-segura" };
    const registration = await post("/auth/register", datos);
    assert.equal(registration.status, 201);
    assert.deepEqual(registration.body, { id: "1", nombre: "Ana", correo: "ana@example.com", rol: "cliente" });
    assert.notEqual(repository.users[0].password_hash, datos.password);
    assert.equal((await post("/auth/register", datos)).status, 409);
    assert.equal((await post("/auth/register", { ...datos, correo: "otro@example.com", rol: "organizador" })).status, 400);
    assert.equal((await post("/auth/register", { ...datos, correo: "invalido" })).status, 400);
    assert.equal((await post("/auth/register", { ...datos, password: "corta" })).status, 400);

    const login = await post("/auth/login", { correo: "ANA@example.com", password: datos.password });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.usuario, registration.body);
    const claims = jwt.verify(login.body.token, secret, { algorithms: ["HS256"] });
    assert.equal(claims.id, "1");
    assert.equal(claims.rol, "cliente");
    assert.equal(claims.exp - claims.iat, 3600);
    assert.throws(() => jwt.verify(login.body.token, secret, {
        algorithms: ["HS256"],
        clockTimestamp: claims.exp
    }), { name: "TokenExpiredError" });
    assert.equal((await post("/auth/login", { correo: datos.correo, password: "clave-incorrecta" })).status, 401);
    assert.equal((await post("/auth/login", { correo: "ausente@example.com", password: datos.password })).status, 401);
    const malformed = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "JSON invalido" });
    assert.equal((await fetch(base + "/no-existe")).status, 404);
});

test("roles internos y errores de base de datos", async t => {
    const repository = createRepository();
    const auth = createAuthService(repository, secret);
    for (const rol of ["organizador", "portero"]) {
        const datos = { nombre: rol, correo: `${rol}@example.com`, password: "clave-segura" };
        const user = await auth.register(datos, rol);
        const result = await auth.login(datos);
        assert.equal(user.rol, rol);
        assert.equal(jwt.verify(result.token, secret, { algorithms: ["HS256"] }).rol, rol);
    }
    await assert.rejects(auth.register({ nombre: "X", correo: "x@example.com", password: "clave-segura" }, "admin"), { status: 400 });

    repository.checkHealth = async () => { throw new Error("fallo privado de base de datos"); };
    const server = createApp(repository, secret).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Servicio no disponible" });
});
