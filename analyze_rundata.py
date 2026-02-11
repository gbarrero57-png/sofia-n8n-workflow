import json

with open('debug_execution2.json', encoding='utf-8') as f:
    d = json.load(f)

e = d['data'][0]
result = e.get('data', {}).get('resultData', {})
run_data = result.get('runData', {})

print('=== RUN DATA ANALYSIS ===\n')

for node_name, node_runs in run_data.items():
    print(f"\nNode: {node_name}")
    if node_runs:
        last_run = node_runs[-1]
        if 'error' in last_run:
            print(f"  ERROR: {last_run['error'].get('message', 'Unknown')}")
        else:
            data_items = last_run.get('data', {}).get('main', [[]])
            if data_items and data_items[0]:
                print(f"  Output items: {len(data_items[0])}")
            else:
                print(f"  No output data")

print('\n\n=== OVERALL ERROR ===')
error = result.get('error', {})
print('Message:', error.get('message'))
print('Node:', error.get('node', {}).get('name'))
