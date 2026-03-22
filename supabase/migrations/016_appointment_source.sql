-- 016: Add source column to appointments to distinguish bot vs manual entries
-- source = 'bot'    → created automatically by SofIA via WhatsApp flow
-- source = 'manual' → created directly by admin/staff in the dashboard

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'bot';

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('bot', 'manual'));

-- Index for filtering by source per clinic
CREATE INDEX IF NOT EXISTS idx_appointments_source
  ON appointments (clinic_id, source, start_time);

COMMENT ON COLUMN appointments.source IS
  'Origin of the appointment: bot = created by SofIA AI flow, manual = created by admin/staff in dashboard';
