const crypto = require("node:crypto");
const { Pool } = require("pg");
const { log } = require("../logger");

const SELECT_COLUMNS = `
    transaction_id, order_id, amount, currency, description, payment_method,
    payment_reference, status, failure_code, failure_message, card_last4,
    card_brand, buyer_name, buyer_email, buyer_document_type,
    buyer_document_number, buyer_phone, request_fingerprint, created_at, updated_at
`;

function advisoryKeys(orderId) {
    const digest = crypto.createHash("sha256").update(orderId).digest();
    return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

async function findByOrderIdOnClient(client, orderId) {
    const result = await client.query(
        `SELECT ${SELECT_COLUMNS} FROM payments WHERE order_id = $1`,
        [orderId]
    );
    return result.rows[0] || null;
}

function createPaymentRepository(databaseUrl) {
    const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000
    });

    pool.on("error", err => {
        log("error", "Error inactivo en el pool de PostgreSQL", {
            code: err.code || null
        });
    });

    return {
        async checkHealth() {
            await pool.query("SELECT 1 FROM payments LIMIT 1");
        },

        async findById(transactionId) {
            const result = await pool.query(
                `SELECT ${SELECT_COLUMNS} FROM payments WHERE transaction_id = $1`,
                [transactionId]
            );
            return result.rows[0] || null;
        },

        async findByOrderId(orderId) {
            return findByOrderIdOnClient(pool, orderId);
        },

        async create(data) {
            const client = await pool.connect();
            let finished = false;

            try {
                await client.query("BEGIN");
                const [lockKeyOne, lockKeyTwo] = advisoryKeys(data.order_id);
                await client.query("SELECT pg_advisory_xact_lock($1, $2)", [lockKeyOne, lockKeyTwo]);

                const existing = await findByOrderIdOnClient(client, data.order_id);
                if (existing) {
                    await client.query("COMMIT");
                    finished = true;
                    return { transaction: existing, created: false };
                }

                const result = await client.query(
                    `INSERT INTO payments (
                        transaction_id, order_id, amount, currency, description,
                        payment_method, payment_reference, status, failure_code,
                        failure_message, card_last4, card_brand, buyer_name,
                        buyer_email, buyer_document_type, buyer_document_number,
                        buyer_phone, request_fingerprint
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                        $14, $15, $16, $17, $18
                    ) RETURNING ${SELECT_COLUMNS}`,
                    [
                        crypto.randomUUID(),
                        data.order_id,
                        data.amount,
                        data.currency,
                        data.description,
                        data.payment_method,
                        data.payment_reference,
                        data.status,
                        data.failure_code,
                        data.failure_message,
                        data.card ? data.card.last4 : null,
                        data.card ? data.card.brand : null,
                        data.buyer.name,
                        data.buyer.email,
                        data.buyer.document_type,
                        data.buyer.document_number,
                        data.buyer.phone,
                        data.fingerprint
                    ]
                );

                await client.query("COMMIT");
                finished = true;
                return { transaction: result.rows[0], created: true };
            } catch (err) {
                if (!finished) {
                    try {
                        await client.query("ROLLBACK");
                    } catch (rollbackError) {
                        log("error", "No se pudo revertir la transaccion de payments", {
                            code: rollbackError.code || null
                        });
                    }
                }

                if (err.code === "23505") {
                    const existing = await findByOrderId(data.order_id);
                    if (existing) {
                        return { transaction: existing, created: false };
                    }
                }

                throw err;
            } finally {
                client.release();
            }
        },

        async close() {
            await pool.end();
        }
    };
}

module.exports = createPaymentRepository;
