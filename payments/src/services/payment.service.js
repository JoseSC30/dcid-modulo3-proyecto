const { HttpError, createHttpError } = require("../middleware/error.middleware");
const { log } = require("../logger");
const paymentModel = require("../models/payment.model");

function createPaymentService(repository) {
    async function withPersistence(operation, meta) {
        try {
            return await operation();
        } catch (err) {
            if (err instanceof HttpError) {
                throw err;
            }

            log("error", "Error de persistencia en payments", {
                ...meta,
                code: err.code || null
            });

            throw createHttpError(
                503,
                "No fue posible conectar con la base de datos de pagos",
                "DATABASE_UNAVAILABLE"
            );
        }
    }

    return {
        async process(payload) {
            const request = paymentModel.buildPaymentRequest(payload);
            const decision = paymentModel.evaluatePayment(request);
            const record = await withPersistence(
                () => repository.create({ ...request, ...decision }),
                { operation: "create", order_id: request.order_id }
            );

            if (!record.created && record.transaction.request_fingerprint !== request.fingerprint) {
                throw createHttpError(
                    409,
                    "La orden ya tiene un pago registrado con datos diferentes",
                    "DUPLICATE_ORDER_CONFLICT"
                );
            }

            const transaction = paymentModel.toPublicTransaction(record.transaction);

            if (!record.created) {
                log("info", "Solicitud de pago repetida", {
                    order_id: transaction.order_id,
                    transaction_id: transaction.transaction_id,
                    status: transaction.status
                });
            } else if (transaction.status === "approved") {
                log("info", "Pago aprobado", {
                    order_id: transaction.order_id,
                    transaction_id: transaction.transaction_id,
                    payment_method: transaction.payment_method
                });
            } else {
                log("warn", "Pago rechazado por la simulacion", {
                    order_id: transaction.order_id,
                    transaction_id: transaction.transaction_id,
                    failure_code: transaction.failure_code
                });
            }

            return { transaction, replayed: !record.created };
        },

        async getById(id) {
            const transactionId = paymentModel.normalizeTransactionId(id);
            const row = await withPersistence(
                () => repository.findById(transactionId),
                { operation: "findById" }
            );

            if (!row) {
                throw createHttpError(
                    404,
                    "Transaccion no encontrada",
                    "TRANSACTION_NOT_FOUND"
                );
            }

            return paymentModel.toPublicTransaction(row);
        },

        async getByOrderId(orderId) {
            const normalizedOrderId = paymentModel.normalizeOrderId(orderId);
            const row = await withPersistence(
                () => repository.findByOrderId(normalizedOrderId),
                { operation: "findByOrderId", order_id: normalizedOrderId }
            );

            if (!row) {
                throw createHttpError(
                    404,
                    "Transaccion no encontrada",
                    "TRANSACTION_NOT_FOUND"
                );
            }

            return paymentModel.toPublicTransaction(row);
        }
    };
}

module.exports = createPaymentService;
