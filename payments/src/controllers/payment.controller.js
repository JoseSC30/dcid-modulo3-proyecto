const createPaymentService = require("../services/payment.service");

function createPaymentController(repository) {
    const service = createPaymentService(repository);

    function statusFor(result) {
        if (result.replayed) {
            return 200;
        }
        return result.transaction.status === "approved" ? 201 : 200;
    }

    return {
        async process(req, res, next) {
            try {
                const result = await service.process(req.body);
                res.status(statusFor(result)).json({
                    transaction: result.transaction,
                    replayed: result.replayed
                });
            } catch (err) {
                next(err);
            }
        },

        async getById(req, res, next) {
            try {
                res.json({ transaction: await service.getById(req.params.id) });
            } catch (err) {
                next(err);
            }
        },

        async getByOrderId(req, res, next) {
            try {
                res.json({ transaction: await service.getByOrderId(req.params.orderId) });
            } catch (err) {
                next(err);
            }
        }
    };
}

module.exports = createPaymentController;
