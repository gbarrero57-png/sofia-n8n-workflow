# SaaS Runtime

Archivos de runtime generados automáticamente. NO editar manualmente.

- `.env` — Variables de entorno (SECRETO, nunca commitear)
- `sofia_live.json` — Cache del workflow SofIA desde n8n (regenerado por backup_workflows.py)
- `reminders_live.json` — Cache del workflow Reminders (regenerado por backup_workflows.py)

## Variables requeridas (.env)
```
N8N_API_KEY=...
N8N_BASE_URL=https://workflows.n8n.redsolucionesti.com
N8N_SUPABASE_URL=https://inhyrrjidhzrbqecnptn.supabase.co
N8N_SUPABASE_SERVICE_KEY=...
N8N_CHATWOOT_API_KEY=...
N8N_OPENAI_API_KEY=...
```
