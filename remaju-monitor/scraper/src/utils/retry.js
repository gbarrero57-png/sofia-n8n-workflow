const logger = require('./logger')

async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry (fn, { attempts = 3, baseDelay = 5000, label = 'operation' } = {}) {
  let lastError
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < attempts) {
        const delay = baseDelay * i
        logger.warn(`${label} falló (intento ${i}/${attempts}), reintentando en ${delay}ms`, { error: err.message })
        await sleep(delay)
      }
    }
  }
  throw lastError
}

async function humanDelay (min = 1500, max = 3500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min
  await sleep(ms)
}

module.exports = { sleep, withRetry, humanDelay }
