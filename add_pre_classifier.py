#!/usr/bin/env python3
"""
Add Pre-Classifier node with keyword-based classification
This will override AI Clasificador for obvious cases
"""

import json

wf = json.load(open('wf_FINAL_CLEAN.json', encoding='utf-8'))

# Create Pre-Classifier node
pre_classifier = {
    "parameters": {
        "jsCode": """// ============================================
// PRE-CLASIFICADOR BASADO EN KEYWORDS
// Casos obvios que no necesitan AI
// ============================================
const message = ($json.message_text || '').toLowerCase().trim();

// Definir keywords muy específicos
const CREATE_EVENT_KEYWORDS = [
    'agendar', 'reservar', 'cita', 'turno', 'hora disponible',
    'appointment', 'quiero una cita', 'necesito cita',
    'cuando puedo ir', 'horarios para cita', 'disponibilidad para cita'
];

const PAYMENT_KEYWORDS = [
    'pagué', 'pagar', 'transferencia', 'deposité',
    'ya pague', 'como pagar', 'métodos de pago',
    'efectivo', 'tarjeta'
];

const EMERGENCY_KEYWORDS = [
    'emergencia', 'urgencia', 'dolor fuerte', 'sangra',
    'mucho dolor', 'hinchazón', 'infección'
];

// Check for obvious CREATE_EVENT
for (const keyword of CREATE_EVENT_KEYWORDS) {
    if (message.includes(keyword)) {
        return [{
            json: {
                ...$json,
                intent: 'CREATE_EVENT',
                confidence: 'high',
                classified_by: 'PRE_CLASSIFIER',
                skip_ai: true
            }
        }];
    }
}

// Check for PAYMENT
for (const keyword of PAYMENT_KEYWORDS) {
    if (message.includes(keyword)) {
        return [{
            json: {
                ...$json,
                intent: 'PAYMENT',
                confidence: 'high',
                classified_by: 'PRE_CLASSIFIER',
                skip_ai: true
            }
        }];
    }
}

// Check for EMERGENCY
for (const keyword of EMERGENCY_KEYWORDS) {
    if (message.includes(keyword)) {
        return [{
            json: {
                ...$json,
                intent: 'HUMAN',
                confidence: 'high',
                classified_by: 'PRE_CLASSIFIER',
                skip_ai: true
            }
        }];
    }
}

// No match - send to AI Clasificador
return [{
    json: {
        ...$json,
        skip_ai: false
    }
}];"""
    },
    "id": "code-pre-classifier",
    "name": "Pre-Clasificador Keywords",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1104, 160]
}

# Add Pre-Classifier node
wf['nodes'].append(pre_classifier)
print(f'[1] Added Pre-Clasificador: {len(wf["nodes"])} nodes')

# Update connections: WhatsApp Safe Check -> Pre-Clasificador -> Clasificador
wf['connections']['WhatsApp Safe Check']['main'][0] = [
    {"node": "Pre-Clasificador Keywords", "type": "main", "index": 0}
]
print('[2] Connected WhatsApp Safe Check -> Pre-Clasificador')

wf['connections']['Pre-Clasificador Keywords'] = {
    "main": [[{"node": "Clasificador de Intención", "type": "main", "index": 0}]]
}
print('[3] Connected Pre-Clasificador -> Clasificador')

# Update Normalizar Intent to check skip_ai flag
normalizar_idx = next(i for i, n in enumerate(wf['nodes']) if n['name'] == 'Normalizar Intent')
wf['nodes'][normalizar_idx]['parameters']['jsCode'] = """// ============================================
// NORMALIZAR OUTPUT DEL CLASIFICADOR
// Check if Pre-Clasificador already classified
// ============================================

// If Pre-Clasificador already classified, use that
if ($json.skip_ai === true && $json.intent) {
  return [{
    json: {
      ...$json,
      classified_at: new Date().toISO String(),
      phase: 'PHASE_1_WITH_PRE_CLASSIFIER'
    }
  }];
}

// Otherwise, parse AI Clasificador output
let intent_data = $json.output || $json;

if (typeof intent_data === 'string') {
  try {
    intent_data = JSON.parse(intent_data);
  } catch (e) {
    const text = intent_data.toLowerCase();
    if (text.includes('create_event')) {
      intent_data = { intent: 'CREATE_EVENT', confidence: 'low' };
    } else if (text.includes('info')) {
      intent_data = { intent: 'INFO', confidence: 'low' };
    } else if (text.includes('payment')) {
      intent_data = { intent: 'PAYMENT', confidence: 'low' };
    } else {
      intent_data = { intent: 'HUMAN', confidence: 'low' };
    }
  }
}

let intent = (intent_data.intent || 'HUMAN').trim().toUpperCase();
let confidence = (intent_data.confidence || 'low').toLowerCase();

const valid_intents = ['CREATE_EVENT', 'INFO', 'PAYMENT', 'HUMAN'];
if (!valid_intents.includes(intent)) {
  intent = 'HUMAN';
  confidence = 'low';
}

return [{
  json: {
    ...$json,
    intent: intent,
    confidence: confidence,
    classified_at: new Date().toISOString(),
    phase: 'PHASE_1_WITH_AI_CLASSIFIER'
  }
}];"""

print('[4] Updated Normalizar Intent to handle Pre-Clasificador')

# Save
with open('wf_WITH_PRE_CLASSIFIER.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print(f'\n[DONE] wf_WITH_PRE_CLASSIFIER.json')
print(f'  Nodes: {len(wf["nodes"])}')
print('[READY] Pre-Clasificador detectará "cita", "agendar", "pague" automáticamente')
