// =====================================================================
// server.js - Backend LeaDi-PDS
// LeaDi-PDS: Lesson Study Digital Platform berbasis Plan-Do-See.
// Multi-user (admin / dosen / guru / observer). Data di data/db.json.
// Hanya modul bawaan Node.js (tanpa npm). Jalankan: node server.js
// =====================================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8095;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_ROOT = process.env.DATA_ROOT || ROOT;
const DATA_DIR = path.join(DATA_ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_DIR = path.join(ROOT, 'seed');
const MAX_BODY = 300 * 1024 * 1024; // 300 MB (menampung berkas 200 MB dalam base64)
const MAX_FILE = 200 * 1024 * 1024; // 200 MB per berkas (video pembelajaran)

// ------------------------------------------------------------------
// Password (scrypt) & id
// ------------------------------------------------------------------
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), s, 64).toString('hex');
  return `${s}:${derived}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt] = stored.split(':');
  const check = hashPassword(password, salt);
  const a = Buffer.from(check);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// ------------------------------------------------------------------
// Penyimpanan (satu file JSON, tulis atomik)
// ------------------------------------------------------------------
let DB = null;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
function seedFromBundleIfEmpty() {
  try {
    if (fs.existsSync(DB_FILE)) return;
    const seedDb = path.join(SEED_DIR, 'db.json');
    if (!fs.existsSync(seedDb)) return;
    fs.copyFileSync(seedDb, DB_FILE);
    const seedUploads = path.join(SEED_DIR, 'uploads');
    if (fs.existsSync(seedUploads)) {
      for (const f of fs.readdirSync(seedUploads)) {
        try { fs.copyFileSync(path.join(seedUploads, f), path.join(UPLOAD_DIR, f)); } catch {}
      }
    }
    console.log('Data awal disalin dari seed/.');
  } catch (e) { console.error('Seed gagal:', e.message); }
}
function loadDB() {
  ensureDirs();
  seedFromBundleIfEmpty();
  if (fs.existsSync(DB_FILE)) {
    try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { console.error('Gagal membaca db.json, membuat baru:', e.message); DB = null; }
  }
  if (!DB) {
    DB = { users: [], cycles: [], notifications: [], schools: [], meta: { createdAt: new Date().toISOString() } };
    DB.users.push({
      id: uid('usr'), username: 'admin', nama: 'Administrator', role: 'admin',
      jabatan: 'Pengelola Sistem', instansi: '', password: hashPassword('admin123'),
      createdAt: new Date().toISOString()
    });
    saveDB();
    console.log('DB baru dibuat. Login admin default:  admin / admin123');
  }
  if (!Array.isArray(DB.users)) DB.users = [];
  if (!Array.isArray(DB.cycles)) DB.cycles = [];
  if (!Array.isArray(DB.notifications)) DB.notifications = [];
  if (!Array.isArray(DB.schools)) DB.schools = [];
}
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ------------------------------------------------------------------
// Sesi (token in-memory, 12 jam)
// ------------------------------------------------------------------
const sessions = new Map();
const SESSION_MS = 12 * 60 * 60 * 1000;
function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, exp: Date.now() + SESSION_MS });
  return token;
}
function getSessionUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) { sessions.delete(token); return null; }
  return DB.users.find(u => u.id === s.userId) || null;
}

// ------------------------------------------------------------------
// Helper HTTP
// ------------------------------------------------------------------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Payload terlalu besar')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}
function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

// ------------------------------------------------------------------
// Peran & sanitasi
// ------------------------------------------------------------------
const ROLES = ['admin', 'dosen', 'guru', 'observer'];
// guru = Guru Model (perencana), observer = Guru Observer (pengamat), dosen = Dosen Pengawas.
const ROLE_LABEL = { admin: 'Admin Sistem', dosen: 'Dosen Pengawas', guru: 'Guru Model', observer: 'Guru Observer' };
const PHASES = ['plan', 'do', 'see'];
const STATUSES = ['plan', 'do', 'see', 'selesai'];

function isAdmin(u) { return u && u.role === 'admin'; }
function userById(id) { return DB.users.find(u => u.id === id) || null; }

// Dosen & admin melihat semua siklus (pengawasan); Guru Model & Guru Observer
// hanya siklus yang mereka miliki atau ikuti.
function canView(user, c) {
  if (!user || !c) return false;
  if (user.role === 'admin' || user.role === 'dosen') return true;
  return c.ownerId === user.id || (c.memberIds || []).includes(user.id);
}
// Yang boleh menyunting rancangan/fase: admin atau pemilik (Guru Model).
function canEdit(user, c) {
  if (!user || !c) return false;
  if (user.role === 'admin') return true;
  if (c.ownerId === user.id) return true;
  return false;
}
// Yang boleh berkontribusi (diskusi/observasi/refleksi): semua yang terlibat.
function canContribute(user, c) {
  if (!user || !c) return false;
  if (user.role === 'admin' || user.role === 'dosen') return true;
  return c.ownerId === user.id || (c.memberIds || []).includes(user.id);
}
// Yang boleh menerbitkan Praktik Baik: Dosen Pengawas atau Admin.
function canPublish(user) {
  return user && (user.role === 'admin' || user.role === 'dosen');
}

function str(v, max) { return String(v == null ? '' : v).slice(0, max || 500).trim(); }
function idArr(v) { return Array.isArray(v) ? [...new Set(v.map(x => String(x)).filter(Boolean))].slice(0, 100) : []; }

function cleanCycle(body, existing) {
  const c = existing ? existing : {};
  const out = {
    id: existing ? existing.id : uid('cyc'),
    title: str(body.title, 200),
    mapel: str(body.mapel, 120),
    materi: str(body.materi, 200),
    kelas: str(body.kelas, 60),
    sekolah: str(body.sekolah, 160),
    ownerId: existing ? existing.ownerId : null,
    ownerName: existing ? existing.ownerName : '',
    memberIds: idArr(body.memberIds != null ? body.memberIds : c.memberIds),
    status: STATUSES.includes(body.status) ? body.status : (existing ? existing.status : 'plan'),
    plan: {
      tujuan: str((body.plan || {}).tujuan, 4000),
      desain: str((body.plan || {}).desain, 8000),
      tanggalRencana: /^\d{4}-\d{2}-\d{2}$/.test((body.plan || {}).tanggalRencana) ? body.plan.tanggalRencana : '',
      jamRencana: /^\d{2}:\d{2}$/.test((body.plan || {}).jamRencana) ? body.plan.jamRencana : '',
      attachments: existing && existing.plan ? (existing.plan.attachments || []) : [],
      observerDocs: existing && existing.plan ? (existing.plan.observerDocs || []) : []
    },
    pelaksanaan: {
      tanggal: /^\d{4}-\d{2}-\d{2}$/.test((body.pelaksanaan || {}).tanggal) ? body.pelaksanaan.tanggal : '',
      jam: /^\d{2}:\d{2}$/.test((body.pelaksanaan || {}).jam) ? body.pelaksanaan.jam : '',
      catatan: str((body.pelaksanaan || {}).catatan, 8000),
      videoLinks: Array.isArray((body.pelaksanaan || {}).videoLinks)
        ? body.pelaksanaan.videoLinks.slice(0, 20).map(v => ({
            id: v && v.id ? String(v.id).slice(0, 60) : uid('vl'),
            title: str(v && v.title, 160),
            url: str(v && v.url, 600)
          })).filter(v => v.url)
        : (existing && existing.pelaksanaan ? (existing.pelaksanaan.videoLinks || []) : []),
      videos: existing && existing.pelaksanaan ? (existing.pelaksanaan.videos || []) : [],
      observasiDocs: existing && existing.pelaksanaan ? (existing.pelaksanaan.observasiDocs || []) : [],
      observerDocs: existing && existing.pelaksanaan ? (existing.pelaksanaan.observerDocs || []) : []
    },
    refleksi: {
      analisis: str((body.refleksi || {}).analisis, 8000),
      rekomendasi: str((body.refleksi || {}).rekomendasi, 8000),
      videos: existing && existing.refleksi ? (existing.refleksi.videos || []) : [],
      observerDocs: existing && existing.refleksi ? (existing.refleksi.observerDocs || []) : []
    },
    praktikBaik: existing && existing.praktikBaik ? existing.praktikBaik : {
      published: false, ringkasan: '', tags: [], publishedAt: null
    },
    entries: existing ? (existing.entries || []) : [],
    createdBy: existing ? existing.createdBy : null,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  return out;
}

// ------------------------------------------------------------------
// Lampiran (perangkat pembelajaran & video) — simpan di uploads/
// ------------------------------------------------------------------
function saveUpload(a) {
  const name = String(a.name || 'berkas').slice(0, 200);
  let b64 = String(a.data || '');
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma >= 0) b64 = b64.slice(comma + 1);
  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch { return null; }
  if (!buf.length || buf.length > MAX_FILE) return null;
  let ext = (path.extname(name) || '').toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) ext = '';
  const id = uid('att');
  const fname = id + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
  return { id, name, type: String(a.type || '').slice(0, 100), size: buf.length, url: '/uploads/' + fname };
}
// Simpan berkas biner (stream langsung ke disk, hemat memori untuk berkas besar)
function saveUploadStream(req, origName, type) {
  return new Promise((resolve, reject) => {
    const name = String(origName || 'berkas').slice(0, 200);
    let ext = (path.extname(name) || '').toLowerCase();
    if (!/^\.[a-z0-9]{1,8}$/.test(ext)) ext = '';
    const id = uid('att');
    const fname = id + ext;
    const dest = path.join(UPLOAD_DIR, fname);
    const ws = fs.createWriteStream(dest);
    let size = 0, aborted = false;
    const fail = (err) => { if (aborted) return; aborted = true; try { ws.destroy(); } catch {} try { fs.unlinkSync(dest); } catch {} try { req.destroy(); } catch {} reject(err); };
    req.on('data', chunk => { size += chunk.length; if (size > MAX_FILE) fail(new Error('Berkas melebihi batas 200 MB')); });
    req.on('error', fail);
    ws.on('error', fail);
    ws.on('finish', () => { if (!aborted) resolve({ id, name, type: String(type || '').slice(0, 100), size, url: '/uploads/' + fname }); });
    req.pipe(ws);
  });
}
function processAttachments(list, oldList) {
  const result = [];
  const keptIds = new Set();
  for (const a of (Array.isArray(list) ? list : [])) {
    if (a && a.id && a.url && !a.data) {
      result.push({ id: a.id, name: String(a.name || '').slice(0, 200), type: String(a.type || '').slice(0, 100), size: a.size || 0, url: a.url });
      keptIds.add(a.id);
    } else if (a && a.data) {
      const meta = saveUpload(a);
      if (meta) result.push(meta);
    }
  }
  for (const o of (oldList || [])) {
    if (!keptIds.has(o.id) && o.url) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(o.url))); } catch {}
    }
  }
  return result;
}
function deleteCycleFiles(c) {
  const all = [...((c.plan && c.plan.attachments) || []), ...((c.plan && c.plan.observerDocs) || []), ...((c.pelaksanaan && c.pelaksanaan.videos) || []), ...((c.pelaksanaan && c.pelaksanaan.observasiDocs) || []), ...((c.pelaksanaan && c.pelaksanaan.observerDocs) || []), ...((c.refleksi && c.refleksi.videos) || []), ...((c.refleksi && c.refleksi.observerDocs) || [])];
  for (const a of all) {
    if (a.url) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(a.url))); } catch {} }
  }
}

// Foto profil pengguna: simpan/hapus berkas di uploads/
function processUserPhoto(user, body) {
  if (body.removePhoto) {
    if (user.photoUrl) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(user.photoUrl))); } catch {} }
    user.photoUrl = '';
    return;
  }
  if (body.photo && body.photo.data) {
    const meta = saveUpload(body.photo);
    if (meta) {
      if (user.photoUrl) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(user.photoUrl))); } catch {} }
      user.photoUrl = meta.url;
    }
  }
}

// ------------------------------------------------------------------
// Notifikasi in-app
// ------------------------------------------------------------------
function notify(recipientIds, actor, cycle, message) {
  const set = new Set(recipientIds.filter(Boolean));
  if (actor) set.delete(actor.id);
  set.forEach(rid => {
    if (!DB.users.some(u => u.id === rid)) return;
    DB.notifications.push({
      id: uid('ntf'), userId: rid, cycleId: cycle ? cycle.id : null,
      title: cycle ? cycle.title : 'LeaDi-PDS', message, read: false, createdAt: Date.now()
    });
  });
  if (DB.notifications.length > 2000) DB.notifications = DB.notifications.slice(-2000);
}
function cycleRecipients(c) {
  return [c.ownerId, ...(c.memberIds || [])];
}

// ------------------------------------------------------------------
// Static file serving
// ------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  let safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  let base = ROOT;
  if (/^[\/\\]uploads[\/\\]/.test(safe)) {
    base = UPLOAD_DIR;
    safe = safe.replace(/^[\/\\]uploads[\/\\]/, '');
  }
  const filePath = path.join(base, safe);
  if (!filePath.startsWith(base)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    // Video mendukung range request (streaming/seek)
    if (['.mp4', '.webm', '.ogg', '.mov'].includes(ext) && req.headers.range) {
      const range = req.headers.range;
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start)) start = 0;
      if (isNaN(end) || end >= st.size) end = st.size - 1;
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': MIME[ext]
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ------------------------------------------------------------------
// Router API
// ------------------------------------------------------------------
async function handleApi(req, res, url) {
  const method = req.method.toUpperCase();
  const parts = url.pathname.split('/').filter(Boolean);
  const seg = parts.slice(1);

  // --- LOGIN ---
  if (seg[0] === 'login' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const user = DB.users.find(u => u.username.toLowerCase() === username);
    if (!user || !verifyPassword(body.password || '', user.password)) {
      return sendJSON(res, 401, { error: 'Username atau kata sandi salah' });
    }
    const token = createSession(user.id);
    return sendJSON(res, 200, { token, user: publicUser(user) });
  }

  const me = getSessionUser(req);
  if (!me) return sendJSON(res, 401, { error: 'Sesi berakhir, silakan masuk kembali' });

  // --- LOGOUT ---
  if (seg[0] === 'logout' && method === 'POST') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    sessions.delete(token);
    return sendJSON(res, 200, { ok: true });
  }

  // --- ME ---
  if (seg[0] === 'me' && !seg[1] && method === 'GET') {
    return sendJSON(res, 200, { user: publicUser(me) });
  }
  if (seg[0] === 'me' && seg[1] === 'password' && method === 'PUT') {
    const body = await readBody(req);
    if (!verifyPassword(body.current || '', me.password)) return sendJSON(res, 400, { error: 'Kata sandi lama salah' });
    if (String(body.next || '').length < 4) return sendJSON(res, 400, { error: 'Kata sandi baru minimal 4 karakter' });
    me.password = hashPassword(body.next);
    saveDB();
    return sendJSON(res, 200, { ok: true });
  }
  if (seg[0] === 'me' && !seg[1] && method === 'PUT') {
    const body = await readBody(req);
    if (body.nama != null) me.nama = str(body.nama, 120) || me.nama;
    if (body.jabatan != null) me.jabatan = str(body.jabatan, 150);
    if (body.instansi != null) me.instansi = str(body.instansi, 160);
    if (body.nip != null) me.nip = str(body.nip, 40);
    if (body.nuptk != null) me.nuptk = str(body.nuptk, 40);
    if (body.nidn != null) me.nidn = str(body.nidn, 40);
    processUserPhoto(me, body);
    saveDB();
    return sendJSON(res, 200, { user: publicUser(me) });
  }

  // --- DIRECTORY (pemilih anggota) ---
  if (seg[0] === 'directory' && method === 'GET') {
    return sendJSON(res, 200, {
      users: DB.users.map(u => ({ id: u.id, nama: u.nama, jabatan: u.jabatan || '', instansi: u.instansi || '', role: u.role, photoUrl: u.photoUrl || '' }))
    });
  }

  // ================= MASTER SEKOLAH =================
  if (seg[0] === 'schools') {
    // baca: semua pengguna terautentikasi (untuk pemilih sekolah)
    if (!seg[1] && method === 'GET') {
      return sendJSON(res, 200, { schools: DB.schools.slice().sort((a, b) => a.nama.localeCompare(b.nama)) });
    }
    // tulis: admin saja
    if (!isAdmin(me)) return sendJSON(res, 403, { error: 'Hanya admin yang boleh mengelola master sekolah' });
    if (!seg[1] && method === 'POST') {
      const body = await readBody(req);
      const nama = str(body.nama, 160);
      if (!nama) return sendJSON(res, 400, { error: 'Nama sekolah wajib diisi' });
      if (DB.schools.some(s => s.nama.toLowerCase() === nama.toLowerCase())) return sendJSON(res, 400, { error: 'Sekolah dengan nama itu sudah ada' });
      const s = { id: uid('sch'), nama, npsn: str(body.npsn, 20), jenjang: str(body.jenjang, 20) || 'SMP', alamat: str(body.alamat, 200), createdAt: new Date().toISOString() };
      DB.schools.push(s);
      saveDB();
      return sendJSON(res, 200, { school: s });
    }
    if (seg[1] && method === 'PUT') {
      const s = DB.schools.find(x => x.id === seg[1]);
      if (!s) return sendJSON(res, 404, { error: 'Sekolah tidak ditemukan' });
      const body = await readBody(req);
      if (body.nama != null) {
        const nama = str(body.nama, 160);
        if (!nama) return sendJSON(res, 400, { error: 'Nama sekolah wajib diisi' });
        if (DB.schools.some(x => x.id !== s.id && x.nama.toLowerCase() === nama.toLowerCase())) return sendJSON(res, 400, { error: 'Sekolah dengan nama itu sudah ada' });
        s.nama = nama;
      }
      if (body.npsn != null) s.npsn = str(body.npsn, 20);
      if (body.jenjang != null) s.jenjang = str(body.jenjang, 20);
      if (body.alamat != null) s.alamat = str(body.alamat, 200);
      saveDB();
      return sendJSON(res, 200, { school: s });
    }
    if (seg[1] && method === 'DELETE') {
      const before = DB.schools.length;
      DB.schools = DB.schools.filter(x => x.id !== seg[1]);
      if (DB.schools.length === before) return sendJSON(res, 404, { error: 'Sekolah tidak ditemukan' });
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
  }

  // ================= CYCLES (siklus Lesson Study) =================
  if (seg[0] === 'cycles') {
    // list (ringkas)
    if (!seg[1] && method === 'GET') {
      const list = DB.cycles.filter(c => canView(me, c)).map(summarizeCycle).sort((a, b) => b.updatedAt - a.updatedAt);
      return sendJSON(res, 200, { cycles: list });
    }
    // create (guru & admin)
    if (!seg[1] && method === 'POST') {
      if (me.role !== 'guru' && me.role !== 'admin') return sendJSON(res, 403, { error: 'Hanya Guru atau Admin yang dapat membuat siklus baru' });
      const body = await readBody(req);
      const c = cleanCycle(body, null);
      if (!c.title) return sendJSON(res, 400, { error: 'Judul siklus wajib diisi' });
      c.ownerId = me.id;
      c.ownerName = me.nama;
      c.createdBy = me.id;
      c.plan.attachments = processAttachments((body.plan || {}).attachments, []);
      c.pelaksanaan.videos = processAttachments((body.pelaksanaan || {}).videos, []);
      c.pelaksanaan.observasiDocs = processAttachments((body.pelaksanaan || {}).observasiDocs, []);
      DB.cycles.push(c);
      notify(c.memberIds, me, c, `Anda ditambahkan pada siklus "${c.title}".`);
      saveDB();
      return sendJSON(res, 200, { cycle: c });
    }
    // detail
    if (seg[1] && !seg[2] && method === 'GET') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canView(me, c)) return sendJSON(res, 403, { error: 'Anda tidak memiliki akses ke siklus ini' });
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
    // update
    if (seg[1] && !seg[2] && method === 'PUT') {
      const existing = DB.cycles.find(x => x.id === seg[1]);
      if (!existing) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canEdit(me, existing)) return sendJSON(res, 403, { error: 'Anda tidak berhak menyunting siklus ini' });
      const body = await readBody(req);
      const prevMembers = existing.memberIds || [];
      const c = cleanCycle(body, existing);
      if (!c.title) return sendJSON(res, 400, { error: 'Judul siklus wajib diisi' });
      const oldPlan = (existing.plan && existing.plan.attachments) || [];
      const oldVideos = (existing.pelaksanaan && existing.pelaksanaan.videos) || [];
      const oldObsvDocs = (existing.pelaksanaan && existing.pelaksanaan.observasiDocs) || [];
      const oldReflVideos = (existing.refleksi && existing.refleksi.videos) || [];
      Object.assign(existing, c);
      existing.plan.attachments = processAttachments((body.plan || {}).attachments, oldPlan);
      existing.pelaksanaan.videos = processAttachments((body.pelaksanaan || {}).videos, oldVideos);
      existing.pelaksanaan.observasiDocs = processAttachments((body.pelaksanaan || {}).observasiDocs, oldObsvDocs);
      existing.refleksi.videos = processAttachments((body.refleksi || {}).videos, oldReflVideos);
      const added = (existing.memberIds || []).filter(id => !prevMembers.includes(id));
      if (added.length) notify(added, me, existing, `Anda ditambahkan pada siklus "${existing.title}".`);
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(existing) });
    }
    // delete
    if (seg[1] && !seg[2] && method === 'DELETE') {
      const target = DB.cycles.find(x => x.id === seg[1]);
      if (!target) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!(isAdmin(me) || target.ownerId === me.id)) return sendJSON(res, 403, { error: 'Hanya pemilik atau admin yang dapat menghapus siklus' });
      deleteCycleFiles(target);
      DB.cycles = DB.cycles.filter(x => x.id !== seg[1]);
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
    // ubah status/fase
    if (seg[1] && seg[2] === 'status' && method === 'PUT') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canEdit(me, c)) return sendJSON(res, 403, { error: 'Anda tidak berhak mengubah tahap siklus' });
      const body = await readBody(req);
      if (!STATUSES.includes(body.status)) return sendJSON(res, 400, { error: 'Tahap tidak valid' });
      c.status = body.status;
      c.updatedAt = Date.now();
      notify(cycleRecipients(c), me, c, `Tahap siklus "${c.title}" diperbarui ke ${statusLabel(c.status)}.`);
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
    // tambah kontribusi (diskusi/observasi/refleksi)
    if (seg[1] && seg[2] === 'entries' && !seg[3] && method === 'POST') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canContribute(me, c)) return sendJSON(res, 403, { error: 'Anda tidak terlibat dalam siklus ini' });
      const body = await readBody(req);
      const phase = PHASES.includes(body.phase) ? body.phase : 'plan';
      const text = str(body.text, 4000);
      if (!text) return sendJSON(res, 400, { error: 'Isi catatan tidak boleh kosong' });
      const typeByPhase = { plan: 'diskusi', do: 'observasi', see: 'refleksi' };
      const entry = {
        id: uid('ent'), phase, type: typeByPhase[phase], userId: me.id, userName: me.nama,
        role: me.role, fokus: str(body.fokus, 120), text, createdAt: Date.now()
      };
      if (!Array.isArray(c.entries)) c.entries = [];
      c.entries.push(entry);
      c.updatedAt = Date.now();
      notify(cycleRecipients(c), me, c, `${me.nama} menambahkan ${entry.type} pada "${c.title}".`);
      saveDB();
      return sendJSON(res, 200, { entry });
    }
    // hapus kontribusi
    if (seg[1] && seg[2] === 'entries' && seg[3] && method === 'DELETE') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      const entry = (c.entries || []).find(e => e.id === seg[3]);
      if (!entry) return sendJSON(res, 404, { error: 'Catatan tidak ditemukan' });
      if (!(isAdmin(me) || entry.userId === me.id)) return sendJSON(res, 403, { error: 'Hanya penulis atau admin yang dapat menghapus catatan' });
      c.entries = c.entries.filter(e => e.id !== seg[3]);
      c.updatedAt = Date.now();
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
    // unggah berkas biner (stream, hemat memori) untuk video/dokumen besar
    if (seg[1] && seg[2] === 'files' && method === 'POST') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      const field = String(url.searchParams.get('field') || '');
      const allowed = ['plan.attachments', 'pelaksanaan.videos', 'pelaksanaan.observasiDocs', 'refleksi.videos', 'plan.observerDocs', 'pelaksanaan.observerDocs', 'refleksi.observerDocs'];
      if (!allowed.includes(field)) return sendJSON(res, 400, { error: 'Field tidak valid' });
      const isObserverDocs = field.endsWith('.observerDocs');
      if (isObserverDocs ? !canContribute(me, c) : !canEdit(me, c)) return sendJSON(res, 403, { error: 'Anda tidak berhak mengunggah pada siklus ini' });
      let origName = 'berkas';
      try { origName = decodeURIComponent(url.searchParams.get('name') || 'berkas'); } catch {}
      let meta;
      try { meta = await saveUploadStream(req, origName, req.headers['content-type'] || ''); }
      catch (e) { return sendJSON(res, 413, { error: e.message || 'Gagal mengunggah berkas' }); }
      const [grp, key] = field.split('.');
      if (!c[grp]) c[grp] = {};
      if (!Array.isArray(c[grp][key])) c[grp][key] = [];
      if (isObserverDocs) c[grp][key].push({ ...meta, uploaderId: me.id, uploaderName: me.nama, uploadedAt: Date.now() });
      else c[grp][key].push(meta);
      c.updatedAt = Date.now();
      if (isObserverDocs) notify(cycleRecipients(c), me, c, `${me.nama} mengunggah dokumen pada "${c.title}".`);
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c), attachment: meta });
    }
    // unggah dokumen observer (perangkat perencanaan yang telah diisi/diunduh)
    if (seg[1] && seg[2] === 'observer-docs' && !seg[3] && method === 'POST') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canContribute(me, c)) return sendJSON(res, 403, { error: 'Anda tidak terlibat dalam siklus ini' });
      const body = await readBody(req);
      const incoming = Array.isArray(body.attachments) ? body.attachments : [];
      if (!c.plan) c.plan = {};
      if (!Array.isArray(c.plan.observerDocs)) c.plan.observerDocs = [];
      let addedCount = 0;
      for (const a of incoming) {
        if (!a || !a.data) continue;
        const meta = saveUpload(a);
        if (meta) {
          c.plan.observerDocs.push({ ...meta, uploaderId: me.id, uploaderName: me.nama, uploadedAt: Date.now() });
          addedCount++;
        }
      }
      if (!addedCount) return sendJSON(res, 400, { error: 'Tidak ada berkas yang valid diunggah' });
      c.updatedAt = Date.now();
      notify(cycleRecipients(c), me, c, `${me.nama} mengunggah dokumen pada "${c.title}".`);
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
    // hapus dokumen observer (cari di semua tahap: plan/pelaksanaan/refleksi)
    if (seg[1] && seg[2] === 'observer-docs' && seg[3] && method === 'DELETE') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      const groups = ['plan', 'pelaksanaan', 'refleksi'];
      let doc = null, grp = null;
      for (const g of groups) {
        const found = ((c[g] && c[g].observerDocs) || []).find(d => d.id === seg[3]);
        if (found) { doc = found; grp = g; break; }
      }
      if (!doc) return sendJSON(res, 404, { error: 'Dokumen tidak ditemukan' });
      if (!(isAdmin(me) || doc.uploaderId === me.id || c.ownerId === me.id)) return sendJSON(res, 403, { error: 'Hanya pengunggah, pemilik, atau admin yang dapat menghapus dokumen' });
      if (doc.url) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(doc.url))); } catch {} }
      c[grp].observerDocs = c[grp].observerDocs.filter(d => d.id !== seg[3]);
      c.updatedAt = Date.now();
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
    // terbitkan ke repositori praktik baik
    if (seg[1] && seg[2] === 'publish' && method === 'POST') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canPublish(me)) return sendJSON(res, 403, { error: 'Hanya Dosen Pengawas atau Admin yang dapat menerbitkan Praktik Baik' });
      const body = await readBody(req);
      c.praktikBaik = {
        published: true,
        ringkasan: str(body.ringkasan, 6000),
        tags: Array.isArray(body.tags) ? body.tags.map(t => str(t, 40)).filter(Boolean).slice(0, 12) : [],
        publishedAt: Date.now()
      };
      c.status = 'selesai';
      c.updatedAt = Date.now();
      notify(cycleRecipients(c), me, c, `Siklus "${c.title}" diterbitkan sebagai Praktik Baik.`);
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
    if (seg[1] && seg[2] === 'unpublish' && method === 'POST') {
      const c = DB.cycles.find(x => x.id === seg[1]);
      if (!c) return sendJSON(res, 404, { error: 'Siklus tidak ditemukan' });
      if (!canPublish(me)) return sendJSON(res, 403, { error: 'Anda tidak berhak' });
      c.praktikBaik = { published: false, ringkasan: (c.praktikBaik || {}).ringkasan || '', tags: (c.praktikBaik || {}).tags || [], publishedAt: null };
      c.updatedAt = Date.now();
      saveDB();
      return sendJSON(res, 200, { cycle: enrichCycle(c) });
    }
  }

  // ================= REPOSITORI PRAKTIK BAIK (semua pengguna) =================
  if (seg[0] === 'repositori' && method === 'GET') {
    const list = DB.cycles.filter(c => c.praktikBaik && c.praktikBaik.published)
      .map(c => {
        const s = summarizeCycle(c);
        s.ringkasan = c.praktikBaik.ringkasan;
        s.tags = c.praktikBaik.tags || [];
        s.publishedAt = c.praktikBaik.publishedAt;
        return s;
      })
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return sendJSON(res, 200, { cycles: list });
  }

  // ================= STATISTIK RINGKAS (dasbor) =================
  if (seg[0] === 'stats' && method === 'GET') {
    const visible = DB.cycles.filter(c => canView(me, c));
    const byStatus = { plan: 0, do: 0, see: 0, selesai: 0 };
    visible.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
    return sendJSON(res, 200, {
      stats: {
        total: visible.length,
        byStatus,
        published: visible.filter(c => c.praktikBaik && c.praktikBaik.published).length,
        users: DB.users.length,
        milik: DB.cycles.filter(c => c.ownerId === me.id).length
      }
    });
  }

  // ================= NOTIFICATIONS =================
  if (seg[0] === 'notifications') {
    if (!seg[1] && method === 'GET') {
      const mine = DB.notifications.filter(n => n.userId === me.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
      return sendJSON(res, 200, { notifications: mine, unread: mine.filter(n => !n.read).length });
    }
    if (seg[1] === 'read' && method === 'POST') {
      const body = await readBody(req);
      DB.notifications.forEach(n => { if (n.userId === me.id && (!body.id || n.id === body.id)) n.read = true; });
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
  }

  // ================= USERS (admin) =================
  if (seg[0] === 'users') {
    if (!isAdmin(me)) return sendJSON(res, 403, { error: 'Hanya admin yang boleh mengelola pengguna' });
    if (!seg[1] && method === 'GET') return sendJSON(res, 200, { users: DB.users.map(publicUser) });
    if (!seg[1] && method === 'POST') {
      const body = await readBody(req);
      const username = String(body.username || '').trim().toLowerCase();
      const nama = str(body.nama, 120);
      const jabatan = str(body.jabatan, 150);
      const instansi = str(body.instansi, 160);
      const role = ROLES.includes(body.role) ? body.role : 'guru';
      const password = String(body.password || '');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return sendJSON(res, 400, { error: 'Username 3-30 karakter (huruf kecil/angka/._-)' });
      if (!nama) return sendJSON(res, 400, { error: 'Nama wajib diisi' });
      if (password.length < 4) return sendJSON(res, 400, { error: 'Kata sandi minimal 4 karakter' });
      if (DB.users.some(u => u.username.toLowerCase() === username)) return sendJSON(res, 400, { error: 'Username sudah dipakai' });
      const u = { id: uid('usr'), username, nama, jabatan, instansi, role, password: hashPassword(password), photoUrl: '', createdAt: new Date().toISOString() };
      u.nip = str(body.nip, 40); u.nuptk = str(body.nuptk, 40); u.nidn = str(body.nidn, 40);
      processUserPhoto(u, body);
      DB.users.push(u);
      saveDB();
      return sendJSON(res, 200, { user: publicUser(u) });
    }
    if (seg[1] && method === 'PUT') {
      const u = DB.users.find(x => x.id === seg[1]);
      if (!u) return sendJSON(res, 404, { error: 'Pengguna tidak ditemukan' });
      const body = await readBody(req);
      if (body.nama != null) u.nama = str(body.nama, 120) || u.nama;
      if (body.jabatan != null) u.jabatan = str(body.jabatan, 150);
      if (body.instansi != null) u.instansi = str(body.instansi, 160);
      if (body.nip != null) u.nip = str(body.nip, 40);
      if (body.nuptk != null) u.nuptk = str(body.nuptk, 40);
      if (body.nidn != null) u.nidn = str(body.nidn, 40);
      if (body.role != null && ROLES.includes(body.role)) {
        if (u.role === 'admin' && body.role !== 'admin' && DB.users.filter(x => x.role === 'admin').length <= 1) {
          return sendJSON(res, 400, { error: 'Minimal harus ada satu admin' });
        }
        u.role = body.role;
      }
      if (body.password != null && String(body.password).length >= 4) u.password = hashPassword(body.password);
      processUserPhoto(u, body);
      saveDB();
      return sendJSON(res, 200, { user: publicUser(u) });
    }
    if (seg[1] && method === 'DELETE') {
      const u = DB.users.find(x => x.id === seg[1]);
      if (!u) return sendJSON(res, 404, { error: 'Pengguna tidak ditemukan' });
      if (u.id === me.id) return sendJSON(res, 400, { error: 'Tidak dapat menghapus akun sendiri' });
      if (u.role === 'admin' && DB.users.filter(x => x.role === 'admin').length <= 1) return sendJSON(res, 400, { error: 'Minimal harus ada satu admin' });
      DB.users = DB.users.filter(x => x.id !== u.id);
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
  }

  return sendJSON(res, 404, { error: 'Endpoint tidak ditemukan' });
}

// ------------------------------------------------------------------
// Penyaji data siklus
// ------------------------------------------------------------------
function statusLabel(s) { return ({ plan: 'Plan', do: 'Do', see: 'See', selesai: 'Selesai' })[s] || s; }
function memberInfo(ids) {
  return (ids || []).map(id => {
    const u = userById(id);
    return u ? { id: u.id, nama: u.nama, role: u.role, jabatan: u.jabatan || '', instansi: u.instansi || '' } : null;
  }).filter(Boolean);
}
function summarizeCycle(c) {
  return {
    id: c.id, title: c.title, mapel: c.mapel, materi: c.materi || '', kelas: c.kelas, sekolah: c.sekolah,
    ownerId: c.ownerId, ownerName: c.ownerName, status: c.status,
    memberCount: (c.memberIds || []).length,
    entryCount: (c.entries || []).length,
    published: !!(c.praktikBaik && c.praktikBaik.published),
    tanggalRencana: (c.plan && c.plan.tanggalRencana) || '',
    updatedAt: c.updatedAt, createdAt: c.createdAt
  };
}
function enrichCycle(c) {
  return Object.assign({}, c, {
    members: memberInfo(c.memberIds),
    entries: (c.entries || []).slice().sort((a, b) => a.createdAt - b.createdAt)
  });
}

// ------------------------------------------------------------------
// Server
// ------------------------------------------------------------------
loadDB();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      console.error(err);
      sendJSON(res, 500, { error: err.message || 'Kesalahan server' });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log('=====================================================');
  console.log(' LeaDi-PDS - Lesson Study Digital Platform (Plan-Do-See)');
  console.log('   Komputer : http://localhost:' + PORT);
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name]) {
        if (ni.family === 'IPv4' && !ni.internal) console.log('   HP (Wi-Fi): http://' + ni.address + ':' + PORT);
      }
    }
  } catch {}
  console.log('   Login awal: admin / admin123');
  console.log(' Tekan Ctrl+C untuk berhenti.');
  console.log('=====================================================');
});
