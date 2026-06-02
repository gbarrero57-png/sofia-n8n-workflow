const axios  = require('axios')
const logger = require('../utils/logger')

const FALLBACK_RATE = 3.72

async function fetchBCRPRate () {
  // BCRP — endpoint alternativo
  try {
    const url = 'https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json/1/1'
    const res = await axios.get(url, { timeout: 8000, headers: { 'Accept': 'application/json' } })
    const periods = res.data?.periods
    if (periods?.length) {
      const rate = parseFloat(periods[0].values[0])
      if (rate > 0) { logger.info('TC BCRP', { rate }); return rate }
    }
  } catch (e) {
    logger.warn('BCRP endpoint 1 falló', { error: e.message })
  }

  // Open Exchange Rates — sin clave, confiable
  try {
    const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 8000 })
    const rate = res.data?.rates?.PEN
    if (rate) { logger.info('TC open.er-api', { rate }); return rate }
  } catch (e) {
    logger.warn('open.er-api falló', { error: e.message })
  }

  // ExchangeRate.host — otro fallback gratuito
  try {
    const res = await axios.get('https://api.exchangerate.host/latest?base=USD&symbols=PEN', { timeout: 8000 })
    const rate = res.data?.rates?.PEN
    if (rate) { logger.info('TC exchangerate.host', { rate }); return rate }
  } catch (e) {
    logger.warn('exchangerate.host falló', { error: e.message })
  }

  logger.warn('Todas las APIs TC fallaron, usando tasa fija', { fallback: FALLBACK_RATE })
  return FALLBACK_RATE
}

function convertToUsd (amountPen, usdToPenRate) {
  if (!usdToPenRate || usdToPenRate <= 0) return null
  return Math.round((amountPen / usdToPenRate) * 100) / 100
}

async function getExchangeRate () {
  const rate = await fetchBCRPRate()
  return {
    usd_to_pen: rate,
    pen_to_usd: Math.round((1 / rate) * 100000) / 100000,
    source:     'auto'
  }
}

module.exports = { getExchangeRate, convertToUsd }
