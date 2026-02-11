# Claudio - Tu n8n Manager

## 🎉 Configuración Completada

¡Todo está listo! Soy Claudio, tu asistente especializado en gestión de workflows de n8n.

## ✅ Estado del Sistema

### Repositorios Instalados

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| **n8n-mcp** | ✅ Instalado y compilado | `./n8n-mcp/` |
| **n8n-skills** | ✅ Clonado y listo | `./n8n-skills/` |
| **Base de datos** | ✅ Pre-construida disponible | `./n8n-mcp/n8n-nodes.db` |

### Conexión n8n

| Parámetro | Estado |
|-----------|--------|
| **Instancia** | https://workflows.n8n.redsolucionesti.com |
| **API** | ✅ Configurada y verificada |
| **Conexión** | ✅ Funcionando correctamente |

## 🚀 Capacidades Disponibles

### 1. Gestión de Workflows
- ✅ Crear nuevos workflows desde cero
- ✅ Listar workflows existentes
- ✅ Modificar workflows (completo o parcial)
- ✅ Eliminar workflows
- ✅ Validar workflows
- ✅ Auto-reparar workflows con errores

### 2. Ejecución y Testing
- ✅ Ejecutar workflows
- ✅ Ver historial de ejecuciones
- ✅ Depurar errores de ejecución
- ✅ Probar webhooks y triggers

### 3. Documentación y Soporte
- ✅ Acceso a **1,084 nodos n8n** (537 core + 547 community)
- ✅ **2,709 plantillas de workflows** con metadata completa
- ✅ Búsqueda y consulta de nodos
- ✅ Ejemplos reales de configuraciones

### 4. Skills Especializadas (7 Habilidades)

1. **n8n Expression Syntax** - Sintaxis de expresiones correcta
2. **n8n MCP Tools Expert** - Uso efectivo de herramientas MCP
3. **n8n Workflow Patterns** - Patrones arquitectónicos probados
4. **n8n Validation Expert** - Resolución de errores de validación
5. **n8n Node Configuration** - Configuración consciente de operaciones
6. **n8n Code JavaScript** - Código efectivo en nodos Code
7. **n8n Code Python** - Python con limitaciones conocidas

## 📝 Cómo Empezar

### Comandos Básicos

```
"Lista mis workflows"
→ Te mostraré todos tus workflows actuales

"Crea un workflow de webhook a Slack"
→ Diseñaré y crearé el workflow completo

"Modifica el workflow Sofia para que..."
→ Editaré el workflow según tus requisitos

"Ejecuta el workflow X"
→ Ejecutaré y te mostraré los resultados

"Ayúdame a depurar el error en el workflow Y"
→ Analizaré el error y propondré soluciones
```

### Ejemplos de Tareas

**Crear desde Plantillas:**
```
"Busca plantillas de integración con Google Sheets"
"Crea un workflow basado en la plantilla de envío de emails"
```

**Modificar Workflows:**
```
"Agrega un nodo de validación al workflow Sofia"
"Cambia la conexión del nodo HTTP para que use autenticación"
"Optimiza el workflow para mejor rendimiento"
```

**Debugging:**
```
"¿Por qué falla el workflow de WhatsApp?"
"Valida el workflow Sofia y muéstrame los errores"
"Explícame qué hace el nodo X en el workflow Y"
```

## 📚 Recursos Locales

### Documentación
- [CLAUDE.md](CLAUDE.md) - Información completa sobre mis capacidades
- [n8n-mcp/README.md](n8n-mcp/README.md) - Documentación del servidor MCP
- [n8n-skills/README.md](n8n-skills/README.md) - Documentación de skills

### Herramientas MCP Disponibles

**Documentación y Búsqueda:**
- `search_nodes` - Buscar nodos por palabra clave
- `get_node` - Obtener información detallada de un nodo
- `search_templates` - Buscar plantillas de workflows
- `get_template` - Obtener workflow completo de plantilla

**Validación:**
- `validate_node` - Validar configuración de nodo
- `validate_workflow` - Validar workflow completo
- `validate_workflow_connections` - Validar conexiones
- `validate_workflow_expressions` - Validar expresiones

**Gestión de Workflows (requiere API):**
- `n8n_create_workflow` - Crear workflow
- `n8n_get_workflow` - Obtener workflow
- `n8n_update_full_workflow` - Actualizar workflow completo
- `n8n_update_partial_workflow` - Actualizar partes del workflow
- `n8n_delete_workflow` - Eliminar workflow
- `n8n_list_workflows` - Listar workflows
- `n8n_validate_workflow` - Validar workflow en n8n
- `n8n_autofix_workflow` - Auto-reparar errores
- `n8n_test_workflow` - Ejecutar workflow
- `n8n_executions` - Gestionar ejecuciones
- `n8n_health_check` - Verificar estado de API

## 🔐 Seguridad

### Buenas Prácticas
- ✅ Siempre hago copias antes de modificar workflows de producción
- ✅ Valido todos los cambios antes de desplegar
- ✅ Te aviso antes de acciones destructivas
- ✅ No expongo credenciales en logs o respuestas

### Credenciales
- Las credenciales API están almacenadas en `n8n-mcp/.env`
- Este archivo está en `.gitignore` (no se sube a git)
- Solo yo tengo acceso para ejecutar operaciones

## 📊 Estadísticas del Sistema

### Base de Datos Local
- **1,084 nodos** documentados (537 core + 547 community)
- **2,709 plantillas** con metadata completa
- **2,646 configuraciones** reales pre-extraídas
- **99% cobertura** de propiedades
- **87% cobertura** de documentación oficial

### Tu Instancia n8n
- **Workflows activos**: Verificaré cuando me lo pidas
- **Última conexión**: ✅ Exitosa
- **Versión n8n**: Detectaré automáticamente

## 💡 Tips y Consejos

### Mejor Rendimiento
1. Usa plantillas cuando sea posible (2,709 disponibles)
2. Valida antes de desplegar
3. Aprovecha las 7 skills para mejores prácticas
4. Pídeme que explique nodos antes de usarlos

### Evitar Errores
1. Siempre prueba en desarrollo primero
2. Haz backup de workflows importantes
3. Usa validación multinivel (minimal → full → workflow)
4. Revisa mis sugerencias antes de aplicar

### Optimización
1. Evita nodos Code cuando haya alternativas
2. Usa expresiones n8n nativas
3. Aprovecha ejemplos reales de configuraciones
4. Implementa manejo de errores apropiado

## 🆘 Soporte

Si encuentras algún problema:
1. Pídeme que diagnostique el error
2. Revisa los logs en `n8n-mcp/`
3. Verifica la conexión API: "Verifica la conexión con n8n"
4. Consulta la documentación en [CLAUDE.md](CLAUDE.md)

## 🎯 Próximos Pasos

1. **Explora tus workflows**: "Lista mis workflows actuales"
2. **Crea algo nuevo**: "Crea un workflow de..."
3. **Optimiza existentes**: "Analiza el workflow X y sugiere mejoras"
4. **Aprende n8n**: "Explícame cómo funcionan los nodos de AI"

---

**¡Estoy listo para ayudarte con tus workflows de n8n!** 🚀

Simplemente dime qué necesitas y me encargaré del resto.
