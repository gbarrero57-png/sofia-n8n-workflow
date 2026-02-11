import json

with open('debug_execution_final.json', encoding='utf-8') as f:
    d = json.load(f)

result = d['data'][0].get('data', {}).get('resultData', {})
run_data = result.get('runData', {})
validar = run_data.get('Validar Input', [])

if validar:
    last = validar[-1]
    data = last.get('data', {}).get('main', [[]])
    if data and data[0]:
        item = data[0][0]
        json_data = item.get('json', {})
        print('Validar Input output:')
        print(f"  message_type: '{json_data.get('message_type')}'")
        print(f"  message_text: '{json_data.get('message_text', '')[:50]}'")
        print(f"  conversation_id: {json_data.get('conversation_id')}")
        print(f"  account_id: {json_data.get('account_id')}")
        print(f"\n  All keys: {list(json_data.keys())}")
else:
    print("No Validar Input data found")
