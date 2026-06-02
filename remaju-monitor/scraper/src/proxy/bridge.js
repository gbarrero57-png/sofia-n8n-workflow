/**
 * proxy-bridge.js
 * Minimal HTTP CONNECT proxy en localhost:8877
 * Recibe CONNECT de Chromium y abre SOCKS5 con auth a Webshare.
 */
const net    = require('net')
const { SocksClient } = require('socks')
const logger = require('../utils/logger')

let _localProxyUrl = null
let _server = null

async function startProxyBridge () {
  const upstream = process.env.PROXY_SERVER
  const user     = process.env.PROXY_USERNAME
  const pass     = process.env.PROXY_PASSWORD

  if (!upstream || !user || !pass) return null

  const upstreamUrl = new URL(upstream)
  const socksHost   = upstreamUrl.hostname
  const socksPort   = parseInt(upstreamUrl.port) || 1080
  const localPort   = parseInt(process.env.PROXY_BRIDGE_PORT) || 8877

  _server = net.createServer((clientSocket) => {
    let buffer     = Buffer.alloc(0)
    let headerDone = false

    const onData = (chunk) => {
      if (headerDone) return
      buffer = Buffer.concat([buffer, chunk])
      const idx = buffer.indexOf('\r\n\r\n')
      if (idx === -1) return

      headerDone = true
      clientSocket.removeListener('data', onData)
      clientSocket.pause()

      const header    = buffer.slice(0, idx).toString()
      const remainder = buffer.slice(idx + 4) // bytes after CONNECT headers
      const firstLine = header.split('\r\n')[0]
      const match     = firstLine.match(/^CONNECT ([^:]+):(\d+) HTTP/)

      if (!match) {
        clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        clientSocket.destroy()
        return
      }

      const destHost = match[1]
      const destPort = parseInt(match[2])

      SocksClient.createConnection({
        proxy: {
          host:     socksHost,
          port:     socksPort,
          type:     5,
          userId:   user,
          password: pass
        },
        command:     'connect',
        destination: { host: destHost, port: destPort }
      })
        .then(({ socket: socksSocket }) => {
          clientSocket.write('HTTP/1.1 200 Connection established\r\n\r\n')

          // Forward any bytes that arrived after the CONNECT headers
          if (remainder.length > 0) socksSocket.write(remainder)

          clientSocket.pipe(socksSocket)
          socksSocket.pipe(clientSocket)
          clientSocket.resume()

          clientSocket.on('error', () => socksSocket.destroy())
          socksSocket.on('error', () => clientSocket.destroy())
        })
        .catch((err) => {
          logger.warn('SOCKS5 connect failed', { dest: `${destHost}:${destPort}`, error: err.message })
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
          clientSocket.destroy()
        })
    }

    clientSocket.on('data', onData)
    clientSocket.on('error', () => {})
  })

  await new Promise((resolve, reject) => {
    _server.listen(localPort, '127.0.0.1', resolve)
    _server.on('error', reject)
  })

  _localProxyUrl = `http://localhost:${localPort}`
  logger.info('Proxy bridge iniciado', { local: _localProxyUrl, socks: `${socksHost}:${socksPort}` })
  return _localProxyUrl
}

function getLocalProxyUrl () {
  return _localProxyUrl
}

// Test directo SOCKS5 → host:port (para diagnóstico)
async function testSocksConnect (host, port) {
  const user     = process.env.PROXY_USERNAME
  const pass     = process.env.PROXY_PASSWORD
  const upstream = new URL(process.env.PROXY_SERVER || 'socks5://p.webshare.io:1080')

  const { socket } = await SocksClient.createConnection({
    proxy: {
      host:     upstream.hostname,
      port:     parseInt(upstream.port) || 1080,
      type:     5,
      userId:   user,
      password: pass
    },
    command:     'connect',
    destination: { host, port }
  })
  socket.destroy()
}

module.exports = { startProxyBridge, getLocalProxyUrl, testSocksConnect }
