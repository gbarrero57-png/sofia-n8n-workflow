require('dotenv').config()

const express        = require('express')
const { v4: uuidv4 } = require('uuid')
const RemajuScraper  = require('./scrapers/remaju/index')
const { getExchangeRate, convertToUsd } = require('./processors/currency')
const { determineTier } = require('./processors/normalizer')
const { getDb, initDb } = require('./database/init')
const { closeBrowser } = require('./browser/manager')

// Inicializar schema al arrancar
initDb()

const logger         = require('./utils/logger')
const { createBot }  = require('./bot/index')

const app  = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

// Iniciar proxy bridge ANTES de aceptar requests
const { startProxyBridge } = require('./proxy/bridge')
startProxyBridge()
  .then(url => url && logger.info('Proxy bridge listo', { url }))
  .catch(err => logger.warn('Proxy bridge error', { error: err.message }))

// ── Estado del scraper ─────────────────────────────────
let isRunning = false
let lastRun   = null

// ── GET /health ────────────────────────────────────────
app.get('/health', async (req, res) => {
  const scraper = new RemajuScraper()
  const browserOk = await scraper.checkHealth()
  res.json({
    status:      'ok',
    browser:     browserOk ? 'ready' : 'not_started',
    is_running:  isRunning,
    last_run:    lastRun,
    uptime_ms:   process.uptime() * 1000
  })
})

// ── POST /scrape ───────────────────────────────────────
app.post('/scrape', async (req, res) => {
  if (isRunning) {
    return res.status(429).json({ error: 'Scraping ya en progreso', is_running: true })
  }

  const {
    source    = 'remaju',
    filters   = {},
    mode      = 'delta'   // 'full' | 'delta'
  } = req.body || {}

  const runId = uuidv4()
  isRunning   = true

  // Responder inmediatamente con el run_id para no bloquear n8n
  res.json({ success: true, run_id: runId, message: 'Scraping iniciado', mode })

  // Ejecutar en background
  runScraping(runId, source, filters, mode).catch(err => {
    logger.error('Error fatal en scraping', { runId, error: err.message })
  })
})

