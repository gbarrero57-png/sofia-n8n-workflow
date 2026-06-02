/**
 * run_local.mjs — Scraper local REMAJU → Supabase
 *
 * Corre desde la PC (no Docker), salta el bloqueo Cloudflare del VPS.
 * Escribe resultados en Supabase remaju_auctions.
 *
 * Uso:
 *   node run_local.mjs              # modo delta (solo nuevos)
 *   node run_local.mjs --full       # modo full (re-scan completo)
 *
 * Programar en Windows Task Scheduler:
 *   Program: C:\Program Files\nodejs\node.exe
 *   Arguments: "C:\Users\Barbara\Documents\n8n_workflow_claudio\remaju-monitor\scraper\run_local.mjs"
 *   Start in: C:\Users\Barbara\Documents\n8n_workflow_claudio\remaju-monitor\scraper
 *   Trigger: Daily at 7:30 AM
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require  = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Forzar Chromium del sistema si está configurado
process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || ''

const RemajuScraper = require('./src/scrapers/remaju/index')
const { getExchangeRate, convertToUsd } = require('./src/processors/currency')
const { determineTier } = require('./src/processors/normalizer')
const { closeBrowser } = require('./src/browser/manager')
const logger = require('./src/utils/logger')

// ── Config ────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const MAX_PRICE    = 90000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL y SUPABASE_SERVICE_KEY requeridos en .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Modo ──────────────────────────────────────────────────
const mode = process.argv.includes('--full') ? 'full' : 'delta'
console.log(`\n🚀 REMAJU Scraper Local — modo: ${mode}\n`)

// ── Main ──────────────────────────────────────────────────
async function main () {
  const startedAt = new Date()

  // 1. Tipo de cambio
  const rateData = await getExchangeRate()
  console.log(`💱 Tipo de cambio: 1 USD = ${rateData.usd_to_pen} PEN`)

  // 2. IDs conocidos (para delta)
  let knownIds = new Set()
  if (mode === 'delta') {
    const { data: existing } = await supabase
      .from('remaju_auctions')
      .select('external_id')
      .eq('source', 'remaju')
    knownIds = new Set((existing || []).map(r => r.external_id))
    console.log(`📋 Registros conocidos en Supabase: ${knownIds.size}`)
  }

  // 3. Scraping
  console.log('🌐 Iniciando scraping de REMAJU...')
  const scraper = new RemajuScraper()
  const result  = await scraper.scrape({ deltaMode: mode === 'delta' }, knownIds)
  console.log(`📄 Páginas scraped: ${result.pagesScraped} | Registros raw: ${result.recordsFound}`)

  // 4. Procesar y filtrar Lima
  let newCount = 0, updatedCount = 0, qualifying = 0

  for (const record of result.data) {
    // Conversión moneda
    if (record.currency_original === 'PEN' && record.price_usd === null) {
      record.price_usd = convertToUsd(record.price_original, rateData.usd_to_pen)
    }
    record.exchange_rate  = rateData.usd_to_pen
    record.price_usd_tier = record.price_usd ? determineTier(record.price_usd) : null

    // Solo Lima/Callao
    if (record.location_department &&
        !record.location_department.includes('LIMA') &&
        !record.location_department.includes('CALLAO')) continue

    // Upsert en Supabase
    const row = {
      id:                   record.id,
      source:               record.source || 'remaju',
      external_id:          record.external_id,
      expediente:           record.expediente || null,
      juzgado:              record.juzgado || null,
      title:                record.title || null,
      description:          record.description || null,
      property_type:        record.property_type || null,
      property_type_raw:    record.property_type_raw || null,
      location_department:  record.location_department || null,
      location_province:    record.location_province || null,
      location_district:    record.location_district || null,
      location_raw:         record.location_raw || null,
      area_m2:              record.area_m2 || null,
      price_original:       record.price_original || null,
      currency_original:    record.currency_original || null,
      exchange_rate:        record.exchange_rate || null,
      price_usd:            record.price_usd || null,
      price_usd_tier:       record.price_usd_tier || null,
      auction_phase:        record.auction_phase || null,
      auction_date:         record.auction_date || null,
      detail_url:           record.detail_url || null,
      images:               record.images || [],
      raw_data:             record.raw_data || {},
      status:               'active',
      last_seen_at:         new Date().toISOString(),
      first_seen_at:        record.first_seen_at || new Date().toISOString()
    }

    const { error } = await supabase
      .from('remaju_auctions')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: false })

    if (error) {
      logger.warn('Error upserting auction', { id: record.id, error: error.message })
      continue
    }

    if (!knownIds.has(record.external_id)) {
      newCount++
      if (record.price_usd && record.price_usd <= MAX_PRICE) qualifying++
    } else {
      updatedCount++
    }
  }

  // 5. Cerrar browser
  await closeBrowser()

  const durationMs = Date.now() - startedAt.getTime()
  console.log(`\n✅ Completado en ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`   Nuevos: ${newCount} | Actualizados: ${updatedCount} | Calificados (<$${MAX_PRICE.toLocaleString()}): ${qualifying}`)

  // 6. Notificar a n8n si hay nuevos
  const N8N_CALLBACK = process.env.N8N_CALLBACK_URL
  if (N8N_CALLBACK && (newCount > 0 || updatedCount > 0)) {
    try {
      const resp = await fetch(N8N_CALLBACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'local_scraper', new_records: newCount, qualifying })
      })
      console.log(`📡 n8n notificado: ${resp.status}`)
    } catch (err) {
      console.warn('⚠️  No se pudo notificar a n8n:', err.message)
    }
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message)
  closeBrowser().finally(() => process.exit(1))
})
