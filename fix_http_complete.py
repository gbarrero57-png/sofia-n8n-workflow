#!/usr/bin/env python3
"""
Complete fix for wf_http_fixed.json - Fix ALL issues found during debugging
"""

import json

# Load both workflows
with open('wf_http_fixed.json', 'r', encoding='utf-8') as f:
    wf_http = json.load(f)

with open('wf_fase2_final.json', 'r', encoding='utf-8') as f:
    wf_fase2 = json.load(f)

print(f"Loaded wf_http_fixed with {len(wf_http['nodes'])} nodes")
print(f"Loaded wf_fase2_final with {len(wf_fase2['nodes'])} nodes\n")

fixes = []

# =========================================
# FIX 1: Add = prefix to all HTTP URLs
# =========================================
for node in wf_http['nodes']:
    if node['type'] == 'n8n-nodes-base.httpRequest':
        params = node['parameters']
        if 'url' in params and not params['url'].startswith('='):
            params['url'] = '=' + params['url']
            fixes.append(f"[{node['name']}] Added '=' prefix to URL")

# =========================================
# FIX 2: Fix OpenAI JSON body format
# =========================================
for node in wf_http['nodes']:
    if node['id'] == 'http-call-openai':
        node['parameters']['jsonBody'] = """={
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": {{ JSON.stringify($json.system_prompt) }}},
    {"role": "user", "content": {{ JSON.stringify($json.user_prompt) }}}
  ],
  "temperature": 0.3,
  "max_tokens": 500
}"""
        fixes.append(f"[{node['name']}] Fixed JSON.stringify format")

# =========================================
# FIX 3: Set correct JSON bodies for INFO nodes
# =========================================

for node in wf_http['nodes']:
    if node['name'] == 'Enviar Respuesta INFO':
        node['parameters']['jsonBody'] = """={
  "content": {{ JSON.stringify($json.llm_response) }},
  "message_type": "outgoing",
  "private": false
}"""
        fixes.append(f"[{node['name']}] Set correct dynamic jsonBody")

    elif node['name'] == 'Crear Nota Interna INFO':
        node['parameters']['jsonBody'] = """={
  "content": "[Fase 2] Pregunta: {{ $json.user_prompt }}\\nRespuesta enviada OK",
  "message_type": "outgoing",
  "private": true
}"""
        fixes.append(f"[{node['name']}] Set correct dynamic jsonBody")

    elif node['name'] == 'Actualizar Attributes INFO':
        node['parameters']['jsonBody'] = """={
  "custom_attributes": {
    "sofia_phase": "PHASE_2_INFO",
    "bot_interaction_count": {{ ($json.bot_interaction_count || 0) + 1 }},
    "last_bot_message_at": "{{ $now.toISO() }}"
  }
}"""
        fixes.append(f"[{node['name']}] Set correct dynamic jsonBody")

# =========================================
# FIX 4: Fix other jsonBody expressions
# =========================================
for node in wf_http['nodes']:
    if node['type'] == 'n8n-nodes-base.httpRequest':
        params = node['parameters']
        if 'jsonBody' in params:
            json_body = params['jsonBody']
            if isinstance(json_body, str) and '{{' in json_body and not json_body.startswith('='):
                params['jsonBody'] = '=' + json_body
                fixes.append(f"[{node['name']}] Added '=' prefix to jsonBody")

# Save
with open('wf_http_COMPLETE_FIX.json', 'w', encoding='utf-8') as f:
    json.dump(wf_http, f, indent=2, ensure_ascii=False)

print(f"Applied {len(fixes)} fixes:\n")
for fix in fixes:
    print(f"  {fix}")

print(f"\nSUCCESS! Complete fix applied")
print(f"   - Output: wf_http_COMPLETE_FIX.json")
print(f"   - Total fixes: {len(fixes)}")
