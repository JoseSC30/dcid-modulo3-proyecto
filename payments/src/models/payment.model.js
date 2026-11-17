const crypto = require("node:crypto");
const { createHttpError } = require("../middleware/error.middleware");

const PAYMENT_METHODS = Object.freeze(["CARD", "QR", "BANK_TRANSFER", "WALLET"]);
const CURRENCIES = Object.freeze(["BOB"]);
const DOCUMENT_TYPES = Object.freeze(["CI", "NIT", "RUC", "PASAPORTE"]);
const STATUSES = Object.freeze(["approved", "rejected"]);

const ORDER_ID_PATTERN = /^\S{1,64}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{3,100}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,20}$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;
const CARD_NUMBER_PATTERN = /^[0-9]{13,19}$/;
const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/;
const CVV_PATTERN = /^[0-9]{3,4}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message, details) {
    return createHttpError(400, message, "VALIDATION_ERROR", details);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value, field, min, max, optional = false) {
    if (value === undefined || value === null) {
        if (optional) {
            return null;
        }
        throw invalid(`${field} es obligatorio`);
    }

    if (typeof value !== "string") {
        throw invalid(`${field} debe ser texto`);
    }

    const text = value.trim();
    if (!text) {
        if (optional) {
            return null;
        }
        throw invalid(`${field} es obligatorio`);
    }

    const length = Buffer.byteLength(text, "utf8");
    if (length < min || length > max) {
        throw invalid(`${field} debe tener entre ${min} y ${max} bytes`);
    }

    return text;
}

function normalizeOrderId(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        value = String(value);
    }

    if (typeof value !== "string") {
        throw invalid("order_id es obligatorio y debe ser texto o entero positivo");
    }

    const orderId = value.trim();
    if (!ORDER_ID_PATTERN.test(orderId)) {
        throw invalid("order_id debe tener entre 1 y 64 caracteres sin espacios");
    }

    return orderId;
}

function normalizeAmount(value) {
    if (typeof value !== "number" && typeof value !== "string") {
        throw invalid("amount debe ser un numero positivo");
    }

    const text = typeof value === "number" ? value.toString() : value.trim();
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text)) {
        throw invalid("amount debe tener hasta dos decimales y ser mayor que cero");
    }

    const [whole, fraction = ""] = text.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999999999999) {
        throw invalid("amount debe ser un importe valido mayor que cero");
    }

    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function normalizeCurrency(value) {
    if (typeof value !== "string") {
        throw invalid("currency es obligatorio");
    }

    const currency = value.trim().toUpperCase();
    if (!CURRENCIES.includes(currency)) {
        throw invalid(`currency no permitida; valores admitidos: ${CURRENCIES.join(", ")}`);
    }

    return currency;
}

function normalizeDescription(value, orderId) {
    const description = normalizeText(value, "description", 1, 255, true);
    return description || `Pago de la orden ${orderId}`;
}

function normalizePaymentMethod(value) {
    if (typeof value !== "string") {
        throw invalid("payment_method es obligatorio");
    }

    const method = value.trim().toUpperCase();
    if (!PAYMENT_METHODS.includes(method)) {
        throw invalid(`payment_method no admitido; valores admitidos: ${PAYMENT_METHODS.join(", ")}`);
    }

    return method;
}

function normalizePaymentReference(value, orderId) {
    const reference = normalizeText(value, "payment_reference", 3, 100, true) || `PAY-${orderId}`;
    if (!REFERENCE_PATTERN.test(reference)) {
        throw invalid("payment_reference solo admite letras, numeros, punto, guion, guion bajo y dos puntos");
    }
    return reference;
}

function normalizeBuyer(value) {
    if (!isPlainObject(value)) {
        throw invalid("buyer es obligatorio");
    }

    const name = normalizeText(value.name, "buyer.name", 2, 100);
    const email = normalizeText(value.email, "buyer.email", 3, 254).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
        throw invalid("buyer.email no tiene un formato valido");
    }

    const documentTypeValue = normalizeText(value.document_type, "buyer.document_type", 2, 20, true);
    const documentType = documentTypeValue ? documentTypeValue.toUpperCase() : null;
    if (documentType && !DOCUMENT_TYPES.includes(documentType)) {
        throw invalid(`buyer.document_type no admitido; valores admitidos: ${DOCUMENT_TYPES.join(", ")}`);
    }

    const documentNumber = normalizeText(value.document_number, "buyer.document_number", 4, 20, true);
    if (documentNumber && !DOCUMENT_NUMBER_PATTERN.test(documentNumber)) {
        throw invalid("buyer.document_number debe tener entre 4 y 20 caracteres alfanumericos o guiones");
    }

    if (Boolean(documentType) !== Boolean(documentNumber)) {
        throw invalid("buyer.document_type y buyer.document_number deben enviarse juntos");
    }

    const phone = normalizeText(value.phone, "buyer.phone", 7, 20, true);
    if (phone && !PHONE_PATTERN.test(phone)) {
        throw invalid("buyer.phone debe tener entre 7 y 15 digitos, con prefijo + opcional");
    }

    return {
        name,
        email,
        document_type: documentType,
        document_number: documentNumber,
        phone
    };
}

