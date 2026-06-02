# REMAJU Monitor

Sistema automatizado de monitoreo de remates inmobiliarios judiciales del Poder Judicial del Perú.
Detecta propiedades en Lima menores a $90,000 USD y envía alertas por Telegram.

---

## Arranque rápido

### 1. Instalar dependencias

```bash
cd scraper
npm install
npx playwright install chromium
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

Variables requeridas en `scraper/.env`:

```env
PORT=3001
BROWSER_HEADLESS=true
DB_PATH=../data/remaju.db
N8N_CALLBACK_URL=https://workflows.n8n.redsolucionesti.com/webhook/remaju-done
ADMIN_TELEGRAM_TOKEN=tu_bot_token
ADMIN_TELEGRAM_CHAT_ID=tu_chat_id
```

### 3. Inicializar base de datos

```bash
npm run init-db
```

### 4. Probar el scraper manualmente (3 páginas, rápido)

```bash
npm run test-scraper
```

O con más páginas:

```bash
node src/cli.js full 10
```

### 5. Levantar el servidor API

```bash
npm start
# Servidor corriendo en http://localhost:3001
```

### 6. Importar workflow en n8n

- Ir a n8n → Workflows → Import
- Seleccionar `workflows/remaju-orchestrator.json`
- Configurar credencial Telegram (Bot Token)
- Agregar variable de entorno en n8n: `REMAJU_SCRAPER_URL=http://localhost:3001`
- Activar el workflow

---

## Estructura del proyecto

```
remaju-monitor/
├── scraper/
│   ├── src/
│   │   ├── server.js               ← API Express (POST /scrape, GET /health)
│   │   ├── cli.js                  ← Prueba manual desde terminal
│   │   ├── browser/manager.js      ← Playwright + stealth
│   │   ├── scrapers/remaju/        ← Scraper específico REMAJU
│   │   ├── processors/
│   │   │   ├── normalizer.js       ← Limpieza y clasificación de datos
│   │   │   └── currency.js         ← BCRP API + conversión PEN→USD
│   │   ├── database/init.js        ← SQLite setup
│   │   └── utils/                  ← Logger, retry
│   ├── Dockerfile
│   └── package.json
├── database/schema.sql             ← Schema completo SQLite
├── workflows/
│   └── remaju-orchestrator.json    ← Workflow n8n importable
├── alerts/formatter.js             ← Formateador de mensajes Telegram
├── config/filters.json             ← Configuración de filtros y tiers
├── data/                           ← Base de datos SQLite (gitignored)
└── docker-compose.yml
```

---

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | /health | Estado del servicio y browser |
| POST | /scrape | Iniciar scraping (async, devuelve run_id) |
| GET  | /results/:runId | Consultar resultado de un run |
| GET  | /auctions | Listar propiedades guardadas con filtros |

### POST /scrape — Body

```json
{
  "source": "remaju",
  "mode": "delta",
  "filters": {
    "departments": ["LIMA"],
    "max_price_usd": 95000
  }
}
```

### GET /auctions — Query params

```
?max_price_usd=90000&department=LIMA&alerted=0&limit=50
```

---

## Deploy en Railway

1. Crear nuevo proyecto en Railway
2. Conectar este repositorio
3. Configurar servicio apuntando a `remaju-monitor/scraper/`
4. Agregar variables de entorno
5. Railway detecta el Dockerfile automáticamente

---

## Tiers de alerta

| Tier | Precio | Emoji | Tipo de alerta |
|------|--------|-------|----------------|
| Super Ganga | < $40k | 🔴 | Individual inmediata |
| Muy Bueno | $40k–$60k | 🟠 | Individual inmediata |
| Bueno | $60k–$75k | 🟡 | Individual inmediata |
| Aceptable | $75k–$90k | 🟢 | Solo en digest |

---

## Próximos pasos

- [ ] Agregar endpoint `/mark-alerted` para registrar alertas enviadas
- [ ] Workflow n8n de digest semanal
- [ ] Workflow n8n de monitor de salud
- [ ] Agregar scraper BCP Remates (Fase 2)
- [ ] Dashboard web con Next.js (Fase 3)
