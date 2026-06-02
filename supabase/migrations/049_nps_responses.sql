-- ============================================================
-- 049_nps_responses.sql
-- Capa 3: tabla para almacenar respuestas NPS de pacientes
-- ============================================================

DROP TABLE IF EXISTS public.nps_responses CASCADE;

CREATE TABLE public.nps_responses (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id        UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_phone    TEXT        NOT NULL,
    score            INT         NOT NULL CHECK (score BETWEEN 1 AND 5),
    conversation_id  BIGINT,
    appointment_id   UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nps_responses IS
  'Respuestas NPS (1-5) enviadas por pacientes post-cita. Disparadas por el workflow NPS Post-Cita.';

CREATE INDEX IF NOT EXISTS idx_nps_responses_clinic_id
    ON public.nps_responses(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nps_responses_phone
    ON public.nps_responses(clinic_id, patient_phone);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_admin_full" ON public.nps_responses
    FOR ALL
    USING (
        clinic_id IN (
            SELECT clinic_id FROM public.staff
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- ── get_nps_summary — promedio y distribución por clínica ────────────────────

CREATE OR REPLACE FUNCTION public.get_nps_summary(
    p_clinic_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    total_responses BIGINT,
    avg_score       NUMERIC,
    score_1         BIGINT,
    score_2         BIGINT,
    score_3         BIGINT,
    score_4         BIGINT,
    score_5         BIGINT,
    promoters_pct   NUMERIC,
    detractors_pct  NUMERIC,
    nps_index       NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)                                                           AS total_responses,
        ROUND(AVG(score)::numeric, 2)                                      AS avg_score,
        COUNT(*) FILTER (WHERE score = 1)                                  AS score_1,
        COUNT(*) FILTER (WHERE score = 2)                                  AS score_2,
        COUNT(*) FILTER (WHERE score = 3)                                  AS score_3,
        COUNT(*) FILTER (WHERE score = 4)                                  AS score_4,
        COUNT(*) FILTER (WHERE score = 5)                                  AS score_5,
        ROUND(COUNT(*) FILTER (WHERE score >= 4)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS promoters_pct,
        ROUND(COUNT(*) FILTER (WHERE score <= 2)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS detractors_pct,
        ROUND(
            (COUNT(*) FILTER (WHERE score >= 4)::numeric
             - COUNT(*) FILTER (WHERE score <= 2)::numeric)
            / NULLIF(COUNT(*),0) * 100, 1
        )                                                                  AS nps_index
    FROM   public.nps_responses
    WHERE  clinic_id  = p_clinic_id
      AND  created_at >= now() - (p_days || ' days')::interval;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT ON public.nps_responses TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_nps_summary(UUID, INT)
    TO authenticated, service_role;
