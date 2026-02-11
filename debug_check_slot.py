#!/usr/bin/env python3
import json

d = json.load(open('exec981_full.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']

# Get input to Check Slot State
normalizar_output = run_data['Normalizar Intent'][0]['data']['main'][0][0]['json']
print("INPUT TO CHECK SLOT STATE (from Normalizar Intent):")
print(f"  has raw_payload: {'raw_payload' in normalizar_output}")
if 'raw_payload' in normalizar_output:
    attrs = normalizar_output['raw_payload'].get('conversation',{}).get('custom_attributes',{})
    print(f"  awaiting_slot_confirmation: '{attrs.get('awaiting_slot_confirmation')}'")
    print(f"  Type: {type(attrs.get('awaiting_slot_confirmation'))}")

# Get output from Check Slot State
check_output = run_data['Check Slot Confirmation State'][0]['data']['main'][0][0]['json']
print("\nOUTPUT FROM CHECK SLOT STATE:")
print(f"  slot_confirmation_pending: {check_output.get('slot_confirmation_pending')}")
print(f"  is_second_interaction: {check_output.get('is_second_interaction')}")
print(f"  offered_slots: {len(check_output.get('offered_slots',[]))} items")

# PROBLEMA: Debuggear el código JavaScript
print("\n[ANALYSIS]")
input_val = normalizar_output['raw_payload'].get('conversation',{}).get('custom_attributes',{}).get('awaiting_slot_confirmation')
print(f"Input value: '{input_val}'")
print(f"Input type: {type(input_val)}")
print(f"Expected: 'true' (string)")
print(f"Match: {input_val == 'true'}")
