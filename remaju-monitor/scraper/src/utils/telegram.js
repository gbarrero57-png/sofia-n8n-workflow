const axios  = require('axios')
const logger = require('./logger')

const TOKEN   = process.env.ADMIN_TELEGRAM_TOKEN
const CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID

// Escape para MarkdownV2 — todos los caracteres reservados
function esc (s) {
  return String(s).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&')
}

async function sendAlert (auction, exchangeRate) {
  const TIER_EMOJI  = { super_ganga: '🔴', muy_bueno: '🟠', bueno: '🟡', aceptable: '🟢' }
  const TYPE_EMOJI  = { casa: '🏠', departamento: '🏢', terreno: '🌿', local: '🏪', otro: '🏗️' }

  const tier      = auction.price_usd_tier || 'aceptable'
  const emoji     = TIER_EMOJI[tier] || '🟢'
  const typeEmoji = TYPE_EMOJI[auction.property_type] || '🏗️'
  const tier_uc   = (tier.replace('_', ' ')).toUpperCase()

  const priceUsd  = Math.round(auction.price_usd)
  const pricePen  = auction.currency_original === 'PEN' ? Math.round(auction.price_original) : null
  const tc        = exchangeRate ? parseFloat(exchangeRate).toFixed(2) : '3.43'
  const district  = auction.location_district || auction.location_department || 'Lima'
  const tipo      = (auction.property_type || 'inmueble').charAt(0).toUpperCase() + (auction.property_type || 'inmueble').slice(1)
  const fase      = auction.auction_phase ? auction.auction_phase.includes('SEGUNDA') ? '2da Conv ↓15%' : auction.auction_phase.includes('TERCERA') ? '3ra Conv ↓30%' : '1ra Conv' : ''

  let days = null
  if (auction.auction_date) {
    days = Math.ceil((new Date(auction.auction_date) - new Date()) / 86400000)
  }

  const lines = [
    `${emoji} *${tier_uc} — REMATE LIMA*`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    esc(`💰  ${pricePen ? 'S/ ' + pricePen.toLocaleString('es-PE') + '  ≈  ' : ''}$${priceUsd.toLocaleString('es-PE')} USD`),
    esc(`💱  TC: S/ ${tc} x USD`),
    esc(`📍  ${district}, Lima`),
    esc(`${typeEmoji}  ${tipo}${fase ? ' · ' + fase : ''}`),
    auction.area_m2 ? esc(`📐  ${auction.area_m2} m²`) : null,
    auction.auction_date ? esc(`📅  Remate: ${auction.auction_date}${days !== null ? ` (${days} días)` : ''}`) : null,
    esc(`📋  ${auction.title || 'Remate REMAJU'}`),
    '',
    '[🔗 Ver en REMAJU](https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml)'
  ].filter(l => l !== null).join('\n')

  return sendMessage(lines, 'MarkdownV2', false)
}

async function sendDigest (auctions, stats = {}) {
  const tierCount = { super_ganga: 0, muy_bueno: 0, bueno: 0, aceptable: 0 }
  auctions.forEach(a => { if (a.price_usd_tier && tierCount[a.price_usd_tier] !== undefined) tierCount[a.price_usd_tier]++ })

  const date  = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
  const top3  = auctions.filter(a => a.price_usd).sort((a, b) => a.price_usd - b.price_usd).slice(0, 3)

  const lines = [
    `📊 *RESUMEN DIARIO REMAJU*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    esc(date),
    '',
    esc(`*${auctions.length} nuevas propiedades < $90k USD*`),
    '',
    tierCount.super_ganga ? esc(`🔴 Super Ganga (< $40k): ${tierCount.super_ganga}`) : null,
    tierCount.muy_bueno   ? esc(`🟠 Muy Bueno  ($40-60k): ${tierCount.muy_bueno}`)   : null,
    tierCount.bueno       ? esc(`🟡 Bueno      ($60-75k): ${tierCount.bueno}`)       : null,
    tierCount.aceptable   ? esc(`🟢 Aceptable  ($75-90k): ${tierCount.aceptable}`)   : null,
    top3.length ? '' : null,
    top3.length ? '*🏆 Top 3 más económicas:*' : null,
    ...top3.map((a, i) => esc(`${i + 1}. $${Math.round(a.price_usd).toLocaleString('es-PE')} — ${a.location_district || 'Lima'}`)),
    '',
    stats.pagesScraped ? esc(`_Páginas: ${stats.pagesScraped} | ${Math.round((stats.durationMs || 0) / 60000)} min_`) : null
  ].filter(l => l !== null).join('\n')

  return sendMessage(lines, 'MarkdownV2')
}

async function sendError (message) {
  const text = esc(`⚠️ REMAJU Monitor — Error\n${message}`)
  return sendMessage(text, 'MarkdownV2')
}

async function sendMessage (text, parseMode = 'MarkdownV2', webPreview = true) {
  if (!TOKEN || !CHAT_ID) {
    logger.warn('Telegram no configurado (TOKEN o CHAT_ID faltante)')
    return null
  }
  try {
    const res = await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode:                parseMode,
      disable_web_page_preview: !webPreview
    })
    logger.info('Telegram enviado', { message_id: res.data.result.message_id })
    return res.data.result
  } catch (err) {
    const errData = err.response?.data
    logger.error('Error enviando Telegram', { error: err.message, telegram: errData })
    // Fallback sin formato si hay error de parsing
    if (errData?.description?.includes('parse entities')) {
      const plain = text.replace(/[*_`\[\]()~>#+=|{}.!\\]/g, '')
      return sendMessage(plain, undefined, webPreview)
    }
    return null
  }
}

module.exports = { sendAlert, sendDigest, sendError, sendMessage, esc }
