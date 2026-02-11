#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

with open('workflow_current.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

# Encontrar nodo 'Preparar Escalado'
for node in wf['nodes']:
    if node['id'] == 'set-prepare':
        print('Convirtiendo Preparar Escalado de SET a CODE')

        # Cambiar a Code node
        node['type'] = 'n8n-nodes-base.code'
        node['typeVersion'] = 2

        # Código que preserva TODO usando spread operator
        js_code = r"""// Preservar TODOS los datos del input
return [{
  json: {
    ...$json,  // TODOS los campos anteriores incluidos conversation_id, account_id, etc.
    escalation_message_final: $json.escalation_message || 'Te conecto con un agente de nuestro equipo.',
    escalation_reason_final: $json.escalation_reason || 'PHASE_1_' + $json.intent,
    internal_note: 'SofIA (Fase 1)\n\nIntencion: ' + $json.intent + ' (' + $json.confidence + ')\nRazon: ' + ($json.escalation_reason || 'Testing') + '\nMensaje: ' + $json.message_text,
    is_urgent: $json.priority === 'urgent'
  }
}];"""

        node['parameters'] = {'jsCode': js_code}

        print('OK - Convertido a Code')
        print('Ahora preserva conversation_id y account_id con spread operator')
        break

# Guardar
clean = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData')
}

with open('workflow_code_escalado.json', 'w', encoding='utf-8') as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)

print('Guardado en workflow_code_escalado.json')
