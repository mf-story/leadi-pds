# WA Gateway LeaDi-PDS — image dengan Chromium untuk whatsapp-web.js
FROM node:20-slim

# Pakai Chromium sistem (jangan unduh Chromium bawaan puppeteer)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WA_PORT=3010 \
    NODE_ENV=production

# Dependensi Chromium headless
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
      libgtk-3-0 libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
      libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxshmfence1 \
      libxfixes3 libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependensi Node (tanpa mengunduh Chromium)
COPY package.json ./
RUN npm install --omit=dev

# Kode aplikasi
COPY . .

# Sesi login WhatsApp disimpan di sini — petakan ke Persistent Storage di Coolify
VOLUME ["/app/.wwebjs_auth"]

EXPOSE 3010
CMD ["node", "server.js"]
