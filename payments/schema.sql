CREATE TABLE IF NOT EXISTS payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id UUID NOT NULL UNIQUE,
    order_id VARCHAR(64) NOT NULL UNIQUE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL CHECK (currency = 'BOB'),
    description VARCHAR(255),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CARD', 'QR', 'BANK_TRANSFER', 'WALLET')),
    payment_reference VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'rejected')),
    failure_code VARCHAR(50),
    failure_message VARCHAR(255),
    card_last4 CHAR(4),
    card_brand VARCHAR(20),
    buyer_name VARCHAR(100) NOT NULL,
    buyer_email VARCHAR(254) NOT NULL,
    buyer_document_type VARCHAR(20),
    buyer_document_number VARCHAR(30),
    buyer_phone VARCHAR(20),
    request_fingerprint CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payments_failure_requires_rejected CHECK (status <> 'rejected' OR (failure_code IS NOT NULL AND failure_message IS NOT NULL)),
    CONSTRAINT payments_approved_has_no_failure CHECK (status <> 'approved' OR (failure_code IS NULL AND failure_message IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_reference ON payments (payment_reference);

CREATE OR REPLACE FUNCTION set_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_payments_updated_at();
