-- ============================================================
-- SofIA SaaS - Conversation Governance RLS
-- Migration 006: Multi-tenant isolation + role-based access
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CONVERSATIONS TABLE
-- ============================================================

-- Admin: full CRUD on their clinic's conversations
CREATE POLICY conversations_admin_all ON conversations
    FOR ALL
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- Staff: read-only on their clinic's conversations
CREATE POLICY conversations_staff_read ON conversations
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('staff', 'admin')
    );

-- ============================================================
-- CONVERSATION_EVENTS TABLE
-- ============================================================

-- Admin: full access to events in their clinic
CREATE POLICY conversation_events_admin_all ON conversation_events
    FOR ALL
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') = 'admin'
    );

-- Staff: read-only access to events in their clinic
CREATE POLICY conversation_events_staff_read ON conversation_events
    FOR SELECT
    USING (
        clinic_id = (auth.jwt() ->> 'clinic_id')::uuid
        AND (auth.jwt() ->> 'user_role') IN ('staff', 'admin')
    );
