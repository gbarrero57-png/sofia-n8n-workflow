#!/usr/bin/env python3
"""
Fix wf_http_fixed.json - Correct OpenAI API JSON body format
"""

import json

# Load workflow
with open('wf_http_fixed.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

print(f"Loaded workflow with {len(wf['nodes'])} nodes")

# Find the "Llamar OpenAI API" node
openai_node_idx = next(i for i, n in enumerate(wf['nodes']) if n['id'] == 'http-call-openai')

# Correct JSON body format
correct_json_body = """={
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": {{ JSON.stringify($json.system_prompt) }}},
    {"role": "user", "content": {{ JSON.stringify($json.user_prompt) }}}
  ],
  "temperature": 0.3,
  "max_tokens": 500
}"""

# Update the node
wf['nodes'][openai_node_idx]['parameters']['jsonBody'] = correct_json_body
print("[OK] Fixed 'Llamar OpenAI API' JSON body format")

# Save
with open('wf_http_fixed_corrected.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\nSUCCESS! Fixed wf_http_fixed.json")
print(f"   - Output: wf_http_fixed_corrected.json")
print(f"   - Fix: Changed content format from quoted expression to JSON.stringify()")
