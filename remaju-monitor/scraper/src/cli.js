// CLI para probar el scraper manualmente sin levantar el servidor
require('dotenv').config()

const RemajuScraper  = require('./scrapers/remaju/index')
const { getExchangeRate, convertToUsd } = require('./processors/currency')
const { determineTier, isLimaProperty } = require('./processors/normalizer')
const logger = require('./utils/logger')

async function main () {
  const mode     = process.argv[2] || 'delta'
  const maxPages = parseInt(process.argv[3]) || 3

  logger.info('Iniciando scraping manual', { mode, maxPages })

  try {
    const rateData = await getExchangeRate()
    logger.info('Tipo de cambio', { usd_to_pen: rateData.usd_to_pen })

    const scraper = new RemajuScraper()
    const result  = await scraper.scrape(
      { maxPages, deltaMode: mode === 'delta' },
      new Set()
    )

    // Enriquecer con USD, filtrar Lima y precio
    const enriched = result.data
      .map(r => {
        if (r.currency_original === 'PEN' && !r.price_usd) {
          r.price_usd = convertToUsd(r.price_original, rateData.usd_to_pen)
        }
        r.exchange_rate  = rateData.usd_to_pen
        r.price_usd_tier = r.price_usd ? determineTier(r.price_usd) : null
        return r
      })
      .filter(r => r.price_usd && r.price_usd <= 90000)
      .filter(r => r.location_department === 'LIMA' || r.location_department === 'CALLAO')
      .sort((a, b) => a.price_usd - b.price_usd)

    const allLima = result.data.filter(r => r.location_department === 'LIMA' || r.location_department === 'CALLAO')

    console.log('\n══════════════════════════════════════════════')
    console.log(`SCRAPEADOS: ${result.recordsFound} remates en ${result.pagesScraped} páginas`)
    console.log(`EN LIMA/CALLAO: ${allLima.length}`)
    console.log(`CALIFICAN (< $90k): ${enriched.length}`)
    console.log('══════════════════════════════════════════════\n')

    enriched.forEach((r, i) => {
      const usd  = `$${Math.round(r.price_usd).toLocaleString('es-PE')}`
      const pen  = r.currency_original === 'PEN' ? ` (S/ ${Math.round(r.price_original).toLocaleString('es-PE')})` : ''
      console.log(`${i + 1}. [${(r.price_usd_tier || '').toUpperCase()}] ${usd}${pen}`)
      console.log(`   Tipo: ${r.property_type} | Distrito: ${r.location_district || 'no detectado'}`)
      console.log(`   Título: ${r.title}`)
      if (r.auction_phase) console.log(`   Fase: ${r.auction_phase}`)
      if (r.auction_date)  console.log(`   Fecha remate: ${r.auction_date}`)
      console.log()
    })

    console.log(`TC usado: 1 USD = S/ ${rateData.usd_to_pen}`)

  } catch (err) {
    logger.error('Error en CLI', { error: err.message, stack: err.stack })
    process.exit(1)
  }

  process.exit(0)
}

main()