// ── GET /results/:runId ────────────────────────────────
// n8n puede hacer polling aquí mientras espera
app.get('/results/:runId', (req, res) => {
  try {
    const db  = getDb()
    const run = db.prepare('SELECT * FROM scraping_runs WHERE id = ?').get(req.params.runId)
    db.close()

    if (!run) return res.status(404).json({ error: 'Run no encontrado' })

    if (run.status === 'running') {
      return res.json({ status: 'running', run_id: req.params.runId })
    }

    // Run completado — devolver los nuevos registros
    const db2  = getDb()
    const rows = db2.prepare(
      `SELECT * FROM auctions WHERE created_at >= ? AND source = ? ORDER BY price_usd ASC`
    ).all(run.started_at, run.source || 'remaju')
    db2.close()

    res.json({ status: run.status, run_id: req.params.runId, run, data: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /auctions ──────────────────────────────────────
app.get('/auctions', (req, res) => {
  try {
    const {
      max_price_usd = 90000,
      department    = 'LIMA',
      alerted       = null,
      limit         = 50
    } = req.query

    const db = getDb()
    let query  = "SELECT * FROM auctions WHERE status = 'active' AND price_usd IS NOT NULL AND price_usd <= ?"
    const args = [parseFloat(max_price_usd)]

    if (department) { query += ' AND location_department = ?'; args.push(department) }
    if (alerted !== null) { query += ' AND alerted = ?'; args.push(parseInt(alerted)) }
    query += ' ORDER BY price_usd ASC LIMIT ?'
    args.push(parseInt(limit))

    const rows = db.prepare(query).all(...args)
    db.close()
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /proxy-test ────────────────────────────────────
app.get('/proxy-test', async (req, res) => {
  const axios = require('axios')
  const results = {}

  const proxyServer = process.env.PROXY_SERVER
  const user = process.env.PROXY_USERNAME
  const pass = process.env.PROXY_PASSWORD

  results.env = { server: proxyServer || 'NOT SET', user: user || 'NOT SET' }

  // Test directo (sin proxy)
  try {
    const r = await axios.get('https://api.ipify.org/?format=json', { timeout: 8000 })
    results.direct_ip = r.data.ip
  } catch (e) { results.direct_error = e.message }

  // Test con proxy via axios (soporta http y socks5)
  if (proxyServer) {
    try {
      const url = new URL(proxyServer)
      const isSocks = proxyServer.startsWith('socks')
      let axiosConfig = { timeout: 10000 }
      if (isSocks) {
        const { SocksProxyAgent } = require('socks-proxy-agent')
        const agent = new SocksProxyAgent(`socks5://${user}:${pass}@${url.hostname}:${url.port}`)
        axiosConfig.httpsAgent = agent
        axiosConfig.httpAgent  = agent
      } else {
        axiosConfig.proxy = { host: url.hostname, port: parseInt(url.port), auth: { username: user, password: pass } }
      }
      const r = await axios.get('https://api.ipify.org/?format=json', axiosConfig)
      results.proxy_ip = r.data.ip
    } catch (e) { results.proxy_error = e.message }
  }

  res.json(results)
})

// ── GET /bridge-test ───────────────────────────────────
app.get('/bridge-test', async (req, res) => {
  const axios = require('axios')
  const bridgePort = parseInt(process.env.PROXY_BRIDGE_PORT) || 8877
  const bridgeUrl = `http://localhost:${bridgePort}`
  try {
    const r = await axios.get('https://api.ipify.org/?format=json', {
      proxy: { host: 'localhost', port: bridgePort },
      timeout: 12000
    })
    res.json({ ok: true, bridge_url: bridgeUrl, ip: r.data.ip })
  } catch (e) {
    res.json({ ok: false, bridge_url: bridgeUrl, error: e.message })
  }
})

// ── GET /socks-test ───────────────────────────────────
app.get('/socks-test', async (req, res) => {
  const { testSocksConnect } = require('./proxy/bridge')
  const results = {}

  const targets = [
    { key: 'ipify',  host: 'api.ipify.org',           port: 443 },
    { key: 'remaju', host: 'remaju.pj.gob.pe',         port: 443 },
    { key: 'remaju_80', host: 'remaju.pj.gob.pe',      port: 80  }
  ]

  for (const t of targets) {
    try {
      await testSocksConnect(t.host, t.port)
      results[t.key] = 'ok'
    } catch (e) {
      results[t.key + '_error'] = e.message
    }
  }

  res.json(results)
})

// ── GET /diagnose ──────────────────────────────────────
app.get('/diagnose', async (req, res) => {
  const { getBrowser, newContext } = require('./browser/manager')
  let browser, context, page
  try {
    browser = await getBrowser()
    context = await newContext(browser)
    page = await context.newPage()
    // Verificar IP real que ve el exterior
    await page.goto('https://api.ipify.org/?format=json', { waitUntil: 'domcontentloaded', timeout: 15000 })
    const ipData = await page.evaluate(() => document.body.innerText)
    const outboundIp = JSON.parse(ipData).ip

    await page.goto('https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)
    const info = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText?.substring(0, 500),
      datagridCount: document.querySelectorAll('.ui-datagrid-column').length,
      formCount: document.querySelectorAll('form').length,
      selectCount: document.querySelectorAll('select').length,
    }))
    await context.close()
    res.json({ ok: true, outbound_ip: outboundIp, proxy_configured: !!process.env.PROXY_SERVER, ...info })
  } catch (err) {
    if (context) await context.close().catch(() => {})
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /inspect-cards ────────────────────────────────
// Extrae HTML crudo del primer card para analizar estructura de links
app.get('/inspect-cards', async (req, res) => {
  const { getBrowser, newContext } = require('./browser/manager')
  let browser, context, page
  try {
    browser = await getBrowser()
    context = await newContext(browser)
    page = await context.newPage()
    await page.goto('https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('.ui-datagrid-column', { timeout: 30000 })
    await page.waitForTimeout(2000)

    const cards = await page.evaluate(() => {
      const els = document.querySelectorAll('.ui-datagrid-column.ui-g-12.ui-md-12')
      return Array.from(els).slice(0, 2).map(card => ({
        innerHTML: card.innerHTML.substring(0, 3000),
        links: Array.from(card.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText?.trim(), onclick: a.getAttribute('onclick') })),
        buttons: Array.from(card.querySelectorAll('button, input[type=submit]')).map(b => ({ text: b.innerText?.trim(), onclick: b.getAttribute('onclick'), name: b.name, value: b.value })),
        forms: Array.from(card.querySelectorAll('form')).map(f => ({ action: f.action, method: f.method })),
        dataAttrs: Object.fromEntries(Array.from(card.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value]))
      }))
    })
    await context.close()
    res.json({ ok: true, cards })
  } catch (err) {
    if (context) await context.close().catch(() => {})
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── GET /goto/:remateNum ───────────────────────────────
// Auto-copia el número de remate y redirige a REMAJU
app.get('/goto/:remateNum', (req, res) => {
  const num = String(req.params.remateNum).replace(/[^0-9]/g, '')
  if (!num) return res.status(400).send('Número inválido')

  const remajuUrl = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml'

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remate Nº ${num} — REMAJU</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px 28px;max-width:420px;width:100%;text-align:center}
  .logo{font-size:40px;margin-bottom:12px}
  h1{font-size:15px;color:#94a3b8;font-weight:500;letter-spacing:.5px;margin-bottom:20px}
  .num{font-size:48px;font-weight:800;color:#38bdf8;letter-spacing:-1px;margin-bottom:8px;font-variant-numeric:tabular-nums}
  .label{font-size:13px;color:#64748b;margin-bottom:28px}
  .btn{display:block;width:100%;padding:14px 20px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;border:none;margin-bottom:10px;transition:opacity .15s}
  .btn-primary{background:#0ea5e9;color:#fff}
  .btn-primary:hover{opacity:.85}
  .btn-copy{background:#334155;color:#94a3b8}
  .btn-copy:hover{opacity:.75}
  .status{font-size:13px;color:#22c55e;margin-top:16px;min-height:20px}
  .countdown{font-size:12px;color:#475569;margin-top:8px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🏛️</div>
  <h1>REMATE JUDICIAL</h1>
  <div class="num">${num}</div>
  <div class="label">Número de remate</div>
  <a href="${remajuUrl}" class="btn btn-primary" id="btnOpen" target="_blank">Abrir REMAJU</a>
  <button class="btn btn-copy" id="btnCopy" onclick="copyNum()">Copiar número</button>
  <div class="status" id="status"></div>
  <div class="countdown" id="countdown"></div>
</div>
<script>
  const NUM = '${num}'
  const REMAJU = '${remajuUrl}'

  function copyNum () {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(NUM).then(function() {
        document.getElementById('status').textContent = '✓ Número copiado al portapapeles'
        document.getElementById('btnCopy').textContent = '✓ Copiado'
      }).catch(fallbackCopy)
    } else { fallbackCopy() }
  }

  function fallbackCopy () {
    var ta = document.createElement('textarea')
    ta.value = NUM; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); document.getElementById('status').textContent = '✓ Número copiado' } catch(e) {}
    document.body.removeChild(ta)
  }

  // Auto-copy on load
  window.addEventListener('load', function () {
    copyNum()
    // Countdown to open REMAJU
    var t = 3
    var el = document.getElementById('countdown')
    el.textContent = 'Abriendo REMAJU en ' + t + 's...'
    var iv = setInterval(function () {
      t--
      if (t <= 0) {
        clearInterval(iv)
        el.textContent = 'Abriendo REMAJU...'
        window.open(REMAJU, '_blank')
      } else {
        el.textContent = 'Abriendo REMAJU en ' + t + 's...'
      }
    }, 1000)
  })
</script>
</body>
</html>`)
})

// ── GET /diagnose-direct ───────────────────────────────
// Igual que /diagnose pero SIN proxy (conexión directa desde VPS)
app.get('/diagnose-direct', async (req, res) => {
  const { getBrowser } = require('./browser/manager')
  const { chromium } = require('playwright-extra')
  let browser, context, page
  try {
    browser = await getBrowser()
    // Contexto sin proxy
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'es-PE',
      timezoneId: 'America/Lima'
    })
    page = await context.newPage()

    await page.goto('https://api.ipify.org/?format=json', { waitUntil: 'domcontentloaded', timeout: 10000 })
    const outboundIp = JSON.parse(await page.evaluate(() => document.body.innerText)).ip

    await page.goto('https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)
    const info = await page.evaluate(() => ({
      title:         document.title,
      url:           location.href,
      status:        document.querySelector('.error-code')?.innerText || 'no-error',
      bodySnippet:   document.body.innerText?.substring(0, 300),
      datagridCount: document.querySelectorAll('.ui-datagrid-column').length,
      selectCount:   document.querySelectorAll('select').length
    }))
    await context.close()
    res.json({ ok: true, outbound_ip: outboundIp, proxy: false, ...info })
  } catch (err) {
    if (context) await context.close().catch(() => {})
    res.status(500).json({ ok: false, proxy: false, error: err.message })
  }
})

// ── Función principal de scraping ─────────────────────
async function runScraping (runId, source, filters, mode) {
  const startedAt = new Date().toISOString()
  const db        = getDb()

  // Registrar inicio del run
  db.prepare(`
    INSERT INTO scraping_runs (id, source, mode, started_at, status)
    VALUES (?, ?, ?, ?, 'running')
  `).run(runId, source, mode, startedAt)
  db.close()

  try {
    // 1. Obtener tipo de cambio del día
    const rateData = await getExchangeRate()
    logger.info('Tipo de cambio obtenido', rateData)

    // Guardar en DB para historial
    const db2 = getDb()
    const today = new Date().toISOString().split('T')[0]
    db2.prepare(`
      INSERT OR REPLACE INTO exchange_rates (id, date, usd_to_pen, pen_to_usd, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), today, rateData.usd_to_pen, rateData.pen_to_usd, rateData.source)
    db2.close()

    // 2. Obtener IDs ya conocidos (para modo delta)
    const db3  = getDb()
    const known = db3.prepare('SELECT external_id FROM auctions WHERE source = ?').all(source)
    const knownIds = new Set(known.map(r => r.external_id))
    db3.close()

    logger.info('IDs conocidos cargados', { count: knownIds.size, mode })

    // 3. Ejecutar scraper
    const scraper  = new RemajuScraper()
    const result   = await scraper.scrape(
      { ...filters, deltaMode: mode === 'delta' },
      knownIds
    )

    // 4. Convertir precios a USD y filtrar
    let newCount     = 0
    let updatedCount = 0
    let qualifying   = 0
    const MAX_PRICE  = filters.max_price_usd || 90000

    const db4 = getDb()

    for (const record of result.data) {
      // Completar conversión de moneda
      if (record.currency_original === 'PEN' && record.price_usd === null) {
        record.price_usd = convertToUsd(record.price_original, rateData.usd_to_pen)
      }
      record.exchange_rate  = rateData.usd_to_pen
      record.price_usd_tier = record.price_usd ? determineTier(record.price_usd) : null

      // Solo guardar propiedades de Lima
      if (record.location_department && !record.location_department.includes('LIMA') &&
          !record.location_department.includes('CALLAO')) continue

      // Guardar en DB
      const existing = db4.prepare('SELECT id, price_usd FROM auctions WHERE id = ?').get(record.id)

      if (!existing) {
        db4.prepare(`
          INSERT OR IGNORE INTO auctions (
            id, source, external_id, expediente, juzgado, title, description,
            property_type, property_type_raw, location_department, location_province,
            location_district, location_raw, area_m2,
            price_original, currency_original, exchange_rate, price_usd, price_usd_tier,
            auction_phase, auction_date, detail_url, images, raw_data, price_history,
            first_seen_at, last_seen_at, status, alerted, alert_count
          ) VALUES (
            @id, @source, @external_id, @expediente, @juzgado, @title, @description,
            @property_type, @property_type_raw, @location_department, @location_province,
            @location_district, @location_raw, @area_m2,
            @price_original, @currency_original, @exchange_rate, @price_usd, @price_usd_tier,
            @auction_phase, @auction_date, @detail_url, @images, @raw_data, @price_history,
            @first_seen_at, @last_seen_at, @status, @alerted, @alert_count
          )
        `).run(record)
        newCount++
        if (record.price_usd && record.price_usd <= MAX_PRICE) qualifying++
      } else {
        // Actualizar last_seen y precio si cambió
        if (Math.abs((existing.price_usd || 0) - (record.price_usd || 0)) > 100) {
          const history = JSON.parse(
            db4.prepare('SELECT price_history FROM auctions WHERE id = ?').get(record.id)?.price_history || '[]'
          )
          history.push({ price_usd: existing.price_usd, date: new Date().toISOString() })

          db4.prepare(`
            UPDATE auctions SET
              price_usd = ?, exchange_rate = ?, price_usd_tier = ?,
              last_seen_at = ?, price_history = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(record.price_usd, rateData.usd_to_pen, record.price_usd_tier,
                 new Date().toISOString(), JSON.stringify(history), record.id)
          updatedCount++
        } else {
          db4.prepare(`UPDATE auctions SET last_seen_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), record.id)
        }
      }
    }
    db4.close()

    // 5. Cerrar run con éxito
    const durationMs = Date.now() - new Date(startedAt).getTime()
    const db5 = getDb()
    db5.prepare(`
      UPDATE scraping_runs SET
        completed_at = ?, pages_scraped = ?, records_found = ?,
        new_records = ?, updated_records = ?, qualifying = ?,
        duration_ms = ?, status = 'success'
      WHERE id = ?
    `).run(
      new Date().toISOString(), result.pagesScraped, result.recordsFound,
      newCount, updatedCount, qualifying, durationMs, runId
    )
    db5.close()

    lastRun = { runId, completedAt: new Date().toISOString(), newRecords: newCount, qualifying }
    logger.info('Run completado', { runId, newCount, updatedCount, qualifying, durationMs })

    // 6. Notificar a n8n si hay callback configurado
    if (process.env.N8N_CALLBACK_URL && (newCount > 0 || updatedCount > 0)) {
      await notifyN8n(runId, newCount, qualifying)
    }

  } catch (err) {
    logger.error('Error en run de scraping', { runId, error: err.message, stack: err.stack })

    const db6 = getDb()
    db6.prepare(`
      UPDATE scraping_runs SET status = 'failed', error_message = ?, completed_at = ?
      WHERE id = ?
    `).run(err.message, new Date().toISOString(), runId)
    db6.close()
  } finally {
    isRunning = false
  }
}

async function notifyN8n (runId, newRecords, qualifying) {
  try {
    const axios = require('axios')
    await axios.post(process.env.N8N_CALLBACK_URL, { run_id: runId, new_records: newRecords, qualifying }, { timeout: 5000 })
    logger.info('n8n notificado', { runId, newRecords, qualifying })
  } catch (err) {
    logger.warn('Error notificando a n8n', { error: err.message })
  }
}

// ── Graceful shutdown ──────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('Cerrando servidor...')
  await closeBrowser()
  process.exit(0)
})

app.listen(PORT, () => {
  logger.info(`Scraper API corriendo en puerto ${PORT}`)
})

// ── Bot Telegram SaaS ──────────────────────────────────
const bot = createBot()
if (bot) {
  logger.info('Iniciando bot Telegram SaaS...')
  bot.launch({ dropPendingUpdates: true })
    .catch(err => logger.error('Error iniciando bot', { error: err.message }))

  process.once('SIGTERM', () => bot.stop('SIGTERM'))
  process.once('SIGINT',  () => bot.stop('SIGINT'))
}

module.exports = app
