# GitHub CI/CD Setup Checklist

Checklist paso a paso para configurar CI/CD en tu repositorio GitHub.

## ✅ Pre-requisitos

- [ ] Repositorio GitHub creado
- [ ] Código del proyecto subido
- [ ] n8n API key generada
- [ ] Workflow ID de SofIA conocido

---

## 📋 Paso 1: Configurar Secrets

### Repository Secrets

Ve a: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

- [ ] **N8N_API_KEY**
  ```
  Valor: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

- [ ] **N8N_BASE_URL**
  ```
  Valor: https://workflows.n8n.redsolucionesti.com
  ```

- [ ] **WORKFLOW_ID**
  ```
  Valor: 37SLdWISQLgkHeXk
  ```

### Verificar Secrets

- [ ] Abrir un secret y verificar que el valor no esté vacío
- [ ] No compartir screenshots de secrets

---

## 📋 Paso 2: Configurar Environments (Opcional)

Ve a: `Settings` → `Environments`

### Development Environment

- [ ] Click `New environment`
- [ ] Nombre: `development`
- [ ] No agregar protection rules
- [ ] Save

### Staging Environment

- [ ] Click `New environment`
- [ ] Nombre: `staging`
- [ ] `Deployment branches`: `develop`, `staging`
- [ ] `Required reviewers`: 1 persona
- [ ] Save

### Production Environment

- [ ] Click `New environment`
- [ ] Nombre: `production`
- [ ] `Deployment branches`: Solo `main`
- [ ] `Required reviewers`: 2 personas
- [ ] `Wait timer`: 5 minutos
- [ ] Save

---

## 📋 Paso 3: Configurar Branch Protection

Ve a: `Settings` → `Branches` → `Add branch protection rule`

### Para Branch `main`

- [ ] **Branch name pattern**: `main`
- [ ] ✅ `Require a pull request before merging`
  - [ ] ✅ `Require approvals`: 1
  - [ ] ✅ `Dismiss stale pull request approvals`
- [ ] ✅ `Require status checks to pass before merging`
  - [ ] Buscar y agregar: `Test SofIA Workflow / Test SofIA Workflow`
- [ ] ✅ `Require conversation resolution before merging`
- [ ] ✅ `Do not allow bypassing the above settings`
- [ ] Click `Create`

### Para Branch `develop` (Opcional)

- [ ] **Branch name pattern**: `develop`
- [ ] ✅ `Require a pull request before merging`
  - [ ] ✅ `Require approvals`: 1
- [ ] ✅ `Require status checks to pass before merging`
- [ ] Click `Create`

---

## 📋 Paso 4: Habilitar GitHub Actions

Ve a: `Settings` → `Actions` → `General`

### Workflow Permissions

- [ ] ✅ `Read and write permissions`
- [ ] ✅ `Allow GitHub Actions to create and approve pull requests`
- [ ] Click `Save`

### Actions Permissions

- [ ] ✅ `Allow all actions and reusable workflows`
- [ ] Click `Save`

---

## 📋 Paso 5: Verificar Workflows

Ve a: `Actions`

### Workflows Disponibles

- [ ] Ver `Test SofIA Workflow`
- [ ] Ver `Deploy SofIA Workflow`
- [ ] Ver `Nightly Full Test Suite`

### Primera Ejecución Manual

- [ ] Click en `Test SofIA Workflow`
- [ ] Click `Run workflow`
- [ ] Branch: `main`
- [ ] Test phases: `regression`
- [ ] Click `Run workflow`
- [ ] Esperar a que termine (~ 2 minutos)
- [ ] Verificar que pase ✅

---

## 📋 Paso 6: Configurar Notificaciones (Opcional)

### Email

Ve a: Tu perfil → `Settings` → `Notifications` → `Actions`

- [ ] ✅ `Send notifications for failed workflows only`

### Slack (Opcional)

- [ ] Crear Slack Webhook URL
- [ ] Agregar secret `SLACK_WEBHOOK`
- [ ] Descomentar sección de Slack en workflows

---

## 📋 Paso 7: Crear README Badges (Opcional)

Agrega a tu `README.md`:

```markdown
## Status

![Tests](https://github.com/TU-USER/TU-REPO/actions/workflows/test-sofia-workflow.yml/badge.svg)
![Deploy](https://github.com/TU-USER/TU-REPO/actions/workflows/deploy-workflow.yml/badge.svg)
![Nightly](https://github.com/TU-USER/TU-REPO/actions/workflows/nightly-tests.yml/badge.svg)
```

- [ ] Reemplazar `TU-USER` y `TU-REPO`
- [ ] Commit y push
- [ ] Verificar que badges aparezcan

---

## 📋 Paso 8: Probar Workflow Completo

### Test en Feature Branch

- [ ] Crear feature branch:
  ```bash
  git checkout -b test/ci-setup
  ```

- [ ] Hacer cambio trivial:
  ```bash
  echo "# CI/CD Test" >> test.md
  git add test.md
  git commit -m "test: verify CI/CD"
  git push origin test/ci-setup
  ```

- [ ] Crear Pull Request hacia `main`
- [ ] Verificar que tests se ejecuten automáticamente
- [ ] Verificar comentario con resultados en el PR
- [ ] Cerrar/merge el PR

### Test de Deployment

- [ ] Ir a `Actions` → `Deploy SofIA Workflow`
- [ ] Click `Run workflow`
- [ ] Environment: `development` (o `production` si no tienes dev)
- [ ] Run tests: `true`
- [ ] Click `Run workflow`
- [ ] Aprobar deployment si es necesario
- [ ] Verificar que complete exitosamente

---

## 📋 Paso 9: Documentación

- [ ] Actualizar `README.md` con instrucciones de CI/CD
- [ ] Documentar secrets requeridos
- [ ] Agregar link a `CI_CD_SETUP.md`

---

## 📋 Paso 10: Mantenimiento Inicial

### Primera Semana

- [ ] Día 1: Verificar que nightly tests corran
- [ ] Día 3: Revisar success rates en reportes
- [ ] Día 7: Analizar tendencias y ajustar si es necesario

### Rotación de Secrets (90 días)

- [ ] Crear calendar reminder para rotar API key
- [ ] Documentar proceso de rotación

---

## 🎯 Verificación Final

Todo listo si:

- [ ] ✅ Tests corren automáticamente en PRs
- [ ] ✅ Comentarios con resultados aparecen en PRs
- [ ] ✅ Nightly tests se ejecutan diariamente
- [ ] ✅ Deployment manual funciona
- [ ] ✅ Notificaciones llegan cuando tests fallan
- [ ] ✅ Success rate está >80% consistentemente

---

## 📞 Troubleshooting

### Si algo falla:

1. **Verificar secrets**:
   ```bash
   Actions → [Run fallido] → Re-run jobs → Enable debug logging
   ```

2. **Verificar permisos**:
   ```
   Settings → Actions → General → Workflow permissions
   ```

3. **Verificar branch protection**:
   ```
   Settings → Branches → [Branch name] → Edit
   ```

4. **Leer logs completos**:
   ```
   Actions → [Run] → [Job] → [Step] → Ver output completo
   ```

---

**¿Completaste todos los pasos?** ✅

Si algún paso falló, consulta [CI_CD_SETUP.md](../CI_CD_SETUP.md) para troubleshooting detallado.
