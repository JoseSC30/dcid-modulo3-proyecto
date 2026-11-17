const { log } = require("../logger");

class HttpError extends Error {
    constructor(status, message, code, details) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function createHttpError(status, message, code, details) {
    return new HttpError(status, message, code, details);
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const malformedJson = err.type === "entity.parse.failed" || err instanceof SyntaxError && err.status === 400;
    const status = err instanceof HttpError ? err.status : malformedJson ? 400 : 500;
    const code = err instanceof HttpError ? err.code : malformedJson ? "INVALID_JSON" : "INTERNAL_ERROR";
    const message = status === 500
        ? "Error interno del servicio"
        : malformedJson && !(err instanceof HttpError)
            ? "JSON malformado"
            : err.message;

    if (status >= 500 && !(err instanceof HttpError)) {
        log("error", "Error no esperado en payments", {
            code,
            method: req.method,
            path: req.originalUrl
        });
    }

    const response = { error: message, code };
    if (err instanceof HttpError && err.details) {
        response.details = err.details;
    }

    return res.status(status).json(response);
}

module.exports = { HttpError, createHttpError, errorHandler };
