# Workflows

Fuente canónica de todos los workflows de n8n.
Estos JSONs se sincronizan desde la instancia de n8n via `scripts/ops/backup_workflows.py`.

## sofia/
- `sofia_main.json` — Workflow principal SofIA (54 nodos). Maneja mensajes WhatsApp
  via Chatwoot: clasificación de intención → agendamiento → confirmación → escalado.
- `sofia_reminders.json` — Cron cada hora: envía recordatorios de citas 24h antes.
- `monthly_reports_cron.json` — Cron mensual: genera y envía reportes PDF por clínica.

## libreria/
Sistema de cotización para librería (4 flujos encadenados):
- `w1_cotizar.json` — Recibe foto + mensaje, cotiza con OpenAI Vision
- `w2_confirmar.json` — Confirma cotización y genera pedido
- `w3_comprobante.json` — Recibe comprobante de pago
- `w4_entrega.json` — Gestiona entrega (recoger / envío)

## ai-news/
- `avatar_pipeline.json` — Genera video avatar IA 2x/semana (D-ID + ElevenLabs)
- `carousel_pipeline.json` — Genera carrusel Instagram 7 slides (Airtable + Placid)

## outreach/
Secuencia de contacto automatizado (email → SMS → llamada).
