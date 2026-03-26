# Migraciones Supabase

Orden cronológico de migraciones aplicadas en producción.
Ref: `inhyrrjidhzrbqecnptn`

| # | Archivo | Descripción |
|---|---------|-------------|
| 001 | schema.sql | Tablas base: clinics, knowledge_base, appointments, metrics |
| 002 | rls_and_indexes.sql | Row Level Security + índices |
| 003 | functions.sql | Funciones PL/pgSQL iniciales |
| 004 | seed.sql | Datos iniciales de clinics y knowledge_base |
| 005 | conversations.sql | Tabla conversations + conversation_events |
| 006 | conversations_rls.sql | RLS para conversations |
| 007 | governance_functions.sql | Funciones de governance (pause/resume bot) |
| 008 | governance_jwt_refactor.sql | JWT custom claims (clinic_id, user_role) |
| 009 | inbox_security.sql | Seguridad multi-inbox |
| 010 | scaling_infrastructure.sql | Índices y optimizaciones de escala |
| 011 | auth_staff.sql | Roles staff (admin / staff) |
| 012 | staff_list.sql | Función list_staff_for_clinic |
| 013a | demo_requests.sql | Tabla demo_requests (leads SaaS) |
| 013b | multi_inbox.sql | Soporte multi-inbox por clínica |
| 015 | offered_slots.sql | Slots ofrecidos en conversación |
| 016 | appointment_source.sql | Campo source en appointments (bot/manual) |
| 017 | monthly_reports.sql | Tabla monthly_reports |
| 018 | reminders_v2.sql | Sistema de recordatorios v2 |
| 019 | fix_payment_reminder_rls.sql | Fix RLS payment_reminder_sent |
| 020 | patients_schema.sql | Tablas patients + patient_allergies + clinical_records |
| 021 | patients_rls_indexes.sql | RLS + índices para patients |
| 022 | patients_functions.sql | RPCs: search_patients, create_or_update_patient, get_patient_by_dni |
| 023 | fix_clinic_isolation.sql | Fix isolación por clínica en patients |
| 024 | doctors_schema.sql | Tabla doctors + KB auto-sync trigger |
| 025 | appointments_doctor.sql | FK doctor_id en appointments + EXCLUDE constraints |
| 026 | resolve_clinic_email.sql | Agrega admin_email al retorno de resolve_clinic() |
| 027 | patient_clinical_history.sql | clinical_events table + bot_upsert_patient + log_clinical_event + get_patient_history RPCs |

> Note: Existe un gap en 014 (no aplicado) y dos archivos 013 aplicados manualmente.
> Migration 027: **Pendiente aplicar via Supabase SQL Editor**. Ver `scripts/ops/apply_migration_027.js` para instrucciones.
