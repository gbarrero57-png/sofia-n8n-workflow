/**
 * e2e_remaju.mjs — REMAJU Monitor end-to-end health check
 * Run: node scripts/tests/e2e_remaju.mjs
 *
 * Suites:
 *   A — Infrastructure (scraper, Supabase REMAJU, n8n workflows)
 *   B — Supabase data integrity (users, filters, alert_log, dispatch_lock)
 *   C — Scraper API (health, auctions endpoint, last run recency)
 *   D — n8n workflows (active status + last execution)
 *   E — Dispatch logic simulation (filter matching, dedup, first_seen_at)
 *   F — Subscription state (active users, trial expiry, lock table)
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const SUP_URL  = 'https://rdjpkfcztnourihqpffe.supabase.co'
const SUP_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkanBrZmN6dG5vdXJpaHFwZmZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY0MTU0NCwiZXhwIjoyMDk0MjE3NTQ0fQ.UhX4I_06RIoqPVx9Gyw0W1U_ABobWUDlkYl16waZGjs'
const N8N_BASE = 'https://workflows.n8n.redsolucionesti.com'
const N8N_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q'
const SCRAPER  = 'https://remaju-scraper.bzgfek.easypanel.host'

const WORKFLOWS = [
  { id: 'HA9BS3KWHE3uIc5F', name: 'Dispatch Diario',         critical: true  },
  { id: 'd0PjMsZRfcqsA7kp', name: 'Expirar Suscripciones',   critical: true  },
  { id: 'epQKConpZduTMhKX', name: 'Scrape Diario 6AM',       critical: true  },
  { id: '9k8gM3rf33fJRal4', name: 'Monitor 7:15AM',          critical: false },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const sb = (path, opts = {}) => fetch(SUP_URL + path, {
  ...opts,
  headers: {
    apikey: SUP_KEY, Authorization: 'Bearer ' + SUP_KEY,
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  }
}).then(r => r.json().then(b => ({ status: r.status, body: b })).catch(() => ({ status: r.status, body: null })))

const n8n = path => fetch(N8N_BASE + path, {
  headers: { 'X-N8N-API-KEY': N8N_KEY }
}).then(r => r.json())

// ── Result tracking ───────────────────────────────────────────────────────────
const results = []
let suiteLabel = ''

const pass = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: true, detail })
  console.log('  ✅ ' + label + (detail ? '  — ' + detail : ''))
}
const fail = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: false, detail })
  console.log('  ❌ ' + label + (detail ? '  — ' + detail : ''))
}
const warn = (label, detail = '') => {
  results.push({ suite: suiteLabel, label, ok: null, detail })
  console.log('  ⚠️  ' + label + (detail ? '  — ' + detail : ''))
}
const section = title => {
  suiteLabel = title
  console.log('\n━━ ' + title + ' ━━')
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE A — INFRASTRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
async function suiteA () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE A — Infrastructure')
  console.log('═'.repeat(60))

  // A1 — Supabase REMAJU
  section('A1: Supabase REMAJU')
  try {
    const r = await sb('/rest/v1/remaju_users?limit=1&select=id')
    if (r.status === 200 && Array.isArray(r.body)) pass('remaju_users accesible', r.body.length + ' row(s)')
    else fail('remaju_users accesible', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80))
  } catch (e) { fail('remaju_users accesible', e.message) }

  try {
    const r = await sb('/rest/v1/remaju_alert_log?limit=1&select=id')
    if (r.status === 200 && Array.isArray(r.body)) pass('remaju_alert_log accesible')
    else fail('remaju_alert_log accesible', 'HTTP ' + r.status)
  } catch (e) { fail('remaju_alert_log accesible', e.message) }

  try {
    const r = await sb('/rest/v1/remaju_dispatch_lock?limit=1&select=lock_date')
    if (r.status === 200 && Array.isArray(r.body)) pass('remaju_dispatch_lock accesible')
    else fail('remaju_dispatch_lock accesible', 'HTTP ' + r.status)
  } catch (e) { fail('remaju_dispatch_lock accesible', e.message) }

  try {
    const r = await sb('/rest/v1/remaju_filters?limit=1&select=id')
    if (r.status === 200 && Array.isArray(r.body)) pass('remaju_filters accesible')
    else fail('remaju_filters accesible', 'HTTP ' + r.status)
  } catch (e) { fail('remaju_filters accesible', e.message) }

  // A2 — Scraper
  section('A2: Scraper EasyPanel')
  try {
    const r = await fetch(SCRAPER + '/health').then(r => r.json())
    if (r.status === 'ok') pass('Scraper reachable', 'browser=' + r.browser + ' running=' + r.is_running)
    else fail('Scraper reachable', JSON.stringify(r).slice(0, 80))
  } catch (e) { fail('Scraper reachable', e.message) }

  // A3 — n8n API
  section('A3: n8n API')
  try {
    const r = await fetch(N8N_BASE + '/api/v1/workflows?limit=1', {
      headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    if (r.ok) pass('n8n API reachable', 'HTTP ' + r.status)
    else fail('n8n API reachable', 'HTTP ' + r.status)
  } catch (e) { fail('n8n API reachable', e.message) }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE B — SUPABASE DATA INTEGRITY
// ══════════════════════════════════════════════════════════════════════════════
async function suiteB () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE B — Supabase Data Integrity')
  console.log('═'.repeat(60))

  // B1 — Usuarios activos
  section('B1: Usuarios activos')
  const { body: users } = await sb('/rest/v1/remaju_users?select=id,telegram_id,subscription_status,trial_ends_at,subscription_ends_at,active')
  const now = new Date()
  if (!Array.isArray(users)) return fail('Leer usuarios', 'respuesta inválida')

  const activeUsers = users.filter(u => {
    if (!u.active) return false
    if (u.subscription_status === 'active') return !u.subscription_ends_at || new Date(u.subscription_ends_at) > now
    if (u.subscription_status === 'trial')  return !u.trial_ends_at  || new Date(u.trial_ends_at) > now
    return false
  })

  pass('Total usuarios en DB', users.length + ' usuarios')
  if (activeUsers.length > 0) pass('Usuarios activos con acceso', activeUsers.length + ' activos')
  else warn('Usuarios activos con acceso', 'ningún usuario con acceso vigente')

  // B2 — Cada usuario activo tiene filtros
  section('B2: Filtros por usuario')
  let filtersOk = 0
  let filtersMissing = 0
  for (const u of activeUsers) {
    const { body: f } = await sb('/rest/v1/remaju_filters?user_id=eq.' + u.id + '&select=id,max_price_usd,tiers,property_types,districts')
    if (Array.isArray(f) && f.length > 0) filtersOk++
    else filtersMissing++
  }
  if (filtersOk > 0) pass('Filtros existentes', filtersOk + '/' + activeUsers.length + ' usuarios tienen filtros')
  if (filtersMissing > 0) fail('Filtros faltantes', filtersMissing + ' usuarios activos sin filtros')

  // B3 — Alert log reciente (últimas 48h)
  section('B3: Alert log')
  const cutoff48h = new Date(now - 48 * 3600 * 1000).toISOString()
  const { body: recentLog } = await sb('/rest/v1/remaju_alert_log?sent_at=gte.' + cutoff48h + '&select=id,user_id,auction_external_id,sent_at&order=sent_at.desc&limit=10')
  if (Array.isArray(recentLog) && recentLog.length > 0) {
    pass('Alertas enviadas en 48h', recentLog.length + ' entradas recientes')
    const latest = recentLog[0]
    pass('Última alerta', latest.auction_external_id + ' → ' + latest.sent_at?.slice(0, 16))
  } else {
    warn('Alertas enviadas en 48h', 'sin registros en las últimas 48h')
  }

  // B4 — Dispatch lock de hoy
  section('B4: Dispatch lock')
  const todayLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const { body: lock } = await sb('/rest/v1/remaju_dispatch_lock?lock_date=eq.' + todayLima + '&select=lock_date,locked_at')
  if (Array.isArray(lock) && lock.length > 0) {
    pass('Lock de hoy existe', 'dispatch corrió el ' + todayLima + ' a las ' + lock[0].locked_at?.slice(11, 19) + ' UTC')
  } else {
    warn('Lock de hoy', 'dispatch NO ha corrido hoy (' + todayLima + ') — o fue eliminado')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE C — SCRAPER API
// ══════════════════════════════════════════════════════════════════════════════
async function suiteC () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE C — Scraper API')
  console.log('═'.repeat(60))

  // C1 — Health detallado
  section('C1: Scraper health')
  let health
  try {
    health = await fetch(SCRAPER + '/health').then(r => r.json())
    pass('Status ok', 'browser=' + health.browser)

    if (health.is_running) warn('Scrape en progreso', 'is_running=true')
    else pass('Scrape no en progreso', 'listo para siguiente ejecución')

    if (health.last_run) {
      const completedAt = new Date(health.last_run.completedAt)
      const hoursAgo = ((Date.now() - completedAt) / 3600000).toFixed(1)
      const detail = `newRecords=${health.last_run.newRecords} qualifying=${health.last_run.qualifying} hace ${hoursAgo}h`
      if (parseFloat(hoursAgo) < 26) pass('Último scrape reciente', detail)
      else warn('Último scrape', 'hace ' + hoursAgo + 'h — puede ser que no corrió hoy')
    } else {
      fail('Último scrape', 'last_run=null — container reiniciado o nunca corrió')
    }
  } catch (e) { fail('Scraper health', e.message) }

  // C2 — Endpoint /auctions
  section('C2: Endpoint /auctions')
  try {
    const r = await fetch(SCRAPER + '/auctions?limit=5').then(r => r.json())
    if (r.count > 0 && Array.isArray(r.data)) {
      pass('GET /auctions responde', r.count + ' propiedades en DB del scraper')

      // Verificar estructura de los campos esperados por el dispatch
      const sample = r.data[0]
      const requiredFields = ['external_id', 'price_usd', 'price_usd_tier', 'property_type', 'first_seen_at', 'status']
      const missing = requiredFields.filter(f => !(f in sample))
      if (missing.length === 0) pass('Campos requeridos presentes', requiredFields.join(', '))
      else fail('Campos faltantes en /auctions', missing.join(', '))

      // Verificar que hay propiedades de Lima
      const limaProps = r.data.filter(a => a.location_department === 'LIMA' || a.location_province === 'LIMA')
      if (limaProps.length > 0) pass('Propiedades de Lima', limaProps.length + '/' + r.data.length + ' en muestra')
      else warn('Propiedades de Lima', '0 en muestra de 5 — puede ser normal')
    } else {
      fail('GET /auctions responde', 'count=' + r.count + ' o data no es array')
    }
  } catch (e) { fail('GET /auctions', e.message) }

  // C3 — Propiedades nuevas hoy
  section('C3: Propiedades nuevas hoy')
  try {
    const todayStr  = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const todayMidUTC = todayStr + 'T05:00:00Z'
    const r = await fetch(SCRAPER + '/auctions?first_seen_after=' + encodeURIComponent(todayMidUTC)).then(r => r.json())
    if (r.count > 0) {
      pass('Propiedades nuevas hoy', r.count + ' con first_seen_at >= ' + todayStr)
    } else {
      warn('Propiedades nuevas hoy', '0 nuevas hoy — scraper puede no haber corrido aún')
    }
  } catch (e) {
    // El endpoint puede no soportar ese query param — no es crítico
    warn('Propiedades nuevas hoy', 'endpoint no soporta first_seen_after — verificar manualmente')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE D — N8N WORKFLOWS
// ══════════════════════════════════════════════════════════════════════════════
async function suiteD () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE D — n8n Workflows REMAJU')
  console.log('═'.repeat(60))
  section('D: Estado y última ejecución')

  for (const wf of WORKFLOWS) {
    try {
      const data = await n8n('/api/v1/workflows/' + wf.id)
      if (!data || data.message) {
        wf.critical ? fail(wf.name, 'no encontrado') : warn(wf.name, 'no encontrado')
        continue
      }

      if (!data.active) {
        wf.critical ? fail(wf.name + ' activo', 'active=false') : warn(wf.name + ' activo', 'active=false')
      } else {
        pass(wf.name + ' activo')
      }

      // Última ejecución
      const execs = await n8n('/api/v1/executions?workflowId=' + wf.id + '&limit=1')
      const last = execs?.data?.[0]
      if (!last) { warn(wf.name + ' última ejecución', 'sin historial'); continue }

      const ago = ((Date.now() - new Date(last.startedAt)) / 3600000).toFixed(1)
      const statusEmoji = last.status === 'success' ? '✅' : last.status === 'error' ? '❌' : '⚠️'
      const detail = statusEmoji + ' ' + last.status + ' hace ' + ago + 'h (exec ' + last.id + ')'

      if (last.status === 'success') pass(wf.name + ' última ejecución', detail)
      else if (last.status === 'error') fail(wf.name + ' última ejecución', detail)
      else warn(wf.name + ' última ejecución', detail)
    } catch (e) {
      wf.critical ? fail(wf.name, e.message) : warn(wf.name, e.message)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE E — DISPATCH LOGIC SIMULATION
// ══════════════════════════════════════════════════════════════════════════════
async function suiteE () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE E — Simulación lógica de Dispatch')
  console.log('═'.repeat(60))

  // E1 — Obtener usuarios + filtros
  section('E1: Datos para dispatch')
  const { body: users } = await sb('/rest/v1/remaju_users?select=id,telegram_id,subscription_status,trial_ends_at,subscription_ends_at,active,remaju_filters(*)')
  if (!Array.isArray(users)) return fail('Leer usuarios', 'respuesta inválida')

  const now = new Date()
  const activeUsers = users.filter(u => {
    if (!u.active) return false
    if (u.subscription_status === 'active') return !u.subscription_ends_at || new Date(u.subscription_ends_at) > now
    if (u.subscription_status === 'trial')  return !u.trial_ends_at  || new Date(u.trial_ends_at) > now
    return false
  })
  pass('Usuarios que recibirían dispatch', activeUsers.length + ' activos')

  // E2 — Simular filtros contra propiedades del scraper
  section('E2: Simulación de filtros vs scraper')
  let auctionsData
  try {
    const r = await fetch(SCRAPER + '/auctions?limit=200').then(r => r.json())
    auctionsData = r.data || []
    pass('Propiedades del scraper cargadas', auctionsData.length + ' propiedades')
  } catch (e) {
    return fail('Cargar propiedades del scraper', e.message)
  }

  const todayStr      = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const todayMidUTC   = new Date(todayStr + 'T05:00:00Z')
  const newToday      = auctionsData.filter(a => a.first_seen_at && new Date(a.first_seen_at) >= todayMidUTC)
  pass('Propiedades nuevas hoy (first_seen_at >= ' + todayStr + ')', newToday.length + ' nuevas')

  // Simular matching por usuario
  const { body: alertLog } = await sb('/rest/v1/remaju_alert_log?select=user_id,auction_external_id')
  const sentSet = new Set((alertLog || []).map(l => l.user_id + ':' + l.auction_external_id))

  for (const user of activeUsers) {
    const rawF = user.remaju_filters
    const f    = Array.isArray(rawF) ? (rawF[0] || {}) : (rawF || {})
    const maxPrice  = f.max_price_usd  || 90000
    const tiers     = f.tiers          || ['super_ganga','muy_bueno','bueno','aceptable']
    const types     = f.property_types || ['casa','departamento','terreno','local','otro']
    const districts = f.districts      || []

    const matching = newToday.filter(a => {
      if (!a.price_usd || a.price_usd > maxPrice) return false
      if (!tiers.includes(a.price_usd_tier)) return false
      if (!types.includes(a.property_type)) return false
      if (districts.length) {
        const norm  = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        const distRaw = norm(a.location_district || a.location_raw || '')
        if (!distRaw) return false
        if (!districts.some(d => distRaw.includes(norm(d)) || norm(d).includes(distRaw))) return false
      }
      if (sentSet.has(user.id + ':' + a.external_id)) return false
      return true
    })

    const label = 'Usuario telegram_id=' + user.telegram_id + ' (status=' + user.subscription_status + ')'
    pass(label, matching.length + ' matches nuevos hoy' +
      (districts.length ? ' · distritos: ' + districts.slice(0,3).join(',') : ' · sin filtro distrito') +
      ' · maxPrice=$' + maxPrice)
  }

  // E3 — Deduplicación (deberían tener 0 matches ya enviados)
  section('E3: Deduplicación alert_log')
  const { body: recentLog } = await sb('/rest/v1/remaju_alert_log?select=user_id,auction_external_id&order=sent_at.desc&limit=200')
  if (Array.isArray(recentLog)) {
    const uniqueKeys = new Set(recentLog.map(l => l.user_id + ':' + l.auction_external_id))
    if (uniqueKeys.size === recentLog.length) pass('Sin duplicados en alert_log', uniqueKeys.size + ' entradas únicas')
    else fail('Duplicados detectados', 'total=' + recentLog.length + ' únicos=' + uniqueKeys.size)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUITE F — SUBSCRIPTION STATE
// ══════════════════════════════════════════════════════════════════════════════
async function suiteF () {
  console.log('\n' + '═'.repeat(60))
  console.log('SUITE F — Estado de Suscripciones')
  console.log('═'.repeat(60))
  section('F: Resumen de usuarios')

  const { body: users } = await sb('/rest/v1/remaju_users?select=id,first_name,telegram_id,subscription_status,trial_ends_at,subscription_ends_at,active')
  if (!Array.isArray(users)) return fail('Leer usuarios', 'respuesta inválida')

  const now = new Date()

  for (const u of users) {
    const endsAt = u.subscription_status === 'trial' ? u.trial_ends_at : u.subscription_ends_at
    const end    = endsAt ? new Date(endsAt) : null
    const days   = end ? Math.ceil((end - now) / 86400000) : null
    const expired = end ? end < now : false
    const name   = u.first_name || 'Sin nombre'

    if (!expired && u.active && days !== null) {
      pass(name + ' (id=' + u.telegram_id + ')', u.subscription_status + ' · vence en ' + days + ' días (' + (end?.toLocaleDateString('es-PE') || '?') + ')')
    } else if (expired || !u.active) {
      warn(name + ' (id=' + u.telegram_id + ')', u.subscription_status + ' · EXPIRADO — active=' + u.active)
    } else {
      pass(name + ' (id=' + u.telegram_id + ')', u.subscription_status + ' · sin fecha de vencimiento configurada')
    }
  }

  // Usuarios con vencimiento en ≤ 2 días (recibirán aviso en dispatch)
  section('F2: Vencimientos próximos (≤ 2 días)')
  const proximos = users.filter(u => {
    const endsAt = u.subscription_status === 'trial' ? u.trial_ends_at : u.subscription_ends_at
    if (!endsAt) return false
    const days = Math.ceil((new Date(endsAt) - now) / 86400000)
    return days > 0 && days <= 2
  })
  if (proximos.length > 0) {
    proximos.forEach(u => {
      const endsAt = u.subscription_status === 'trial' ? u.trial_ends_at : u.subscription_ends_at
      const days = Math.ceil((new Date(endsAt) - now) / 86400000)
      warn('Vence pronto: ' + (u.first_name || u.telegram_id), 'en ' + days + ' día(s) — recibirá aviso en dispatch')
    })
  } else {
    pass('Sin vencimientos próximos', 'nadie vence en las próximas 48h')
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main () {
  console.log('\n' + '█'.repeat(60))
  console.log('  REMAJU Monitor — E2E Health Check')
  console.log('  ' + new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }) + ' (Lima)')
  console.log('█'.repeat(60))

  await suiteA()
  await suiteB()
  await suiteC()
  await suiteD()
  await suiteE()
  await suiteF()

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('RESUMEN')
  console.log('═'.repeat(60))

  const passed  = results.filter(r => r.ok === true).length
  const failed  = results.filter(r => r.ok === false).length
  const warned  = results.filter(r => r.ok === null).length

  console.log(`  ✅ Passed : ${passed}`)
  console.log(`  ❌ Failed : ${failed}`)
  console.log(`  ⚠️  Warnings: ${warned}`)
  console.log(`  Total  : ${results.length}`)

  if (failed > 0) {
    console.log('\n  Fallos críticos:')
    results.filter(r => r.ok === false).forEach(r => {
      console.log(`    ❌ [${r.suite}] ${r.label}${r.detail ? ' — ' + r.detail : ''}`)
    })
  }

  if (warned > 0) {
    console.log('\n  Advertencias:')
    results.filter(r => r.ok === null).forEach(r => {
      console.log(`    ⚠️  [${r.suite}] ${r.label}${r.detail ? ' — ' + r.detail : ''}`)
    })
  }

  console.log('')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Error inesperado en e2e:', e.message)
  process.exit(1)
})
