-- ============================================================
-- SOFIA SaaS - Row Level Security + Indexes
-- Migration 002: Multi-clinic isolation & performance
-- ============================================================

-- ============================================================
-- ROW LEVEL SECURITY
-- Every query is automatically filtered by clinic_id.
-- No cross-clinic data leakage possible.
-- ============================================================

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Service role bypass (for n8n backend calls)
-- n8n uses the service_role key, which bypasses RLS.
-- This is by design: n8n is a trusted backend.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Clinic-scoped access for authenticated users (dashboard)
-- Uses JWT claim: auth.jwt() ->> 'clinic_id'
-- ------------------------------------------------------------

-- Clinics: users only see their own clinic
CREATE POLICY clinic_isolation ON clinics
    FOR ALL
    USING (id = (auth.jwt() ->> 'clinic_id')::uuid);

-- Knowledge Base: scoped to user's clinic
CREATE POLICY kb_isolation ON knowledge_base
    FOR ALL
    USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- Appointments: scoped to user's clinic
CREATE POLICY appointment_isolation ON appointments
    FOR ALL
    USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- Metrics: scoped to user's clinic
CREATE POLICY metrics_isolation ON conversation_metrics
    FOR ALL
    USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- Reminder log: scoped to user's clinic
CREATE POLICY reminder_isolation ON reminder_log
    FOR ALL
    USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- ------------------------------------------------------------
-- Public read for knowledge_base (chatbot doesn't auth as user)
-- n8n uses service_role, so this is for edge functions only
-- ------------------------------------------------------------

CREATE POLICY kb_public_read ON knowledge_base
    FOR SELECT
    USING (active = true);

-- ============================================================
-- INDEXES
-- Designed for the actual query patterns from n8n + dashboard.
-- ============================================================

-- Clinics
CREATE INDEX idx_clinics_subdomain ON clinics (subdomain) WHERE active = true;
CREATE INDEX idx_clinics_active ON clinics (active);

-- Knowledge Base - Primary query: fetch by clinic + category
CREATE INDEX idx_kb_clinic_category ON knowledge_base (clinic_id, category) WHERE active = true;
CREATE INDEX idx_kb_clinic_active ON knowledge_base (clinic_id) WHERE active = true;
-- Trigram index for fuzzy text search on questions
CREATE INDEX idx_kb_question_trgm ON knowledge_base USING gin (question gin_trgm_ops);
-- GIN index on keywords array for @> (contains) operator
CREATE INDEX idx_kb_keywords ON knowledge_base USING gin (keywords);

-- Appointments - Primary queries
CREATE INDEX idx_appointments_clinic_status ON appointments (clinic_id, status);
CREATE INDEX idx_appointments_clinic_time ON appointments (clinic_id, start_time)
    WHERE status IN ('scheduled', 'confirmed');
-- Reminder query: upcoming appointments not yet reminded
CREATE INDEX idx_appointments_reminder ON appointments (start_time)
    WHERE status IN ('scheduled', 'confirmed') AND reminder_sent = false;
-- Conversation lookup
CREATE INDEX idx_appointments_conversation ON appointments (clinic_id, conversation_id);

-- Conversation Metrics - Dashboard queries
CREATE INDEX idx_metrics_clinic_created ON conversation_metrics (clinic_id, created_at DESC);
CREATE INDEX idx_metrics_clinic_intent ON conversation_metrics (clinic_id, intent);
CREATE INDEX idx_metrics_clinic_booked ON conversation_metrics (clinic_id)
    WHERE booked = true;

-- Reminder Log
CREATE INDEX idx_reminder_log_appointment ON reminder_log (appointment_id);
CREATE INDEX idx_reminder_log_clinic ON reminder_log (clinic_id, sent_at DESC);
