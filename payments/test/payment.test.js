const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const createApp = require("../src/app");
const { errorHandler } = require("../src/middleware/error.middleware");
const createJwtMiddleware = require("../src/middleware/jwt.middleware");

const secret = "un-secreto-de-prueba-de-mas-de-32-bytes";
const approvedCard = "4111111111111111";
const declinedCard = "4000000000020000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createMutex() {
    const tails = new Map();

    return function withLock(key, operation) {
        const previous = tails.get(key) || Promise.resolve();
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });

        tails.set(key, previous.then(() => gate));

        return previous.then(async () => {
            try {
                return await operation();
            } finally {
                release();
            }
        });
    };
}

function databaseFailure(code) {
    const err = new Error("fallo simulado de base de datos");
    err.code = code;
    return err;
}

function createFakeRepository(options = {}) {
    const transactions = [];
    const withLock = createMutex();

    const repository = {
        transactions,
        failHealth: Boolean(options.failHealth),
        failCreate: Boolean(options.failCreate),
        failRead: Boolean(options.failRead),

        async checkHealth() {
            if (repository.failHealth) {
                throw databaseFailure("ECONNREFUSED");
            }
        },

        async findById(transactionId) {
            if (repository.failRead) {
                throw databaseFailure("ECONNRESET");
            }
            return transactions.find(item => item.transaction_id === transactionId) || null;
        },

        async findByOrderId(orderId) {
            if (repository.failRead) {
                throw databaseFailure("ECONNRESET");
            }
            return transactions.find(item => item.order_id === orderId) || null;
        },

        async create(data) {
            return withLock(data.order_id, async () => {
                if (repository.failCreate) {
                    throw databaseFailure("ECONNRESET");
                }

                const existing = await repository.findByOrderId(data.order_id);
                if (existing) {
                    return { transaction: existing, created: false };
                }

                const now = new Date().toISOString();
                const transaction = {
                    transaction_id: crypto.randomUUID(),
                    order_id: data.order_id,
                    amount: data.amount,
                    currency: data.currency,
                    description: data.description,
                    payment_method: data.payment_method,
                    payment_reference: data.payment_reference,
                    status: data.status,
                    failure_code: data.failure_code,
                    failure_message: data.failure_message,
                    card_last4: data.card ? data.card.last4 : null,
                    card_brand: data.card ? data.card.brand : null,
                    buyer_name: data.buyer.name,
                    buyer_email: data.buyer.email,
                    buyer_document_type: data.buyer.document_type,
                    buyer_document_number: data.buyer.document_number,
                    buyer_phone: data.buyer.phone,
                    request_fingerprint: data.fingerprint,
                    created_at: now,
                    updated_at: now
                };
                transactions.push(transaction);
                return { transaction, created: true };
            });
        },

        async close() {}
    };

    return repository;
}

async function startServer(t, app) {
    const server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
}

async function request(base, method, path, body, token) {
    const headers = {};
    if (body !== undefined) {
        headers["content-type"] = "application/json";
    }
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined
            ? undefined
            : typeof body === "string" ? body : JSON.stringify(body)
    });

    const text = await response.text();
    return {
        status: response.status,
        body: text ? JSON.parse(text) : null
    };
}

