#!/usr/bin/env python3
import json

d = json.load(open('exec981_full.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']

validar_data = run_data['Validar Input'][0]['data']['main'][0][0]['json']

print("RAW_PAYLOAD from Validar Input:")
print(f"  conversation_id: {validar_data.get('conversation_id')}")
print(f"  has raw_payload: {'raw_payload' in validar_data}")

if 'raw_payload' in validar_data:
    payload = validar_data['raw_payload']
    conv = payload.get('conversation',{})
    attrs = conv.get('custom_attributes',{})

    print(f"\n  conversation keys: {list(conv.keys())[:5]}")
    print(f"  custom_attributes keys: {list(attrs.keys())}")
    print(f"\n  awaiting_slot_confirmation: {attrs.get('awaiting_slot_confirmation')}")
    print(f"  bot_interaction_count: {attrs.get('bot_interaction_count')}")

    offered = attrs.get('offered_slots')
    print(f"\n  offered_slots type: {type(offered)}")
    if offered:
        print(f"  offered_slots length: {len(offered) if isinstance(offered,str) else 'N/A'}")
        print(f"  offered_slots preview: {str(offered)[:100]}")
