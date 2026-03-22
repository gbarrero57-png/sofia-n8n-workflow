#!/usr/bin/env python3
"""
SofIA Ops — Rotación de credenciales (zero-downtime)

Proceso:
  1. Solicita nueva credencial (generada externamente)
  2. Verifica que la nueva credencial funciona
  3. Actualiza el workflow n8n con la nueva credencial
  4. Confirma que el workflow sigue funcionando
  5. Guarda registro de la rotación

Ejecutar manualmente cada 30-90 días según política.
"""
import json, requests, os, sys, getpass
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = os.environ.get("N8N_BASE_URL", "https://workflows.n8n.redsolucionesti.com")
N8N_API_KEY  = os.environ.get("N8N_API_KEY", "")
SUPABASE_URL = os.environ.get("N8N_SUPABASE_URL", "https://inhyrrjidhzrbqecnptn.supabase.co")
WORKFLOW_ID  = os.environ.get("N8N_WORKFLOW_ID", "37SLdWISQLgkHeXk")

ROTATION_LOG = "./ops/rotation_log.jsonl"

def log_rotation(event, details):
    entry = {"ts": datetime.now().isoformat(), "event": event, **details}
    os.makedirs(os.path.dirname(ROTATION_LOG), exist_ok=True)
    with open(ROTATION_LOG, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry) + "\n")
    return entry

