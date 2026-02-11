#!/usr/bin/env python3
"""
Fix Check Slot Confirmation State to get raw_payload from correct node
"""

import json

# Load current workflow
wf = json.load(open('wf_current.json', 'r', encoding='utf-8'))

# Find and fix Check Slot Confirmation State node
check_node = [n for n in wf['nodes'] if n['name'] == 'Check Slot Confirmation State'][0]

NEW_CODE = """// ============================================
// CHECK IF AWAITING SLOT CONFIRMATION
// Get raw_payload from Validar Input node (AI Agent doesn't preserve it)
// ============================================
const validar_data = $node["Validar Input"].json;
const custom_attrs = validar_data.raw_payload?.conversation?.custom_attributes;
const awaiting = custom_attrs?.awaiting_slot_confirmation === 'true';
const offered_slots = custom_attrs?.offered_slots;

// Parse offered_slots if string
let slots = [];
if (typeof offered_slots === 'string') {
    try {
        slots = JSON.parse(offered_slots);
    } catch (e) {
        slots = [];
    }
} else if (Array.isArray(offered_slots)) {
    slots = offered_slots;
}

return [{
    json: {
        ...$json,
        slot_confirmation_pending: awaiting,
        offered_slots: slots,
        is_second_interaction: awaiting,
        raw_payload: validar_data.raw_payload  // Pass it forward explicitly
    }
}];"""

check_node['parameters']['jsCode'] = NEW_CODE
print("[FIXED] Check Slot Confirmation State - now gets raw_payload from Validar Input")

# Clean workflow
clean_wf = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData', None)
}

# Save
with open('wf_phase4_fixed_final.json', 'w', encoding='utf-8') as f:
    json.dump(clean_wf, f, indent=2, ensure_ascii=False)

print("[DONE] wf_phase4_fixed_final.json")
print("  Check Slot State now reads from Validar Input node directly")
