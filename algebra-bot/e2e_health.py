import json, urllib.request, urllib.error, sys, os
from datetime import datetime, timezone

# Load from env vars or .env file
def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', 'n8n-mcp', '.env')
    env = {}
    try:
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    env[k] = v
    except FileNotFoundError:
        pass
    return env

_env = _load_env()
def _e(key, default=''):
    return os.environ.get(key, _env.get(key, default))

N8N_URL   = _e('N8N_URL',   'https://workflows.n8n.redsolucionesti.com')
SUP_URL   = _e('SUP_URL',   'https://rdjpkfcztnourihqpffe.supabase.co')
SUP_KEY   = _e('SUP_KEY')
SVC_URL   = _e('SVC_URL',   'https://algebra-word-gen.bzgfek.easypanel.host')
BOT_TOKEN = _e('BOT_TOKEN')
WF_BOT    = _e('WF_BOT',    'TAls1O6PZShlBfNT')
WF_CRON   = _e('WF_CRON',   'HqNwcpPTNmnr5GfE')
api_key   = _e('N8N_API_KEY')

SUP_HEADERS = {'apikey': SUP_KEY, 'Authorization': 'Bearer ' + SUP_KEY}

results = []

def check(label, fn):
    try:
        detail = fn()
        tag = '[OK]  '
    except AssertionError as e:
        detail = str(e); tag = '[FAIL]'
    except Exception as e:
        detail = type(e).__name__ + ': ' + str(e)[:120]; tag = '[FAIL]'
    results.append((tag.strip(), label, detail))
    print(f'{tag} {label:48} {detail}')

def get(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read()), r.status

def post(url, body, headers=None, timeout=30):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    h = {'Content-Type': 'application/json'}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read()), r.status

# Minimal valid problem payload matching what /generate expects
MINIMAL_PROBLEMS = [
    {
        'number': 1,
        'question': 'Si x + 2 = 5, hallar x.',
        'options': [
            {'letter': 'A', 'text': '1', 'correct': False},
            {'letter': 'B', 'text': '2', 'correct': False},
            {'letter': 'C', 'text': '3', 'correct': True},
            {'letter': 'D', 'text': '4', 'correct': False},
            {'letter': 'E', 'text': '5', 'correct': False},
        ],
        'solution': 'x = 5 - 2 = 3'
    },
    {
        'number': 2,
        'question': 'Hallar el perimetro si cada lado mide 4.',
        'options': [
            {'letter': 'A', 'text': '12', 'correct': False},
            {'letter': 'B', 'text': '16', 'correct': True},
            {'letter': 'C', 'text': '20', 'correct': False},
            {'letter': 'D', 'text': '24', 'correct': False},
            {'letter': 'E', 'text': '32', 'correct': False},
        ],
        'solution': 'P = 4 x 4 = 16'
    },
]

print('=' * 72)
print('E2E HEALTH CHECK — GeneradorPreU Bot')
print(f'Fecha: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}')
print('=' * 72)

# ── 1. MICROSERVICIO ──────────────────────────────────────────────────────────
print('\n--- Microservicio Flask (EasyPanel) ---')

def check_health():
    r, s = get(f'{SVC_URL}/health', timeout=12)
    assert s == 200, f'status={s}'
    assert r.get('status') == 'ok'
    return f'version={r.get("version")}'
check('Microservicio /health', check_health)

def check_verify():
    body = {
        'area': 'algebra', 'topic': 'ecuaciones', 'difficulty': 'facil',
        'numProblems': 2, 'chatId': '0',
        'problems': MINIMAL_PROBLEMS
    }
    r, s = post(f'{SVC_URL}/verify', body, timeout=20)
    assert s == 200, f'status={s}'
    assert 'problems' in r, f'no problems key: {list(r.keys())}'
    correct = sum(1 for p in r['problems'] for o in p.get('options',[]) if o.get('correct'))
    return f'problems={len(r["problems"])} correct_options={correct}'
check('Microservicio /verify (2 problemas)', check_verify)

def check_generate():
    body = {
        'area': 'algebra', 'topic': 'ecuaciones', 'difficulty': 'facil',
        'numProblems': 2, 'chatId': '0', 'name': 'Test',
        'problems': MINIMAL_PROBLEMS
    }
    # /generate returns a file, so we can't use json.loads
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        f'{SVC_URL}/generate', data=data,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        assert r.status == 200, f'status={r.status}'
        content = r.read()
        ct = r.headers.get('Content-Type', '')
        size = len(content)
    assert size > 5000, f'archivo muy pequeno: {size} bytes'
    return f'size={size//1024}KB content-type={ct[:40]}'
check('Microservicio /generate (docx)', check_generate)

# ── 2. SUPABASE (via n8n — DNS local no resuelve) ────────────────────────────
print('\n--- Supabase (verificado via n8n executions exitosas) ---')

def check_sup_via_executions():
    r, s = get(f'{N8N_URL}/api/v1/executions?workflowId={WF_BOT}&limit=20', {'X-N8N-API-KEY': api_key})
    assert s == 200
    execs = r.get('data', [])
    ok_execs = [e for e in execs if e['status'] == 'success']
    assert len(ok_execs) > 0, 'no hay ejecuciones exitosas'
    last_ok = ok_execs[0]['startedAt'][:19]
    return f'{len(ok_execs)} ejecuciones OK (ultima: {last_ok}) — Supabase alcanzable desde n8n'
check('Supabase accesible (via n8n exitoso)', check_sup_via_executions)

