-- ============================================================
-- SOFIA SaaS - Multi-Clinic Schema
-- Migration 001: Core tables
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- For text search on knowledge_base
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- For EXCLUDE constraint on appointments

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE appointment_status AS ENUM (
    'scheduled',
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
);

CREATE TYPE intent_type AS ENUM (
    'CREATE_EVENT',
    'INFO',
    'PAYMENT',
    'HUMAN',
    'UNKNOWN'
);

CREATE TYPE kb_category AS ENUM (
    'servicios',
    'precios',
    'horarios',
    'ubicacion',
    'pagos',
    'seguros',
    'preparacion',
    'general'
);

-- ============================================================
-- TABLE: clinics
-- Root tenant table. Every other table references this.
-- ============================================================

CREATE TABLE clinics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    subdomain       TEXT UNIQUE NOT NULL,
    phone           TEXT,
    address         TEXT,
    timezone        TEXT NOT NULL DEFAULT 'America/Lima',
    calendar_id     TEXT,                        -- Google Calendar ID
    chatwoot_account_id INTEGER,                 -- Chatwoot account for this clinic
    chatwoot_inbox_id   INTEGER,                 -- Chatwoot inbox for this clinic
    branding_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    bot_config      JSONB NOT NULL DEFAULT '{
        "max_bot_interactions": 3,
        "business_hours_start": 8,
        "business_hours_end": 22,
        "reminder_hours_before": 24,
        "escalation_message": "Te conecto con un agente.",
        "welcome_message": "Hola, soy SofIA, tu asistente virtual."
    }'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: knowledge_base
-- Dynamic FAQ per clinic. Replaces hardcoded Code node.
-- ============================================================

CREATE TABLE knowledge_base (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    category        kb_category NOT NULL DEFAULT 'general',
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    keywords        TEXT[] DEFAULT '{}',          -- For keyword matching
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority        INTEGER NOT NULL DEFAULT 0,   -- Higher = shown first
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: appointments
-- Tracks every booking across all clinics.
-- ============================================================

CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    conversation_id INTEGER,                      -- Chatwoot conversation ID
    patient_name    TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    service         TEXT NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    status          appointment_status NOT NULL DEFAULT 'scheduled',
    calendar_event_id TEXT,                       -- Google Calendar event ID
    reminder_sent   BOOLEAN NOT NULL DEFAULT false,
    reminder_sent_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent double-booking at the same clinic
    CONSTRAINT no_overlap EXCLUDE USING gist (
        clinic_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('scheduled', 'confirmed'))
);

-- ============================================================
-- TABLE: conversation_metrics
-- One row per conversation for analytics.
-- ============================================================

CREATE TABLE conversation_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL,
    intent          intent_type NOT NULL DEFAULT 'UNKNOWN',
    escalated       BOOLEAN NOT NULL DEFAULT false,
    booked          BOOLEAN NOT NULL DEFAULT false,
    cancelled       BOOLEAN NOT NULL DEFAULT false,
    phase_reached   INTEGER NOT NULL DEFAULT 1,
    response_time_ms INTEGER,
    message_count   INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_conversation UNIQUE (clinic_id, conversation_id)
);

-- ============================================================
-- TABLE: reminder_log
-- Audit trail for sent reminders.
-- ============================================================

CREATE TABLE reminder_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL DEFAULT 'chatwoot',
    status          TEXT NOT NULL DEFAULT 'sent',  -- sent / failed / skipped
    error_message   TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-update updated_at on row modification.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated
    BEFORE UPDATE ON clinics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_knowledge_base_updated
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_appointments_updated
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversation_metrics_updated
    BEFORE UPDATE ON conversation_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
