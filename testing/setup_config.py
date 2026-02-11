#!/usr/bin/env python3
"""
Configuration Setup Helper
Ayuda a configurar y validar credenciales para testing suite
"""

import requests
import json

def test_api_key(base_url, api_key):
    """Test if API key is valid"""
    try:
        response = requests.get(
            f"{base_url}/api/v1/workflows",
            headers={"X-N8N-API-KEY": api_key},
            timeout=10
        )

        if response.status_code == 200:
            workflows = response.json().get('data', [])
            print(f"✅ API Key VÁLIDA - {len(workflows)} workflows encontrados")
            return workflows
        elif response.status_code == 401 or response.status_code == 403:
            print(f"❌ API Key INVÁLIDA - Response: {response.text}")
            return None
        else:
            print(f"⚠️  Respuesta inesperada: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Error conectando a n8n: {e}")
        return None


def find_sofia_workflow(workflows):
    """Find SofIA workflow in list"""
    sofia_workflows = [w for w in workflows if 'sofia' in w.get('name', '').lower()]

    if not sofia_workflows:
        print("⚠️  No se encontró workflow con 'Sofia' en el nombre")
        return None

    print(f"\n✅ Workflows de SofIA encontrados:")
    for i, wf in enumerate(sofia_workflows):
        print(f"  {i+1}. ID: {wf.get('id')}")
        print(f"     Nombre: {wf.get('name')}")
        print(f"     Activo: {wf.get('active')}")
        print(f"     Nodos: {len(wf.get('nodes', []))}")
        print()

    return sofia_workflows[0] if sofia_workflows else None


def update_config_file(workflow_id, api_key):
    """Update config.py with new values"""
    config_path = "config.py"

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Update API key
        content = content.replace(
            'N8N_API_KEY = os.getenv("N8N_API_KEY", "n8n_api_PGXk9J9Fg97HbYXYcDdXQRUu3")',
            f'N8N_API_KEY = os.getenv("N8N_API_KEY", "{api_key}")'
        )

        # Update workflow ID
        content = content.replace(
            'WORKFLOW_ID = "37SLdWISQLgkHeXk"',
            f'WORKFLOW_ID = "{workflow_id}"'
        )

        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"✅ config.py actualizado exitosamente")
        return True
    except Exception as e:
        print(f"❌ Error actualizando config.py: {e}")
        return False


def main():
    """Main setup flow"""
    print("="*70)
    print("          SofIA Testing Suite - Configuration Setup")
    print("="*70)
    print()

    # Step 1: Get credentials
    print("PASO 1: Credenciales de n8n")
    print("-" * 70)
    base_url = input("URL de n8n [https://workflows.n8n.redsolucionesti.com]: ").strip()
    if not base_url:
        base_url = "https://workflows.n8n.redsolucionesti.com"

    api_key = input("API Key de n8n: ").strip()
    if not api_key:
        print("❌ API Key es requerida")
        return

    print()

    # Step 2: Test API key
    print("PASO 2: Validando API Key...")
    print("-" * 70)
    workflows = test_api_key(base_url, api_key)

    if not workflows:
        print("\n❌ No se pudo validar la API Key. Verifica:")
        print("  1. La API Key está correcta")
        print("  2. La API Key tiene permisos adecuados")
        print("  3. n8n está accesible desde esta red")
        return

    print()

    # Step 3: Find SofIA workflow
    print("PASO 3: Buscando workflow de SofIA...")
    print("-" * 70)
    sofia_wf = find_sofia_workflow(workflows)

    if not sofia_wf:
        print("\nWorkflows disponibles:")
        for i, wf in enumerate(workflows[:10]):
            print(f"  {i+1}. ID: {wf.get('id')}, Name: {wf.get('name')}")

        wf_id = input("\nIngresa el ID del workflow a usar: ").strip()
        if not wf_id:
            print("❌ Workflow ID requerido")
            return
    else:
        wf_id = sofia_wf.get('id')
        print(f"✅ Usando workflow: {sofia_wf.get('name')} (ID: {wf_id})")

    print()

    # Step 4: Update config
    print("PASO 4: Actualizando configuración...")
    print("-" * 70)

    if update_config_file(wf_id, api_key):
        print("\n" + "="*70)
        print("          ✅ CONFIGURACIÓN COMPLETA")
        print("="*70)
        print("\nPróximos pasos:")
        print("  1. Ejecuta: python test_runner.py --phases regression")
        print("  2. Si pasa, ejecuta: python test_runner.py --phases all")
        print()
    else:
        print("\n❌ Error actualizando configuración")
        print("\nActualiza manualmente testing/config.py:")
        print(f"  N8N_API_KEY = \"{api_key}\"")
        print(f"  WORKFLOW_ID = \"{wf_id}\"")


if __name__ == "__main__":
    main()
