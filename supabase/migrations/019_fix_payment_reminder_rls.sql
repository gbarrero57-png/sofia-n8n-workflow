-- 019: Fix RLS on payment_reminder_log (was UNRESTRICTED)
-- Date: 2026-03-16
--
-- Problem: payment_reminder_log had no RLS → any authenticated user
--          could read ALL payment logs from ALL clinics.
--
-- Fix:
--   1. Enable RLS (locks out anon + authenticated roles by default)
--   2. Add service_role-only policy so n8n/server code still works
--   3. staff can only see their own clinic's logs (via JWT clinic_id claim)

ALTER TABLE payment_reminder_log ENABLE ROW LEVEL SECURITY;

-- Drop any leftover permissive policy
DROP POLICY IF EXISTS prl_service ON payment_reminder_log;

-- Service role bypasses RLS automatically — but make explicit for clarity
-- Staff/admin can only read logs from their own clinic
DROP POLICY IF EXISTS prl_staff_read ON payment_reminder_log;
CREATE POLICY prl_staff_read ON payment_reminder_log
  FOR SELECT
  USING (
    clinic_id::text = (auth.jwt() ->> 'clinic_id')
    AND (auth.jwt() ->> 'user_role') IN ('admin', 'staff')
  );

-- No INSERT/UPDATE/DELETE policy for authenticated users
-- All writes come exclusively from service_role (n8n, server functions)
