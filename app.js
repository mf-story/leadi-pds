/* =========================================================
   LeaDi-PDS — app.js  (tampilan "Lesson Study Platform")
   Top-nav: Dashboard · Plan · Do · See · Repository
   Plan/Do/See beroperasi pada SIKLUS AKTIF (dua kolom).
   ========================================================= */
(function () {
  'use strict';

  const TOKEN_KEY = 'leadi_token';
  const ACTIVE_KEY = 'leadi_active_cycle';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ROLE_LABEL = { admin: 'Admin Sistem', dosen: 'Dosen Pengawas', guru: 'Guru Model', observer: 'Guru Observer' };
  const STATUS_LABEL = { plan: 'Plan', do: 'Do', see: 'See', selesai: 'Selesai' };

  const state = { user: null, cycles: [], directory: [], schools: [], current: null, activeId: null, statusFilter: 'all', selectedMembers: [], notifTimer: null, view: 'dashboard' };

  // ---------------- API ----------------
  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = token(); if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {}; try { data = await res.json(); } catch {}
    if (res.status === 401 && state.user) { handleExpired(); throw new Error(data.error || 'Sesi berakhir'); }
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    return data;
  }
  function handleExpired() {
    localStorage.removeItem(TOKEN_KEY); state.user = null;
    if (state.notifTimer) clearInterval(state.notifTimer);
    $('#app').hidden = true; $('#loginScreen').hidden = false;
    toast('Sesi berakhir, silakan masuk kembali', 'err');
  }

  // Unggah dgn progres (XHR mendukung upload.onprogress; fetch tidak)
  function apiUpload(method, path, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, '/api' + path);
      xhr.setRequestHeader('Content-Type', 'application/json');
      const t = token(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401 && state.user) { handleExpired(); return reject(new Error(data.error || 'Sesi berakhir')); }
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(data.error || 'Terjadi kesalahan'));
        resolve(data);
      };
      xhr.onerror = () => reject(new Error('Gagal terhubung ke server'));
      xhr.send(body ? JSON.stringify(body) : undefined);
    });
  }
  // Unggah berkas biner langsung (tanpa base64) — hemat memori untuk video/dokumen besar
  function apiUploadBinary(cycleId, field, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/cycles/' + cycleId + '/files?field=' + encodeURIComponent(field) + '&name=' + encodeURIComponent(file.name));
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      const t = token(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401 && state.user) { handleExpired(); return reject(new Error(data.error || 'Sesi berakhir')); }
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(data.error || 'Gagal mengunggah'));
        resolve(data);
      };
      xhr.onerror = () => reject(new Error('Gagal terhubung ke server'));
      xhr.send(file);
    });
  }
  function showUploadProgress(label) { const b = $('#uploadBar'); b.className = 'upload-bar'; $('#uploadBarLabel').textContent = label || 'Mengunggah…'; $('#uploadBarFill').style.width = '0%'; b.hidden = false; }
  function setUploadProgress(frac) { const pct = Math.round((frac || 0) * 100); $('#uploadBarFill').style.width = pct + '%'; $('#uploadBarLabel').textContent = 'Mengunggah… ' + pct + '%'; }
  function uploadIndeterminate(label) { const b = $('#uploadBar'); b.className = 'upload-bar indeterminate'; $('#uploadBarLabel').textContent = label || 'Menyiapkan berkas…'; b.hidden = false; }
  function hideUploadProgress(successMsg) {
    const b = $('#uploadBar');
    if (successMsg) { b.className = 'upload-bar success'; $('#uploadBarFill').style.width = '100%'; $('#uploadBarLabel').textContent = successMsg; clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2400); }
    else b.hidden = true;
  }

  // ---------------- Helpers ----------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function initials(name) { const p = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase() : '?'; }
  function fmtDate(s) { if (!s) return ''; return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtDateTime(ms) { return new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function relTime(ms) { const s = Math.floor((Date.now() - ms) / 1000); if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hari lalu'; }
  function fmtSize(n) { if (!n) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  function toast(msg, kind) { const el = $('#toast'); el.textContent = msg; el.className = 'toast' + (kind ? ' ' + kind : ''); el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2800); }
  function isImage(t) { return /^image\//.test(t || ''); }
  function isPdf(t, url) { return (t || '').includes('pdf') || /\.pdf$/i.test(url || ''); }
  function isVideoFile(t, url) { return /^video\//.test(t || '') || /\.(mp4|webm|ogg|mov)$/i.test(url || ''); }
  function attIcon(a) { if (isImage(a.type)) return '🖼️'; if (isPdf(a.type, a.url)) return '📕'; if (isVideoFile(a.type, a.url)) return '🎬'; if (/word|doc/i.test(a.type)) return '📘'; if (/sheet|excel|xls/i.test(a.type)) return '📗'; if (/presentation|ppt/i.test(a.type)) return '📙'; return '📎'; }

  // ---- Rich text (editor mirip MS Word) ----
  const RTE_ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, P: 1, BR: 1, UL: 1, OL: 1, LI: 1, H3: 1, H4: 1, BLOCKQUOTE: 1, DIV: 1, SPAN: 1, A: 1 };
  function sanitizeHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = html || '';
    (function walk(node) {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 1) {
          if (!RTE_ALLOWED[ch.tagName]) { while (ch.firstChild) node.insertBefore(ch.firstChild, ch); node.removeChild(ch); continue; }
          for (const attr of Array.from(ch.attributes)) {
            if (ch.tagName === 'A' && attr.name === 'href' && /^(https?:|mailto:)/i.test(attr.value)) continue;
            ch.removeAttribute(attr.name);
          }
          if (ch.tagName === 'A') { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener'); }
          walk(ch);
        } else if (ch.nodeType === 8) { node.removeChild(ch); }
      }
    })(root);
    return root.innerHTML;
  }
  function isHtml(s) { return /<[a-z][\s\S]*>/i.test(s || ''); }
  function richDisplay(s) { if (!s) return ''; return isHtml(s) ? sanitizeHtml(s) : esc(s).replace(/\n/g, '<br>'); }

  const can = {
    edit(c) { const u = state.user; if (!u || !c) return false; if (u.role === 'admin') return true; return c.ownerId === u.id; },
    contribute(c) { const u = state.user; if (!u || !c) return false; if (u.role === 'admin') return true; return c.ownerId === u.id || (c.members || []).some(m => m.id === u.id); },
    delete(c) { const u = state.user; return u && (u.role === 'admin' || c.ownerId === u.id); },
    publish() { const u = state.user; return u && (u.role === 'admin' || u.role === 'dosen'); },
    createCycle() { return state.user && (state.user.role === 'guru' || state.user.role === 'observer' || state.user.role === 'admin'); }
  };

  // ---------------- Auth ----------------
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#loginError'); err.hidden = true;
    try {
      const data = await api('POST', '/login', { username: $('#loginUser').value, password: $('#loginPass').value });
      localStorage.setItem(TOKEN_KEY, data.token); state.user = data.user; await startApp();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  // Ajukan akun (guru/dosen) → menunggu persetujuan admin
  $('#showRegisterBtn').addEventListener('click', async () => { $('#registerForm').reset(); $('#registerError').hidden = true; await loadPublicOptions(); updateRegisterOrgField(); $('#registerModal').hidden = false; });
  $('#rRole').addEventListener('change', updateRegisterOrgField);
  function updateRegisterOrgField() {
    const isDosen = $('#rRole').value === 'dosen';
    if ($('#rOrgLabel').firstChild) $('#rOrgLabel').firstChild.nodeValue = isDosen ? 'Instansi ' : 'Sekolah ';
    const inp = $('#rInstansi');
    inp.setAttribute('list', isDosen ? 'institutionOptions' : 'schoolOptions');
    inp.placeholder = isDosen ? 'pilih atau ketik instansi…' : 'pilih atau ketik sekolah…';
  }
  async function loadPublicOptions() {
    try {
      const d = await api('GET', '/public/options');
      const fill = (id, arr) => { const dl = $('#' + id); if (dl) dl.innerHTML = (arr || []).map(n => `<option value="${esc(n)}"></option>`).join(''); };
      fill('schoolOptions', d.schools); fill('institutionOptions', d.institutions);
    } catch {}
  }
  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#registerError'); err.hidden = true;
    const payload = {
      nama: $('#rNama').value, role: $('#rRole').value,
      username: $('#rUsername').value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
      email: $('#rEmail').value.trim(), password: $('#rPassword').value, instansi: $('#rInstansi').value
    };
    try {
      await api('POST', '/register', payload);
      $('#registerModal').hidden = true;
      toast('Permintaan terkirim. Akun aktif setelah disetujui admin.', 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  async function startApp() {
    $('#loginScreen').hidden = true; $('#app').hidden = false;
    applyRoleUI(); renderAccount();
    try { const d = await api('GET', '/directory'); state.directory = d.users; } catch {}
    try { const s = await api('GET', '/schools'); state.schools = s.schools; renderSchoolOptions(); } catch {}
    try { const i = await api('GET', '/institutions'); state.institutions = i.institutions; renderInstitutionOptions(); } catch {}
    await loadCycles();
    state.activeId = localStorage.getItem(ACTIVE_KEY) || (state.cycles[0] && state.cycles[0].id) || null;
    navigate('dashboard');
    loadNotifications();
    if (state.notifTimer) clearInterval(state.notifTimer);
    state.notifTimer = setInterval(loadNotifications, 45000);
  }

  function applyRoleUI() {
    const isAdmin = state.user.role === 'admin';
    $$('[data-admin]').forEach(el => { el.hidden = !isAdmin; });
    $('#newCycleBtn').style.display = can.createCycle() ? '' : 'none';
  }
  function renderAccount() {
    const u = state.user;
    setAvatarEl($('#accountBtn'), $('#avatarInitials'), u);
    setPhotoPreview($('#accPhotoPreview'), u.photoUrl || '', u.nama);
    $('#accName').textContent = u.nama;
    const rt = $('#accRole'); rt.textContent = ROLE_LABEL[u.role]; rt.className = 'role-tag ' + u.role;
    $('#accNameInput').value = u.nama; $('#accJabatan').value = u.jabatan || ''; $('#accInstansi').value = u.instansi || ''; $('#accEmail').value = u.email || '';
  }
  // Avatar dgn ikon inisial di dalam span, foto sbg background pada tombol
  function setAvatarEl(btn, span, u) {
    if (u.photoUrl) { btn.style.backgroundImage = `url("${u.photoUrl}")`; btn.classList.add('has-photo'); span.textContent = ''; }
    else { btn.style.backgroundImage = ''; btn.classList.remove('has-photo'); span.textContent = initials(u.nama); }
  }
  function setPhotoPreview(el, url, nama) {
    if (url) { el.style.backgroundImage = `url("${url}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.textContent = initials(nama || ''); }
  }

  // ---------------- Navigation ----------------
  const PHASE_VIEWS = { plan: 'plan', do: 'do', see: 'see' };
  function navigate(view) {
    // Pertahankan ketikan yang belum disimpan saat berpindah tab fase.
    if (PHASE_VIEWS[state.view] && state.current) { try { collectFields(state.current); } catch {} }
    state.view = view;
    $$('.view').forEach(v => { v.hidden = true; });
    const el = $('#view-' + view); if (el) el.hidden = false;
    $$('.topnav-tab').forEach(t => t.classList.toggle('active', t.dataset.nav === view));
    const isPhase = !!PHASE_VIEWS[view];
    $('#cycleContext').hidden = !isPhase;
    if (isPhase) startEntriesPoll(); else stopEntriesPoll();
    if (view === 'dashboard') renderDashboard();
    else if (isPhase) renderPhaseView(view);
    else if (view === 'repo') loadRepo();
    else if (view === 'users') loadUsers();
    else if (view === 'schools') loadSchools();
    else if (view === 'institutions') loadInstitutions();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { closeDrawer(); navigate(nav.dataset.nav); return; }
    const close = e.target.closest('[data-close]');
    if (close) { $('#' + close.dataset.close).hidden = true; return; }
    // Buka-tutup panel (klik judul panel)
    const head = e.target.closest('.panel-head');
    if (head && head.parentElement.classList.contains('panel')) head.parentElement.classList.toggle('collapsed');
  });
  // Toolbar editor teks kaya (global: berlaku utk fase & modal)
  document.addEventListener('mousedown', e => { if (e.target.closest('.rte-btn')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const btn = e.target.closest('.rte-btn'); if (!btn) return;
    const rte = btn.closest('.rte'); if (!rte) return;
    const area = rte.querySelector('.rte-area'); if (!area) return;
    area.focus();
    if (btn.dataset.block) document.execCommand('formatBlock', false, btn.dataset.block);
    else document.execCommand(btn.dataset.cmd, false, null);
  });

  // drawer
  $('#menuBtn').addEventListener('click', () => { $('#drawerOverlay').hidden = false; });
  function closeDrawer() { $('#drawerOverlay').hidden = true; }
  $('#drawerOverlay').addEventListener('click', e => { if (e.target.id === 'drawerOverlay') closeDrawer(); });
  $('#drawerNewCycle').addEventListener('click', () => { closeDrawer(); openCycleForm(null); });
  $('#drawerAccount').addEventListener('click', () => { closeDrawer(); renderAccount(); $('#accountModal').hidden = false; });
  $('#drawerLogout').addEventListener('click', () => { closeDrawer(); doLogout(); });

  // ---------------- Data ----------------
  async function loadCycles() { const d = await api('GET', '/cycles'); state.cycles = d.cycles; }
  function activeCycleSummary() { return state.cycles.find(c => c.id === state.activeId) || null; }

  async function ensureActiveLoaded() {
    // Jika siklus aktif tak ada di daftar (mis. terhapus/di luar akses), pilih ulang yang pertama
    // agar dropdown "Siklus aktif" dan isi tab selalu cocok.
    if (state.activeId && !state.cycles.some(c => c.id === state.activeId)) {
      state.activeId = state.cycles[0] ? state.cycles[0].id : null;
      if (state.activeId) localStorage.setItem(ACTIVE_KEY, state.activeId); else localStorage.removeItem(ACTIVE_KEY);
      state.current = null;
    }
    if (!state.activeId) { state.current = null; return; }
    if (state.current && state.current.id === state.activeId) return;
    try { const d = await api('GET', '/cycles/' + state.activeId); state.current = d.cycle; }
    catch { state.current = null; state.activeId = null; }
  }

  // ---------------- Dashboard ----------------
  async function renderDashboard() {
    $('#welcomeName').textContent = 'Halo, ' + state.user.nama.split(' ')[0] + ' 👋';
    $('#welcomeRole').textContent = ROLE_LABEL[state.user.role] + (state.user.instansi ? ' · ' + state.user.instansi : '');
    renderCycleList();
  }
  function cycleCard(c) {
    return `<div class="cycle-card st-${c.status}" data-open="${c.id}">
      <div class="cycle-foot" style="margin:0"><span class="status-pill ${c.status}">${STATUS_LABEL[c.status]}</span>${c.published ? '<span class="badge-pub">🏆 Praktik Baik</span>' : ''}</div>
      <h4>${esc(c.title)}</h4>
      <div class="cycle-meta">${c.mapel ? `<span>📚 ${esc(c.mapel)}</span>` : ''}${c.materi ? `<span>📖 ${esc(c.materi)}</span>` : ''}${c.kelas ? `<span>🎓 ${esc(c.kelas)}</span>` : ''}${c.sekolah ? `<span>🏫 ${esc(c.sekolah)}</span>` : ''}</div>
      <div class="cycle-foot"><span class="tag owner">👤 ${esc(c.ownerName || '')}</span><span class="muted" style="font-size:.75rem">👥 ${c.memberCount} · 💬 ${c.entryCount}</span></div>
    </div>`;
  }
  function renderCycleList() {
    const q = ($('#cycleSearch').value || '').toLowerCase();
    let list = state.cycles;
    if (state.statusFilter !== 'all') list = list.filter(c => c.status === state.statusFilter);
    if (q) list = list.filter(c => (c.title + ' ' + c.mapel + ' ' + c.sekolah + ' ' + c.kelas + ' ' + c.ownerName).toLowerCase().includes(q));
    $('#cycleList').innerHTML = list.length ? list.map(cycleCard).join('') : emptyState('🔄', 'Belum ada siklus. Klik "+ Siklus Baru".');
  }
  $('#cycleSearch').addEventListener('input', renderCycleList);
  // buka siklus dari kartu → jadikan aktif → ke Plan (atau fase saat ini)
  document.addEventListener('click', async e => {
    const open = e.target.closest('[data-open]'); if (!open) return;
    state.activeId = open.dataset.open; localStorage.setItem(ACTIVE_KEY, state.activeId);
    state.current = null;
    await ensureActiveLoaded();
    const c = state.current;
    const go = c && c.status && c.status !== 'selesai' ? c.status : 'plan';
    navigate(PHASE_VIEWS[go] ? go : 'plan');
  });

  // ---------------- Cycle context bar ----------------
  function renderCycleContext() {
    const sel = $('#cycleSwitcher');
    sel.innerHTML = state.cycles.map(c => `<option value="${c.id}" ${c.id === state.activeId ? 'selected' : ''}>${esc(c.title)} — ${STATUS_LABEL[c.status]}</option>`).join('') || '<option value="">(belum ada siklus)</option>';
    const c = state.current;
    const acts = $('#ccActions');
    if (!c) { acts.innerHTML = ''; return; }
    const editable = can.edit(c);
    acts.innerHTML = `
      <span class="status-pill ${c.status}">${STATUS_LABEL[c.status]}</span>
      ${c.praktikBaik && c.praktikBaik.published ? '<span class="badge-pub">🏆 Praktik Baik</span>' : ''}
      ${editable ? `<button class="btn btn-ghost btn-sm" data-cc="edit">✎ Info</button>` : ''}
      ${editable && c.status !== 'selesai' ? `<button class="btn btn-primary btn-sm" data-cc="advance">${advanceLabel(c.status)}</button>` : ''}
      ${can.publish() && (c.status === 'see' || c.status === 'selesai') ? `<button class="btn btn-ghost btn-sm" data-cc="publish">🏆 ${c.praktikBaik && c.praktikBaik.published ? 'Perbarui' : 'Terbitkan'}</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-cc="print">🖨️ PDF</button>
      ${can.delete(c) ? `<button class="btn btn-danger btn-sm" data-cc="delete">🗑</button>` : ''}`;
  }
  function advanceLabel(st) { return st === 'plan' ? 'Lanjut ke Do →' : st === 'do' ? 'Lanjut ke See →' : 'Tandai Selesai ✓'; }
  $('#cycleSwitcher').addEventListener('change', async e => {
    state.activeId = e.target.value; localStorage.setItem(ACTIVE_KEY, state.activeId); state.current = null;
    await renderPhaseView(state.view);
  });
  $('#ccActions').addEventListener('click', e => {
    const b = e.target.closest('[data-cc]'); if (!b || !state.current) return;
    const c = state.current;
    const a = b.dataset.cc;
    if (a === 'edit') openCycleForm(c);
    else if (a === 'advance') advancePhase(c);
    else if (a === 'publish') openPublish(c);
    else if (a === 'print') printCycleReport(c);
    else if (a === 'delete') deleteCycle(c);
  });

  // ---------------- Phase views (dua kolom) ----------------
  let pendingUploads = { 'plan.attachments': [], 'pelaksanaan.videos': [], 'pelaksanaan.observasiDocs': [] };

  async function renderPhaseView(view) {
    await ensureActiveLoaded();
    renderCycleContext();
    const bodyEl = $('#' + view + 'Body');
    const c = state.current;
    if (!c) {
      bodyEl.innerHTML = `<div class="phase-empty"><span class="ic">🗂️</span>Belum ada siklus dipilih.<br><button class="btn btn-primary btn-sm" style="margin-top:.8rem" data-nav="dashboard">Ke Dashboard</button></div>`;
      return;
    }
    pendingUploads = { 'plan.attachments': [], 'pelaksanaan.videos': [], 'pelaksanaan.observasiDocs': [] };
    const editable = can.edit(c), contrib = can.contribute(c);
    if (view === 'plan') bodyEl.innerHTML = planView(c, editable);
    else if (view === 'do') bodyEl.innerHTML = doView(c, editable);
    else if (view === 'see') bodyEl.innerHTML = seeView(c, editable);
    wirePhase(c, view);
  }

  function metaBar(c) {
    return `<div class="phase-meta-bar">
      <span><b>${esc(c.title)}</b></span>
      ${c.mapel ? `<span>📚 ${esc(c.mapel)}</span>` : ''}${c.materi ? `<span>📖 ${esc(c.materi)}</span>` : ''}${c.kelas ? `<span>🎓 ${esc(c.kelas)}</span>` : ''}${c.sekolah ? `<span>🏫 ${esc(c.sekolah)}</span>` : ''}
      <span>👤 ${esc(c.ownerName)}</span>
    </div>`;
  }
  function membersPanel(c) {
    const members = c.members || [];
    return `<div class="panel"><div class="panel-head"><span class="ph-ic">👥</span> Tim Kolaborasi</div><div class="panel-body">
      <div class="members-row"><span class="member-badge"><span class="dot guru"></span>${esc(c.ownerName)} · Guru Model</span>${members.map(m => `<span class="member-badge"><span class="dot ${cycleRoleClass(c, m.id, m.role)}"></span>${esc(m.nama)} · ${cycleRoleLabel(c, m.id, m.role)}</span>`).join('')}</div>
    </div></div>`;
  }
  function userRole(id) { const u = state.directory.find(x => x.id === id); return u ? u.role : 'guru'; }
  // Peran kontekstual dalam satu siklus: pembuat/pemilik = Guru Model, guru lain = Guru Observer
  function cycleRoleLabel(c, userId, accountRole) {
    if (c && userId && c.ownerId === userId) return 'Guru Model';
    if (accountRole === 'dosen') return 'Dosen Pengawas';
    if (accountRole === 'admin') return 'Admin Sistem';
    return 'Guru Observer';
  }
  function cycleRoleClass(c, userId, accountRole) {
    if (c && userId && c.ownerId === userId) return 'guru';
    if (accountRole === 'dosen') return 'dosen';
    if (accountRole === 'admin') return 'admin';
    return 'observer';
  }

  // Stepper Plan→Do→See→Selesai (menegaskan ketiga tab = satu siklus)
  function phaseStepper(c, currentView) {
    const steps = [['plan', 'Plan', '📝'], ['do', 'Do', '🎥'], ['see', 'See', '🔍'], ['selesai', 'Selesai', '🏁']];
    const order = { plan: 0, do: 1, see: 2, selesai: 3 };
    const activeIdx = order[c.status] != null ? order[c.status] : 0;
    return `<div class="mini-stepper">${steps.map(([k, l, ic], i) => {
      const reached = i <= activeIdx;
      const isCurrent = k === currentView;
      const clickable = k !== 'selesai';
      return `<div class="ms-step ${k}${reached ? ' reached' : ''}${isCurrent ? ' current' : ''}${clickable ? ' clickable' : ''}"${clickable ? ` data-nav="${k}"` : ''}>${ic} ${l}</div>`;
    }).join('<span class="ms-sep">›</span>')}</div>`;
  }
  // Panel acuan ringkas (fase terdahulu terbawa ke fase berikutnya)
  function refRow(label, val, fmt) {
    const has = val != null && val !== '';
    return `<div class="ref-row"><span class="ref-label">${label}</span><div class="ref-val${has ? '' : ' empty'}">${has ? (fmt ? fmt(val) : richDisplay(val)) : '— belum diisi'}</div></div>`;
  }
  function planRefPanel(c) {
    const p = c.plan || {};
    const jadwal = p.tanggalRencana ? fmtDate(p.tanggalRencana) + (p.jamRencana ? ' · ' + p.jamRencana + ' WITA' : '') : '';
    return `<div class="panel"><div class="panel-head plan"><span class="ph-ic">📋</span> Acuan Rencana (Plan)</div><div class="panel-body ref-body">${refRow('Capaian pembelajaran', p.desain)}${refRow('Tujuan pembelajaran', p.tujuan)}${refRow('Rencana open class', jadwal)}</div></div>`;
  }
  function doRefPanel(c) {
    const d = c.pelaksanaan || {};
    const jadwal = d.tanggal ? fmtDate(d.tanggal) + (d.jam ? ' · ' + d.jam + ' WITA' : '') : '';
    return `<div class="panel"><div class="panel-head do"><span class="ph-ic">📋</span> Acuan Pelaksanaan (Do)</div><div class="panel-body ref-body">${refRow('Tanggal & jam', jadwal)}${refRow('Catatan pelaksanaan', d.catatan)}</div></div>`;
  }
  // Panel perangkat (dokumen) yang diunggah Guru Model (pemilik), diunduh anggota — dipakai Do & See
  function perangkatDocsPanel(c, editable, field, title, emptyText) {
    const [grp, key] = field.split('.');
    const headClass = grp === 'refleksi' ? 'see' : (grp === 'pelaksanaan' ? 'do' : 'plan');
    const docs = (c[grp] && c[grp][key]) || [];
    const items = docs.length
      ? `<div class="file-list">${docs.map(a => `<div class="file-item"><span class="ic">${attIcon(a)}</span><span class="nm" data-preview="${esc(a.url)}" data-type="${esc(a.type)}" data-name="${esc(a.name)}" title="Buka ${esc(a.name)}">${esc(a.name)}</span><span class="sz">${fmtSize(a.size)}</span><a class="file-dl" href="${esc(a.url)}" download="${esc(a.name)}" title="Unduh">⬇️</a>${editable ? `<button type="button" class="x" data-rmodoc="${a.id}" data-odocfield="${field}">✕</button>` : ''}</div>`).join('')}</div>`
      : `<div class="file-empty">${emptyText || 'Belum ada dokumen.'}</div>`;
    return `<div class="panel">
      <div class="panel-head ${headClass}"><span class="ph-ic">📋</span> ${title}</div>
      <div class="panel-body">
        ${items}
        ${editable ? `<label class="add-file-btn">➕ Tambah dokumen<input type="file" hidden multiple accept=".doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,image/*" data-upload="${field}"></label>` : ''}
      </div>
    </div>`;
  }

  // PLAN
  function planView(c, editable) {
    const p = c.plan || {};
    const atts = p.attachments || [];
    const videos = atts.filter(a => isVideoFile(a.type, a.url));
    const docs = atts.filter(a => !isVideoFile(a.type, a.url));
    return `${metaBar(c)}${phaseStepper(c, 'plan')}<div class="phase-layout">
      <div class="phase-main">
        <div class="panel">
          <div class="panel-head plan"><span class="ph-ic">📝</span> Rencana Pembelajaran${c.mapel ? ' — ' + esc(c.mapel) : ''}</div>
          <div class="panel-body">
            ${richField('Capaian pembelajaran', 'plan.desain', p.desain, editable, 'Rumuskan capaian pembelajaran (CP) yang ditargetkan…')}
            ${richField('Tujuan pembelajaran', 'plan.tujuan', p.tujuan, editable, 'Rumuskan tujuan/kompetensi yang ingin dicapai…')}
            ${dateTimeField('Rencana open class', 'plan.tanggalRencana', 'plan.jamRencana', p.tanggalRencana, p.jamRencana, editable)}
            ${editable ? saveRow('plan') : ''}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head plan"><span class="ph-ic">💬</span> Diskusi Perencanaan</div>
          <div class="panel-body">${threadHtml(c, 'plan', can.contribute(c))}</div>
        </div>
      </div>
      <div class="phase-side">
        <div class="panel">
          <div class="panel-head plan"><span class="ph-ic">📎</span> Perangkat Perencanaan</div>
          <div class="panel-body">
            ${docsHtml(docs, editable)}
            ${editable ? `<label class="add-file-btn">➕ Tambah dokumen<input type="file" hidden multiple accept=".doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,image/*" data-upload="plan.attachments"></label>` : ''}
            ${videos.length ? `<div class="file-list" style="margin-top:.5rem">${videos.map(v => videoPlayerItem(v, editable)).join('')}</div>` : ''}
            ${(() => { const pEmbed = ((p.videoLinks || []).map(v => ytEmbed(v.url)).find(Boolean)); return pEmbed ? `<div class="video-embed" style="margin-top:.5rem"><iframe src="${pEmbed}" allowfullscreen loading="lazy"></iframe></div>` : ''; })()}
            ${videoLinksHtml(p.videoLinks, editable, 'plan.videoLinks')}
            ${editable ? `<label class="add-file-btn">🎬 Tambah video<input type="file" hidden accept="video/*" data-upload="plan.attachments"></label>
              <div class="row" style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap"><input type="text" id="vlTitle" placeholder="Judul (opsional)" style="flex:1 1 120px;min-width:110px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><input type="url" id="vlUrl" placeholder="Tautan YouTube/Drive…" style="flex:2 1 160px;min-width:140px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><button type="button" class="btn btn-primary btn-sm" id="addVideoLink" data-vlfield="plan.videoLinks" style="white-space:nowrap">➕ Simpan Tautan</button></div>` : ''}
          </div>
        </div>
        ${observerDocsPanel(c, 'plan.observerDocs')}
        ${membersPanel(c)}
      </div>
    </div>`;
  }
  // Pemutar video inline (panel utama Plan)
  function videoPlayerItem(v, editable) {
    return `<div class="file-media"><video controls preload="metadata" src="${esc(v.url)}"></video><div class="file-item"><span class="ic">🎬</span><span class="nm">${esc(v.name)}</span><span class="sz">${fmtSize(v.size)}</span>${editable ? `<button type="button" class="x" data-rmatt="${v.id}">✕</button>` : ''}</div></div>`;
  }
  // Daftar dokumen (Perangkat Pembelajaran) — klik nama untuk pratinjau di aplikasi, ikon unduh untuk mengunduh
  function docsHtml(list, editable) {
    list = list || [];
    if (!list.length) return `<div class="file-empty">Belum ada dokumen.</div>`;
    return `<div class="file-list">${list.map(a => `<div class="file-item"><span class="ic">${attIcon(a)}</span><span class="nm" data-preview="${esc(a.url)}" data-type="${esc(a.type)}" data-name="${esc(a.name)}" title="Buka ${esc(a.name)}">${esc(a.name)}</span><span class="sz">${fmtSize(a.size)}</span><a class="file-dl" href="${esc(a.url)}" download="${esc(a.name)}" title="Unduh">⬇️</a>${editable ? `<button type="button" class="x" data-rmatt="${a.id}">✕</button>` : ''}</div>`).join('')}</div>`;
  }

  // Panel unggahan observer — dokumen yang diunduh & diisi observer (per tahap)
  function observerDocsPanel(c, field) {
    const u = state.user;
    const contrib = can.contribute(c);
    // Pemilik (Guru Model) hanya melihat dokumen observer; tombol unggah untuk kontributor selain pemilik
    const canUpload = contrib && u && u.id !== c.ownerId;
    const [grp, key] = field.split('.');
    const headClass = grp === 'pelaksanaan' ? 'do' : (grp === 'refleksi' ? 'see' : 'plan');
    const list = (c[grp] && c[grp][key]) || [];
    const items = list.map(a => {
      const canRm = u && (u.role === 'admin' || a.uploaderId === u.id || c.ownerId === u.id);
      return `<div class="file-item"><span class="ic">${attIcon(a)}</span><span class="nm" data-preview="${esc(a.url)}" data-type="${esc(a.type)}" data-name="${esc(a.name)}" title="Buka ${esc(a.name)}">${esc(a.name)}</span><a class="file-dl" href="${esc(a.url)}" download="${esc(a.name)}" title="Unduh">⬇️</a>${canRm ? `<button type="button" class="x" data-rmobs="${a.id}">✕</button>` : ''}<span class="obs-by">👤 ${esc(a.uploaderName || '')}</span></div>`;
    }).join('');
    return `<div class="panel">
      <div class="panel-head ${headClass}"><span class="ph-ic">📤</span> Unggahan Observer</div>
      <div class="panel-body">
        ${list.length ? `<div class="file-list obs-list">${items}</div>` : '<div class="file-empty">Belum ada dokumen dari observer.</div>'}
        ${canUpload ? `<label class="add-file-btn">➕ Unggah dokumen<input type="file" hidden multiple accept=".doc,.docx,.xls,.xlsx,.pdf,.ppt,.pptx,image/*" data-upload="${field}"></label>` : ''}
      </div>
    </div>`;
  }

  // DO
  function doView(c, editable) {
    const d = c.pelaksanaan || {};
    const p = c.plan || {};
    // Pra-isi tanggal & jam pelaksanaan dari jadwal open class (Plan) bila belum diisi
    const doTgl = d.tanggal || p.tanggalRencana || '';
    const doJam = d.jam || p.jamRencana || '';
    const firstVideo = (d.videos || [])[0];
    const firstEmbed = (d.videoLinks || []).map(v => ytEmbed(v.url)).find(Boolean);
    let player = '';
    if (firstVideo) player = `<div class="video-block"><video controls preload="metadata" src="${esc(firstVideo.url)}"></video></div>`;
    else if (firstEmbed) player = `<div class="video-embed"><iframe src="${firstEmbed}" allowfullscreen loading="lazy"></iframe></div>`;
    else player = `<div class="readonly-text empty">Belum ada video pembelajaran.</div>`;
    return `${metaBar(c)}${phaseStepper(c, 'do')}<div class="phase-layout">
      <div class="phase-main">
        <div class="panel">
          <div class="panel-head do"><span class="ph-ic">🎥</span> Pembelajaran${c.mapel ? ' ' + esc(c.mapel) : ''}${doTgl ? ' — ' + fmtDate(doTgl) : ''}${doJam ? ' ' + esc(doJam) : ''}</div>
          <div class="panel-body">
            ${player}
            ${videoThumbs(d.videos, editable)}
            ${videoLinksHtml(d.videoLinks, editable)}
            ${editable ? `<label class="add-file-btn">🎬 Unggah video<input type="file" hidden accept="video/*" data-upload="pelaksanaan.videos"></label>
              <div class="row" style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap"><input type="text" id="vlTitle" placeholder="Judul (opsional)" style="flex:1 1 120px;min-width:110px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><input type="url" id="vlUrl" placeholder="Tautan YouTube/Drive…" style="flex:2 1 160px;min-width:140px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><button type="button" class="btn btn-primary btn-sm" id="addVideoLink" style="white-space:nowrap">➕ Simpan Tautan</button></div>` : ''}
            ${textField('Catatan', 'pelaksanaan.catatan', d.catatan, editable, 'Kejadian penting saat open class…', true)}
            ${editable ? saveRow('do') : ''}
            <div class="obs-block">
              <div class="sub-head"><span class="ph-ic">🔭</span> Diskusi Observasi</div>
              ${threadHtml(c, 'do', can.contribute(c))}
            </div>
          </div>
        </div>
      </div>
      <div class="phase-side">
        ${perangkatDocsPanel(c, editable, 'pelaksanaan.observasiDocs', 'Perangkat Observasi', 'Belum ada perangkat observasi.')}
        ${observerDocsPanel(c, 'pelaksanaan.observerDocs')}
        ${planRefPanel(c)}
        ${membersPanel(c)}
      </div>
    </div>`;
  }

  // SEE
  function seeView(c, editable) {
    const s = c.refleksi || {};
    const rv = s.videos || [];
    const rvl = s.videoLinks || [];
    const rEmbed = rvl.map(v => ytEmbed(v.url)).find(Boolean);
    return `${metaBar(c)}${phaseStepper(c, 'see')}<div class="phase-layout">
      <div class="phase-main">
        <div class="panel">
          <div class="panel-head see"><span class="ph-ic">🎬</span> Video</div>
          <div class="panel-body">
            ${rv.length ? `<div class="file-list">${rv.map(v => `<div class="file-media"><video controls preload="metadata" src="${esc(v.url)}"></video><div class="file-item"><span class="ic">🎬</span><span class="nm">${esc(v.name)}</span><span class="sz">${fmtSize(v.size)}</span>${editable ? `<button type="button" class="x" data-rmvid="${v.id}" data-vidfield="refleksi.videos">✕</button>` : ''}</div></div>`).join('')}</div>` : '<div class="file-empty">Belum ada video.</div>'}
            ${rEmbed ? `<div class="video-embed"><iframe src="${rEmbed}" allowfullscreen loading="lazy"></iframe></div>` : ''}
            ${videoLinksHtml(rvl, editable, 'refleksi.videoLinks')}
            ${editable ? `<label class="add-file-btn">🎬 Unggah video<input type="file" hidden accept="video/*" data-upload="refleksi.videos"></label>
              <div class="row" style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap"><input type="text" id="vlTitle" placeholder="Judul (opsional)" style="flex:1 1 120px;min-width:110px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><input type="url" id="vlUrl" placeholder="Tautan YouTube/Drive…" style="flex:2 1 160px;min-width:140px;padding:.5rem .6rem;border:1.5px solid var(--line);border-radius:9px"><button type="button" class="btn btn-primary btn-sm" id="addVideoLink" data-vlfield="refleksi.videoLinks" style="white-space:nowrap">➕ Simpan Tautan</button></div>` : ''}
            ${textField('Catatan', 'refleksi.catatan', s.catatan, editable, 'Kejadian penting saat refleksi…', true)}
            ${editable ? saveRow('see') : ''}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head see"><span class="ph-ic">🗣️</span> Diskusi Refleksi</div>
          <div class="panel-body">${threadHtml(c, 'see', can.contribute(c))}</div>
        </div>
      </div>
      <div class="phase-side">
        ${perangkatDocsPanel(c, editable, 'refleksi.perangkatDocs', 'Perangkat Refleksi', 'Belum ada perangkat refleksi.')}
        ${observerDocsPanel(c, 'refleksi.observerDocs')}
        <div class="panel">
          <div class="panel-head see"><span class="ph-ic">📊</span> Analisis & Rekomendasi</div>
          <div class="panel-body">
            ${textField('Analisis pembelajaran', 'refleksi.analisis', s.analisis, editable, 'Analisis berbasis data: capaian, temuan, keterlibatan siswa…', true)}
            ${textField('Rekomendasi perbaikan', 'refleksi.rekomendasi', s.rekomendasi, editable, 'Rekomendasi untuk siklus / pembelajaran berikutnya…', true)}
            ${editable ? saveRow('see') : ''}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head see"><span class="ph-ic">🎞️</span> Analisis Video</div>
          <div class="panel-body">${videoThumbs((c.pelaksanaan || {}).videos) || '<div class="file-empty">Belum ada rekaman video.</div>'}${videoLinksHtml((c.pelaksanaan || {}).videoLinks, false)}</div>
        </div>
        ${planRefPanel(c)}
        ${doRefPanel(c)}
        ${membersPanel(c)}
      </div>
    </div>`;
  }

  // ---- field renderers ----
  function textField(label, key, val, editable, ph, big) {
    if (editable) return `<div class="field-block"><label>${label}</label><textarea data-field="${key}" rows="${big ? 4 : 2}" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea></div>`;
    return `<div class="field-block"><label>${label}</label><div class="readonly-text${val ? '' : ' empty'}">${val ? esc(val) : 'Belum diisi'}</div></div>`;
  }
  // Editor teks kaya (mirip MS Word) — default tampil read-only; toolbar muncul saat "Edit"
  function richField(label, key, val, editable, ph) {
    if (!editable) return `<div class="field-block"><label>${label}</label><div class="readonly-text${val ? '' : ' empty'}">${val ? richDisplay(val) : 'Belum diisi'}</div></div>`;
    return `<div class="field-block rich-field">
      <label>${label} <button type="button" class="rte-edit-btn" data-rteedit>✎ Edit</button></label>
      <div class="readonly-text rich-view${val ? '' : ' empty'}" data-rteview>${val ? richDisplay(val) : 'Belum diisi'}</div>
      <div class="rte" data-rtewrap hidden>
        <div class="rte-toolbar">
          <button type="button" class="rte-btn" data-cmd="bold" title="Tebal"><b>B</b></button>
          <button type="button" class="rte-btn" data-cmd="italic" title="Miring"><i>I</i></button>
          <button type="button" class="rte-btn" data-cmd="underline" title="Garis bawah"><u>U</u></button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="insertUnorderedList" title="Daftar poin">• </button>
          <button type="button" class="rte-btn" data-cmd="insertOrderedList" title="Daftar nomor">1.</button>
          <button type="button" class="rte-btn" data-block="H3" title="Sub-judul">H</button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="removeFormat" title="Hapus format">⌫</button>
        </div>
        <div class="rte-area" contenteditable="true" data-richfield="${key}" data-placeholder="${esc(ph || '')}">${richDisplay(val)}</div>
      </div></div>`;
  }
  function dateField(label, key, val, editable) {
    if (editable) return `<div class="field-block"><label>${label}</label><input type="date" data-field="${key}" value="${val || ''}" style="max-width:220px"></div>`;
    return `<div class="field-block"><label>${label}</label><div class="readonly-text${val ? '' : ' empty'}">${val ? fmtDate(val) : 'Belum ditentukan'}</div></div>`;
  }
  function dateTimeField(label, dateKey, timeKey, dateVal, timeVal, editable) {
    if (editable) return `<div class="field-block"><label>${label}</label><div style="display:flex;gap:.5rem;flex-wrap:wrap"><input type="date" data-field="${dateKey}" value="${dateVal || ''}" style="max-width:200px"><input type="text" class="time24" data-field="${timeKey}" value="${timeVal || ''}" placeholder="--:-- (24 jam)" maxlength="5" inputmode="numeric" autocomplete="off" style="max-width:150px"></div></div>`;
    const txt = (dateVal ? fmtDate(dateVal) : 'Belum ditentukan') + (timeVal ? ' · ' + timeVal + ' WITA' : '');
    return `<div class="field-block"><label>${label}</label><div class="readonly-text${dateVal ? '' : ' empty'}">${txt}</div></div>`;
  }
  function filesHtml(list, editable) {
    list = list || [];
    if (!list.length) return `<div class="file-empty">Belum ada berkas.</div>`;
    return `<div class="file-list">${list.map(a => fileItem(a, editable)).join('')}</div>`;
  }
  function fileItem(a, editable) {
    const rm = editable ? `<button type="button" class="x" data-rmatt="${a.id}">✕</button>` : '';
    const meta = `<div class="file-item"><span class="ic">${attIcon(a)}</span><span class="nm" data-preview="${esc(a.url)}" data-type="${esc(a.type)}">${esc(a.name)}</span><span class="sz">${fmtSize(a.size)}</span>${rm}</div>`;
    // Video & gambar tampil langsung (inline)
    if (isVideoFile(a.type, a.url)) return `<div class="file-media"><video controls preload="metadata" src="${esc(a.url)}"></video>${meta}</div>`;
    if (isImage(a.type)) return `<div class="file-media"><img class="file-img" src="${esc(a.url)}" alt="" data-preview="${esc(a.url)}" data-type="${esc(a.type)}">${meta}</div>`;
    return meta;
  }
  function videoThumbs(list, editable, field) {
    list = list || []; if (!list.length) return '';
    const fld = field || 'pelaksanaan.videos';
    return `<div class="video-thumbs" style="margin-top:.6rem">${list.map(v => `<div class="video-thumb"><video preload="metadata" src="${esc(v.url)}" data-preview="${esc(v.url)}" data-type="video"></video><div class="vt-cap"><span class="vt-name">${esc(v.name)}</span>${editable ? `<button type="button" class="x vt-del" data-rmvid="${v.id}" data-vidfield="${fld}" title="Hapus video">✕</button>` : ''}</div></div>`).join('')}</div>`;
  }
  function videoLinksHtml(list, editable, field) {
    list = list || []; if (!list.length) return '';
    const fld = field || 'pelaksanaan.videoLinks';
    return `<div class="video-links">${list.map(v => `<div class="video-link-item"><span>🔗</span><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title || v.url)}</a>${editable ? `<button type="button" class="x" data-rmvl="${v.id}" data-vlfield="${fld}">✕</button>` : ''}</div>`).join('')}</div>`;
  }
  function ytEmbed(url) { const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(url || ''); return m ? 'https://www.youtube.com/embed/' + m[1] : ''; }

  function threadHtml(c, phase, contrib) {
    const entries = (c.entries || []).filter(e => e.phase === phase);
    const list = entries.length ? entries.map(e => entryHtml(e, c)).join('') : `<div class="entry-empty">Belum ada catatan.</div>`;
    const ph = { plan: 'Diskusikan rencana pelajaran…', do: 'Tambahkan catatan observasi…', see: 'Apa yang berjalan baik? Apa yang perlu diperbaiki?' }[phase];
    // Tag perangkat perencanaan (dokumen & video) + unggahan observer — khusus Diskusi Perencanaan/Plan
    const planAtts = phase === 'plan' ? ((c.plan && c.plan.attachments) || []) : [];
    const obsDocs = phase === 'plan' ? ((c.plan && c.plan.observerDocs) || []) : [];
    const vidLinks = phase === 'plan' ? ((c.plan && c.plan.videoLinks) || []) : [];
    const tagSelect = (planAtts.length || obsDocs.length || vidLinks.length) ? `<select data-refatt class="tag-select"><option value="">📎 Tag perangkat/unggahan (opsional)…</option>${planAtts.map(a => `<option value="${esc(a.id)}">${isVideoFile(a.type, a.url) ? '🎬 ' : '📄 '}${esc(a.name)}</option>`).join('')}${vidLinks.map(v => `<option value="${esc(v.id)}">🔗 ${esc(v.title || v.url)}</option>`).join('')}${obsDocs.map(a => `<option value="${esc(a.id)}">👤 ${esc(a.name)}${a.uploaderName ? ' — ' + esc(a.uploaderName) : ''}</option>`).join('')}</select>` : '';
    const form = contrib ? `<div class="entry-form" data-entryform="${phase}">
        ${phase === 'do' ? `<input type="text" data-fokus placeholder="Fokus observasi (opsional)">` : ''}
        <textarea data-text rows="2" placeholder="${ph}"></textarea>
        ${tagSelect}
        <div class="row"><button type="button" class="btn btn-primary btn-sm" data-sendentry="${phase}">Kirim</button></div>
      </div>` : '';
    return `<div class="thread">${list}</div>${form}`;
  }
  function entryHtml(e, c) {
    const mine = state.user && (e.userId === state.user.id || state.user.role === 'admin');
    const rLabel = cycleRoleLabel(c, e.userId, e.role); const rClass = cycleRoleClass(c, e.userId, e.role);
    const refChip = e.ref ? `<div class="entry-ref"><span class="ref-chip" data-preview="${esc(e.ref.url)}" data-type="${esc(e.ref.type)}" data-name="${esc(e.ref.name)}" title="Buka ${esc(e.ref.name)}">${e.ref.type === 'video-link' ? '🔗' : (isVideoFile(e.ref.type, e.ref.url) ? '🎬' : '📎')} ${esc(e.ref.name)}</span></div>` : '';
    return `<div class="entry ${e.phase}"><div class="entry-head"><span class="who">${esc(e.userName)}</span><span class="role-tag ${rClass}">${rLabel}</span><span class="when">${relTime(e.createdAt)}</span>${mine ? `<button class="del" data-rment="${e.id}" title="Hapus">🗑</button>` : ''}</div>${e.fokus ? `<div class="entry-fokus">🎯 ${esc(e.fokus)}</div>` : ''}<div class="entry-text">${esc(e.text)}</div>${refChip}</div>`;
  }
  function saveRow(phase) { return `<div class="save-row"><button type="button" class="btn btn-primary btn-sm" data-savephase="${phase}">💾 Simpan</button><span class="save-hint" data-savehint="${phase}" hidden>✓ Tersimpan</span></div>`; }

  // ---------------- Phase wiring ----------------
  // Input jam 24 jam (HH:MM) — otomatis sisip titik dua & validasi 00–23:00–59
  function wireTime24(scope) {
    $$('.time24', scope).forEach(inp => {
      inp.addEventListener('input', () => {
        let v = inp.value.replace(/[^0-9]/g, '').slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
        inp.value = v;
      });
      inp.addEventListener('blur', () => {
        if (!inp.value) return;
        const m = /^(\d{1,2}):?(\d{0,2})$/.exec(inp.value);
        if (!m) { inp.value = ''; return; }
        const h = Math.min(23, parseInt(m[1] || '0', 10));
        const mm = Math.min(59, parseInt(m[2] || '0', 10));
        inp.value = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      });
    });
  }
  function wirePhase(c, view) {
    const body = $('#' + view + 'Body');
    wireTime24(body);
    $$('[data-upload]', body).forEach(inp => {
      inp.addEventListener('change', async () => {
        const key = inp.dataset.upload;
        const files = Array.from(inp.files); inp.value = '';
        if (!files.length) return;
        try {
          showUploadProgress('Mengunggah… 0%');
          let done = 0;
          for (const f of files) {
            if (f.size > 200 * 1024 * 1024) { toast('“' + f.name + '” melebihi 200 MB', 'err'); continue; }
            const d = await apiUploadBinary(c.id, key, f, setUploadProgress);
            state.current = d.cycle; done++;
          }
          if (done) { hideUploadProgress('✅ Berkas berhasil diunggah'); await loadCycles(); await renderPhaseView(view); }
          else hideUploadProgress();
        } catch (ex) { hideUploadProgress(); toast(ex.message, 'err'); }
      });
    });
  }
  // Handler klik panel fase — dipasang SEKALI per body (bukan tiap render) agar tidak menumpuk
  async function onPhaseBodyClick(ev) {
    const c = state.current; if (!c) return;
    const rmAtt = ev.target.closest('[data-rmatt]');
    const rmVl = ev.target.closest('[data-rmvl]');
    const rmVid = ev.target.closest('[data-rmvid]');
    const rmObs = ev.target.closest('[data-rmobs]');
    const rmOdoc = ev.target.closest('[data-rmodoc]');
    const rment = ev.target.closest('[data-rment]');
    const prev = ev.target.closest('[data-preview]');
    const savePhase = ev.target.closest('[data-savephase]');
    const sendEntry = ev.target.closest('[data-sendentry]');
    const addVl = ev.target.closest('#addVideoLink');
    const rteEdit = ev.target.closest('[data-rteedit]');
    if (rteEdit) { const fb = rteEdit.closest('.rich-field'); if (fb) { const view = fb.querySelector('[data-rteview]'); if (view) view.hidden = true; const wrap = fb.querySelector('[data-rtewrap]'); if (wrap) wrap.hidden = false; rteEdit.hidden = true; const area = fb.querySelector('.rte-area'); if (area) area.focus(); } return; }
    if (rmAtt) { c.plan.attachments = (c.plan.attachments || []).filter(a => a.id !== rmAtt.dataset.rmatt); await savePhaseData(c, state.view); }
    else if (rmVl) { const fld = rmVl.dataset.vlfield || 'pelaksanaan.videoLinks'; const [g, k] = fld.split('.'); if (!c[g]) c[g] = {}; c[g][k] = (c[g][k] || []).filter(v => v.id !== rmVl.dataset.rmvl); await savePhaseData(c, state.view); }
    else if (rmVid) { if (confirm('Hapus video ini?')) { const fld = rmVid.dataset.vidfield || 'pelaksanaan.videos'; const [g, k] = fld.split('.'); if (!c[g]) c[g] = {}; c[g][k] = (c[g][k] || []).filter(v => v.id !== rmVid.dataset.rmvid); await savePhaseData(c, state.view); } }
    else if (rmOdoc) { const fld = rmOdoc.dataset.odocfield || 'pelaksanaan.observasiDocs'; const [g, k] = fld.split('.'); if (!c[g]) c[g] = {}; c[g][k] = (c[g][k] || []).filter(a => a.id !== rmOdoc.dataset.rmodoc); await savePhaseData(c, state.view); }
    else if (rmObs) { await deleteObserverDoc(c, rmObs.dataset.rmobs); }
    else if (rment) { await deleteEntry(c, rment.dataset.rment); }
    else if (prev) { openPreview(prev.dataset.preview, prev.dataset.type, prev.dataset.name); }
    else if (savePhase) { await savePhaseData(c, savePhase.dataset.savephase); }
    else if (sendEntry) { await sendEntry_(c, sendEntry.dataset.sendentry); }
    else if (addVl) { addVideoLink(c, addVl.dataset.vlfield); }
  }
  ['plan', 'do', 'see'].forEach(v => { const el = document.getElementById(v + 'Body'); if (el) el.addEventListener('click', onPhaseBodyClick); });
  function collectFields(c) {
    $$('#view-' + state.view + ' [data-field]').forEach(el => {
      const [group, key] = el.dataset.field.split('.'); if (!c[group]) c[group] = {}; c[group][key] = el.value;
    });
    $$('#view-' + state.view + ' [data-richfield]').forEach(el => {
      const [group, key] = el.dataset.richfield.split('.'); if (!c[group]) c[group] = {}; c[group][key] = sanitizeHtml(el.innerHTML);
    });
  }
  function buildCyclePayload(c) {
    return {
      title: c.title, mapel: c.mapel, materi: c.materi, kelas: c.kelas, sekolah: c.sekolah,
      memberIds: (c.members || []).map(m => m.id), status: c.status,
      plan: { tujuan: c.plan.tujuan, desain: c.plan.desain, tanggalRencana: c.plan.tanggalRencana, jamRencana: c.plan.jamRencana, videoLinks: c.plan.videoLinks || [], attachments: c.plan.attachments || [] },
      pelaksanaan: { tanggal: c.pelaksanaan.tanggal, jam: c.pelaksanaan.jam, catatan: c.pelaksanaan.catatan, videoLinks: c.pelaksanaan.videoLinks || [], videos: c.pelaksanaan.videos || [], observasiDocs: c.pelaksanaan.observasiDocs || [] },
      refleksi: { analisis: c.refleksi.analisis, rekomendasi: c.refleksi.rekomendasi, catatan: c.refleksi.catatan, videoLinks: c.refleksi.videoLinks || [], videos: c.refleksi.videos || [], perangkatDocs: c.refleksi.perangkatDocs || [] }
    };
  }
  async function savePhaseData(c, phase) {
    collectFields(c);
    // Auto-simpan tautan video yang sudah diketik tapi belum di-"+ Tautan"
    const vlUrlEl = $('#vlUrl'), addVlBtn = $('#addVideoLink');
    if (vlUrlEl && vlUrlEl.value.trim() && addVlBtn) {
      const fld = addVlBtn.dataset.vlfield || 'pelaksanaan.videoLinks';
      const [vg, vk] = fld.split('.');
      const vt = ($('#vlTitle') || {}).value ? $('#vlTitle').value.trim() : '';
      if (!c[vg]) c[vg] = {}; c[vg][vk] = c[vg][vk] || [];
      c[vg][vk].push({ id: 'vl_' + Date.now(), title: vt, url: vlUrlEl.value.trim() });
      vlUrlEl.value = ''; if ($('#vlTitle')) $('#vlTitle').value = '';
    }
    const payload = buildCyclePayload(c);
    payload.plan.attachments = [...(c.plan.attachments || []), ...pendingUploads['plan.attachments']];
    payload.pelaksanaan.videos = [...(c.pelaksanaan.videos || []), ...pendingUploads['pelaksanaan.videos']];
    payload.pelaksanaan.observasiDocs = [...(c.pelaksanaan.observasiDocs || []), ...pendingUploads['pelaksanaan.observasiDocs']];
    const hasNew = pendingUploads['plan.attachments'].length || pendingUploads['pelaksanaan.videos'].length || pendingUploads['pelaksanaan.observasiDocs'].length;
    try {
      let d;
      if (hasNew) {
        showUploadProgress('Mengunggah… 0%');
        d = await apiUpload('PUT', '/cycles/' + c.id, payload, setUploadProgress);
        hideUploadProgress('✅ Berkas berhasil diunggah');
      } else {
        d = await api('PUT', '/cycles/' + c.id, payload);
      }
      state.current = d.cycle; pendingUploads = { 'plan.attachments': [], 'pelaksanaan.videos': [], 'pelaksanaan.observasiDocs': [] };
      await loadCycles();
      await renderPhaseView(state.view);
      const hint = $(`[data-savehint="${phase}"]`); if (hint) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 2000); }
      if (!hasNew) toast('Perubahan tersimpan', 'ok');
    } catch (ex) { hideUploadProgress(); toast(ex.message, 'err'); }
  }
  function addVideoLink(c, field) {
    field = field || 'pelaksanaan.videoLinks';
    const title = ($('#vlTitle') || {}).value ? $('#vlTitle').value.trim() : '';
    const url = ($('#vlUrl') || {}).value ? $('#vlUrl').value.trim() : '';
    if (!url) { toast('Isi URL video', 'err'); return; }
    const [g, k] = field.split('.');
    collectFields(c); if (!c[g]) c[g] = {}; c[g][k] = c[g][k] || [];
    c[g][k].push({ id: 'vl_' + Date.now(), title, url });
    if ($('#vlUrl')) $('#vlUrl').value = ''; if ($('#vlTitle')) $('#vlTitle').value = '';
    savePhaseData(c, state.view);
  }
  async function sendEntry_(c, phase) {
    const form = $(`[data-entryform="${phase}"]`);
    const text = $('[data-text]', form).value.trim();
    const fokusEl = $('[data-fokus]', form);
    const refEl = $('[data-refatt]', form);
    if (!text) { toast('Tulis catatan dulu', 'err'); return; }
    try {
      await api('POST', '/cycles/' + c.id + '/entries', { phase, text, fokus: fokusEl ? fokusEl.value : '', refAtt: refEl ? refEl.value : '' });
      const d = await api('GET', '/cycles/' + c.id); state.current = d.cycle;
      await loadCycles(); await renderPhaseView(state.view);
    } catch (ex) { toast(ex.message, 'err'); }
  }
  async function deleteEntry(c, eid) {
    if (!confirm('Hapus catatan ini?')) return;
    try { await api('DELETE', '/cycles/' + c.id + '/entries/' + eid); const d = await api('GET', '/cycles/' + c.id); state.current = d.cycle; await renderPhaseView(state.view); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  async function deleteObserverDoc(c, id) {
    if (!confirm('Hapus dokumen ini?')) return;
    try { const d = await api('DELETE', '/cycles/' + c.id + '/observer-docs/' + id); state.current = d.cycle; await renderPhaseView(state.view); }
    catch (ex) { toast(ex.message, 'err'); }
  }

  // Poll komentar/kontribusi terbaru (muncul otomatis tanpa refresh manual)
  let entriesPollTimer = null;
  function startEntriesPoll() { stopEntriesPoll(); entriesPollTimer = setInterval(pollEntries, 8000); }
  function stopEntriesPoll() { if (entriesPollTimer) clearInterval(entriesPollTimer); entriesPollTimer = null; }
  async function pollEntries() {
    if (!state.user || document.hidden || !PHASE_VIEWS[state.view] || !state.activeId) return;
    if (!state.current || state.current.id !== state.activeId) return;
    try {
      const d = await api('GET', '/cycles/' + state.activeId);
      const fresh = d.cycle;
      if (!fresh || fresh.id !== state.activeId || state.view && !PHASE_VIEWS[state.view]) return;
      if (!state.current || state.current.id !== fresh.id) return;
      const phase = state.view;
      const oldIds = (state.current.entries || []).filter(e => e.phase === phase).map(e => e.id).join();
      const newList = (fresh.entries || []).filter(e => e.phase === phase);
      state.current.entries = fresh.entries; // sinkronkan data komentar terbaru
      if (oldIds === newList.map(e => e.id).join()) return; // tak ada perubahan
      const bodyEl = $('#' + state.view + 'Body');
      const threadEl = bodyEl ? bodyEl.querySelector('.thread') : null;
      if (threadEl) threadEl.innerHTML = newList.length ? newList.map(e => entryHtml(e, state.current)).join('') : `<div class="entry-empty">Belum ada catatan.</div>`;
    } catch {}
  }
  async function advancePhase(c) {
    const next = { plan: 'do', do: 'see', see: 'selesai' }[c.status]; if (!next) return;
    if (!confirm('Lanjut ke tahap ' + STATUS_LABEL[next] + '?')) return;
    try {
      const d = await api('PUT', '/cycles/' + c.id + '/status', { status: next }); state.current = d.cycle;
      await loadCycles();
      const target = next === 'selesai' ? 'see' : next;
      navigate(PHASE_VIEWS[target] ? target : 'see');
      toast('Tahap diperbarui ke ' + STATUS_LABEL[next], 'ok');
    } catch (ex) { toast(ex.message, 'err'); }
  }
  async function deleteCycle(c) {
    if (!confirm('Hapus siklus "' + c.title + '" beserta seluruh isinya?')) return;
    try { await api('DELETE', '/cycles/' + c.id); state.activeId = null; state.current = null; localStorage.removeItem(ACTIVE_KEY); await loadCycles(); navigate('dashboard'); toast('Siklus dihapus', 'ok'); }
    catch (ex) { toast(ex.message, 'err'); }
  }

  // ---------------- Cycle form ----------------
  function openCycleForm(c) {
    const editing = !!c;
    $('#cycleModalTitle').textContent = editing ? 'Ubah Info Siklus' : 'Siklus Baru';
    $('#cTitle').value = editing ? c.title : ''; $('#cMapel').value = editing ? c.mapel : '';
    $('#cMateri').value = editing ? (c.materi || '') : '';
    $('#cKelas').value = editing ? c.kelas : ''; $('#cSekolah').value = editing ? c.sekolah : '';
    state.selectedMembers = editing ? (c.members || []).map(m => ({ id: m.id, nama: m.nama, role: m.role })) : [];
    $('#cycleForm').dataset.editId = editing ? c.id : '';
    $('#memberSearch').value = ''; $('#memberOptions').hidden = true; renderMemberChips();
    // Kolom catatan & unggahan hanya utk siklus BARU (saat ubah info, isi diedit di tab Plan/Do)
    $('#cycleCreateExtras').hidden = editing;
    $('#cCapaianArea').innerHTML = ''; $('#cTujuanArea').innerHTML = ''; cycleDocs = []; cycleVids = [];
    renderCreateFiles();
    $('#cycleError').hidden = true; $('#cycleModal').hidden = false;
  }
  // Berkas terpilih saat membuat siklus baru (objek File asli, diunggah biner setelah siklus dibuat)
  let cycleDocs = [], cycleVids = [];
  function renderCreateFiles() {
    const chip = (f, i, kind) => `<div class="file-item"><span class="ic">${attIcon({ type: f.type, url: f.name })}</span><span class="nm">${esc(f.name)}</span><span class="sz">${fmtSize(f.size)}</span><button type="button" class="x" data-rmcfile="${kind}:${i}">✕</button></div>`;
    const dl = $('#cDocList'); if (dl) dl.innerHTML = cycleDocs.map((f, i) => chip(f, i, 'doc')).join('');
    const vl = $('#cVidList'); if (vl) vl.innerHTML = cycleVids.map((f, i) => chip(f, i, 'vid')).join('');
  }
  async function addCreateFiles(files, arr) {
    files = Array.from(files);
    for (const f of files) {
      if (f.size > 200 * 1024 * 1024) { toast('“' + f.name + '” melebihi 200 MB', 'err'); continue; }
      arr.push(f);
    }
    renderCreateFiles();
  }
  { const di = $('#cDocInput'); if (di) di.addEventListener('change', async e => { await addCreateFiles(e.target.files, cycleDocs); e.target.value = ''; }); }
  { const vi = $('#cVidInput'); if (vi) vi.addEventListener('change', async e => { await addCreateFiles(e.target.files, cycleVids); e.target.value = ''; }); }
  $('#cycleCreateExtras').addEventListener('click', e => {
    const b = e.target.closest('[data-rmcfile]'); if (!b) return;
    const [kind, i] = b.dataset.rmcfile.split(':');
    (kind === 'doc' ? cycleDocs : cycleVids).splice(Number(i), 1);
    renderCreateFiles();
  });
  $('#newCycleBtn').addEventListener('click', () => openCycleForm(null));
  function renderMemberChips() { $('#memberChips').innerHTML = state.selectedMembers.map(m => `<span class="sel-chip"><span class="dot ${m.role}"></span>${esc(m.nama)}<button type="button" class="cx" data-rmmember="${m.id}">✕</button></span>`).join(''); }
  $('#memberChips').addEventListener('click', e => { const b = e.target.closest('[data-rmmember]'); if (!b) return; state.selectedMembers = state.selectedMembers.filter(m => m.id !== b.dataset.rmmember); renderMemberChips(); });
  $('#memberSearch').addEventListener('input', () => {
    const q = $('#memberSearch').value.toLowerCase().trim(); const opts = $('#memberOptions');
    if (!q) { opts.hidden = true; return; }
    const chosen = new Set(state.selectedMembers.map(m => m.id));
    const list = state.directory.filter(u => u.id !== state.user.id && !chosen.has(u.id) && (u.nama.toLowerCase().includes(q) || (u.instansi || '').toLowerCase().includes(q))).slice(0, 8);
    opts.innerHTML = list.length ? list.map(u => `<div class="picker-item" data-addmember="${u.id}"><span>${esc(u.nama)}</span><span class="role-tag ${u.role}">${ROLE_LABEL[u.role]}</span></div>`).join('') : '<div class="picker-item">Tidak ada</div>';
    opts.hidden = false;
  });
  $('#memberOptions').addEventListener('click', e => {
    const it = e.target.closest('[data-addmember]'); if (!it) return;
    const u = state.directory.find(x => x.id === it.dataset.addmember);
    if (u) { state.selectedMembers.push({ id: u.id, nama: u.nama, role: u.role }); renderMemberChips(); }
    $('#memberSearch').value = ''; $('#memberOptions').hidden = true;
  });
  $('#cycleForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#cycleError'); err.hidden = true;
    const editId = $('#cycleForm').dataset.editId;
    const payload = { title: $('#cTitle').value, mapel: $('#cMapel').value, materi: $('#cMateri').value, kelas: $('#cKelas').value, sekolah: $('#cSekolah').value, memberIds: state.selectedMembers.map(m => m.id) };
    try {
      if (editId) {
        const base = buildCyclePayload(state.current); Object.assign(base, payload);
        const d = await api('PUT', '/cycles/' + editId, base); state.current = d.cycle;
        $('#cycleModal').hidden = true; await loadCycles();
        if (PHASE_VIEWS[state.view]) await renderPhaseView(state.view); else renderDashboard();
        toast('Tersimpan', 'ok');
      } else {
        // Siklus baru: capaian & tujuan (rich text); berkas diunggah biner setelah siklus dibuat
        payload.plan = { desain: sanitizeHtml($('#cCapaianArea').innerHTML), tujuan: sanitizeHtml($('#cTujuanArea').innerHTML), attachments: [] };
        const files = [...cycleDocs, ...cycleVids];
        let d = await api('POST', '/cycles', payload);
        if (files.length) {
          showUploadProgress('Mengunggah… 0%');
          for (const f of files) {
            try { const r = await apiUploadBinary(d.cycle.id, 'plan.attachments', f, setUploadProgress); d = { cycle: r.cycle }; }
            catch (ex) { toast('Gagal unggah “' + f.name + '”: ' + ex.message, 'err'); }
          }
          hideUploadProgress('✅ Siklus & berkas berhasil diunggah');
        }
        await loadCycles();
        $('#cycleModal').hidden = true;
        state.activeId = d.cycle.id; state.current = null; localStorage.setItem(ACTIVE_KEY, state.activeId);
        navigate('plan'); if (!files.length) toast('Siklus dibuat', 'ok');
      }
    } catch (ex) { hideUploadProgress(); err.textContent = ex.message; err.hidden = false; }
  });

  // ---------------- Publish ----------------
  function openPublish(c) {
    const pb = c.praktikBaik || {};
    $('#pbRingkasan').value = pb.ringkasan || ''; $('#pbTags').value = (pb.tags || []).join(', ');
    $('#publishError').hidden = true; $('#publishForm').dataset.cycleId = c.id; $('#publishModal').hidden = false;
  }
  $('#publishForm').addEventListener('submit', async e => {
    e.preventDefault(); const id = $('#publishForm').dataset.cycleId;
    const tags = $('#pbTags').value.split(',').map(t => t.trim()).filter(Boolean);
    try {
      const d = await api('POST', '/cycles/' + id + '/publish', { ringkasan: $('#pbRingkasan').value, tags });
      state.current = d.cycle; $('#publishModal').hidden = true; await loadCycles();
      if (PHASE_VIEWS[state.view]) await renderPhaseView(state.view);
      toast('Diterbitkan sebagai Praktik Baik 🏆', 'ok');
    } catch (ex) { const err = $('#publishError'); err.textContent = ex.message; err.hidden = false; }
  });

  // ---------------- Repository ----------------
  async function loadRepo() { try { const d = await api('GET', '/repositori'); state._repo = d.cycles; renderRepo(); } catch (ex) { toast(ex.message, 'err'); } }
  function renderRepo() {
    const q = ($('#repoSearch').value || '').toLowerCase();
    let list = state._repo || [];
    if (q) list = list.filter(c => (c.title + ' ' + c.mapel + ' ' + (c.ringkasan || '') + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(q));
    $('#repoList').innerHTML = list.length ? list.map(repoCard).join('') : emptyState('🏆', 'Belum ada praktik baik yang diterbitkan.');
  }
  function repoCard(c) {
    return `<div class="cycle-card st-selesai" data-open="${c.id}" style="border-color:var(--gold)">
      <div class="cycle-foot" style="margin:0"><span class="badge-pub">🏆 Praktik Baik</span><span class="muted" style="font-size:.72rem">${c.publishedAt ? fmtDateTime(c.publishedAt) : ''}</span></div>
      <h4>${esc(c.title)}</h4>
      <div class="cycle-meta">${c.mapel ? `<span>📚 ${esc(c.mapel)}</span>` : ''}${c.sekolah ? `<span>🏫 ${esc(c.sekolah)}</span>` : ''}</div>
      <p class="muted" style="font-size:.85rem;margin:0">${esc((c.ringkasan || '').slice(0, 120))}${(c.ringkasan || '').length > 120 ? '…' : ''}</p>
      ${(c.tags || []).length ? `<div class="tags-row">${c.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      <span class="tag owner">👤 ${esc(c.ownerName || '')}</span>
    </div>`;
  }
  $('#repoSearch').addEventListener('input', renderRepo);

  // ---------------- Users (admin) ----------------
  async function loadUsers() { try { const d = await api('GET', '/users'); state._users = d.users; renderUsers(); } catch (ex) { toast(ex.message, 'err'); } loadAccountRequests(); }
  async function loadAccountRequests() {
    try { const d = await api('GET', '/account-requests'); state._requests = d.requests; renderRequests(); } catch {}
  }
  function renderRequests() {
    const list = state._requests || [];
    $('#requestsSection').hidden = !list.length;
    $('#reqBadge').textContent = list.length ? list.length : '';
    $('#requestList').innerHTML = list.map(r => `
      <div class="user-item"><div class="u-ava">${initials(r.nama)}</div>
        <div class="u-main"><b>${esc(r.nama)} <span class="role-tag ${r.role}">${ROLE_LABEL[r.role]}</span></b><div class="u-sub">@${esc(r.username)}${r.email ? ' · ✉ ' + esc(r.email) : ''}${r.instansi ? ' · ' + esc(r.instansi) : ''}</div></div>
        <div class="u-actions"><button class="btn btn-primary btn-sm" data-approvereq="${r.id}">✓ Setujui</button><button class="btn btn-danger btn-sm" data-rejectreq="${r.id}">✕ Tolak</button></div>
      </div>`).join('');
  }
  $('#requestList').addEventListener('click', async e => {
    const ap = e.target.closest('[data-approvereq]'); const rj = e.target.closest('[data-rejectreq]');
    if (ap) { try { await api('POST', '/account-requests/' + ap.dataset.approvereq + '/approve'); toast('Akun disetujui', 'ok'); await loadUsers(); try { const dir = await api('GET', '/directory'); state.directory = dir.users; } catch {} } catch (ex) { toast(ex.message, 'err'); } }
    if (rj) { if (!confirm('Tolak & hapus permintaan ini?')) return; try { await api('DELETE', '/account-requests/' + rj.dataset.rejectreq); toast('Permintaan ditolak', 'ok'); await loadAccountRequests(); } catch (ex) { toast(ex.message, 'err'); } }
  });
  function renderUsers() {
    $('#userList').innerHTML = (state._users || []).map(u => `
      <div class="user-item"><div class="u-ava">${u.photoUrl ? `<img src="${esc(u.photoUrl)}" alt="">` : initials(u.nama)}</div>
        <div class="u-main"><b>${esc(u.nama)} <span class="role-tag ${u.role}">${ROLE_LABEL[u.role]}</span></b><div class="u-sub">@${esc(u.username)}${u.jabatan ? ' · ' + esc(u.jabatan) : ''}${u.instansi ? ' · ' + esc(u.instansi) : ''}${u.email ? ' · ✉ ' + esc(u.email) : ''}${u.nip ? ' · NIP ' + esc(u.nip) : ''}${u.nuptk ? ' · NUPTK ' + esc(u.nuptk) : ''}${u.nidn ? ' · NIDN ' + esc(u.nidn) : ''}</div></div>
        <div class="u-actions"><button class="btn btn-ghost btn-sm" data-edituser="${u.id}">✎</button>${u.id !== state.user.id ? `<button class="btn btn-danger btn-sm" data-deluser="${u.id}">🗑</button>` : ''}</div>
      </div>`).join('');
  }
  $('#newUserBtn').addEventListener('click', () => openUserForm(null));
  // Tampilkan NIP/NUPTK/NIDN sesuai peran
  function updateUserRoleFields() {
    const role = $('#uRole').value;
    const isGuru = role === 'guru' || role === 'observer';
    const isDosen = role === 'dosen';
    $('#uNipWrap').hidden = !(isGuru || isDosen);
    $('#uNuptkWrap').hidden = !isGuru;
    $('#uNidnWrap').hidden = !isDosen;
    $('#uIdRow').hidden = !(isGuru || isDosen);
    $('#uEmailRow').hidden = role === 'admin';
  }
  $('#uRole').addEventListener('change', updateUserRoleFields);
  let userPhoto = { data: null, remove: false };
  function openUserForm(u) {
    $('#userModalTitle').textContent = u ? 'Ubah Pengguna' : 'Pengguna Baru';
    $('#userForm').dataset.editId = u ? u.id : '';
    $('#uNama').value = u ? u.nama : ''; $('#uRole').value = u ? u.role : 'guru';
    $('#uUsername').value = u ? u.username : ''; $('#uUsername').disabled = !!u;
    $('#uPassword').value = ''; $('#uPassword').placeholder = u ? 'kosongkan bila tetap' : 'min. 4 karakter';
    $('#uJabatan').value = u ? (u.jabatan || '') : ''; $('#uInstansi').value = u ? (u.instansi || '') : '';
    $('#uEmail').value = u ? (u.email || '') : '';
    $('#uNip').value = u ? (u.nip || '') : ''; $('#uNuptk').value = u ? (u.nuptk || '') : ''; $('#uNidn').value = u ? (u.nidn || '') : '';
    updateUserRoleFields();
    userPhoto = { data: null, remove: false };
    setPhotoPreview($('#uPhotoPreview'), u && u.photoUrl ? u.photoUrl : '', u ? u.nama : '');
    $('#uPhotoRemove').hidden = !(u && u.photoUrl);
    $('#uPhotoInput').value = '';
    $('#userError').hidden = true; $('#userModal').hidden = false;
  }
  $('#uPhotoInput').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('Foto maksimal 8 MB', 'err'); return; }
    const data = await fileToDataUrl(f);
    userPhoto = { data: { name: f.name, type: f.type, size: f.size, data }, remove: false };
    setPhotoPreview($('#uPhotoPreview'), data, $('#uNama').value);
    $('#uPhotoRemove').hidden = false;
  });
  $('#uPhotoRemove').addEventListener('click', () => {
    userPhoto = { data: null, remove: true };
    setPhotoPreview($('#uPhotoPreview'), '', $('#uNama').value);
    $('#uPhotoRemove').hidden = true; $('#uPhotoInput').value = '';
  });
  $('#userList').addEventListener('click', e => {
    const ed = e.target.closest('[data-edituser]'); const del = e.target.closest('[data-deluser]');
    if (ed) openUserForm((state._users || []).find(u => u.id === ed.dataset.edituser));
    if (del) delUser(del.dataset.deluser);
  });
  async function delUser(id) { if (!confirm('Hapus pengguna ini?')) return; try { await api('DELETE', '/users/' + id); await loadUsers(); toast('Pengguna dihapus', 'ok'); } catch (ex) { toast(ex.message, 'err'); } }
  $('#userForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#userError'); err.hidden = true;
    const id = $('#userForm').dataset.editId;
    const payload = { nama: $('#uNama').value, role: $('#uRole').value, jabatan: $('#uJabatan').value, instansi: $('#uInstansi').value };
    const role = $('#uRole').value;
    payload.email = role === 'admin' ? '' : $('#uEmail').value.trim();
    payload.nip = (role === 'guru' || role === 'observer' || role === 'dosen') ? $('#uNip').value : '';
    payload.nuptk = (role === 'guru' || role === 'observer') ? $('#uNuptk').value : '';
    payload.nidn = role === 'dosen' ? $('#uNidn').value : '';
    const pw = $('#uPassword').value; if (pw) payload.password = pw;
    if (userPhoto.data) payload.photo = userPhoto.data; else if (userPhoto.remove) payload.removePhoto = true;
    try {
      if (id) { await api('PUT', '/users/' + id, payload); }
      else { payload.username = $('#uUsername').value.toLowerCase().replace(/[^a-z0-9._-]/g, ''); await api('POST', '/users', payload); }
      $('#userModal').hidden = true; await loadUsers();
      const dir = await api('GET', '/directory'); state.directory = dir.users; toast('Tersimpan', 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  // ---------------- Master Sekolah ----------------
  function renderSchoolOptions() {
    const dl = $('#schoolOptions');
    if (dl) dl.innerHTML = (state.schools || []).map(s => `<option value="${esc(s.nama)}">${s.jenjang ? esc(s.jenjang) : ''}${s.alamat ? ' · ' + esc(s.alamat) : ''}</option>`).join('');
  }
  async function loadSchools() {
    try { const d = await api('GET', '/schools'); state.schools = d.schools; renderSchoolOptions(); renderSchools(); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  function renderSchools() {
    const q = ($('#schoolSearch').value || '').toLowerCase();
    let list = state.schools || [];
    if (q) list = list.filter(s => (s.nama + ' ' + (s.alamat || '') + ' ' + (s.npsn || '')).toLowerCase().includes(q));
    $('#schoolList').innerHTML = list.length ? list.map(s => `
      <div class="user-item"><div class="u-ava">🏫</div>
        <div class="u-main"><b>${esc(s.nama)} ${s.jenjang ? `<span class="role-tag guru">${esc(s.jenjang)}</span>` : ''}</b><div class="u-sub">${s.npsn ? 'NPSN ' + esc(s.npsn) : ''}${s.npsn && s.alamat ? ' · ' : ''}${s.alamat ? esc(s.alamat) : ''}</div></div>
        <div class="u-actions"><button class="btn btn-ghost btn-sm" data-editschool="${s.id}">✎</button><button class="btn btn-danger btn-sm" data-delschool="${s.id}">🗑</button></div>
      </div>`).join('') : emptyState('🏫', 'Belum ada sekolah. Klik "+ Sekolah".');
  }
  $('#schoolSearch').addEventListener('input', renderSchools);
  $('#newSchoolBtn').addEventListener('click', () => openSchoolForm(null));
  function openSchoolForm(s) {
    $('#schoolModalTitle').textContent = s ? 'Ubah Sekolah' : 'Sekolah Baru';
    $('#schoolForm').dataset.editId = s ? s.id : '';
    $('#sNama').value = s ? s.nama : ''; $('#sJenjang').value = s ? (s.jenjang || 'SMP') : 'SMP';
    $('#sNpsn').value = s ? (s.npsn || '') : ''; $('#sAlamat').value = s ? (s.alamat || '') : '';
    $('#schoolError').hidden = true; $('#schoolModal').hidden = false;
  }
  $('#schoolList').addEventListener('click', e => {
    const ed = e.target.closest('[data-editschool]'); const del = e.target.closest('[data-delschool]');
    if (ed) openSchoolForm((state.schools || []).find(s => s.id === ed.dataset.editschool));
    if (del) delSchool(del.dataset.delschool);
  });
  async function delSchool(id) {
    if (!confirm('Hapus sekolah ini dari master?')) return;
    try { await api('DELETE', '/schools/' + id); await loadSchools(); toast('Sekolah dihapus', 'ok'); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  $('#schoolForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#schoolError'); err.hidden = true;
    const id = $('#schoolForm').dataset.editId;
    const payload = { nama: $('#sNama').value, jenjang: $('#sJenjang').value, npsn: $('#sNpsn').value, alamat: $('#sAlamat').value };
    try {
      if (id) await api('PUT', '/schools/' + id, payload); else await api('POST', '/schools', payload);
      $('#schoolModal').hidden = true; await loadSchools(); toast('Tersimpan', 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  // ---------------- Master Instansi ----------------
  function renderInstitutionOptions() {
    const dl = $('#institutionOptions');
    if (dl) dl.innerHTML = (state.institutions || []).map(s => `<option value="${esc(s.nama)}">${s.jenis ? esc(s.jenis) : ''}${s.alamat ? ' · ' + esc(s.alamat) : ''}</option>`).join('');
  }
  async function loadInstitutions() {
    try { const d = await api('GET', '/institutions'); state.institutions = d.institutions; renderInstitutionOptions(); renderInstitutions(); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  function renderInstitutions() {
    const q = ($('#institutionSearch').value || '').toLowerCase();
    let list = state.institutions || [];
    if (q) list = list.filter(s => (s.nama + ' ' + (s.alamat || '') + ' ' + (s.jenis || '')).toLowerCase().includes(q));
    $('#institutionList').innerHTML = list.length ? list.map(s => `
      <div class="user-item"><div class="u-ava">🏢</div>
        <div class="u-main"><b>${esc(s.nama)} ${s.jenis ? `<span class="role-tag dosen">${esc(s.jenis)}</span>` : ''}</b><div class="u-sub">${s.alamat ? esc(s.alamat) : ''}</div></div>
        <div class="u-actions"><button class="btn btn-ghost btn-sm" data-editinst="${s.id}">✎</button><button class="btn btn-danger btn-sm" data-delinst="${s.id}">🗑</button></div>
      </div>`).join('') : emptyState('🏢', 'Belum ada instansi. Klik "+ Instansi".');
  }
  $('#institutionSearch').addEventListener('input', renderInstitutions);
  $('#newInstitutionBtn').addEventListener('click', () => openInstitutionForm(null));
  function openInstitutionForm(s) {
    $('#institutionModalTitle').textContent = s ? 'Ubah Instansi' : 'Instansi Baru';
    $('#institutionForm').dataset.editId = s ? s.id : '';
    $('#iNama').value = s ? s.nama : ''; $('#iJenis').value = s ? (s.jenis || 'Universitas') : 'Universitas';
    $('#iAlamat').value = s ? (s.alamat || '') : '';
    $('#institutionError').hidden = true; $('#institutionModal').hidden = false;
  }
  $('#institutionList').addEventListener('click', e => {
    const ed = e.target.closest('[data-editinst]'); const del = e.target.closest('[data-delinst]');
    if (ed) openInstitutionForm((state.institutions || []).find(s => s.id === ed.dataset.editinst));
    if (del) delInstitution(del.dataset.delinst);
  });
  async function delInstitution(id) {
    if (!confirm('Hapus instansi ini dari master?')) return;
    try { await api('DELETE', '/institutions/' + id); await loadInstitutions(); toast('Instansi dihapus', 'ok'); }
    catch (ex) { toast(ex.message, 'err'); }
  }
  $('#institutionForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#institutionError'); err.hidden = true;
    const id = $('#institutionForm').dataset.editId;
    const payload = { nama: $('#iNama').value, jenis: $('#iJenis').value, alamat: $('#iAlamat').value };
    try {
      if (id) await api('PUT', '/institutions/' + id, payload); else await api('POST', '/institutions', payload);
      $('#institutionModal').hidden = true; await loadInstitutions(); toast('Tersimpan', 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  // ---------------- Account ----------------
  let accPhoto = { data: null, remove: false };
  $('#accountBtn').addEventListener('click', () => {
    renderAccount();
    accPhoto = { data: null, remove: false };
    setPhotoPreview($('#accPhotoPreview'), state.user.photoUrl || '', state.user.nama);
    $('#accPhotoRemove').hidden = !state.user.photoUrl;
    $('#accPhotoInput').value = '';
    $('#accountModal').hidden = false;
  });
  $('#accPhotoInput').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('Foto maksimal 8 MB', 'err'); return; }
    const data = await fileToDataUrl(f);
    accPhoto = { data: { name: f.name, type: f.type, size: f.size, data }, remove: false };
    setPhotoPreview($('#accPhotoPreview'), data, state.user.nama);
    $('#accPhotoRemove').hidden = false;
  });
  $('#accPhotoRemove').addEventListener('click', () => {
    accPhoto = { data: null, remove: true };
    setPhotoPreview($('#accPhotoPreview'), '', state.user.nama);
    $('#accPhotoRemove').hidden = true; $('#accPhotoInput').value = '';
  });
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = { nama: $('#accNameInput').value, jabatan: $('#accJabatan').value, instansi: $('#accInstansi').value, email: $('#accEmail').value.trim() };
    if (accPhoto.data) payload.photo = accPhoto.data; else if (accPhoto.remove) payload.removePhoto = true;
    try {
      const d = await api('PUT', '/me', payload);
      state.user = d.user; accPhoto = { data: null, remove: false }; renderAccount();
      setPhotoPreview($('#accPhotoPreview'), state.user.photoUrl || '', state.user.nama);
      $('#accPhotoRemove').hidden = !state.user.photoUrl;
      toast('Profil tersimpan', 'ok');
    } catch (ex) { toast(ex.message, 'err'); }
  });
  $('#passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PUT', '/me/password', { current: $('#pwCurrent').value, next: $('#pwNext').value }); $('#pwCurrent').value = ''; $('#pwNext').value = ''; toast('Kata sandi diperbarui', 'ok'); }
    catch (ex) { toast(ex.message, 'err'); }
  });
  $('#logoutBtn').addEventListener('click', doLogout);
  async function doLogout() {
    try { await api('POST', '/logout'); } catch {}
    localStorage.removeItem(TOKEN_KEY); state.user = null;
    if (state.notifTimer) clearInterval(state.notifTimer); stopEntriesPoll();
    $('#accountModal').hidden = true; $('#app').hidden = true; $('#loginScreen').hidden = false; $('#loginPass').value = '';
  }

  // ---------------- Notifications ----------------
  $('#notifBtn').addEventListener('click', async () => {
    const panel = $('#notifPanel'); if (!panel.hidden) { panel.hidden = true; return; }
    await loadNotifications(true); panel.hidden = false;
  });
  $('#notifReadAll').addEventListener('click', async () => { try { await api('POST', '/notifications/read', {}); await loadNotifications(); } catch {} });
  document.addEventListener('click', e => { const panel = $('#notifPanel'); if (!panel.hidden && !e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) panel.hidden = true; });
  async function loadNotifications(open) {
    if (!state.user) return;
    try {
      const d = await api('GET', '/notifications'); const badge = $('#notifBadge');
      if (d.unread > 0) { badge.textContent = d.unread; badge.hidden = false; } else badge.hidden = true;
      if (open) $('#notifList').innerHTML = d.notifications.length ? d.notifications.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}" data-notif="${n.cycleId || ''}" data-link="${n.link || ''}"><span class="n-msg">${esc(n.message)}</span><span class="n-when">${relTime(n.createdAt)}</span></div>`).join('') : '<div class="notif-empty">Tidak ada notifikasi</div>';
    } catch {}
  }
  $('#notifList').addEventListener('click', async e => {
    const it = e.target.closest('[data-notif]'); if (!it) return;
    const cid = it.dataset.notif; const link = it.dataset.link; $('#notifPanel').hidden = true;
    try { await api('POST', '/notifications/read', {}); loadNotifications(); } catch {}
    if (link) { navigate(link); }
    else if (cid) { state.activeId = cid; state.current = null; localStorage.setItem(ACTIVE_KEY, cid); await ensureActiveLoaded(); const c = state.current; navigate(c && PHASE_VIEWS[c.status] ? c.status : 'plan'); }
  });

  // ---------------- Preview ----------------
  function isOffice(t, url) { return /\.(docx?|xlsx?|pptx?)$/i.test(url || '') || /officedocument|msword|ms-excel|ms-powerpoint/i.test(t || ''); }
  async function openPreview(url, type, name) {
    const body = $('#previewBody');
    const dl = $('#previewDownload'); dl.href = url; dl.setAttribute('download', name || '');
    $('#previewName').textContent = name || '';
    $('#previewModal').hidden = false;
    const ext = ((name || url).split('.').pop() || '').toLowerCase();
    if (type === 'video-link') { const emb = ytEmbed(url); body.innerHTML = emb ? `<iframe src="${esc(emb)}" allow="autoplay; fullscreen" allowfullscreen></iframe>` : `<div class="preview-fallback">Tautan video eksternal.<br><a href="${esc(url)}" target="_blank" rel="noopener">Buka tautan ↗</a></div>`; return; }
    if (isImage(type)) { body.innerHTML = `<img src="${esc(url)}" alt="">`; return; }
    if (isPdf(type, url)) { body.innerHTML = `<iframe src="${esc(url)}"></iframe>`; return; }
    if (isVideoFile(type, url)) { body.innerHTML = `<video src="${esc(url)}" controls autoplay></video>`; return; }
    // Word & Excel dirender di browser (satu origin) → jalan di HTTP maupun HTTPS
    if (ext === 'docx' || ext === 'doc' || /wordprocessingml|msword/i.test(type || '')) return renderDocx(url, body);
    if (ext === 'xlsx' || ext === 'xls' || /spreadsheetml|ms-excel/i.test(type || '')) return renderXlsx(url, body);
    body.innerHTML = `<div class="preview-fallback">Pratinjau untuk berkas ${ext ? esc(ext.toUpperCase()) : 'ini'} belum didukung.<br>Gunakan tombol ⬇️ Unduh untuk membukanya.</div>`;
  }
  async function renderDocx(url, body) {
    body.innerHTML = `<div class="preview-fallback">⏳ Memuat dokumen…</div>`;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const res = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      body.innerHTML = `<div class="doc-view">${res.value || '<p><i>(dokumen kosong)</i></p>'}</div>`;
    } catch (e) { body.innerHTML = `<div class="preview-fallback">Gagal menampilkan dokumen.<br>Gunakan tombol ⬇️ Unduh.</div>`; }
  }
  async function renderXlsx(url, body) {
    body.innerHTML = `<div class="preview-fallback">⏳ Memuat spreadsheet…</div>`;
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      let html = '';
      wb.SheetNames.forEach(n => { html += `<h4 class="doc-sheet">${esc(n)}</h4>` + window.XLSX.utils.sheet_to_html(wb.Sheets[n]); });
      body.innerHTML = `<div class="doc-view doc-xlsx">${html || '<p><i>(spreadsheet kosong)</i></p>'}</div>`;
    } catch (e) { body.innerHTML = `<div class="preview-fallback">Gagal menampilkan spreadsheet.<br>Gunakan tombol ⬇️ Unduh.</div>`; }
  }

  // ---------------- Laporan cetak / PDF ----------------
  function printCycleReport(c) {
    const p = c.plan || {}, d = c.pelaksanaan || {}, s = c.refleksi || {}, pb = c.praktikBaik || {};
    const members = (c.members || []).map(m => `${esc(m.nama)} (${cycleRoleLabel(c, m.id, m.role)})`).join(', ') || '—';
    const field = (lbl, val, fmt) => `<div class="rep-field"><div class="lbl">${lbl}</div><div class="val${val ? '' : ' empty'}">${val ? (fmt ? fmt(val) : esc(val)) : 'Belum diisi'}</div></div>`;
    const fieldHtml = (lbl, val) => `<div class="rep-field"><div class="lbl">${lbl}</div><div class="val${val ? '' : ' empty'}">${val ? richDisplay(val) : 'Belum diisi'}</div></div>`;
    const filesList = (list, label) => (list && list.length) ? `<div class="rep-field"><div class="lbl">${label}</div><ul class="rep-list">${list.map(a => `<li>${esc(a.name)}${a.size ? ' (' + fmtSize(a.size) + ')' : ''}</li>`).join('')}</ul></div>` : '';
    const links = (d.videoLinks || []).length ? `<div class="rep-field"><div class="lbl">Tautan video</div><ul class="rep-list">${d.videoLinks.map(v => `<li>${esc(v.title || '')}${v.title ? ': ' : ''}${esc(v.url)}</li>`).join('')}</ul></div>` : '';
    const entriesFor = (phase, cls) => { const es = (c.entries || []).filter(e => e.phase === phase); if (!es.length) return '<div class="val empty">Belum ada catatan.</div>'; return es.map(e => `<div class="rep-entry ${cls}"><div class="eh"><b>${esc(e.userName)}</b> · ${cycleRoleLabel(c, e.userId, e.role)} · ${fmtDateTime(e.createdAt)}${e.fokus ? ' · Fokus: ' + esc(e.fokus) : ''}</div><div class="et">${esc(e.text)}</div></div>`).join(''); };
    const html = `<div class="rep">
      <div class="rep-header"><div class="rep-brand">LeaDi-PDS</div><div class="rep-tag">Lesson Study Digital Platform berbasis Plan · Do · See</div></div>
      <div class="rep-title">${esc(c.title)}</div>
      <div class="rep-meta">${c.mapel ? `<span><b>Mapel:</b> ${esc(c.mapel)}</span>` : ''}${c.materi ? `<span><b>Materi:</b> ${esc(c.materi)}</span>` : ''}${c.kelas ? `<span><b>Kelas:</b> ${esc(c.kelas)}</span>` : ''}${c.sekolah ? `<span><b>Sekolah:</b> ${esc(c.sekolah)}</span>` : ''}<span><b>Tahap:</b> ${STATUS_LABEL[c.status]}</span></div>
      <div class="rep-members"><b>Guru pemilik:</b> ${esc(c.ownerName)} &nbsp;·&nbsp; <b>Tim:</b> ${members}</div>
      <div class="rep-section"><h3>📝 Modul Plan — Perencanaan</h3>${fieldHtml('Capaian pembelajaran', p.desain)}${fieldHtml('Tujuan pembelajaran', p.tujuan)}${field('Rencana open class', (p.tanggalRencana ? fmtDate(p.tanggalRencana) : '') + (p.jamRencana ? ' · ' + p.jamRencana + ' WITA' : ''))}${filesList(p.attachments, 'Perangkat pembelajaran')}<div class="rep-field"><div class="lbl">Diskusi perencanaan</div>${entriesFor('plan', 'plan')}</div></div>
      <div class="rep-section"><h3 class="do">🎥 Modul Do — Pelaksanaan &amp; Observasi</h3>${field('Tanggal &amp; jam pelaksanaan', (d.tanggal ? fmtDate(d.tanggal) : '') + (d.jam ? ' · ' + d.jam + ' WITA' : ''))}${filesList(d.videos, 'Video pembelajaran (berkas)')}${links}${field('Catatan pelaksanaan', d.catatan)}<div class="rep-field"><div class="lbl">Catatan observasi</div>${entriesFor('do', 'do')}</div></div>
      <div class="rep-section"><h3 class="see">🔍 Modul See — Refleksi &amp; Evaluasi</h3>${field('Analisis pembelajaran', s.analisis)}${field('Rekomendasi perbaikan', s.rekomendasi)}<div class="rep-field"><div class="lbl">Refleksi kolaboratif</div>${entriesFor('see', 'see')}</div></div>
      ${pb.published ? `<div class="rep-section"><h3 class="pb">🏆 Praktik Baik</h3>${field('Ringkasan', pb.ringkasan)}${(pb.tags || []).length ? `<div class="rep-field"><div class="lbl">Kata kunci</div><div class="val">${pb.tags.map(t => '#' + esc(t)).join(', ')}</div></div>` : ''}${field('Diterbitkan', pb.publishedAt ? fmtDateTime(pb.publishedAt) : '')}</div>` : ''}
      <div class="rep-foot">Dicetak dari LeaDi-PDS pada ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</div>
    </div>`;
    const rep = $('#printReport'); rep.innerHTML = html;
    const cleanup = () => { rep.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup); window.print(); setTimeout(cleanup, 1000);
  }

  // ---------------- Utils ----------------
  function fileToDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }
  function emptyState(ic, msg) { return `<div class="empty-state"><span class="ic">${ic}</span>${esc(msg)}</div>`; }

  // ---------------- Boot ----------------
  (async function boot() {
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('service-worker.js').catch(() => {}); }
    if (token()) { try { const d = await api('GET', '/me'); state.user = d.user; await startApp(); } catch { localStorage.removeItem(TOKEN_KEY); } }
  })();
})();
