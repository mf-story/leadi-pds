# LeaDi-PDS — image untuk Coolify (tanpa dependensi npm)
FROM node:20-alpine

WORKDIR /app

# Salin seluruh berkas aplikasi (tanpa data/uploads — lihat .dockerignore)
COPY . .

ENV NODE_ENV=production
ENV PORT=8095
ENV HOST=0.0.0.0
# Data & unggahan disimpan di /data (pasang Persistent Storage ke path ini di Coolify)
ENV DATA_ROOT=/data

# Siapkan folder data agar server bisa menulis saat pertama jalan
RUN mkdir -p /data/data /data/uploads

EXPOSE 8095

CMD ["node", "server.js"]
