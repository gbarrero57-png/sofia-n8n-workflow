// Extrae datos reales de REMAJU — estructura ui-datagrid PrimeFaces
// Cada remate es un div.ui-datagrid-column.ui-g-12.ui-md-12

async function extractPage (page) {
  return page.evaluate(() => {
    const results = []

    // Selector confirmado por diagnóstico real
    const cards = document.querySelectorAll('.ui-datagrid-column.ui-g-12.ui-md-12')

    cards.forEach((card, idx) => {
      const text = card.innerText || ''
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

      // Extraer número de remate — "Remate N° 23520 - PRIMERA CONVOCATORIA"
      const remateMatch = text.match(/Remate\s+N[°º]\s*(\d+)\s*-\s*([^\n]+)/i)
      const remateNum   = remateMatch ? remateMatch[1] : null
      const convocatoria = remateMatch ? remateMatch[2].trim() : null

      // Precio — "S/. 23,785.60" o "$ 46,645.33" o "S/. 615, 777. 23" (con espacios)
      const priceMatch = text.match(/(?:S\/\.?\s*|PEN\s*)([\d,\.\s]+)|(?:\$\s*|USD\s*)([\d,\.]+)/i)
      let priceAmount  = null
      let currency     = 'PEN'
      if (priceMatch) {
        const raw = (priceMatch[1] || priceMatch[2] || '').replace(/\s/g, '').replace(/,/g, '')
        priceAmount = parseFloat(raw)
        currency    = priceMatch[2] ? 'USD' : 'PEN'
      }

      // Fecha — "28/05/2026"
      const dateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      const auctionDate = dateMatch
        ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        : null

      // Ubicación — línea corta después de "REMATE SIMPLE" (ej: "CARABAYLLO", "MIRAFLORES")
      // El patrón real: REMATE SIMPLE\n <espacio> DISTRITO
      const locationMatch = text.match(/REMATE\s+SIMPLE\s*\n\s*([A-ZÁÉÍÓÚÑ\s]+?)(?:\n|Presentación|Primera|Segunda)/i)
      const locationRaw   = locationMatch ? locationMatch[1].trim() : null

      // Descripción completa del inmueble
      const descMatch = text.match(/(?:BIEN INMUEBLE|INMUEBLE|EL TERRENO|TERRENO|DEPARTAMENTO|CASA)(.+?)(?:Precio Base|$)/is)
      const description = descMatch ? descMatch[0].trim().substring(0, 600) : text.substring(0, 400)

      // Fase de la convocatoria (para detectar descuentos)
      const fase = convocatoria || ''
      let auctionPhase = 'PRIMERA CONVOCATORIA'
      if (/segunda/i.test(fase)) auctionPhase = 'SEGUNDA CONVOCATORIA'
      else if (/tercera/i.test(fase)) auctionPhase = 'TERCERA CONVOCATORIA'

      // Detectar LIMA en la descripción completa
      const isLima = /\bLIMA\b/.test(text.toUpperCase()) ||
                     /CARABAYLLO|MIRAFLORES|SAN ISIDRO|SURCO|BARRANCO|CHORRILLOS|LA MOLINA|SAN BORJA|MAGDALENA|PUEBLO LIBRE|JESUS MARIA|LINCE|BREÑA|RIMAC|EL AGUSTINO|ATE |LURIGANCHO|COMAS|INDEPENDENCIA|LOS OLIVOS|SAN MARTIN DE PORRES|VILLA EL SALVADOR|VILLA MARIA|LA VICTORIA|SAN MIGUEL|LURIN|PACHACAMAC|ANCON|PUNTA HERMOSA|PUNTA NEGRA|SANTA ROSA|SANTA MARIA DEL MAR|PUCUSANA|CALLAO|BELLAVISTA|VENTANILLA|LA PERLA|CARMEN DE LA LEGUA/.test(text.toUpperCase())

      results.push({
        external_id:     `REMATE-${remateNum || idx}`,
        remate_num:      remateNum,
        convocatoria,
        auction_phase:   auctionPhase,
        auction_date:    auctionDate,
        location_raw:    locationRaw,
        description,
        price_original:  priceAmount,
        currency_original: currency,
        is_lima:         isLima,
        raw_text:        text.substring(0, 800)
      })
    })

    return results
  })
}

// Detecta si hay página siguiente disponible
async function hasNextPage (page) {
  return page.evaluate(() => {
    const SELECTORS = [
      '[id*="listaRemate"] .ui-paginator-next:not(.ui-state-disabled)',
      '.ui-paginator-next:not(.ui-state-disabled)',
      '.ui-paginator-next[aria-disabled="false"]',
      '.ui-paginator-next:not([aria-disabled="true"])'
    ]
    for (const sel of SELECTORS) {
      if (document.querySelector(sel)) return true
    }
    return false
  })
}

// Total de registros en el paginador
async function getTotalRecords (page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ui-paginator-current')
    if (!el) return null
    const match = el.innerText?.match(/(\d[\d,]*)\s*(?:de|of)?\s*(\d[\d,]*)/i)
    if (match) return parseInt(match[2].replace(/,/g, ''))
    const match2 = el.innerText?.match(/(\d[\d,]+)/)
    return match2 ? parseInt(match2[1].replace(/,/g, '')) : null
  })
}

module.exports = { extractPage, hasNextPage, getTotalRecords }
