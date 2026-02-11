#!/usr/bin/env python3
import json

d = json.load(open('exec983_full.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']

# Check chosen slot
proc_output = run_data['Procesar Elección Slot'][0]['data']['main'][0][0]['json']
print("[PROCESAR ELECCIÓN SLOT]")
print(f"  Slot chosen: {proc_output.get('slot_chosen')}")
chosen = proc_output.get('chosen_slot', {})
print(f"  Chosen slot: {chosen.get('date')} a las {chosen.get('time')}")

# Check lock slot (event preparation)
lock_output = run_data['Lock de Slot'][0]['data']['main'][0][0]['json']
print(f"\n[LOCK DE SLOT]")
print(f"  Event summary: {lock_output.get('event_summary')}")
print(f"  Event start: {lock_output.get('event_start')}")
print(f"  Service type: {lock_output.get('service_type')}")

# Check Google Calendar event creation
calendar_output = run_data['Crear Evento Google Calendar'][0]['data']['main'][0][0]['json']
print(f"\n[GOOGLE CALENDAR EVENT]")
print(f"  Event created: {bool(calendar_output.get('id'))}")
if 'id' in calendar_output:
    print(f"  Event ID: {calendar_output.get('id')}")
    print(f"  HTML Link: {calendar_output.get('htmlLink','N/A')[:80]}")
    print(f"  Summary: {calendar_output.get('summary')}")
    print(f"  Start: {calendar_output.get('start',{}).get('dateTime','N/A')}")

# Check confirmation message
confirm_output = run_data['Confirmar al Paciente'][0]['data']['main'][0][0]['json']
print(f"\n[CONFIRMATION MESSAGE]")
print(confirm_output.get('confirmation_message','N/A')[:200])
