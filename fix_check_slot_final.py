#!/usr/bin/env python3
"""
Fix Check Slot Confirmation State to pass ALL fields from Validar Input
"""

import json

# Load workflow
wf = json.load(open('wf_phase4_fixed_final.json', 'r', encoding='utf-8'))

# Find and fix Check Slot node
check_node = [n for n in wf['nodes'] if n['name'] == 'Check Slot Confirmation State'][0]

NEW_CODE = """// ============================================
// CHECK IF AWAITING SLOT CONFIRMATION
// Get ALL data from Validar Input (AI Agent doesn't preserve context)
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

// Return ALL fields from Validar Input + our additions
return [{
    json: {
        ...validar_data,  // ALL fields from Validar Input
        intent: $json.intent,  // Intent from Normalizar Intent
        confidence: $json.confidence,  // Confidence from Normalizar Intent
        slot_confirmation_pending: awaiting,
        offered_slots: slots,
        is_second_interaction: awaiting
    }
}];"""

check_node['parameters']['jsCode'] = NEW_CODE
print("[FIXED] Check Slot Confirmation State - now passes ALL fields from Validar Input")

# Clean workflow
clean_wf = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {}),
    'staticData': wf.get('staticData', None)
}

# Save
with open('wf_phase4_FINAL_WORKING.json', 'w', encoding='utf-8') as f:
    json.dump(clean_wf, f, indent=2, ensure_ascii=False)

print("[DONE] wf_phase4_FINAL_WORKING.json")
print("  Check Slot State now preserves ALL context fields")
