#!/usr/bin/env python3
import json

d = json.load(open('exec982.json','r',encoding='utf-8'))
run_data = d['data']['resultData']['runData']
nodes = list(run_data.keys())

print(f"Nodes executed: {len(nodes)}")
for i,n in enumerate(nodes[:20]):
    print(f"{i+1:2d}. {n}")

err_nodes = [n for n in nodes if run_data[n][0].get('error')]
if err_nodes:
    print(f"\nError in node: {err_nodes[0]}")
    err = run_data[err_nodes[0]][0]['error']
    print(f"Error message: {err['message'][:300]}")
    print(f"\nError description: {err.get('description','N/A')[:200]}")
