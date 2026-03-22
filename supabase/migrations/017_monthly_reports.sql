-- 017: Monthly reports table + admin_email on clinics

-- Admin contact email per clinic (destination for monthly reports)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS admin_email TEXT;

-- Update existing clinics with known emails (edit as needed)
-- UPDATE clinics SET admin_email = 'admin@clinica.com' WHERE id = '...';

-- Monthly reports history
CREATE TABLE IF NOT EXISTS monthly_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,          -- 'YYYY-MM'
  pdf_url     TEXT,                   -- Supabase Storage public URL
  email_to    TEXT,
  sent_at     TIMESTAMPTZ,
  metrics     JSONB,                  -- snapshot of all KPIs
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_clinic_month
  ON monthly_reports (clinic_id, month DESC);

-- RLS: super admin reads all, clinic admin reads own
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_reports_service ON monthly_reports;
CREATE POLICY monthly_reports_service ON monthly_reports
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE monthly_reports IS
  'Historial de reportes PDF mensuales enviados a cada clínica';
