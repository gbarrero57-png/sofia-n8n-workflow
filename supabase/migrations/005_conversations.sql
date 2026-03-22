-- ============================================================
-- SofIA SaaS - Conversation Governance Tables
-- Migration 005: Human-in-the-loop support
-- ============================================================

-- Conversation status enum
CREATE TYPE conversation_status AS ENUM ('active', 'human', 'closed');

-- Event type enum
CREATE TYPE conversation_event_type AS ENUM ('message', 'booking', 'escalation', 'cancel');

-- Event source enum
CREATE TYPE conversation_event_source AS ENUM ('bot', 'human');

-- ============================================================
-- TABLE: conversations
-- One row per Chatwoot conversation. Governs bot behavior.
-- ============================================================

CREATE TABLE conversations (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id                   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    chatwoot_conversation_id    TEXT NOT NULL,
    patient_name                TEXT,
    status                      conversation_status NOT NULL DEFAULT 'active',
    bot_paused                  BOOLEAN NOT NULL DEFAULT false,
    assigned_user_id            UUID,
    last_message                TEXT,
    last_activity_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT unique_chatwoot_conversation UNIQUE (clinic_id, chatwoot_conversation_id)
);

COMMENT ON TABLE conversations IS 'Conversation governance - track bot pause, human assignment, status';
COMMENT ON COLUMN conversations.bot_paused IS 'When true, n8n workflow stops before AI response';
COMMENT ON COLUMN conversations.assigned_user_id IS 'Staff user assigned to handle this conversation';

-- ============================================================
-- TABLE: conversation_events
-- Append-only audit log for all governance actions.
-- ============================================================

CREATE TABLE conversation_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    type                conversation_event_type NOT NULL,
    source              conversation_event_source NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversation_events IS 'Append-only event log for conversation governance audit';

-- ============================================================
-- INDEXES
-- ============================================================

-- Lookup by Chatwoot ID (n8n bot pause check)
CREATE INDEX idx_conversations_chatwoot
    ON conversations (clinic_id, chatwoot_conversation_id);

-- Dashboard: list by status, ordered by recent activity
CREATE INDEX idx_conversations_status_activity
    ON conversations (clinic_id, status, last_activity_at DESC);

-- Partial: active conversations only
CREATE INDEX idx_conversations_active
    ON conversations (clinic_id, last_activity_at DESC)
    WHERE status = 'active';

-- Partial: human-handled conversations
CREATE INDEX idx_conversations_human
    ON conversations (clinic_id, last_activity_at DESC)
    WHERE status = 'human';

-- Assigned conversations
CREATE INDEX idx_conversations_assigned
    ON conversations (clinic_id, assigned_user_id, last_activity_at DESC)
    WHERE assigned_user_id IS NOT NULL;

-- Event log queries
CREATE INDEX idx_conversation_events_conversation
    ON conversation_events (conversation_id, created_at DESC);

CREATE INDEX idx_conversation_events_clinic
    ON conversation_events (clinic_id, created_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_conversations_updated
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
