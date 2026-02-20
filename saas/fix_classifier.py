#!/usr/bin/env python3
"""Fix Pre-Clasificador Keywords and AI Clasificador system prompt"""
import json, requests, sys
sys.stdout.reconfigure(encoding='utf-8')

N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM"
WORKFLOW_ID = "37SLdWISQLgkHeXk"

wf = requests.get(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={"X-N8N-API-KEY": N8N_API_KEY}).json()

# ============================================================
# 1. Fix Pre-Clasificador Keywords - add HUMAN keywords + fix tildes
# ============================================================
PRE_CLASIFICADOR_CODE = (
    '// ============================================\n'
    '// PRE-CLASIFICADOR BASADO EN KEYWORDS\n'
    '// Casos obvios que no necesitan AI\n'
    '// ============================================\n'
    'const message = ($json.message_text || "").toLowerCase().trim();\n'
    '\n'
    '// Definir keywords\n'
    'const CREATE_EVENT_KEYWORDS = [\n'
    '    "agendar", "reservar", "cita", "turno", "hora disponible",\n'
    '    "appointment", "quiero una cita", "necesito cita",\n'
    '    "cuando puedo ir", "horarios para cita", "disponibilidad para cita"\n'
    '];\n'
    '\n'
    'const PAYMENT_KEYWORDS = [\n'
    '    "pague", "pagar", "transferencia", "deposite",\n'
    '    "ya pague", "como pagar", "metodos de pago", "metodo de pago",\n'
    '    "efectivo", "tarjeta", "pagos", "cobran", "cobro",\n'
    '    "factura", "recibo", "comprobante de pago"\n'
    '];\n'
    '\n'
    'const HUMAN_KEYWORDS = [\n'
    '    "hablar con", "persona real", "humano", "agente",\n'
    '    "operador", "recepcion", "quiero hablar",\n'
    '    "necesito hablar", "contactar persona",\n'
    '    "emergencia", "urgencia", "dolor fuerte", "sangra",\n'
    '    "mucho dolor", "hinchazon", "infeccion",\n'
    '    "queja", "reclamo", "problema grave"\n'
    '];\n'
    '\n'
    '// Check for HUMAN first (highest priority for escalation)\n'
    'for (const keyword of HUMAN_KEYWORDS) {\n'
    '    if (message.includes(keyword)) {\n'
    '        return [{\n'
    '            json: {\n'
    '                ...$json,\n'
    '                intent: "HUMAN",\n'
    '                confidence: "high",\n'
    '                classified_by: "PRE_CLASSIFIER",\n'
    '                skip_ai: true\n'
    '            }\n'
    '        }];\n'
    '    }\n'
    '}\n'
    '\n'
    '// Check for CREATE_EVENT\n'
    'for (const keyword of CREATE_EVENT_KEYWORDS) {\n'
    '    if (message.includes(keyword)) {\n'
    '        return [{\n'
    '            json: {\n'
    '                ...$json,\n'
    '                intent: "CREATE_EVENT",\n'
    '                confidence: "high",\n'
    '                classified_by: "PRE_CLASSIFIER",\n'
    '                skip_ai: true\n'
    '            }\n'
    '        }];\n'
    '    }\n'
    '}\n'
    '\n'
    '// Check for PAYMENT\n'
    'for (const keyword of PAYMENT_KEYWORDS) {\n'
    '    if (message.includes(keyword)) {\n'
    '        return [{\n'
    '            json: {\n'
    '                ...$json,\n'
    '                intent: "PAYMENT",\n'
    '                confidence: "high",\n'
    '                classified_by: "PRE_CLASSIFIER",\n'
    '                skip_ai: true\n'
    '            }\n'
    '        }];\n'
    '    }\n'
    '}\n'
    '\n'
    '// No match - send to AI Clasificador\n'
    'return [{\n'
    '    json: {\n'
    '        ...$json,\n'
    '        skip_ai: false\n'
    '    }\n'
    '}];'
)

