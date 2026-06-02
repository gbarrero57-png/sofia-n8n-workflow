// Diagnóstico: navega REMAJU y vuelca el HTML real para identificar selectores correctos
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') })

const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const fs = require('fs')
const path = require('path')

chromium.use(StealthPlugin())

const REMAJU_URL = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml'

;(async () => {
  console.log('Iniciando diagnóstico REMAJU...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE'
  })
  const page = await context.newPage()

  try {
    console.log('Navegando...')
    await page.goto(REMAJU_URL, { waitUntil: 'networkidle', timeout: 60000 })
    console.log('Página cargada. Esperando 3 segundos...')
    await page.waitForTimeout(3000)

    // 1. Volcar estructura de selectores clave
    const info = await page.evaluate(() => {
      const result = {}

      // Todos los SELECT del formulario
      result.selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id, name: s.name, class: s.className,
        options: Array.from(s.options).slice(0,5).map(o => ({ val: o.value, txt: o.text }))
      }))

      // Todos los INPUT del formulario
      result.inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, value: i.value?.substring(0,30)
      })).filter(i => i.id || i.name)

      // Todos los BUTTON
      result.buttons = Array.from(document.querySelectorAll('button, input[type=submit], a.ui-button')).map(b => ({
        id: b.id, text: b.innerText?.trim()?.substring(0,30), type: b.type, onclick: b.getAttribute('onclick')?.substring(0,50)
      }))

      // Estructura de la tabla de resultados
      result.tableClasses = Array.from(document.querySelectorAll('[class*="datatable"], [class*="DataTable"], table, [class*="result"]'))
        .slice(0, 5)
        .map(el => ({ tag: el.tagName, id: el.id, class: el.className?.substring(0,80) }))

      // Primeras filas de cualquier tabla
      result.rows = Array.from(document.querySelectorAll('tr, [role="row"]'))
        .slice(0, 5)
        .map(r => ({ class: r.className?.substring(0,60), text: r.innerText?.trim()?.substring(0,100) }))

      // Texto visible en la página (primeros 2000 chars)
      result.bodyText = document.body.innerText?.substring(0, 2000)

      // Title y h1/h2
      result.title = document.title
      result.headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.innerText?.trim())

      return result
    })

    // Guardar resultado
    const outPath = path.join(__dirname, '../../../../data/diagnose_result.json')
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(info, null, 2))
    console.log(`\n✅ Diagnóstico guardado en: ${outPath}`)

    // Imprimir resumen
    console.log('\n── TÍTULO:', info.title)
    console.log('\n── HEADINGS:', info.headings?.join(' | '))
    console.log('\n── SELECTs encontrados:', info.selects?.length)
    info.selects?.forEach(s => console.log(`   [${s.id || s.name}] opciones: ${s.options?.map(o => o.txt).join(', ')}`))
    console.log('\n── BUTTONs encontrados:', info.buttons?.length)
    info.buttons?.slice(0,5).forEach(b => console.log(`   [${b.id}] "${b.text}"`))
    console.log('\n── TABLAs/DataTables:', info.tableClasses?.length)
    info.tableClasses?.forEach(t => console.log(`   <${t.tag}> id="${t.id}" class="${t.class}"`))
    console.log('\n── TEXTO VISIBLE (primeros 500 chars):')
    console.log(info.bodyText?.substring(0, 500))

    // Screenshot
    const ssPath = path.join(__dirname, '../../../../data/remaju_screenshot.png')
    await page.screenshot({ path: ssPath, fullPage: false })
    console.log(`\n── Screenshot guardado en: ${ssPath}`)

  } finally {
    await browser.close()
  }
})()
