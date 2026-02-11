#!/usr/bin/env python3
"""
Add IF node to bypass AI Clasificador when Pre-Clasificador already classified
"""

import json

wf = json.load(open('wf_SYNTAX_FIXED.json', encoding='utf-8'))

print(f"Current: {len(wf['nodes'])} nodes\n")

# Create IF node to check skip_ai
bypass_if = {
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": "",
                "typeValidation": "strict"
            },
            "conditions": [
                {
                    "id": "skip-ai-check",
                    "leftValue": "={{ $json.skip_ai }}",
                    "rightValue": True,
                    "operator": {
                        "type": "boolean",
                        "operation": "equals"
                    }
                }
            ],
            "combinator": "and"
        }
    },
    "id": "if-bypass-ai",
    "name": "¿Ya clasificado?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [1216, 160]
}

# Add IF node
wf['nodes'].append(bypass_if)
print(f"[1] Added IF bypass node: {len(wf['nodes'])} nodes")

# Update connections
# Pre-Clasificador -> IF bypass
wf['connections']['Pre-Clasificador Keywords']['main'][0] = [
    {"node": "¿Ya clasificado?", "type": "main", "index": 0}
]
print("[2] Connected Pre-Clasificador -> ¿Ya clasificado?")

# IF bypass -> TRUE (already classified) -> Normalizar Intent
# IF bypass -> FALSE (needs AI) -> Clasificador
wf['connections']['¿Ya clasificado?'] = {
    "main": [
        [{"node": "Normalizar Intent", "type": "main", "index": 0}],  # TRUE
        [{"node": "Clasificador de Intención", "type": "main", "index": 0}]  # FALSE
    ]
}
print("[3] Connected IF -> Normalizar Intent (TRUE) / Clasificador (FALSE)")

# Save
with open('wf_COMPLETE_WITH_BYPASS.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] wf_COMPLETE_WITH_BYPASS.json")
print(f"  Nodes: {len(wf['nodes'])}")
print("[READY] Pre-Clasificador bypass funcionando!")
