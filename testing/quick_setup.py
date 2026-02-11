#!/usr/bin/env python3
"""
Quick Configuration Setup
Configura credenciales rápidamente
"""

import sys
import requests

def main():
    if len(sys.argv) < 2:
        print("""
USO: python quick_setup.py <API_KEY> [WORKFLOW_ID]

Ejemplos:
  python quick_setup.py n8n_api_ABC123XYZ
  python quick_setup.py n8n_api_ABC123XYZ 37SLdWISQLgkHeXk

Si no proporcionas WORKFLOW_ID, el script buscará automáticamente el workflow de SofIA.
""")
        sys.exit(1)

    api_key = sys.argv[1]
    workflow_id = sys.argv[2] if len(sys.argv) > 2 else None

    base_url = "https://workflows.n8n.redsolucionesti.com"

    print("="*70)
    print("         SofIA Testing Suite - Quick Setup")
    print("="*70)
    print()

    # Step 1: Validate API key
    print("Validando API Key...")
    try:
        response = requests.get(
            f"{base_url}/api/v1/workflows",
            headers={"X-N8N-API-KEY": api_key},
            timeout=10
        )

        if response.status_code != 200:
            print(f"[ERROR] API Key invalida - Status: {response.status_code}")
            print(f"   Response: {response.text}")
            sys.exit(1)

        workflows = response.json().get('data', [])
        print(f"[OK] API Key valida - {len(workflows)} workflows encontrados")

    except Exception as e:
        print(f"[ERROR] Error conectando a n8n: {e}")
        sys.exit(1)

    # Step 2: Find or validate workflow ID
    if not workflow_id:
        print("\nBuscando workflow de SofIA...")
        sofia_workflows = [w for w in workflows if 'sofia' in w.get('name', '').lower()]

        if not sofia_workflows:
            print("[ERROR] No se encontro workflow con 'Sofia' en el nombre")
            print("\nWorkflows disponibles:")
            for i, wf in enumerate(workflows[:10]):
                print(f"  {i+1}. ID: {wf.get('id')}, Name: {wf.get('name')}")
            print("\nEjecuta de nuevo con: python quick_setup.py <API_KEY> <WORKFLOW_ID>")
            sys.exit(1)

        workflow_id = sofia_workflows[0].get('id')
        print(f"[OK] Workflow encontrado: {sofia_workflows[0].get('name')} (ID: {workflow_id})")

        if len(sofia_workflows) > 1:
            print(f"\n[WARN] Advertencia: Se encontraron {len(sofia_workflows)} workflows de SofIA")
            print("   Usando el primero. Si es incorrecto, especifica el ID manualmente.")

    else:
        print(f"\nValidando Workflow ID: {workflow_id}...")
        try:
            response = requests.get(
                f"{base_url}/api/v1/workflows/{workflow_id}",
                headers={"X-N8N-API-KEY": api_key},
                timeout=10
            )

            if response.status_code != 200:
                print(f"[ERROR] Workflow ID invalido - Status: {response.status_code}")
                sys.exit(1)

            wf = response.json()
            print(f"[OK] Workflow valido: {wf.get('name')} ({len(wf.get('nodes', []))} nodos)")

        except Exception as e:
            print(f"[ERROR] Error validando workflow: {e}")
            sys.exit(1)

    # Step 3: Update config.py
    print("\nActualizando config.py...")
    try:
        with open('config.py', 'r', encoding='utf-8') as f:
            content = f.read()

        # Update API key
        import re
        content = re.sub(
            r'N8N_API_KEY = os\.getenv\("N8N_API_KEY", "[^"]*"\)',
            f'N8N_API_KEY = os.getenv("N8N_API_KEY", "{api_key}")',
            content
        )

        # Update workflow ID
        content = re.sub(
            r'WORKFLOW_ID = "[^"]*"',
            f'WORKFLOW_ID = "{workflow_id}"',
            content
        )

        with open('config.py', 'w', encoding='utf-8') as f:
            f.write(content)

        print("[OK] config.py actualizado exitosamente")

    except Exception as e:
        print(f"[ERROR] Error actualizando config.py: {e}")
        print(f"\nActualiza manualmente:")
        print(f'  N8N_API_KEY = os.getenv("N8N_API_KEY", "{api_key}")')
        print(f'  WORKFLOW_ID = "{workflow_id}"')
        sys.exit(1)

    # Success
    print("\n" + "="*70)
    print("          [OK] CONFIGURACION COMPLETA")
    print("="*70)
    print("\nPróximos pasos:")
    print("  1. Prueba la configuración:")
    print("     python test_runner.py --phases regression")
    print()
    print("  2. Si funciona, ejecuta toda la suite:")
    print("     python test_runner.py --phases all")
    print()


if __name__ == "__main__":
    main()