function futureExpiry() {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${month}/${now.getUTCFullYear() + 2}`;
}

function validPayload(overrides = {}) {
    return {
        order_id: "ORD-1001",
        amount: 50,
        currency: "BOB",
        description: "Entradas Concierto",
        payment_method: "CARD",
        payment_reference: "REF-ORD-1001",
        buyer: {
            name: "Ana Perez",
            email: "ana@example.com",
            document_type: "CI",
            document_number: "1234567",
            phone: "+59171234567"
        },
        card: {
            number: approvedCard,
            expiry: futureExpiry(),
            cvv: "123",
            holder: "Ana Perez"
        },
        ...overrides
    };
}

test("health check distingue disponibilidad de PostgreSQL", async t => {
    const readyBase = await startServer(t, createApp(createFakeRepository()));
    const ready = await request(readyBase, "GET", "/health");
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.body, { status: "ok", service: "payments" });

    const unavailableBase = await startServer(
        t,
        createApp(createFakeRepository({ failHealth: true }))
    );
    const unavailable = await request(unavailableBase, "GET", "/health");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "DATABASE_UNAVAILABLE");
    assert.equal(
        unavailable.body.error,
        "No fue posible conectar con la base de datos de pagos"
    );
});

test("procesa un pago aprobado y permite consultarlo por transaccion y orden", async t => {
    const repository = createFakeRepository();
    const base = await startServer(t, createApp(repository));

    const created = await request(base, "POST", "/payments", validPayload());
    assert.equal(created.status, 201);
    assert.equal(created.body.replayed, false);

    const transaction = created.body.transaction;
    assert.match(transaction.transaction_id, UUID_PATTERN);
    assert.equal(transaction.order_id, "ORD-1001");
    assert.equal(transaction.amount, "50.00");
    assert.equal(transaction.currency, "BOB");
    assert.equal(transaction.status, "approved");
    assert.equal(transaction.payment_method, "CARD");
    assert.equal(transaction.card_last4, "1111");
    assert.equal(transaction.card_brand, "VISA");
    assert.equal(transaction.buyer.email, "ana@example.com");
    assert.equal(transaction.card, undefined);
    assert.equal(JSON.stringify(created.body).includes(approvedCard), false);

    const byId = await request(base, "GET", `/payments/${transaction.transaction_id}`);
    assert.equal(byId.status, 200);
    assert.deepEqual(byId.body.transaction, transaction);

    const byOrder = await request(base, "GET", "/payments/order/ORD-1001");
    assert.equal(byOrder.status, 200);
    assert.deepEqual(byOrder.body.transaction, transaction);

    const missingId = await request(base, "GET", `/payments/${crypto.randomUUID()}`);
    assert.equal(missingId.status, 404);
    assert.equal(missingId.body.code, "TRANSACTION_NOT_FOUND");

    const missingOrder = await request(base, "GET", "/payments/order/ORD-9999");
    assert.equal(missingOrder.status, 404);
    assert.equal(missingOrder.body.code, "TRANSACTION_NOT_FOUND");

    const invalidId = await request(base, "GET", "/payments/no-es-un-uuid");
    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.code, "VALIDATION_ERROR");
});

test("rechaza una tarjeta terminada en 0000 como resultado del negocio", async t => {
    const repository = createFakeRepository();
    const base = await startServer(t, createApp(repository));
    const payload = validPayload({
        order_id: "ORD-DECLINED",
        card: {
            ...validPayload().card,
            number: declinedCard
        }
    });

    const response = await request(base, "POST", "/payments", payload);
    assert.equal(response.status, 200);
    assert.equal(response.body.replayed, false);
    assert.equal(response.body.transaction.status, "rejected");
    assert.equal(response.body.transaction.failure_code, "CARD_DECLINED");
    assert.equal(response.body.transaction.card_last4, "0000");
    assert.equal(repository.transactions.length, 1);
    assert.equal(repository.transactions[0].status, "rejected");
});

test("aprueba los metodos no tarjeta y rechaza datos de tarjeta fuera de lugar", async t => {
    const repository = createFakeRepository();
    const base = await startServer(t, createApp(repository));

    for (const method of ["QR", "BANK_TRANSFER", "WALLET"]) {
        const payload = validPayload({
            order_id: `ORD-${method}`,
            payment_method: method
        });
        delete payload.card;

        const response = await request(base, "POST", "/payments", payload);
        assert.equal(response.status, 201, method);
        assert.equal(response.body.transaction.status, "approved", method);
        assert.equal(response.body.transaction.payment_method, method);
        assert.equal(response.body.transaction.card_last4, null);
        assert.equal(response.body.transaction.card_brand, null);
    }

    const misplacedCard = validPayload({
        order_id: "ORD-QR-CARD",
        payment_method: "QR"
    });
    const response = await request(base, "POST", "/payments", misplacedCard);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
});

test("valida datos obligatorios, formatos y JSON malformado", async t => {
    const base = await startServer(t, createApp(createFakeRepository()));

    const missingOrder = validPayload();
    delete missingOrder.order_id;

    const missingName = validPayload();
    delete missingName.buyer.name;

    const missingEmail = validPayload();
    delete missingEmail.buyer.email;

    const invalidEmail = validPayload();
    invalidEmail.buyer.email = "correo-invalido";

    const incompleteDocument = validPayload();
    delete incompleteDocument.buyer.document_number;

    const invalidLuhn = validPayload();
    invalidLuhn.card.number = "4111111111111112";

    const expiredCard = validPayload();
    expiredCard.card.expiry = "01/20";

    const cases = [
        ["metodo invalido", validPayload({ payment_method: "EFECTIVO" })],
        ["importe negativo", validPayload({ amount: -1 })],
        ["importe cero", validPayload({ amount: 0 })],
        ["importe no numerico", validPayload({ amount: "abc" })],
        ["orden ausente", missingOrder],
        ["nombre ausente", missingName],
        ["correo ausente", missingEmail],
        ["moneda no permitida", validPayload({ currency: "USD" })],
        ["correo invalido", invalidEmail],
        ["documento incompleto", incompleteDocument],
        ["tarjeta invalida", invalidLuhn],
        ["tarjeta vencida", expiredCard]
    ];

    for (const [name, payload] of cases) {
        const response = await request(base, "POST", "/payments", payload);
        assert.equal(response.status, 400, name);
        assert.equal(response.body.code, "VALIDATION_ERROR", name);
    }

    const emptyBody = await request(base, "POST", "/payments", {});
    assert.equal(emptyBody.status, 400);
    assert.equal(emptyBody.body.code, "VALIDATION_ERROR");

    const malformed = await request(base, "POST", "/payments", "{");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.code, "INVALID_JSON");
    assert.equal(malformed.body.error, "JSON malformado");

    const notFound = await request(base, "GET", "/no-existe");
    assert.equal(notFound.status, 404);
    assert.equal(notFound.body.code, "NOT_FOUND");
});

test("devuelve el resultado previo para una orden repetida sin crear otra transaccion", async t => {
    const repository = createFakeRepository();
    const base = await startServer(t, createApp(repository));

    const first = await request(base, "POST", "/payments", validPayload());
    const second = await request(base, "POST", "/payments", validPayload());

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.replayed, true);
    assert.equal(
        second.body.transaction.transaction_id,
        first.body.transaction.transaction_id
    );
    assert.equal(repository.transactions.length, 1);

    const incompatible = validPayload({ amount: 75 });
    const conflict = await request(base, "POST", "/payments", incompatible);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "DUPLICATE_ORDER_CONFLICT");
    assert.equal(repository.transactions.length, 1);
    assert.equal(repository.transactions[0].amount, "50.00");
});

test("dos solicitudes simultaneas para una orden generan una sola transaccion", async t => {
    const repository = createFakeRepository();
    const base = await startServer(t, createApp(repository));

    const results = await Promise.all([
        request(base, "POST", "/payments", validPayload()),
        request(base, "POST", "/payments", validPayload())
    ]);

    assert.deepEqual(results.map(item => item.status).sort(), [200, 201]);
    assert.equal(results[0].body.transaction.transaction_id, results[1].body.transaction.transaction_id);
    assert.ok(results.some(item => item.body.replayed === true));
    assert.equal(repository.transactions.length, 1);
});

test("traduce errores de persistencia sin exponer detalles internos", async t => {
    const writeRepository = createFakeRepository({ failCreate: true });
    const writeBase = await startServer(t, createApp(writeRepository));
    const failedWrite = await request(writeBase, "POST", "/payments", validPayload());

    assert.equal(failedWrite.status, 503);
    assert.equal(failedWrite.body.code, "DATABASE_UNAVAILABLE");
    assert.equal(
        failedWrite.body.error,
        "No fue posible conectar con la base de datos de pagos"
    );
    assert.equal(failedWrite.body.message, undefined);
    assert.equal(writeRepository.transactions.length, 0);

    const readRepository = createFakeRepository({ failRead: true });
    const readBase = await startServer(t, createApp(readRepository));
    const failedRead = await request(readBase, "GET", `/payments/${crypto.randomUUID()}`);
    assert.equal(failedRead.status, 503);
    assert.equal(failedRead.body.code, "DATABASE_UNAVAILABLE");

    const failedOrderRead = await request(readBase, "GET", "/payments/order/ORD-1001");
    assert.equal(failedOrderRead.status, 503);
    assert.equal(failedOrderRead.body.code, "DATABASE_UNAVAILABLE");
});

test("el middleware JWT queda preparado para la integracion futura", async t => {
    const app = express();
    app.get("/protected", createJwtMiddleware(secret), (req, res) => {
        res.json({ rol: req.auth.rol });
    });
    app.use(errorHandler);

    const base = await startServer(t, app);
    const token = jwt.sign(
        { id: "1", rol: "cliente" },
        secret,
        { algorithm: "HS256", expiresIn: "1h" }
    );

    const authorized = await request(base, "GET", "/protected", undefined, token);
    assert.equal(authorized.status, 200);
    assert.deepEqual(authorized.body, { rol: "cliente" });

    const missing = await request(base, "GET", "/protected");
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, "TOKEN_REQUIRED");

    const invalid = await request(base, "GET", "/protected", undefined, "token-invalido");
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.code, "TOKEN_INVALID");
});
