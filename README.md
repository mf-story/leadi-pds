# LeaDi-PDS

**Lesson Study Digital Platform berbasis Plan-Do-See** — platform digital untuk memperkuat praktik pembelajaran berbasis bukti di Sekolah Menengah Pertama (SMP), sesuai *BluePrint_LeaDi-PDS.pdf*.

Aplikasi web multi-pengguna yang mengintegrasikan seluruh siklus Lesson Study (**Plan → Do → See**) beserta **Repositori Praktik Baik** untuk replikasi dan diseminasi antar sekolah.

## Teknologi
- **Backend + Database:** `server.js` (Node.js, hanya modul bawaan — tanpa npm). Data tersimpan sebagai JSON di `data/db.json`, berkas unggahan di `uploads/`.
- **Frontend:** PWA vanilla (`index.html`, `style.css`, `app.js`) — bisa dipasang di HP/desktop, mendukung offline untuk aset.
- Arsitektur modular sesuai blueprint: **Frontend · Backend · Database**.

## Peran Pengguna
| Peran | Kemampuan |
|------|-----------|
| **Guru SMP** | Merancang pembelajaran, membuat & mengelola siklus, pelaksana open class, reflektor. |
| **Dosen Pendamping** | Fasilitator akademik, melihat semua siklus, menyunting siklus yang diikuti, mengarahkan refleksi. |
| **Observer** | Mengamati pembelajaran & memberi umpan balik (observasi/refleksi) pada siklus yang diikuti. |
| **Admin Sistem** | Mengelola pengguna, data, dan akses. |

## Empat Modul Inti
1. **Plan** — tujuan pembelajaran, lesson design, unggah perangkat pembelajaran (RPP/LKPD/media), diskusi perencanaan kolaboratif.
2. **Do** — tanggal pelaksanaan, unggah **video** pembelajaran atau **tautan** (YouTube/Drive), catatan observasi.
3. **See** — analisis pembelajaran berbasis data, rekomendasi perbaikan, refleksi kolaboratif.
4. **Repositori Praktik Baik** — hasil Lesson Study terbaik yang dapat diakses & direplikasi semua pengguna.

Alur kerja: **Plan → Do → See → (terbitkan) Praktik Baik.**

## Cara Menjalankan
Prasyarat: **Node.js** terpasang.

1. (Opsional) Buat data contoh + akun demo:
   ```
   node seed.js
   ```
2. Jalankan server (atau klik dua kali **`Jalankan Server.bat`**):
   ```
   node server.js
   ```
3. Buka di browser:
   - Komputer: `http://localhost:8095`
   - HP (satu Wi-Fi): `http://IP-LAN-komputer:8095` (alamat ditampilkan saat server start)

### Akun demo (setelah `node seed.js`)
Kata sandi = **username + 123**.

| Username | Peran |
|----------|-------|
| `admin` | Admin Sistem |
| `dosen` | Dosen Pendamping |
| `guru` | Guru SMP (pemilik contoh siklus) |
| `observer` | Observer |
| `guru2` | Guru SMP lain |

> Tanpa `seed.js`, server otomatis membuat satu akun **`admin` / `admin123`**.

## Struktur Berkas
```
server.js                 Backend + API + Database (JSON)
index.html / style.css / app.js   Frontend PWA
manifest.webmanifest / service-worker.js / icon.svg   PWA
seed.js                   Pembuat data contoh
Jalankan Server.bat       Peluncur cepat (Windows)
data/db.json              Database (dibuat otomatis)
uploads/                  Berkas perangkat & video
```

## Keamanan
- Kata sandi di-hash dengan **scrypt** (salt unik per pengguna).
- Sesi memakai token Bearer (kedaluwarsa 12 jam).
- Otorisasi per peran divalidasi di sisi server pada setiap endpoint.

## Catatan
- Video besar (hingga 200 MB) diunggah sebagai berkas; streaming mendukung *range request* (seek).
- Untuk akses online/HTTPS (agar bisa dipasang sebagai PWA di HP dari luar jaringan) dapat memakai Cloudflare Tunnel atau reverse proxy — mengikuti pola proyek lain di workspace ini.
