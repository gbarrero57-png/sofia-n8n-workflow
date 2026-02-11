#!/usr/bin/env python3
# Test simple: enviar mensaje directo a Chatwoot
import requests
import json

url = "https://chat.redsolucionesti.com/api/v1/accounts/2/conversations/3/messages"
headers = {
    "api_access_token": "yypAwZDH2dV3crfbqJqWCgj1",
    "Content-Type": "application/json"
}
body = {
    "content": "Test desde Python - SofIA funcionando",
    "message_type": "outgoing",
    "private": False
}

print("Enviando mensaje directo a Chatwoot...")
print(f"URL: {url}")
print(f"Body: {json.dumps(body, indent=2)}")
print()

response = requests.post(url, headers=headers, json=body)

print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")

if response.status_code == 200:
    print("\nOK - Mensaje enviado correctamente!")
    print("Verifica en: https://chat.redsolucionesti.com/app/accounts/2/conversations/3")
else:
    print(f"\nERROR {response.status_code}")
