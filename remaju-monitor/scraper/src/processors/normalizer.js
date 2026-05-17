const { createHash } = require('crypto')

const PROPERTY_TYPE_MAP = {
  'DEPARTAMENTO': 'departamento', 'DEPTO': 'departamento', 'DPTO': 'departamento', 'FLAT': 'departamento',
  'CASA': 'casa', 'VIVIENDA': 'casa', 'INMUEBLE': 'casa',
  'TERRENO': 'terreno', 'LOTE': 'terreno', 'SOLAR': 'terreno', 'PREDIO': 'terreno',
  'LOCAL COMERCIAL': 'local', 'LOCAL': 'local', 'TIENDA': 'local', 'OFICINA': 'local'
}

// Distritos de Lima y Callao para detección
const LIMA_DISTRICTS = [
  'CARABAYLLO','COMAS','INDEPENDENCIA','LOS OLIVOS','PUENTE PIEDRA','SAN MARTIN DE PORRES','SMP',
  'ANCÓN','SANTA ROSA','ANCON',
  'ATE','CHACLACAYO','CIENEGUILLA','EL AGUSTINO','LA MOLINA','LURIGANCHO','SAN JUAN DE LURIGANCHO','SJL',
  'SANTA ANITA',
  'BARRANCO','CHORRILLOS','LURÍN','LURIN','PACHACAMAC','PUCUSANA','PUNTA HERMOSA','PUNTA NEGRA',
  'SAN BARTOLO','SANTA MARIA DEL MAR','VILLA EL SALVADOR','VES','VILLA MARIA DEL TRIUNFO',
  'BREÑA','LIMA CERCADO','CERCADO DE LIMA','LA VICTORIA','LINCE','PUEBLO LIBRE','RIMAC','RÍMAC',
  'SAN BORJA','SAN ISIDRO','SAN LUIS','SAN MIGUEL','SANTIAGO DE SURCO','SURCO','SURQUILLO',
  'JESÚS MARÍA','JESUS MARIA','MAGDALENA DEL MAR','MAGDALENA','MIRAFLORES',
  'CALLAO','BELLAVISTA','CARMEN DE LA LEGUA','LA PERLA','VENTANILLA'
]

function detectPropertyType (text) {
  if (!text) return 'otro'
  const upper = text.toUpperCase()
  for (const [key, val] of Object.entries(PROPERTY_TYPE_MAP)) {
    if (upper.includes(key)) return val
  }
  return 'otro'
}

function detectLimaDistrict (text) {
  if (!text) return null
  const upper = text.toUpperCase()
  if (upper.includes('LIMA')) return 'LIMA'
  for (const d of LIMA_DISTRICTS) {
    if (upper.includes(d)) return d
  }
  return null
}

function isLimaProperty (record) {
  // Only use location_raw — descriptions mention "Lima" for legal references (Zona Registral, SUNARP)
  // which causes false positives for properties physically outside Lima
  const locRaw = (record.location_raw || '').toUpperCase()
  if (locRaw.includes('LIMA') || locRaw.includes('CALLAO')) return true
  return LIMA_DISTRICTS.some(d => locRaw.includes(d))
}

function extractAreaM2 (text) {
  if (!text) return null
  const match = text.match(/(\d+(?:[,\.]\d+)?)\s*(?:m[\s²2]|metros?\s*cuadrados?)/i)
  if (!match) return null
  return parseFloat(match[1].replace(',', '.'))
}

function determineTier (priceUsd) {
  if (priceUsd < 40000)  return 'super_ganga'
  if (priceUsd < 60000)  return 'muy_bueno'
  if (priceUsd < 75000)  return 'bueno'
  if (priceUsd <= 90000) return 'aceptable'
  return 'fuera_rango'
}

function makeId (source, externalId) {
  return createHash('sha256')
    .update(`${source}::${externalId}`)
    .digest('hex')
    .substring(0, 32)
}

function normalizeRecord (raw, source = 'remaju') {
  try {
    if (!raw.price_original || isNaN(raw.price_original)) return null

    const now       = new Date().toISOString()
    const allText   = raw.raw_text || raw.description || ''
    const propType  = detectPropertyType(allText)
    const district  = detectLimaDistrict(raw.location_raw || allText)
    const areaM2    = extractAreaM2(allText)

    // Usar remate_num como external_id — es el identificador oficial del portal
    const externalId = raw.remate_num
      ? `REMAJU-${raw.remate_num}`
      : raw.external_id

    return {
      id:                  makeId(source, externalId),
      source,
      external_id:         externalId,
      expediente:          null,   // se obtiene en la vista de detalle (fase 2)
      juzgado:             null,
      title:               `Remate N° ${raw.remate_num || '?'} - ${raw.convocatoria || ''}`.trim(),
      description:         (raw.description || allText).substring(0, 600),
      property_type:       propType,
      property_type_raw:   null,
      location_department: isLimaProperty(raw) ? 'LIMA' : null,
      location_province:   isLimaProperty(raw) ? 'LIMA' : null,
      location_district:   district,
      location_raw:        raw.location_raw || null,
      area_m2:             areaM2,
      price_original:      raw.price_original,
      currency_original:   raw.currency_original || 'PEN',
      exchange_rate:       null,
      price_usd:           raw.currency_original === 'USD' ? raw.price_original : null,
      price_usd_tier:      null,
      auction_phase:       raw.auction_phase || null,
      auction_date:        raw.auction_date  || null,
      detail_url:          null,
      images:              '[]',
      raw_data:            JSON.stringify({ remate_num: raw.remate_num, location: raw.location_raw }),
      price_history:       '[]',
      first_seen_at:       now,
      last_seen_at:        now,
      status:              'active',
      alerted:             0,
      alert_count:         0
    }
  } catch {
    return null
  }
}

module.exports = { normalizeRecord, determineTier, makeId, isLimaProperty }
