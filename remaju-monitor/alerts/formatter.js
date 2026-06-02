// Formateador de mensajes Telegram para alertas REMAJU

const TIER_EMOJI = {
  super_ganga: '🔴',
  muy_bueno:   '🟠',
  bueno:       '🟡',
  aceptable:   '🟢'
}

const TIER_LABEL = {
  super_ganga: 'SUPER GANGA',
  muy_bueno:   'MUY BUENO',
  bueno:       'BUENO',
  aceptable:   'ACEPTABLE'
}

const TYPE_EMOJI = {
  casa:         '🏠',
  departamento: '🏢',
  terreno:      '🌿',
  local:        '🏪',
  otro:         '🏗️'
}

function formatCurrency (amount, currency = 'USD') {
  if (!amount) return 'N/D'
  return new Intl.NumberFormat('es-PE', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(amount)
}

function daysUntil (dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function buildPropertyMessage (auction) {
  const tier      = auction.price_usd_tier || 'aceptable'
  const emoji     = TIER_EMOJI[tier] || '🟢'
  const label     = TIER_LABEL[tier] || ''
  const typeEmoji = TYPE_EMOJI[auction.property_type] || '🏗️'
  const days      = daysUntil(auction.auction_date)

  const priceUsd = auction.price_usd ? formatCurrency(auction.price_usd, 'USD') : 'N/D'
  const pricePen = auction.price_original && auction.currency_original === 'PEN'
    ? formatCurrency(auction.price_original, 'PEN') : null

  const priceStr = pricePen
    ? `${pricePen}  ≈  *${priceUsd}*`
    : `*${priceUsd}*`

  let lines = []
  lines.push(`${emoji} *REMATE LIMA — ${label}*`)
  lines.push('━━━━━━━━━━━━━━━━━━━━━━')
  lines.push(`💰  ${priceStr}`)

  if (auction.exchange_rate) {
    lines.push(`💱  TC: S/ ${auction.exchange_rate.toFixed(2)} por USD`)
  }

  if (auction.location_district) {
    lines.push(`📍  ${auction.location_district}, Lima`)
  } else if (auction.location_department) {
    lines.push(`📍  ${auction.location_department}`)
  }

  lines.push(`${typeEmoji}  ${capitalizeFirst(auction.property_type || 'Inmueble')}${auction.auction_phase ? ' · ' + formatPhase(auction.auction_phase) : ''}`)

  if (auction.area_m2) {
    const priceM2 = auction.price_usd ? Math.round(auction.price_usd / auction.area_m2) : null
    lines.push(`📐  ${auction.area_m2} m²${priceM2 ? ` · $${priceM2}/m²` : ''}`)
  }

  if (auction.expediente) {
    lines.push(`📋  Exp: \`${auction.expediente}\``)
  }

  if (auction.juzgado) {
    lines.push(`⚖️  ${auction.juzgado}`)
  }

  if (auction.auction_date) {
    const dateFormatted = new Date(auction.auction_date + 'T00:00:00').toLocaleDateString('es-PE', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
    const urgencyTag = days !== null && days <= 7 ? ` ⚡ ¡En ${days} días!` : days !== null ? ` (${days} días)` : ''
    lines.push(`📅  Remate: ${dateFormatted}${urgencyTag}`)
  }

  if (auction.detail_url) {
    lines.push(``)
    lines.push(`[🔗 Ver detalle en REMAJU](${auction.detail_url})`)
  }

  // Hashtags por tier y distrito
  const tags = [`#${tier}`, `#Lima`]
  if (auction.property_type) tags.push(`#${auction.property_type}`)
  if (auction.location_district) {
    tags.push('#' + auction.location_district.replace(/\s+/g, ''))
  }
  lines.push(``)
  lines.push(tags.join(' '))

  return lines.join('\n')
}

function buildDigestMessage (auctions, runStats = {}) {
  const total     = auctions.length
  const byTier    = groupBy(auctions, 'price_usd_tier')
  const superGangas = (byTier.super_ganga || []).length
  const muyBuenos   = (byTier.muy_bueno   || []).length
  const buenos      = (byTier.bueno       || []).length
  const aceptables  = (byTier.aceptable   || []).length

  const lines = []
  lines.push(`📊 *RESUMEN DIARIO REMAJU*`)
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`🗓  ${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}`)
  lines.push(``)
  lines.push(`*Nuevas propiedades encontradas: ${total}*`)
  lines.push(``)
  if (superGangas) lines.push(`🔴 Super Ganga (< $40k): ${superGangas}`)
  if (muyBuenos)   lines.push(`🟠 Muy Bueno  ($40-60k): ${muyBuenos}`)
  if (buenos)      lines.push(`🟡 Bueno      ($60-75k): ${buenos}`)
  if (aceptables)  lines.push(`🟢 Aceptable  ($75-90k): ${aceptables}`)

  if (runStats.pagesScraped) {
    lines.push(``)
    lines.push(`_Páginas revisadas: ${runStats.pagesScraped} | Duración: ${Math.round((runStats.durationMs || 0) / 60000)} min_`)
  }

  // Top 3 propiedades más baratas
  const top3 = auctions
    .filter(a => a.price_usd)
    .sort((a, b) => a.price_usd - b.price_usd)
    .slice(0, 3)

  if (top3.length) {
    lines.push(``)
    lines.push(`*🏆 Top 3 más económicas:*`)
    top3.forEach((a, i) => {
      const usd = formatCurrency(a.price_usd, 'USD')
      const dist = a.location_district || a.location_department || 'Lima'
      lines.push(`${i + 1}. ${usd} — ${capitalizeFirst(a.property_type)} en ${dist}`)
    })
  }

  return lines.join('\n')
}

function buildErrorMessage (error, context = '') {
  return [
    `⚠️ *REMAJU Monitor — Error*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    context ? `Contexto: ${context}` : '',
    `Error: \`${error}\``,
    ``,
    `_${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}_`
  ].filter(Boolean).join('\n')
}

function formatPhase (phase) {
  if (!phase) return ''
  if (phase.includes('PRIMERA') || phase.includes('1RA')) return '1ra Convocatoria'
  if (phase.includes('SEGUNDA') || phase.includes('2DA')) return '2da Convocatoria ↓15%'
  if (phase.includes('TERCERA') || phase.includes('3RA')) return '3ra Convocatoria ↓30%'
  return phase
}

function capitalizeFirst (str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function groupBy (arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'unknown'
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}

module.exports = { buildPropertyMessage, buildDigestMessage, buildErrorMessage }
