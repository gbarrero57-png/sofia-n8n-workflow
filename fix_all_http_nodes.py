#!/usr/bin/env python3
"""
Fix ALL HTTP nodes in wf_http_fixed.json - Add = prefix to URLs with expressions
"""

import json

# Load workflow
with open('wf_http_fixed.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded workflow with {len(wf['nodes'])} nodes\n")

# Fix counters
fixes = []

# Fix all HTTP Request nodes
for i, node in enumerate(wf['nodes']):
    if node['type'] == 'n8n-nodes-base.httpRequest':
        params = node['parameters']

        # Fix URL
        if 'url' in params and not params['url'].startswith('='):
            old_url = params['url']
            params['url'] = '=' + params['url']
            fixes.append(f"  [{node['name']}] URL: Added '=' prefix")

        # Fix jsonBody if it exists and has expressions
        if 'jsonBody' in params:
            json_body = params['jsonBody']
            if isinstance(json_body, str) and '{{' in json_body and not json_body.startswith('='):
                params['jsonBody'] = '=' + json_body
                fixes.append(f"  [{node['name']}] jsonBody: Added '=' prefix")

            # Also fix the JSON.stringify issue for OpenAI
            if node['id'] == 'http-call-openai':
                # Replace quoted expressions with JSON.stringify
                correct_json_body = """={
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": {{ JSON.stringify($json.system_prompt) }}},
    {"role": "user", "content": {{ JSON.stringify($json.user_prompt) }}}
  ],
  "temperature": 0.3,
  "max_tokens": 500
}"""
                params['jsonBody'] = correct_json_body
                fixes.append(f"  [{node['name']}] jsonBody: Fixed JSON.stringify format")

print(f"Applied {len(fixes)} fixes:\n")
for fix in fixes:
    print(fix)

# Save
with open('wf_http_fixed_v2.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n✅ SUCCESS! All HTTP nodes fixed")
print(f"   - Output: wf_http_fixed_v2.json")
print(f"   - Total fixes: {len(fixes)}")
