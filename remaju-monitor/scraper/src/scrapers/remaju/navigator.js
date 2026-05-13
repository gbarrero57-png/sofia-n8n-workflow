const logger      = require('../../utils/logger')
const { humanDelay, withRetry } = require('../../utils/retry')
const { extractPage, hasNextPage, getTotalRecords } = require('./extractor')

const REMAJU_URL = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml'
const TIMEOUT    = parseInt(process.env.SCRAPER_PAGE_TIMEOUT_MS) || 30000

async function navigateAndScrape (page, filters = {}, knownIds = new Set()) {
  const {
    maxPages  = parseInt(process.env.SCRAPER_MAX_PAGES) || 500,
    deltaMode = true
  } = filters

  const allRecords = []
  let pagesScraped = 0

  logger.info('Navegando a REMAJU...', { url: REMAJU_URL })

  await withRetry(async () => {
    await page.goto(REMAJU_URL, { waitUntil: 'networkidle', timeout: 60000 })
  }, { label: 'goto REMAJU' })

  await page.waitForSelector('.ui-datagrid-column', { timeout: TIMEOUT })
  await humanDelay(2000, 3000)

  // Intentar cambiar a 12 items por página (sin CAPTCHA — es control del paginador)
  await setPageSize(page, 12)
  await humanDelay(2000, 3000)

  const total = await getTotalRecords(page)
  logger.info('Página cargada', { totalRecords: total })

  // ── LOOP DE PAGINACIÓN ─────────────────────────────────────
  let stopEarly    = false
  let currentPage  = 1

  while (pagesScraped < maxPages && !stopEarly) {
    logger.info(`Extrayendo página ${currentPage}...`)

    const pageRecords = await withRetry(
      () => extractPage(page),
      { label: `extractPage(${currentPage})` }
    )

    if (!pageRecords.length) {
      logger.warn('Página sin tarjetas, deteniendo')
      break
    }

    pagesScraped++

    for (const record of pageRecords) {
      if (deltaMode && knownIds.has(record.external_id)) {
        logger.info('Modo delta: remate ya conocido, deteniendo', { id: record.external_id })
        stopEarly = true
        break
      }
      allRecords.push(record)
    }

    if (stopEarly) break

    const hasNext = await hasNextPage(page)
    if (!hasNext) {
      logger.info('No hay más páginas')
      break
    }

    try {
      await goToNextPage(page)
    } catch (err) {
      logger.warn('Error navegando a siguiente página, terminando paginación', { error: err.message })
      break
    }
    await humanDelay(2500, 4000)
    currentPage++
  }

  logger.info('Scraping completado', { pagesScraped, recordsFound: allRecords.length })
  return { records: allRecords, pagesScraped, totalRecords: total }
}

async function setPageSize (page, size) {
  try {
    // Selector confirmado por diagnóstico: el select de filas por página
    const sel = 'select[name="formBuscarRemateExterno:listaRemate_rppDD"]'
    const el  = await page.$(sel)
    if (!el) { logger.warn('No se encontró selector de tamaño de página'); return }
    await el.selectOption(String(size))
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {})
    logger.info(`Página configurada a ${size} items`)
  } catch (err) {
    logger.warn('Error configurando tamaño de página', { error: err.message })
  }
}

async function goToNextPage (page) {
  await withRetry(async () => {
    // Use page.evaluate click — same JS engine as hasNextPage, avoids race with page.$()
    const clicked = await page.evaluate(() => {
      const SELECTORS = [
        '[id*="listaRemate"] .ui-paginator-next:not(.ui-state-disabled)',
        '.ui-paginator-next:not(.ui-state-disabled)',
        '.ui-paginator-next[aria-disabled="false"]',
        '.ui-paginator-next:not([aria-disabled="true"])'
      ]
      for (const sel of SELECTORS) {
        const btn = document.querySelector(sel)
        if (btn) { btn.click(); return true }
      }
      return false
    })
    if (!clicked) throw new Error('Botón siguiente no encontrado')
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {})
    await page.waitForSelector('.ui-datagrid-column', { timeout: TIMEOUT })
  }, { label: 'goToNextPage', attempts: 2 })
}

module.exports = { navigateAndScrape }