function passesLuhn(number) {
    let sum = 0;
    let double = false;

    for (let index = number.length - 1; index >= 0; index -= 1) {
        let digit = Number(number[index]);
        if (double) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    return sum % 10 === 0;
}

function detectCardBrand(number) {
    if (number.startsWith("4")) {
        return "VISA";
    }

    if (number.startsWith("34") || number.startsWith("37")) {
        return "AMEX";
    }

    const firstTwo = Number(number.slice(0, 2));
    const firstFour = Number(number.slice(0, 4));
    if ((firstTwo >= 51 && firstTwo <= 55) || (firstFour >= 2221 && firstFour <= 2720)) {
        return "MASTERCARD";
    }

    return "OTHER";
}

function normalizeCard(value) {
    if (!isPlainObject(value)) {
        throw invalid("card es obligatorio cuando payment_method es CARD");
    }

    const number = normalizeText(value.number, "card.number", 13, 19);
    if (!CARD_NUMBER_PATTERN.test(number)) {
        throw invalid("card.number debe contener unicamente entre 13 y 19 digitos");
    }

    if (!passesLuhn(number)) {
        throw invalid("card.number no supera la validacion de formato de prueba");
    }

    const expiry = normalizeText(value.expiry, "card.expiry", 5, 7);
    const expiryMatch = EXPIRY_PATTERN.exec(expiry);
    if (!expiryMatch) {
        throw invalid("card.expiry debe tener el formato MM/AA o MM/AAAA");
    }

    const month = Number(expiryMatch[1]);
    let year = Number(expiryMatch[2]);
    if (year < 100) {
        year += 2000;
    }

    if (Date.UTC(year, month, 1) <= Date.now()) {
        throw invalid("card.expiry debe ser una fecha futura");
    }

    const brand = detectCardBrand(number);
    const cvv = normalizeText(value.cvv, "card.cvv", 3, 4);
    if (!CVV_PATTERN.test(cvv) || cvv.length !== (brand === "AMEX" ? 4 : 3)) {
        throw invalid(`card.cvv debe tener ${brand === "AMEX" ? 4 : 3} digitos`);
    }

    normalizeText(value.holder, "card.holder", 2, 100, true);

    return {
        last4: number.slice(-4),
        brand
    };
}

function buildFingerprint(request) {
    const comparable = [
        request.order_id,
        request.amount,
        request.currency,
        request.description,
        request.payment_method,
        request.payment_reference,
        request.buyer.name,
        request.buyer.email,
        request.buyer.document_type || "",
        request.buyer.document_number || "",
        request.buyer.phone || "",
        request.card ? request.card.last4 : "",
        request.card ? request.card.brand : ""
    ];

    return crypto.createHash("sha256").update(JSON.stringify(comparable)).digest("hex");
}

function buildPaymentRequest(payload) {
    if (!isPlainObject(payload)) {
        throw invalid("El cuerpo de la solicitud debe ser un JSON objeto");
    }

    const orderId = normalizeOrderId(payload.order_id);
    const amount = normalizeAmount(payload.amount);
    const currency = normalizeCurrency(payload.currency);
    const description = normalizeDescription(payload.description, orderId);
    const paymentMethod = normalizePaymentMethod(payload.payment_method);
    const paymentReference = normalizePaymentReference(payload.payment_reference, orderId);
    const buyer = normalizeBuyer(payload.buyer);

    let card = null;
    if (paymentMethod === "CARD") {
        card = normalizeCard(payload.card);
    } else if (payload.card !== undefined && payload.card !== null) {
        throw invalid("card solo aplica cuando payment_method es CARD");
    }

    const request = {
        order_id: orderId,
        amount,
        currency,
        description,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        buyer,
        card
    };

    request.fingerprint = buildFingerprint(request);
    return request;
}

function evaluatePayment(request) {
    if (request.payment_method === "CARD" && request.card.last4 === "0000") {
        return {
            status: "rejected",
            failure_code: "CARD_DECLINED",
            failure_message: "Tarjeta rechazada por la regla de prueba terminada en 0000"
        };
    }

    return {
        status: "approved",
        failure_code: null,
        failure_message: null
    };
}

function normalizeTransactionId(value) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
        throw invalid("El identificador de transaccion no tiene un formato valido");
    }
    return value;
}

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

function toPublicTransaction(row) {
    return {
        transaction_id: row.transaction_id,
        order_id: row.order_id,
        amount: row.amount,
        currency: row.currency,
        description: row.description,
        payment_method: row.payment_method,
        payment_reference: row.payment_reference,
        status: row.status,
        failure_code: row.failure_code,
        failure_message: row.failure_message,
        card_last4: row.card_last4,
        card_brand: row.card_brand,
        buyer: {
            name: row.buyer_name,
            email: row.buyer_email,
            document_type: row.buyer_document_type,
            document_number: row.buyer_document_number,
            phone: row.buyer_phone
        },
        created_at: toIso(row.created_at),
        updated_at: toIso(row.updated_at)
    };
}

module.exports = {
    PAYMENT_METHODS,
    CURRENCIES,
    DOCUMENT_TYPES,
    STATUSES,
    buildPaymentRequest,
    evaluatePayment,
    normalizeOrderId,
    normalizeTransactionId,
    toPublicTransaction
};
