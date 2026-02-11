#!/usr/bin/env python3
import json

d = json.load(open('exec981_full.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']
nodes = list(run_data.keys())

print(f"Total nodes executed: {len(nodes)}")
print("\nALL NODES:")
for i,n in enumerate(nodes):
    print(f"{i+1:2d}. {n}")

# Check if Phase 4 detection worked
check_slot_node = [n for n in nodes if 'Check Slot' in n]
if check_slot_node:
    check_data = run_data[check_slot_node[0]][0]['data']['main'][0][0]['json']
    print(f"\n[CHECK SLOT STATE]:")
    print(f"  slot_confirmation_pending: {check_data.get('slot_confirmation_pending')}")
    print(f"  is_second_interaction: {check_data.get('is_second_interaction')}")
    print(f"  offered_slots count: {len(check_data.get('offered_slots',[]))}")

# Check IF node decision
if_awaiting_node = [n for n in nodes if 'Esperando Confirmación Slot' in n]
if if_awaiting_node:
    if_data = run_data[if_awaiting_node[0]][0]
    print(f"\n[IF ESPERANDO CONFIRMACIÓN]:")
    print(f"  Outputs: {list(if_data['data'].keys())}")
    # Check which output was taken
    for output in if_data['data'].keys():
        if if_data['data'][output]:
            print(f"  Took: {output} (TRUE if main[0], FALSE if main[1])")
