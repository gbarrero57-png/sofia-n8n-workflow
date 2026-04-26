-- Migration 041: Odontograma dental por paciente
-- FDI notation: Q1=11-18, Q2=21-28, Q3=31-38, Q4=41-48

CREATE TABLE IF NOT EXISTS public.patient_teeth (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  tooth_fdi   smallint    NOT NULL,
  CONSTRAINT  valid_fdi CHECK (
    (tooth_fdi BETWEEN 11 AND 18) OR (tooth_fdi BETWEEN 21 AND 28) OR
    (tooth_fdi BETWEEN 31 AND 38) OR (tooth_fdi BETWEEN 41 AND 48)
  ),
  status      text        NOT NULL DEFAULT 'healthy'
              CHECK (status IN ('healthy','caries','treated','extracted','crown','implant','missing')),
  surfaces    text,  -- JSON string: {m:bool, d:bool, o:bool, v:bool, p:bool} = mesial/distal/oclusal/vestibular/palatino
  notes       text,
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id, tooth_fdi)
);

CREATE INDEX IF NOT EXISTS patient_teeth_patient ON public.patient_teeth (patient_id);
CREATE INDEX IF NOT EXISTS patient_teeth_clinic  ON public.patient_teeth (clinic_id);

ALTER TABLE public.patient_teeth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teeth_select" ON public.patient_teeth FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "teeth_insert" ON public.patient_teeth FOR INSERT
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "teeth_update" ON public.patient_teeth FOR UPDATE
  USING (clinic_id IN (SELECT clinic_id FROM public.staff WHERE user_id = auth.uid()));
