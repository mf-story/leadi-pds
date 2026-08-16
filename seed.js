// seed.js — buat data awal LeaDi-PDS (akun demo + contoh siklus Lesson Study)
// Jalankan sekali: node seed.js   (JANGAN dijalankan saat server aktif)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), s, 64).toString('hex');
  return `${s}:${derived}`;
}
function uid(p) { return p + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

if (fs.existsSync(DB_FILE)) {
  console.log('data/db.json sudah ada. Hapus dulu bila ingin membuat ulang seed. Dibatalkan.');
  process.exit(0);
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const now = Date.now();
const mk = (username, nama, role, jabatan, instansi) => ({
  id: uid('usr'), username, nama, role, jabatan, instansi,
  password: hashPassword(username + '123'), createdAt: new Date().toISOString()
});

const admin = mk('admin', 'Administrator', 'admin', 'Pengelola Sistem', 'LeaDi-PDS');
const dosen = mk('dosen', 'Dr. Andi Sukri, M.Pd.', 'dosen', 'Dosen Pendamping', 'Universitas Muhammadiyah Makassar');
const guru = mk('guru', 'Siti Nurhaliza, S.Pd.', 'guru', 'Guru Matematika', 'SMP Negeri 1 Makassar');
const observer = mk('observer', 'Ahmad Fauzi, S.Pd.', 'observer', 'Guru IPA', 'SMP Negeri 1 Makassar');
const guru2 = mk('guru2', 'Rahmawati, S.Pd.', 'guru', 'Guru IPS', 'SMP Negeri 3 Makassar');

const cycle = {
  id: uid('cyc'),
  title: 'Menemukan Konsep Pecahan melalui Benda Konkret',
  mapel: 'Matematika',
  kelas: 'VII-A',
  sekolah: 'SMP Negeri 1 Makassar',
  ownerId: guru.id,
  ownerName: guru.nama,
  memberIds: [dosen.id, observer.id],
  status: 'see',
  plan: {
    tujuan: 'Peserta didik dapat menemukan konsep pecahan sebagai bagian dari keseluruhan dan membandingkan nilai pecahan melalui aktivitas dengan benda konkret.',
    desain: 'Kegiatan diawali dengan membagi kue/kertas lipat menjadi beberapa bagian sama besar. Siswa berdiskusi dalam kelompok untuk merepresentasikan pecahan, lalu membandingkan dua pecahan menggunakan potongan. Antisipasi: sebagian siswa mungkin membagi tidak sama besar — guru mendorong siswa membandingkan luas potongan.',
    tanggalRencana: new Date(now + 3 * 86400000).toISOString().slice(0, 10),
    attachments: []
  },
  pelaksanaan: {
    tanggal: new Date(now - 2 * 86400000).toISOString().slice(0, 10),
    catatan: 'Open class berjalan lancar. Antusiasme siswa tinggi saat menggunakan kertas lipat. Diskusi kelompok 3 sempat terhambat karena bahan kurang, guru menambah bahan cadangan.',
    videoLinks: [{ id: uid('vl'), title: 'Rekaman Open Class (contoh)', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    videos: []
  },
  refleksi: {
    analisis: 'Berdasarkan lembar observasi, 80% siswa mampu merepresentasikan pecahan dengan benar. Kesulitan muncul pada membandingkan pecahan berpenyebut berbeda. Keterlibatan siswa meningkat dibanding pembelajaran konvensional.',
    rekomendasi: 'Sediakan lebih banyak variasi benda konkret. Tambahkan jembatan ke representasi simbolik secara bertahap. Alokasikan waktu diskusi kelompok lebih panjang.'
  },
  praktikBaik: { published: false, ringkasan: '', tags: [], publishedAt: null },
  entries: [
    { id: uid('ent'), phase: 'plan', type: 'diskusi', userId: dosen.id, userName: dosen.nama, role: 'dosen', fokus: '', text: 'Tujuan sudah tajam. Sarankan tambahkan pertanyaan pemantik di awal agar siswa mengaitkan dengan pengalaman sehari-hari (membagi makanan).', createdAt: now - 6 * 86400000 },
    { id: uid('ent'), phase: 'plan', type: 'diskusi', userId: guru.id, userName: guru.nama, role: 'guru', fokus: '', text: 'Setuju, saya tambahkan pemantik: "Bagaimana cara membagi 1 pizza untuk 4 orang secara adil?"', createdAt: now - 6 * 86400000 + 3600000 },
    { id: uid('ent'), phase: 'do', type: 'observasi', userId: observer.id, userName: observer.nama, role: 'observer', fokus: 'Keterlibatan siswa', text: 'Kelompok 1 dan 2 sangat aktif berdiskusi. Terlihat siswa saling mengoreksi saat membagi kertas tidak sama besar.', createdAt: now - 2 * 86400000 + 7200000 },
    { id: uid('ent'), phase: 'do', type: 'observasi', userId: dosen.id, userName: dosen.nama, role: 'dosen', fokus: 'Peran guru', text: 'Guru memberi scaffolding tepat waktu tanpa langsung memberi jawaban. Bagus.', createdAt: now - 2 * 86400000 + 7500000 },
    { id: uid('ent'), phase: 'see', type: 'refleksi', userId: guru.id, userName: guru.nama, role: 'guru', fokus: '', text: 'Saya merasa transisi ke bentuk simbolik terlalu cepat bagi sebagian siswa. Perlu jembatan lebih halus.', createdAt: now - 1 * 86400000 },
    { id: uid('ent'), phase: 'see', type: 'refleksi', userId: dosen.id, userName: dosen.nama, role: 'dosen', fokus: '', text: 'Refleksi yang jujur dan reflektif. Untuk siklus berikutnya, coba gunakan garis bilangan sebagai jembatan.', createdAt: now - 1 * 86400000 + 1800000 }
  ],
  createdBy: guru.id,
  createdAt: now - 7 * 86400000,
  updatedAt: now - 1 * 86400000 + 1800000
};

const DB = {
  users: [admin, dosen, guru, observer, guru2],
  cycles: [cycle],
  notifications: [],
  schools: [
    { id: uid('sch'), nama: 'SMP Negeri 1 Makassar', jenjang: 'SMP', npsn: '40307001', alamat: 'Jl. Baji Areng, Makassar', createdAt: new Date().toISOString() },
    { id: uid('sch'), nama: 'SMP Negeri 3 Makassar', jenjang: 'SMP', npsn: '40307003', alamat: 'Jl. Baji Gau, Makassar', createdAt: new Date().toISOString() },
    { id: uid('sch'), nama: 'SMP Negeri 6 Makassar', jenjang: 'SMP', npsn: '40307006', alamat: 'Jl. Jenderal Sudirman, Makassar', createdAt: new Date().toISOString() },
    { id: uid('sch'), nama: 'SMP Muhammadiyah 1 Makassar', jenjang: 'SMP', npsn: '', alamat: 'Makassar', createdAt: new Date().toISOString() }
  ],
  meta: { createdAt: new Date().toISOString(), seeded: true }
};

fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), 'utf8');
console.log('✔ Seed dibuat: data/db.json');
console.log('  Akun demo (sandi = username + 123):');
console.log('   admin / admin123        (Admin Sistem)');
console.log('   dosen / dosen123        (Dosen Pendamping)');
console.log('   guru  / guru123         (Guru SMP — pemilik contoh siklus)');
console.log('   observer / observer123  (Observer)');
console.log('   guru2 / guru2123        (Guru SMP lain)');
