# CI/CD Setup para SofIA Testing Suite

Guía completa para configurar integración continua y deployment automatizado.

## 📋 Tabla de Contenidos

1. [Configuración Inicial](#configuración-inicial)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [Secrets y Variables](#secrets-y-variables)
4. [Environments](#environments)
5. [Uso y Ejecución](#uso-y-ejecución)
6. [Troubleshooting](#troubleshooting)

---

## Configuración Inicial

### 1. GitHub Secrets

Configura los siguientes secrets en tu repositorio GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Descripción | Ejemplo |
|-------------|-------------|---------|
| `N8N_API_KEY` | API key de n8n (JWT token) | `eyJhbGciOiJIUzI1NiIs...` |
| `N8N_BASE_URL` | URL base de tu instancia n8n | `https://workflows.n8n.redsolucionesti.com` |
| `WORKFLOW_ID` | ID del workflow de SofIA | `37SLdWISQLgkHeXk` |

### 2. Habilitar GitHub Actions

1. Ve a **Settings → Actions → General**
2. Marca **Allow all actions and reusable workflows**
3. En **Workflow permissions**, selecciona **Read and write permissions**

### 3. Crear Environments (Opcional)

Para deployments controlados, crea environments:

**Settings → Environments → New environment**

- `development` - Sin protección
- `staging` - Requiere 1 revisor
- `production` - Requiere 2 revisores + rama protegida

---

## GitHub Actions Workflows

### 1. Test SofIA Workflow (`test-sofia-workflow.yml`)

**Trigger automático en**:
- Push a `main` o `develop`
- Pull requests hacia `main`
- Diariamente a las 9 AM
- Ejecución manual

**Qué hace**:
- Ejecuta tests de regresión en cada push
- Suite completa en schedule o manual
- Comenta resultados en PRs
- Falla si success rate < 80%

**Uso manual**:
```bash
# En GitHub UI
Actions → Test SofIA Workflow → Run workflow
```

### 2. Deploy Workflow (`deploy-workflow.yml`)

**Trigger**: Manual solamente

**Qué hace**:
1. **Pre-deployment tests** (opcional)
   - Ejecuta suite completa
   - Requiere >95% success rate

2. **Deploy**
   - Sube workflow JSON a n8n
   - Activa el workflow

3. **Post-deployment validation**
   - Smoke tests
   - Guarda reporte

**Uso**:
```bash
# En GitHub UI
Actions → Deploy SofIA Workflow → Run workflow
  Environment: production
  Run tests: true
```

### 3. Nightly Full Test Suite (`nightly-tests.yml`)

**Trigger**: Diario a las 2 AM UTC

**Qué hace**:
- Ejecuta TODAS las fases por separado
- Genera reporte consolidado
- Analiza tendencias
- Crea issue automático si falla

---

## Secrets y Variables

### Secrets Requeridos

```yaml
# Repository Secrets
N8N_API_KEY: "eyJhbGciOiJIUzI1NiIs..."
N8N_BASE_URL: "https://workflows.n8n.redsolucionesti.com"
WORKFLOW_ID: "37SLdWISQLgkHeXk"
```

### Variables Opcionales

```yaml
# Repository Variables (Settings → Variables)
TEST_TIMEOUT: "180"           # Timeout en segundos
MIN_SUCCESS_RATE: "80.0"      # Mínimo success rate
PYTHON_VERSION: "3.12"        # Versión de Python
```

### Environment-Specific Secrets

Para múltiples entornos:

**Development**:
```yaml
N8N_API_KEY: "dev_key..."
N8N_BASE_URL: "https://dev-workflows.example.com"
WORKFLOW_ID: "dev_workflow_id"
```

**Production**:
```yaml
N8N_API_KEY: "prod_key..."
N8N_BASE_URL: "https://workflows.n8n.redsolucionesti.com"
WORKFLOW_ID: "37SLdWISQLgkHeXk"
```

---

## Environments

### Configurar Protection Rules

#### Development
- ✅ Sin restricciones
- ❌ No requiere aprobación

#### Staging
- ✅ Requiere 1 revisor
- ✅ Deployment branches: `develop`, `staging`

#### Production
- ✅ Requiere 2 revisores
- ✅ Solo rama `main`
- ✅ Espera 5 minutos antes de deploy

**Configuración**:
```yaml
Settings → Environments → production → Required reviewers
  - Agrega emails de revisores
  - Marca "Require approval from all required reviewers"
```

---

## Uso y Ejecución

### Workflow de Desarrollo Típico

1. **Crear feature branch**:
   ```bash
   git checkout -b feature/nueva-funcionalidad
   ```

2. **Hacer cambios** al workflow

3. **Commit y push**:
   ```bash
   git add .
   git commit -m "feat: nueva funcionalidad"
   git push origin feature/nueva-funcionalidad
   ```

4. **Crear Pull Request**:
   - Los tests se ejecutan automáticamente
   - Resultados aparecen como comentario en el PR

5. **Merge a develop**:
   - Tests de regresión se ejecutan
   - Si pasan, merge a `main`

6. **Deploy a producción**:
   ```
   Actions → Deploy SofIA Workflow
   Environment: production
   Run tests: true
   → Run workflow
   ```

### Ejecución Manual de Tests

**Opción 1: Via GitHub Actions**
```
Actions → Test SofIA Workflow → Run workflow
  Test phases: all
```

**Opción 2: Localmente**
```bash
cd testing
python test_runner.py --phases all
```

---

## Monitoreo y Reportes

### Ver Resultados de Tests

1. **En Actions**:
   ```
   Actions → [Workflow name] → [Run] → Artifacts
   ```

2. **Descargar reportes**:
   - `test-reports-py3.12.zip`
   - `nightly-test-reports-123.zip`

### Métricas Disponibles

Cada reporte incluye:
- ✅ Total tests
- ✅ Passed/Failed
- ✅ Success rate
- ✅ Execution IDs
- ✅ Detalles de fallos

### Dashboard (Opcional)

Puedes agregar badges al README:

```markdown
![Tests](https://github.com/USER/REPO/actions/workflows/test-sofia-workflow.yml/badge.svg)
![Nightly](https://github.com/USER/REPO/actions/workflows/nightly-tests.yml/badge.svg)
```

---

## Troubleshooting

### Tests Fallan en CI pero Pasan Localmente

**Causa**: Diferencias de environment

**Solución**:
```yaml
# En workflow.yml
env:
  PYTHONUNBUFFERED: "1"
  TZ: "America/Lima"
```

### API Key Inválida en CI

**Causa**: Secret mal configurado

**Verificación**:
```bash
# En workflow step
- name: Verify secrets
  run: |
    if [ -z "$N8N_API_KEY" ]; then
      echo "::error::N8N_API_KEY not set"
      exit 1
    fi
    echo "API Key length: ${#N8N_API_KEY}"
```

### Timeout en Tests

**Causa**: Tests muy lentos

**Solución**:
```yaml
# Aumentar timeout
- name: Run tests
  run: python test_runner.py --phases all
  timeout-minutes: 30  # Default es 360
```

### No Se Pueden Obtener Ejecuciones

**Causa**: Workflow no está activo

**Solución**:
```bash
# Activar workflow antes de tests
curl -X PATCH \
  "${N8N_BASE_URL}/api/v1/workflows/${WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -d '{"active": true}'
```

---

## Notificaciones

### Slack Integration

Agrega al final de `test-sofia-workflow.yml`:

```yaml
- name: Notify Slack
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "🚨 SofIA Tests Failed",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Workflow*: ${{ github.workflow }}\n*Status*: Failed\n*Run*: <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View>"
            }
          }
        ]
      }
```

### Email Notifications

GitHub envía emails automáticamente a:
- Autor del commit si el workflow falla
- Watchers del repositorio (configurable)

**Personalizar**:
```
Settings → Notifications → Actions
  ✅ Send notifications for failed workflows only
```

---

## Best Practices

### 1. Versionado de Secrets

Mantén registro de cambios:

```bash
# .github/secrets-changelog.md
## 2026-02-10
- Updated N8N_API_KEY (expired)
- Added staging environment secrets
```

### 2. Rotación de API Keys

Cada 90 días:
1. Generar nueva API key en n8n
2. Actualizar secret en GitHub
3. Verificar con test manual
4. Documentar cambio

### 3. Separación de Environments

```yaml
# No mezclar secrets de prod y dev
# Usar environment-specific secrets

development:
  N8N_API_KEY: dev_key
  N8N_BASE_URL: https://dev.example.com

production:
  N8N_API_KEY: prod_key
  N8N_BASE_URL: https://prod.example.com
```

### 4. Monitoreo de Success Rate

Si success rate < 90% por 3 días:
1. Investigar causa raíz
2. Crear issue
3. Priorizar fix

---

## Recursos Adicionales

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [n8n API Documentation](https://docs.n8n.io/api/)
- [Testing Suite README](testing/README.md)
- [Testing Suite Docs](TESTING_SUITE_DOCUMENTATION.md)

---

**Configurado por**: Claudio (n8n Manager Assistant)
**Fecha**: 2026-02-10
**Versión**: 1.0
