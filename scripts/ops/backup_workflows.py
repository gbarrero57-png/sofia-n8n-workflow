#!/usr/bin/env python3
"""
SofIA Ops — Backup diario de workflows n8n
Corre como cron job diario: 0 2 * * * python backup_workflows.py
Guarda en: ./backups/YYYY-MM-DD/
"""
import json, requests, os, sys, gzip, shutil
from datetime import datetime, timedelta
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = os.environ.get("N8N_BASE_URL", "https://workflows.n8n.redsolucionesti.com")
N8N_API_KEY  = os.environ.get("N8N_API_KEY", "")
BACKUP_DIR   = os.environ.get("BACKUP_DIR", "./backups")
KEEP_DAYS    = int(os.environ.get("BACKUP_KEEP_DAYS", "30"))

if not N8N_API_KEY:
    print("[ERROR] N8N_API_KEY no configurada")
    sys.exit(1)

HEADERS = {"X-N8N-API-KEY": N8N_API_KEY}
TODAY   = datetime.now().strftime("%Y-%m-%d")

# ── Crear directorio de backup ────────────────────────────────────────────────
backup_path = os.path.join(BACKUP_DIR, TODAY)
os.makedirs(backup_path, exist_ok=True)

print(f"[{datetime.now().isoformat()}] Backup SofIA workflows → {backup_path}")
backed_up = 0
failed = 0

# ── 1. Listar todos los workflows ─────────────────────────────────────────────
r = requests.get(f"{N8N_BASE_URL}/api/v1/workflows", headers=HEADERS, params={"limit": 100})
if r.status_code != 200:
    print(f"[ERROR] No se pudo listar workflows: {r.status_code}")
    sys.exit(1)

workflows = r.json().get("data", [])
print(f"  Workflows encontrados: {len(workflows)}")

# ── 2. Exportar cada workflow ─────────────────────────────────────────────────
summary = {"date": TODAY, "workflows": [], "total": len(workflows), "success": 0, "failed": 0}

for wf in workflows:
    wf_id   = wf["id"]
    wf_name = wf["name"].replace("/", "_").replace(" ", "_")[:50]

    try:
        detail = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{wf_id}", headers=HEADERS).json()

        filename = f"{wf_id}_{wf_name}.json.gz"
        filepath = os.path.join(backup_path, filename)

        # Comprimir con gzip
        with gzip.open(filepath, 'wt', encoding='utf-8') as f:
            json.dump(detail, f, indent=2, ensure_ascii=False)

        size_kb = os.path.getsize(filepath) / 1024
        print(f"  [OK] {wf_name} ({wf_id}) → {filename} ({size_kb:.1f}KB)")
        summary["workflows"].append({"id": wf_id, "name": wf["name"], "status": "ok", "size_kb": round(size_kb, 1)})
        summary["success"] += 1

    except Exception as e:
        print(f"  [ERROR] {wf_name}: {e}")
        summary["workflows"].append({"id": wf_id, "name": wf.get("name", "?"), "status": "error", "error": str(e)})
        summary["failed"] += 1

# ── 3. Guardar resumen ────────────────────────────────────────────────────────
summary_file = os.path.join(backup_path, "backup_summary.json")
with open(summary_file, 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

# ── 4. Purgar backups antiguos ────────────────────────────────────────────────
cutoff = datetime.now() - timedelta(days=KEEP_DAYS)
purged = 0
for d in os.listdir(BACKUP_DIR):
    dir_path = os.path.join(BACKUP_DIR, d)
    if os.path.isdir(dir_path):
        try:
            dir_date = datetime.strptime(d, "%Y-%m-%d")
            if dir_date < cutoff:
                shutil.rmtree(dir_path)
                print(f"  [PURGED] {d}")
                purged += 1
        except ValueError:
            pass  # No es un directorio de fecha

# ── 5. Resultado ──────────────────────────────────────────────────────────────
print(f"\n[DONE] {summary['success']}/{summary['total']} workflows backed up. Purged: {purged} old backups.")
if summary["failed"] > 0:
    print(f"[WARNING] {summary['failed']} workflows fallaron")
    sys.exit(1)
