FROM node:22-slim

# Dependencias del sistema para Playwright/Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# Credenciales configuradas como variables de entorno en EasyPanel — no hardcodear aquí
# PROXY_SERVER, PROXY_USERNAME, PROXY_PASSWORD
# ADMIN_TELEGRAM_TOKEN, ADMIN_TELEGRAM_CHAT_ID
# SUPABASE_URL, SUPABASE_SERVICE_KEY
# PAYMENT_PRICE_SOLES, PAYMENT_YAPE, PAYMENT_PLIN, PAYMENT_ADMIN_NAME

WORKDIR /app

RUN mkdir -p /app/data

COPY package.json .
RUN npm install --omit=dev

ARG CACHEBUST=6
COPY src/ ./src/

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["sh", "-c", "echo '177.54.156.39 p.webshare.io' >> /etc/hosts && node src/server.js"]
