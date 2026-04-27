-- ============================================================
-- 044_appointment_source_staff.sql
-- Agrega 'staff' como origen válido de citas.
-- Usado cuando el doctor crea cita de seguimiento desde
-- el historial clínico (próxima cita recomendada).
-- ============================================================

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('bot', 'manual', 'staff'));

COMMENT ON COLUMN public.appointments.source IS
  'bot = creada por SofIA, manual = creada por admin, staff = recomendada por doctor desde historial';
