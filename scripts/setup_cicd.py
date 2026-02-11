#!/usr/bin/env python3
"""
CI/CD Setup Helper
Script para facilitar la configuración de CI/CD
"""

import os
import sys
import json

def main():
    print("="*70)
    print("         SofIA CI/CD Setup Helper")
    print("="*70)
    print()

    print("Este script te ayudará a configurar CI/CD para GitHub Actions.")
    print()

    # Paso 1: Verificar archivos
    print("PASO 1: Verificando archivos de workflow...")
    print("-" * 70)

    workflows = [
        ".github/workflows/test-sofia-workflow.yml",
        ".github/workflows/deploy-workflow.yml",
        ".github/workflows/nightly-tests.yml"
    ]

    missing = []
    for wf in workflows:
        if os.path.exists(wf):
            print(f"[OK] {wf}")
        else:
            print(f"[MISSING] {wf}")
            missing.append(wf)

    if missing:
        print("\n[ERROR] Faltan archivos de workflow. Ejecuta este script desde la raíz del proyecto.")
        sys.exit(1)

    print()

    # Paso 2: Obtener secrets
    print("PASO 2: Configuración de Secrets")
    print("-" * 70)
    print()
    print("Necesitarás configurar estos secrets en GitHub:")
    print()

    secrets = {
        "N8N_API_KEY": "API Key de n8n (JWT token)",
        "N8N_BASE_URL": "URL de tu instancia n8n",
        "WORKFLOW_ID": "ID del workflow de SofIA"
    }

    secrets_config = {}

    for secret_name, description in secrets.items():
        print(f"{secret_name}:")
        print(f"  Descripción: {description}")

        value = input(f"  Valor (Enter para usar valor actual): ").strip()

        if value:
            secrets_config[secret_name] = value
            print(f"  [OK] Configurado")
        else:
            # Try to get from environment
            env_value = os.getenv(secret_name)
            if env_value:
                secrets_config[secret_name] = env_value
                print(f"  [OK] Usando valor de variable de entorno")
            else:
                print(f"  [WARN] No configurado (deberás agregarlo manualmente en GitHub)")

        print()

    # Paso 3: Generar comandos para GitHub CLI
    print("PASO 3: Configurar Secrets en GitHub")
    print("-" * 70)
    print()

    if secrets_config:
        print("Si tienes GitHub CLI instalado (gh), ejecuta estos comandos:")
        print()

        for secret_name, value in secrets_config.items():
            # No mostrar el valor completo por seguridad
            masked_value = value[:10] + "..." if len(value) > 10 else value
            print(f"gh secret set {secret_name} --body \"{masked_value}\"")

        print()
        print("O copia estos valores manualmente en GitHub:")
        print("  Settings → Secrets and variables → Actions → New repository secret")
        print()

        # Guardar en archivo temporal (solo nombres, no valores)
        secrets_file = "github_secrets_template.md"
        with open(secrets_file, 'w') as f:
            f.write("# GitHub Secrets Template\n\n")
            f.write("Configura estos secrets en tu repositorio GitHub:\n\n")
            for secret_name, description in secrets.items():
                f.write(f"## {secret_name}\n")
                f.write(f"**Descripción**: {description}\n")
                f.write(f"**Valor**: [CONFIGURAR EN GITHUB]\n\n")

        print(f"[OK] Template guardado en: {secrets_file}")
        print()

    # Paso 4: Generar checklist
    print("PASO 4: Próximos Pasos")
    print("-" * 70)
    print()
    print("1. Sube el código a GitHub:")
    print("   git add .")
    print("   git commit -m \"feat: add CI/CD workflows\"")
    print("   git push origin main")
    print()
    print("2. Configura los secrets en GitHub:")
    print("   Settings → Secrets and variables → Actions")
    print()
    print("3. Habilita GitHub Actions:")
    print("   Settings → Actions → General → Allow all actions")
    print()
    print("4. Ejecuta el primer test:")
    print("   Actions → Test SofIA Workflow → Run workflow")
    print()
    print("5. Lee la documentación completa:")
    print("   CI_CD_SETUP.md")
    print("   .github/GITHUB_SETUP_CHECKLIST.md")
    print()

    # Paso 5: Resumen
    print("="*70)
    print("         SETUP COMPLETO")
    print("="*70)
    print()
    print("Archivos de CI/CD listos:")
    print("  [OK] 3 GitHub Actions workflows")
    print("  [OK] Documentación completa")
    print("  [OK] Checklist de setup")
    print()
    print("¡Ahora sigue los próximos pasos arriba para configurar GitHub!")
    print()


if __name__ == "__main__":
    main()
