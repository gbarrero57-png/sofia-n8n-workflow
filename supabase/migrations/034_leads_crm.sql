-- Migration 034: Leads CRM table
-- Migrates from Airtable (free plan, 1,000 record limit) to Supabase (unlimited)
-- Supports full CRM features: pipeline, notes, activity log, bulk outreach tracking

CREATE TABLE IF NOT EXISTS leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_id       text UNIQUE,               -- for dedup during migration

  -- Identity
  nombre            text NOT NULL,
  email             text,
  telefono          text,
  website           text,
  direccion         text,
  ciudad            text,
  distrito          text,

  -- Scoring
  score_relevancia  integer DEFAULT 0,
  rating            numeric(3,1),
  total_resenas     integer DEFAULT 0,

  -- Pipeline status
  status            text NOT NULL DEFAULT 'nuevo'
                    CHECK (status IN ('nuevo','sin_email','enviado','email_enviado',
                                      'follow_up_enviado','respondio','interesado',
                                      'demo_agendada','cerrado','no_interesado')),

  -- Outreach tracking
  fuente            text[] DEFAULT '{}',
  whatsapp_enviado  boolean DEFAULT false,
  sms_enviado       boolean DEFAULT false,
  fecha_envio       timestamptz,
  fecha_followup    timestamptz,
  email_asunto      text,
  email_cuerpo      text,

  -- CRM fields
  notas             text,
  ultima_actividad  timestamptz,
  fecha_contacto    timestamptz,
  citas_semana      text,

  -- Timestamps
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS leads_status_idx       ON leads(status);
CREATE INDEX IF NOT EXISTS leads_ciudad_idx       ON leads(ciudad);
CREATE INDEX IF NOT EXISTS leads_email_idx        ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_score_idx        ON leads(score_relevancia DESC);
CREATE INDEX IF NOT EXISTS leads_created_at_idx   ON leads(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

-- RLS: only service role (backend) can write; superadmin reads via service key
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON leads
  FOR ALL USING (true) WITH CHECK (true);
