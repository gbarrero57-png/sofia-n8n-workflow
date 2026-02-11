import json

with open('debug_execution.json', encoding='utf-8') as f:
    d = json.load(f)

e = d['data'][0]
result_data = e.get('data', {}).get('resultData', {})

print('Result data keys:', list(result_data.keys()))

error = result_data.get('error')
if error:
    print('\n=== ERROR DETAILS ===')
    print('Message:', error.get('message', 'No message')[:500])
    print('\nError name:', error.get('name'))
    print('Error type:', error.get('type'))

    node_info = error.get('node', {})
    if node_info:
        print('\nFailing node:', node_info.get('name'))
        print('Node type:', node_info.get('type'))
        print('Node ID:', node_info.get('id'))
else:
    print('\nNo error object found')
    print('Result data:', json.dumps(result_data, indent=2)[:1000])