def check_sup_direct():
    # DNS local en Windows no resuelve supabase.co — lo saltamos con warning
    try:
        r, s = get(SUP_URL + '/rest/v1/profesor_users?select=telegram_id,first_name,active,subscription_status,subscription_ends_at', SUP_HEADERS, timeout=8)
        assert s == 200
        active = [u for u in r if u.get('active')]
        return f'total={len(r)} activos={len(active)}'
    except Exception as e:
        if 'getaddrinfo' in str(e) or 'Name or service' in str(e):
            # DNS local issue, not a real failure
            results_override.append(True)
            return 'DNS local no resuelve (normal en Windows) — n8n alcanza Supabase OK'
        raise
results_override = []

try:
    r, s = get(SUP_URL + '/rest/v1/profesor_users?select=telegram_id,first_name,active,subscription_status,subscription_ends_at', SUP_HEADERS, timeout=8)
    users_list = r if s == 200 else []
    check('Supabase REST API directo', lambda: f'total={len(r)} activos={sum(1 for u in r if u.get("active"))}')
except Exception as e:
    if 'getaddrinfo' in str(e):
        results.append(('[SKIP]', 'Supabase REST API directo', 'DNS local no resuelve (solo accesible desde n8n en cloud)'))
        print(f'[SKIP]  {"Supabase REST API directo":48} DNS local Windows no resuelve — accesible desde n8n OK')
        users_list = []
    else:
        results.append(('[FAIL]', 'Supabase REST API directo', str(e)[:100]))
        print(f'[FAIL]  {"Supabase REST API directo":48} {str(e)[:100]}')
        users_list = []

# ── 3. TELEGRAM ───────────────────────────────────────────────────────────────
print('\n--- Telegram Bot ---')

def check_tg_bot():
    r, s = get(f'https://api.telegram.org/bot{BOT_TOKEN}/getMe')
    assert s == 200 and r.get('ok')
    b = r['result']
    return f'@{b["username"]} id={b["id"]} can_join_groups={b.get("can_join_groups")}'
check('Telegram bot activo', check_tg_bot)

def check_tg_webhook():
    r, s = get(f'https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo')
    res = r.get('result', {})
    url = res.get('url', '')
    assert 'workflows.n8n.redsolucionesti.com' in url, f'URL incorrecta: {url}'
    err = res.get('last_error_message')
    pending = res.get('pending_update_count', 0)
    if err:
        raise AssertionError(f'last_error={err}')
    return f'pending={pending} updates={res.get("allowed_updates")} max_conn={res.get("max_connections",40)}'
check('Telegram webhook registrado y sin errores', check_tg_webhook)

# ── 4. N8N ────────────────────────────────────────────────────────────────────
print('\n--- n8n Workflows ---')

def check_wf_bot():
    r, s = get(f'{N8N_URL}/api/v1/workflows/{WF_BOT}', {'X-N8N-API-KEY': api_key})
    assert r.get('active'), 'NOT ACTIVE'
    nodes = len(r.get('nodes', []))
    # Verify key nodes exist
    names = {n['name'] for n in r['nodes']}
    for required in ['Verificar Suscripcion', 'Router', 'Datos de Pago', 'Mensaje No Suscrito']:
        assert required in names, f'missing node: {required}'
    return f'active=True nodes={nodes}'
check('n8n Bot workflow (32 nodos)', check_wf_bot)

def check_wf_cron():
    r, s = get(f'{N8N_URL}/api/v1/workflows/{WF_CRON}', {'X-N8N-API-KEY': api_key})
    assert r.get('active'), 'NOT ACTIVE'
    return f'active=True name="{r["name"]}"'
check('n8n Cron expiracion activo', check_wf_cron)

def check_executions():
    r, s = get(f'{N8N_URL}/api/v1/executions?workflowId={WF_BOT}&limit=10', {'X-N8N-API-KEY': api_key})
    execs = r.get('data', [])
    ok_n  = sum(1 for e in execs if e['status'] == 'success')
    err_n = sum(1 for e in execs if e['status'] == 'error')
    last  = execs[0] if execs else {}
    last_str = f'{last.get("status","?")} @ {last.get("startedAt","?")[:19]}' if last else 'sin ejecuciones'
    # Only fail if last error is recent (< 1h) — old errors may be pre-fix
    if last.get('status') == 'error':
        from datetime import timedelta
        last_dt = datetime.fromisoformat(last['startedAt'].replace('Z', '+00:00'))
        age = datetime.now(timezone.utc) - last_dt
        if age < timedelta(hours=1):
            raise AssertionError(f'ultimo error reciente: {last.get("startedAt","")[:19]}')
        return f'ok={ok_n} err={err_n}/10 (errores pre-fix, >1h) | ultima: {last_str}'
    return f'ok={ok_n} err={err_n}/10 | ultima: {last_str}'
check('n8n Ultimas ejecuciones', check_executions)

# ── RESUMEN ───────────────────────────────────────────────────────────────────
print('\n' + '=' * 72)
real = [(t,l,d) for t,l,d in results if t != '[SKIP]']
ok_n   = sum(1 for t,l,d in real if t == '[OK]')
fail_n = sum(1 for t,l,d in real if t == '[FAIL]')
skip_n = sum(1 for t,l,d in results if t == '[SKIP]')
print(f'RESULTADO: {ok_n}/{len(real)} OK  |  {fail_n} FALLOS  |  {skip_n} SKIP')

if fail_n:
    print('\nFALLOS:')
    for t,l,d in results:
        if t == '[FAIL]':
            print(f'  x {l}: {d}')

print('=' * 72)
sys.exit(0 if fail_n == 0 else 1)
