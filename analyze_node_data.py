import json

with open('debug_execution_final.json', encoding='utf-8') as f:
    d = json.load(f)

e = d['data'][0]
result = e.get('data', {}).get('resultData', {})
run_data = result.get('runData', {})

# Check what data the "Enviar Respuesta INFO" node had available
if '¿Respuesta Válida?' in run_data:
    valid_node_data = run_data['¿Respuesta Válida?']
    if valid_node_data:
        last_run = valid_node_data[-1]
        data_items = last_run.get('data', {}).get('main', [[]])
        if data_items and data_items[0]:
            item = data_items[0][0]
            json_data = item.get('json', {})
            print('Data available at "¿Respuesta Válida?" output:')
            print(f"  account_id: {json_data.get('account_id')}")
            print(f"  conversation_id: {json_data.get('conversation_id')}")
            print(f"  llm_response: {str(json_data.get('llm_response', 'MISSING'))[:100]}")
            print(f"  validation_passed: {json_data.get('validation_passed')}")
            print(f"\n  All keys: {list(json_data.keys())[:20]}")
