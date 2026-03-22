# Patches Archive

Historial de patches aplicados al workflow de SofIA en n8n.
Todos estos cambios ya están incorporados en el workflow vivo (ID: 37SLdWISQLgkHeXk).

## Estado actual
El workflow actual se puede ver/descargar desde:
https://workflows.n8n.redsolucionesti.com

El JSON de referencia está en: `workflows/sofia/sofia_main.json`

## Patches aplicados (cronológico)
- `patch_verificar_token.js` — Agrega verificación HMAC del webhook
- `patch_webhook_signature.js` — Mejora firma webhook
- `patch_safe_check.js` — Reglas WhatsApp Safe Check
- `patch_preclasificador_v2.js` / `v3.js` — Clasificación pre-IA
- `patch_info_prompt_v2.js` — Prompt de respuestas informativas
- `patch_menu_system.js` — Sistema de menú interactivo
- `patch_menu_reset_state.js` — Reset de estado del menú
- `patch_normalizar_greeting.js` — Normalización de saludos
- `patch_slot_preferences.js` — Preferencias de horario del paciente
- `patch_formatear_oferta.js` — Formato de oferta de slots
- `patch_marcar_v3.js` — Marcar conversación esperando confirmación
- `patch_guardar_cita_v2.js` — Guardar cita en Supabase (con doctor_id)
- `patch_actualizar_v2.js` — Actualizar atributos en Chatwoot
- `patch_doctors_flow.js` — Integración de doctores en flujo de agendamiento
- `patch_email_v3.js` — Email de escalado al admin de la clínica
- `patch_remove_gcal.js` — Eliminar dependencia de Google Calendar
- `patch_twilio.js` — Integración SMS Twilio
- `fix_sofia_bugs.js` — Fixes varios de bugs E2E
- `patch_all.js` — Script maestro que aplica todos los patches
