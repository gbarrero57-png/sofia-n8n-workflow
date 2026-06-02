const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const logger = require('../utils/logger')

chromium.use(StealthPlugin())

let _browser = null

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu'
]

async function getBrowser () {
  if (_browser && _browser.isConnected()) return _browser

  logger.info('Iniciando browser Chromium con stealth...')
  const launchOpts = {
    headless: process.env.BROWSER_HEADLESS !== 'false',
    args: BROWSER_ARGS
  }
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  _browser = await chromium.launch(launchOpts)

  _browser.on('disconnected', () => {
    logger.warn('Browser desconectado')
    _browser = null
  })

  logger.info('Browser listo')
  return _browser
}

async function newContext (browser) {
  const ctxOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive'
    }
  }

  // HTTP proxy con auth nativa (iproyal.com residential)
  const proxyServer = process.env.PROXY_SERVER
  const proxyUser   = process.env.PROXY_USERNAME
  const proxyPass   = process.env.PROXY_PASSWORD
  if (proxyServer && proxyUser) {
    ctxOpts.proxy = { server: proxyServer, username: proxyUser, password: proxyPass }
    logger.info('Proxy configurado', { server: proxyServer })
  }

  return browser.newContext(ctxOpts)
}

async function closeBrowser () {
  if (_browser) {
    await _browser.close()
    _browser = null
    logger.info('Browser cerrado')
  }
}

module.exports = { getBrowser, newContext, closeBrowser }
