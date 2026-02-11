# SofIA Testing Suite

Suite de testing automatizado para el workflow de SofIA en n8n.

## 📋 Estructura

```
testing/
├── __init__.py                    # Package init
├── config.py                      # Configuración centralizada
├── utils.py                       # Utilidades comunes
├── test_phase1_classification.py  # Tests de clasificación de intenciones
├── test_phase2_calendar.py        # Tests de Google Calendar y slots
├── test_phase3_offer.py           # Tests de oferta de slots
├── test_phase4_booking.py         # Tests de creación de eventos
├── test_regression.py             # Tests de regresión
├── test_runner.py                 # Ejecutor principal
└── README.md                      # Esta documentación
```

## 🚀 Uso Rápido

### Ejecutar toda la suite

```bash
cd testing
python -m test_runner
```

### Ejecutar fases específicas

```bash
# Solo Phase 1 (clasificación)
python -m test_runner --phases phase1

# Phase 4 + Regression
python -m test_runner --phases phase4 regression

# Todas las fases
python -m test_runner --phases all
```

### Guardar reporte

```bash
python -m test_runner --output test_report.txt
```

## 📊 Tests Incluidos

### Phase 1: Intent Classification (19 tests)
- ✅ Detecta CREATE_EVENT (4 tests)
- ✅ Detecta INFO (4 tests)
- ✅ Detecta PAYMENT (4 tests)
- ✅ Detecta HUMAN fallback (4 tests)
- ✅ WhatsApp Safe Check (3 tests)

### Phase 2: Calendar & Slots (4 tests)
- ✅ Lee Google Calendar correctamente
- ✅ Calcula slots disponibles
- ✅ Selecciona top 3 slots
- ⚠️ Maneja calendario lleno (test manual)

### Phase 3: Slot Offer (3 tests)
- ✅ Formatea y envía oferta de slots
- ✅ Actualiza custom_attributes
- ✅ Phase 3 completa correctamente

### Phase 4: Event Creation (5 tests)
- ✅ Detecta segunda interacción
- ✅ Procesa elección de slot
- ✅ Crea evento en Google Calendar
- ✅ Envía confirmación al paciente
- ✅ Maneja respuestas ambiguas

### Regression Tests (5 tests)
- ✅ Flujo INFO sigue funcionando
- ✅ PAYMENT escala correctamente
- ✅ HUMAN escala correctamente
- ✅ Primera interacción no va a Phase 4
- ✅ No hay loops infinitos

**Total: 36 tests automatizados**

## ⚙️ Configuración

Edita `config.py` para ajustar:
- URLs de n8n y Chatwoot
- API keys
- IDs de test
- Timeouts
- Mensajes de prueba

```python
# Example
N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = "n8n_api_xxxxx"
WORKFLOW_ID = "37SLdWISQLgkHeXk"
```

## 📝 Interpretar Resultados

### Exit Codes
- `0`: Todos los tests pasaron ✅
- `1`: Al menos un test falló ❌

### Success Rates
- **100%**: Producción lista ✅
- **90-99%**: Review tests fallidos antes de deploy ⚠️
- **70-89%**: Investigación requerida ⚠️
- **<70%**: Fixes críticos necesarios ❌

### Ejemplo de Output

```
╔══════════════════════════════════════════════════════════════════════╗
║                        FINAL TEST REPORT                             ║
╚══════════════════════════════════════════════════════════════════════╝

Date: 2026-02-10 15:30:45
Duration: 180.45 seconds

SUMMARY:
  Total Tests:   36
  Passed:        34
  Failed:        2
  Success Rate:  94.4%

TEST BREAKDOWN:

✓ CREATE_EVENT:
   Passed: 4/4 (100%)

✗ Calendar Read:
   Passed: 3/4 (75%)
   Failed tests:
     • No Availability: Manual test required

✓ Regression:
   Passed: 5/5 (100%)
```

## 🔧 Troubleshooting

### Tests fallan con "Connection refused"
- Verifica que n8n esté accesible
- Revisa `N8N_BASE_URL` en config.py

### Tests fallan con "401 Unauthorized"
- Verifica `N8N_API_KEY` en config.py
- Confirma que la API key tenga permisos

### Tests de Calendar fallan
- Verifica credenciales OAuth2 de Google Calendar
- Confirma que el `CALENDAR_ID` sea correcto
- Asegúrate de que el calendario tenga eventos de test

### Tests son muy lentos
- Ajusta `EXECUTION_WAIT_TIME` en config.py
- Considera usar `--phases` para ejecutar solo tests específicos

## 📈 Agregar Nuevos Tests

1. Crea un nuevo archivo `test_feature.py` en `testing/`
2. Importa utilities: `from .utils import *`
3. Define función de test que retorne `TestResult`
4. Agrega runner function: `run_feature_tests()`
5. Importa en `test_runner.py`

```python
# Ejemplo
def test_new_feature():
    payload = create_test_payload("Test message")
    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    passed = analysis.get("success", False)

    return TestResult(
        name="New Feature Test",
        passed=passed,
        message="Feature works" if passed else "Feature broken",
        details={"execution_id": analysis["execution_id"]}
    )
```

## 🎯 Best Practices

1. **Ejecuta tests antes de deploy**: Valida cambios antes de producción
2. **Ejecuta regression tests**: Después de cada modificación importante
3. **Guarda reportes**: Mantén historial con `--output`
4. **Limpia test data**: Elimina eventos de test del calendario periódicamente
5. **Actualiza config.py**: Cuando cambien credenciales o endpoints

## 📚 Recursos

- **n8n API Docs**: https://docs.n8n.io/api/
- **Google Calendar API**: https://developers.google.com/calendar
- **Chatwoot API**: https://www.chatwoot.com/developers/api/

## 🤝 Soporte

Para reportar bugs o sugerir mejoras en la suite de testing:
1. Documenta el test que falla
2. Incluye el execution ID
3. Adjunta logs relevantes
4. Describe comportamiento esperado vs actual

---

**Version**: 1.0
**Date**: 2026-02-10
**Maintainer**: Claudio (n8n Manager Assistant)
