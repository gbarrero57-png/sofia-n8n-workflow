const { getBrowser, newContext } = require('../../browser/manager')
const { navigateAndScrape }     = require('./navigator')
const { normalizeRecord }       = require('../../processors/normalizer')
const logger                    = require('../../utils/logger')

class RemajuScraper {
  constructor () {
    this.source = 'remaju'
  }

  async scrape (filters = {}, knownIds = new Set()) {
    const browser = await getBrowser()
    const context = await newContext(browser)
    const page    = await context.newPage()

    // Bloquear recursos innecesarios para acelerar scraping
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico}', route => route.abort())
    await page.route('**/analytics**', route => route.abort())
    await page.route('**/gtag**', route => route.abort())

    try {
      const { records, pagesScraped, totalRecords } = await navigateAndScrape(page, filters, knownIds)

      // Normalizar todos los registros
      const normalized = records.map(r => normalizeRecord(r, this.source))
        .filter(r => r !== null)

      logger.info('Registros normalizados', {
        raw: records.length,
        normalized: normalized.length,
        dropped: records.length - normalized.length
      })

      return {
        source:       this.source,
        pagesScraped,
        totalRecords,
        recordsFound: normalized.length,
        data:         normalized
      }
    } finally {
      await page.close()
      await context.close()
    }
  }

  async checkHealth () {
    try {
      const browser = await getBrowser()
      return browser.isConnected()
    } catch {
      return false
    }
  }
}

module.exports = RemajuScraper
