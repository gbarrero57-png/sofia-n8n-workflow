#!/usr/bin/env python3
"""
Fix Clasificador prompt to correctly identify CREATE_EVENT and PAYMENT
"""

import json

wf = json.load(open('wf_user_configured.json', encoding='utf-8'))

NEW_SYSTEM_PROMPT = """You are an intent classifier for SofIA dental clinic assistant.

RESPOND ONLY with valid JSON:
{
  "intent": "CREATE_EVENT" | "INFO" | "PAYMENT" | "HUMAN",
  "confidence": "high" | "medium" | "low"
}

CLASSIFICATION RULES (STRICT PRIORITY ORDER):

1. CREATE_EVENT - HIGHEST PRIORITY
   **KEYWORDS THAT ALWAYS MEAN CREATE_EVENT:**
   - agendar, reservar, cita, turno, hora, appointment
   - "quiero una cita", "necesito cita", "agendar", "reservar hora"
   - "cuando puedo ir", "disponibilidad", "horarios disponibles para cita"
   **IF MESSAGE CONTAINS THESE = CREATE_EVENT, NOT INFO**

2. PAYMENT - SECOND PRIORITY
   **KEYWORDS:**
   - pag�, pagar, transferencia, deposit�, efectivo, tarjeta
   - "ya pagu�", "c�mo pagar", "m�todos de pago"
   **IF MENTIONS PAYMENT ACTION = PAYMENT**

3. HUMAN - THIRD PRIORITY
   **ONLY FOR:**
   - emergencia, urgencia, dolor fuerte, sangrado
   - queja, reclamo, problema grave
   - factura, seguro, documentos
   **URGENT/COMPLEX ISSUES ONLY**

4. INFO - LAST RESORT
   **ONLY IF NONE OF THE ABOVE:**
   - General questions: precios, servicios, horarios generales, ubicaci�n
   - "cu�nto cuesta", "qu� servicios", "d�nde est�n"
   **BUT: If asking about appointment availability = CREATE_EVENT!**

**CRITICAL**:
- "cita" or "agendar" ALWAYS = CREATE_EVENT
- "pagu�" or "pagar" ALWAYS = PAYMENT
- When in doubt between CREATE_EVENT and INFO, choose CREATE_EVENT
"""

# Find and update Clasificador
for node in wf['nodes']:
    if 'Clasificador' in node['name']:
        node['parameters']['options']['systemMessage'] = NEW_SYSTEM_PROMPT
        print(f'[UPDATED] {node["name"]}')
        print('[NEW PROMPT] Prioriza CREATE_EVENT y PAYMENT sobre INFO')
        break

# Save
with open('wf_CLASIFICADOR_FIXED.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print('\n[DONE] wf_CLASIFICADOR_FIXED.json')
print('[READY] Subiendo workflow con Clasificador arreglado...')
