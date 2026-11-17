const jwt = require("jsonwebtoken");
const { createHttpError } = require("./error.middleware");

function createJwtMiddleware(secret) {
    return function verifyJwt(req, res, next) {
        try {
            const header = req.get("authorization");
            if (!header || !header.startsWith("Bearer ")) {
                throw createHttpError(401, "Token de autorizacion requerido", "TOKEN_REQUIRED");
            }

            const token = header.slice("Bearer ".length).trim();
            if (!token) {
                throw createHttpError(401, "Token de autorizacion requerido", "TOKEN_REQUIRED");
            }

            req.auth = jwt.verify(token, secret, { algorithms: ["HS256"] });
            next();
        } catch (err) {
            if (err instanceof Error && err.name !== "HttpError") {
                return next(createHttpError(401, "Token de autorizacion invalido", "TOKEN_INVALID"));
            }
            next(err);
        }
    };
}

module.exports = createJwtMiddleware;
