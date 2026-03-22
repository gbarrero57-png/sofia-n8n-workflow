# Scripts

## patches/archive/
Historial de patches aplicados al workflow de n8n. El estado actual del workflow
está en `workflows/sofia/sofia_main.json` (sincronizado desde n8n).
NO ejecutar estos scripts en producción — ya están aplicados.

## ops/
Scripts operacionales:
- `seed_kb.js` — Carga inicial de base de conocimiento
- `seed_menu_config.js` — Configuración del menú de SofIA
- `onboard_clinic.js` — Alta de nueva clínica
- `backup_workflows.py` — Backup de workflows desde n8n API
- `rotate_keys.py` — Rotación de API keys
- `audit_users_clinics.js` — Auditoría de usuarios y clínicas
- `check_appointments.js` — Revisión de citas en Supabase
- `fix_user_clinic_assignments.js` — Fix de asignaciones usuario-clínica

## builders/
Constructores de workflows nuevos (outreach, lead gen).

## tests/ (JS)
Tests de integración en JavaScript.
Ver también `testing/` en la raíz para la suite Python con CI/CD.
