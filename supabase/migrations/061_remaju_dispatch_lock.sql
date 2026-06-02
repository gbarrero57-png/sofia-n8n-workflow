-- ============================================================
-- REMAJU — Lock atómico para dispatch diario
-- Previene ejecuciones duplicadas del dispatch en el mismo día
-- ============================================================

CREATE TABLE IF NOT EXISTS remaju_dispatch_lock (
  lock_date  DATE        PRIMARY KEY,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo admins pueden insertar/leer (service role bypasses RLS)
ALTER TABLE remaju_dispatch_lock ENABLE ROW LEVEL SECURITY;
