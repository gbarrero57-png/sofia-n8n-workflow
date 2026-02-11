#!/usr/bin/env python3
import json

d = json.load(open('exec980_full.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']
nodes = list(run_data.keys())

print("NODES EXECUTED:")
for i,n in enumerate(nodes):
    print(f"{i+1:2d}. {n}")

# Check slots calculated
calc_node = [n for n in nodes if 'Calcular Slots' in n]
if calc_node:
    calc_data = run_data[calc_node[0]][0]['data']['main'][0][0]['json']
    print(f"\n[PHASE 2] SLOTS CALCULATED:")
    print(f"  Total available: {calc_data.get('total_available',0)}")
    print(f"  Busy events: {calc_data.get('busy_events_count',0)}")

# Check slots selected
select_node = [n for n in nodes if 'Seleccionar 3' in n]
if select_node:
    select_data = run_data[select_node[0]][0]['data']['main'][0][0]['json']
    print(f"\n[PHASE 2] SLOTS SELECTED:")
    print(f"  Total offered: {select_data.get('total_offered',0)}")
    slots = select_data.get('selected_slots',[])
    for s in slots[:3]:
        print(f"  {s['option_number']}. {s['date']} a las {s['time']}")

# Check offer message
format_node = [n for n in nodes if 'Formatear Oferta' in n]
if format_node:
    format_data = run_data[format_node[0]][0]['data']['main'][0][0]['json']
    print(f"\n[PHASE 3] OFFER MESSAGE:")
    print(format_data.get('offer_message','N/A')[:200])
