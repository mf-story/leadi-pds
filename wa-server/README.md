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

whatsapp-web.js butuh Chromium. Contoh env untuk memakai Chromium sistem:

```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

Pastikan folder `.wwebjs_auth/` dipetakan ke **persistent storage** agar sesi tidak hilang saat redeploy.
