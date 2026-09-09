# LeaDi-PDS · WA Gateway

Gateway kecil berbasis **whatsapp-web.js** agar LeaDi-PDS bisa mengirim
notifikasi WhatsApp ke admin saat ada **pendaftaran akun baru**.

## Cara jalan (lokal / VPS)

```bash
cd wa-server
npm install
# opsional: set WA_API_KEY biar endpoint /send tidak terbuka bebas
node server.js
```

1. Buka `http://localhost:3010/qr` → **scan** dengan WhatsApp di HP
   (WhatsApp › Perangkat Tertaut › Tautkan perangkat).
2. Setelah status "Terhubung", gateway siap menerima `POST /send`.

Sesi login tersimpan di folder `.wwebjs_auth/` (tidak perlu scan ulang selama folder ini ada).

## Endpoint

| Method | Path      | Keterangan |
| ------ | --------- | ---------- |
| GET    | `/`       | Status ringkas |
| GET    | `/status` | `{ ready, me }` |
| GET    | `/qr`     | Halaman QR untuk menautkan |
| POST   | `/send`   | Body `{ "number": "62...", "message": "..." }` |

Jika `WA_API_KEY` diisi, `/send` wajib header `Authorization: Bearer <key>`.

## Menyambungkan ke LeaDi-PDS

Set environment variable pada server LeaDi-PDS (server.js):

| Env | Contoh | Fungsi |
| --- | ------ | ------ |
| `WA_API_URL` | `http://127.0.0.1:3010/send` | Alamat endpoint gateway |
| `WA_ADMIN_NUMBER` | `6282345779247` | Nomor admin penerima (boleh dipisah koma) |
| `WA_API_KEY` | *(opsional)* | Sama dengan key di gateway bila dipakai |

Jika `WA_API_URL` kosong, LeaDi-PDS jalan normal tanpa kirim WA.

## Deploy di VPS (Coolify/Docker)

whatsapp-web.js butuh Chromium. Sudah disediakan **Dockerfile** (base Debian + Chromium).

### Langkah di Coolify

1. **New Resource → Application** dari repo GitHub `leadi-pds`.
2. **Build Pack: Dockerfile**, dan set **Base Directory / Dockerfile location** ke folder `wa-server` (agar `wa-server/Dockerfile` yang dipakai).
3. **Port**: `3010` (Ports Exposes = `3010`).
4. **Environment variables** (opsional):
   - `WA_API_KEY` — bila ingin mengamankan endpoint `/send`.
   - `PUPPETEER_EXECUTABLE_PATH` — sudah default `/usr/bin/chromium` di image.
5. **Persistent Storage** — WAJIB agar tidak scan ulang tiap redeploy:
   - Destination Path: `/app/.wwebjs_auth`
6. Beri **domain** (mis. `wa.lessonstudy.online`) atau akses lewat IP:port.
7. Deploy → buka `https://wa.domain/qr` → **scan** dengan WhatsApp.

### Sambungkan ke LeaDi-PDS

Pada aplikasi **LeaDi-PDS** di Coolify, set env:

- `WA_API_URL` = `https://wa.domain/send` (atau `http://<nama-service>:3010/send` bila satu jaringan Coolify)
- `WA_ADMIN_NUMBER` = `6282345779247`
- `WA_API_KEY` = (samakan bila diaktifkan di gateway)

Lalu **Redeploy** LeaDi-PDS.

> Catatan: container jalan sebagai root dengan `--no-sandbox` (sudah diatur). Pastikan Persistent Storage `/app/.wwebjs_auth` aktif agar sesi WhatsApp bertahan.