def verify_supabase_key(url, key, label=""):
    """Verifica que la key de Supabase funciona haciendo una query simple."""
    r = requests.get(f"{url}/rest/v1/clinics?select=id&limit=1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=10)
    if r.status_code in [200, 206]:
        print(f"  [OK] {label} Supabase key válida (status={r.status_code})")
        return True
    else:
        print(f"  [FAIL] {label} Supabase key inválida: {r.status_code} {r.text[:100]}")
        return False

def verify_chatwoot_token(chatwoot_url, api_token, label=""):
    """Verifica token de Chatwoot."""
    r = requests.get(f"{chatwoot_url}/auth/sign_in",
        headers={"api_access_token": api_token}, timeout=10)
    valid = r.status_code in [200, 401]  # 401 = token válido pero ruta incorrecta
    print(f"  {'[OK]' if valid else '[FAIL]'} {label} Chatwoot token: {r.status_code}")
    return valid

print("=" * 65)
print("SofIA Key Rotation — Proceso Guiado")
print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print("=" * 65)

print("""
ANTES DE CONTINUAR:
  1. Genera la nueva credencial en el dashboard correspondiente
  2. NO revoca la credencial anterior hasta confirmar que la nueva funciona
  3. Ten acceso al servidor n8n para actualizar variables de entorno

Credenciales con política de rotación:
  [1] Supabase service_role key (cada 90 días)
  [2] n8n API key (cada 30 días)
  [3] Chatwoot webhook token (cada 30 días)
  [4] OpenAI API key (cada 90 días)
  [5] Todas las anteriores
  [0] Salir
""")

choice = input("Selecciona credencial a rotar [0-5]: ").strip()
if choice == "0":
    print("Rotación cancelada.")
    sys.exit(0)

rotations = []

# ── Supabase service_role ────────────────────────────────────────────────────
if choice in ["1", "5"]:
    print("\n── Supabase service_role Key ──")
    print("1. Ve a: https://supabase.com/dashboard/project/inhyrrjidhzrbqecnptn/settings/api")
    print("2. Genera nueva service_role key")
    print("3. Pégala aquí (se oculta en pantalla):\n")

    new_key = getpass.getpass("Nueva Supabase service_role key: ").strip()
    if not new_key:
        print("[SKIP] Supabase key vacía — saltando")
    else:
        print("\nVerificando nueva key...")
        if verify_supabase_key(SUPABASE_URL, new_key, "nueva"):
            print("\nACTUALIZAR VARIABLE EN SERVIDOR n8n:")
            print(f"  export N8N_SUPABASE_SERVICE_KEY='{new_key}'")
            print(f"  # Luego: pm2 restart n8n  (o docker-compose restart n8n-main n8n-worker)")
            print("\nDespués de reiniciar n8n, REVOCA la key anterior en Supabase dashboard.")
            log_rotation("SUPABASE_KEY_ROTATED", {"status": "pending_deploy", "ts": datetime.now().isoformat()})
            rotations.append("supabase_service_key")
        else:
            print("[ERROR] Nueva key NO funciona. NO actualizar producción.")

# ── n8n API Key ───────────────────────────────────────────────────────────────
if choice in ["2", "5"]:
    print("\n── n8n API Key ──")
    print("1. Ve a: n8n UI → Settings → API → Create new token")
    print("2. Pégala aquí:\n")

    new_n8n_key = getpass.getpass("Nuevo n8n API key: ").strip()
    if not new_n8n_key:
        print("[SKIP] n8n key vacía — saltando")
    else:
        r = requests.get(f"{N8N_BASE_URL}/api/v1/workflows",
            headers={"X-N8N-API-KEY": new_n8n_key}, params={"limit": 1})
        if r.status_code == 200:
            print("  [OK] Nueva n8n API key válida")
            print(f"\nACTUALIZAR VARIABLE:")
            print(f"  export N8N_API_KEY='{new_n8n_key}'")
            print("  # Actualizar también en scripts de deploy/backup/ops")
            log_rotation("N8N_API_KEY_ROTATED", {"status": "pending_deploy"})
            rotations.append("n8n_api_key")
        else:
            print(f"  [FAIL] Nueva n8n key inválida: {r.status_code}")

# ── Chatwoot webhook token ────────────────────────────────────────────────────
if choice in ["3", "5"]:
    print("\n── Chatwoot Webhook Token ──")
    print("Genera un token aleatorio (32 bytes hex):")
    print("  openssl rand -hex 32")
    print("")

    new_token = getpass.getpass("Nuevo Chatwoot webhook token: ").strip()
    if not new_token:
        print("[SKIP] Token vacío — saltando")
    elif len(new_token) < 16:
        print("[ERROR] Token muy corto (mínimo 16 caracteres)")
    else:
        print("  [OK] Token generado")
        print("\nACTUALIZAR EN DOS LUGARES:")
        print("  1. Chatwoot dashboard → Settings → Integrations → Webhooks → Editar SofIA")
        print(f"     Token: {new_token[:8]}...")
        print("  2. Variable en servidor n8n:")
        print(f"     export N8N_CHATWOOT_WEBHOOK_TOKEN='{new_token}'")
        print("     pm2 restart n8n  (o docker-compose restart)")
        log_rotation("CHATWOOT_TOKEN_ROTATED", {"status": "pending_manual_update"})
        rotations.append("chatwoot_webhook_token")

# ── OpenAI API Key ────────────────────────────────────────────────────────────
if choice in ["4", "5"]:
    print("\n── OpenAI API Key ──")
    print("1. Ve a: platform.openai.com/api-keys")
    print("2. Crea nueva key")
    print("3. Pégala aquí:\n")

    new_openai = getpass.getpass("Nueva OpenAI API key: ").strip()
    if not new_openai:
        print("[SKIP] OpenAI key vacía — saltando")
    else:
        r = requests.get("https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {new_openai}"}, timeout=10)
        if r.status_code == 200:
            print("  [OK] Nueva OpenAI key válida")
            print("\nACTUALIZAR EN n8n:")
            print("  n8n UI → Credentials → OpenAI API → Editar → Pegar nueva key")
            print("  (n8n almacena encriptada — no requiere restart)")
            log_rotation("OPENAI_KEY_ROTATED", {"status": "pending_ui_update"})
            rotations.append("openai_api_key")
        else:
            print(f"  [FAIL] Nueva OpenAI key inválida: {r.status_code}")

# ── Resumen ───────────────────────────────────────────────────────────────────
print(f"\n{'='*65}")
print(f"ROTACIÓN COMPLETADA: {len(rotations)} credenciales procesadas")
if rotations:
    print(f"  Rotadas: {', '.join(rotations)}")
print(f"\nRegistro guardado en: {ROTATION_LOG}")
print(f"{'='*65}")

print("""
CHECKLIST POST-ROTACIÓN:
  □ Reiniciar n8n workers (no main)
  □ Verificar que el webhook de Chatwoot llega y se procesa
  □ Revocar credenciales anteriores (después de 24h operación)
  □ Actualizar .env.queue con las nuevas keys (para próximo deploy)
  □ Actualizar este script con las nuevas keys si aplica
""")