# ============================================================
# 2. Fix AI Clasificador system prompt - add HUMAN for "hablar con persona"
# ============================================================
AI_SYSTEM_PROMPT = (
    'You are an intent classifier for SofIA dental clinic assistant.\n'
    '\n'
    'RESPOND ONLY with valid JSON:\n'
    '{\n'
    '  "intent": "CREATE_EVENT" | "INFO" | "PAYMENT" | "HUMAN",\n'
    '  "confidence": "high" | "medium" | "low"\n'
    '}\n'
    '\n'
    'CLASSIFICATION RULES (STRICT PRIORITY ORDER):\n'
    '\n'
    '1. HUMAN - HIGHEST PRIORITY (escalation to real person)\n'
    '   **KEYWORDS:**\n'
    '   - hablar con persona, humano, agente, operador, recepcion\n'
    '   - "quiero hablar con alguien", "necesito un humano"\n'
    '   - emergencia, urgencia, dolor fuerte, sangrado\n'
    '   - queja, reclamo, problema grave\n'
    '   **IF USER WANTS A REAL PERSON OR HAS EMERGENCY = HUMAN**\n'
    '\n'
    '2. CREATE_EVENT - SECOND PRIORITY\n'
    '   **KEYWORDS:**\n'
    '   - agendar, reservar, cita, turno, hora, appointment\n'
    '   - "quiero una cita", "necesito cita", "reservar hora"\n'
    '   - "cuando puedo ir", "disponibilidad", "horarios disponibles"\n'
    '   **IF MESSAGE IS ABOUT BOOKING AN APPOINTMENT = CREATE_EVENT**\n'
    '\n'
    '3. PAYMENT - THIRD PRIORITY\n'
    '   **KEYWORDS:**\n'
    '   - pague, pagar, transferencia, deposite, efectivo, tarjeta\n'
    '   - "ya pague", "como pagar", "metodos de pago"\n'
    '   - cobro, cobran, factura, recibo\n'
    '   **IF MENTIONS PAYMENT ACTION = PAYMENT**\n'
    '\n'
    '4. INFO - LAST RESORT\n'
    '   **ONLY IF NONE OF THE ABOVE:**\n'
    '   - General questions: precios, servicios, horarios generales, ubicacion\n'
    '   - "cuanto cuesta", "que servicios", "donde estan"\n'
    '   **BUT: If asking about appointment availability = CREATE_EVENT!**\n'
    '   **BUT: If asking to talk to someone = HUMAN!**\n'
    '\n'
    '**CRITICAL RULES**:\n'
    '- "hablar con" or "persona" or "humano" = HUMAN\n'
    '- "cita" or "agendar" = CREATE_EVENT\n'
    '- "pague" or "pagar" = PAYMENT\n'
    '- When in doubt between INFO and another intent, choose the other intent\n'
)

# ============================================================
# Apply fixes
# ============================================================
fixed = 0
for i, node in enumerate(wf['nodes']):
    if node['name'] == 'Pre-Clasificador Keywords':
        wf['nodes'][i]['parameters']['jsCode'] = PRE_CLASIFICADOR_CODE
        print(f"[OK] Fixed: Pre-Clasificador Keywords")
        fixed += 1

    if 'Clasificador' in node['name'] and 'Pre' not in node['name']:
        if 'options' not in wf['nodes'][i]['parameters']:
            wf['nodes'][i]['parameters']['options'] = {}
        wf['nodes'][i]['parameters']['options']['systemMessage'] = AI_SYSTEM_PROMPT
        print(f"[OK] Fixed: {node['name']} system prompt")
        fixed += 1

print(f"\nFixed {fixed} nodes")

# Upload
wf_update = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData')
}

r = requests.put(f"{N8N_BASE_URL}/api/v1/workflows/{WORKFLOW_ID}",
    headers={"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"},
    json=wf_update)

if r.status_code == 200:
    print(f"[OK] Workflow updated: {len(r.json().get('nodes', []))} nodes")
else:
    print(f"[ERROR] {r.status_code}: {r.text[:500]}")
