# SofIA — Hardening Setup Guide (Capa 1)

## PASO 0: Rotar Todas las Credenciales AHORA

Antes de cualquier deploy, rotar en este orden:

### 0.1 Supabase Service Role Key
1. Ir a: https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/settings/api
2. Clic en "Reveal" junto a "service_role"
3. Clic en "Revoke" → confirmar
4. Copiar la nueva key generada
5. Actualizar .env.production con el nuevo valor

### 0.2 n8n API Key
1. Ir a: https://workflows.n8n.redsolucionesti.com/settings/api
2. Eliminar el token actual
3. Crear nuevo token
4. Actualizar .env.production

### 0.3 Chatwoot Webhook Token
1. Ir a Chatwoot → Settings → Integrations → Webhooks
2. Editar el webhook de SofIA
3. Generar nuevo token aleatorio (usa: openssl rand -hex 32)
4. Actualizar .env.production con el mismo valor
5. El mismo valor va en la variable de entorno de n8n

---

## PASO 1: Variables de Entorno en n8n Host

Agregar al archivo de configuración de n8n (docker-compose.yml o .env del servidor):

```env
# Supabase
N8N_SUPABASE_URL=https://inhyrrjidhzrbqecnptn.supabase.co
N8N_SUPABASE_SERVICE_KEY=<nueva_service_role_key_rotada>

# Chatwoot
N8N_CHATWOOT_API_TOKEN=<nuevo_chatwoot_token>
N8N_CHATWOOT_WEBHOOK_TOKEN=<token_generado_con_openssl>

# Alertas (puede ser un webhook de Slack, Discord, o el mismo Chatwoot)
N8N_ALERT_WEBHOOK_URL=<url_de_alertas_internas>

# Configuración de seguridad
N8N_WEBHOOK_MAX_AGE_SECONDS=300
```

### Si n8n corre en Docker:

```yaml
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - N8N_SUPABASE_URL=${N8N_SUPABASE_URL}
      - N8N_SUPABASE_SERVICE_KEY=${N8N_SUPABASE_SERVICE_KEY}
      - N8N_CHATWOOT_API_TOKEN=${N8N_CHATWOOT_API_TOKEN}
      - N8N_CHATWOOT_WEBHOOK_TOKEN=${N8N_CHATWOOT_WEBHOOK_TOKEN}
      - N8N_ALERT_WEBHOOK_URL=${N8N_ALERT_WEBHOOK_URL}
      - N8N_WEBHOOK_MAX_AGE_SECONDS=300
```

### Para aplicar sin downtime:
1. Agregar variables nuevas (paralelo a las hardcoded)
2. Reiniciar n8n workers (no el main process si tienes queue mode)
3. Deploy de nodos actualizados (leen de env vars)
4. Verificar que funciona
5. El código hardcoded ya no se usa — puedes eliminar nodos viejos

---

## PASO 2: Agregar Credencial Supabase en n8n UI

1. Ir a: n8n → Credentials → Add Credential
2. Tipo: "Header Auth"
3. Nombre: "Supabase Service Role"
4. Header Name: "Authorization"
5. Header Value: "Bearer <nueva_service_role_key>"

6. Crear segunda credencial:
   - Tipo: "Header Auth"
   - Nombre: "Supabase API Key"
   - Header Name: "apikey"
   - Header Value: "<nueva_service_role_key>"

Estas credenciales se almacenan encriptadas en la DB de n8n y NO aparecen en el JSON del workflow exportado.

---

## PASO 3: Nginx Rate Limiting

Agregar en el bloque `server` de n8n en Nginx:

```nginx
# /etc/nginx/conf.d/n8n-ratelimit.conf

# Zona de rate limiting por IP
limit_req_zone $binary_remote_addr zone=webhook_zone:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api_zone:10m rate=30r/m;

server {
    # ... resto de config ...

    # Webhook Chatwoot - max 10 req/seg por IP
    location /webhook/chatwoot-sofia {
        limit_req zone=webhook_zone burst=20 nodelay;
        limit_req_status 429;

        # Headers de seguridad
        add_header X-Content-Type-Options nosniff;
        add_header X-Frame-Options DENY;

        proxy_pass http://n8n:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # API n8n - limitar acceso externo
    location /api/v1/ {
        limit_req zone=api_zone burst=10;
        limit_req_status 429;

        # Solo permitir IPs internas si es posible
        # allow 10.0.0.0/8;
        # deny all;

        proxy_pass http://n8n:5678;
    }
}
```

---

## PASO 4: .gitignore actualizado

```gitignore
# Secrets - NUNCA en git
.env
.env.*
!.env.example
*.env

# Workflow JSONs con credenciales incrustadas
saas/workflow_*.json
saas/*_deployed.json
saas/*_backup*.json

# Logs
*.log
saas/logs/
```
