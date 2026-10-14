'use strict';
/* Sinkronisasi cloud (Supabase) lewat REST, tanpa library. Mode lokal tetap berjalan jika config kosong.
   Satu baris data per pengguna (JSON), dengan nomor revisi untuk mencegah saling menimpa antar perangkat. */
const Cloud = (() => {
  const cfg = (typeof window !== 'undefined' && window.PJ_CONFIG) || {};
  const enabled = !!(cfg.url && cfg.anonKey);
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const SK = 'pj_cloud_session';
  const api = { enabled, onStatus: null };
  let cur = null, tmr = null, poll = null, busy = false, status = enabled ? 'Cloud siap' : 'Mode lokal';

  const hhmm = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const setStatus = s => { status = s; if (api.onStatus) api.onStatus(s); };
  const getS = () => { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } };
  const putS = s => s ? localStorage.setItem(SK, JSON.stringify(s)) : localStorage.removeItem(SK);
  const metaKey = e => 'pj_sync_' + encodeURIComponent(e);
  const getMeta = e => { try { return JSON.parse(localStorage.getItem(metaKey(e))) || { rev: 0, dirty: false }; } catch (x) { return { rev: 0, dirty: false }; } };
  const putMeta = (e, m) => localStorage.setItem(metaKey(e), JSON.stringify(m));
  const dkey = e => 'pj_data_' + e;

  async function call(path, { method = 'GET', body, token, prefer } = {}) {
    // Kunci baru (sb_publishable_...) hanya boleh di header apikey. Kunci lama (JWT, awalan eyJ) boleh juga di Authorization.
    const h = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
    const bearer = token || (/^eyJ/.test(cfg.anonKey) ? cfg.anonKey : null);
    if (bearer) h.Authorization = 'Bearer ' + bearer;
    if (prefer) h.Prefer = prefer;
    const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { /* respons kosong */ }
    return { ok: r.ok, status: r.status, json: j };
  }
  function errMsg(r) {
    const t = JSON.stringify(r.json || {}).toLowerCase();
    if (/invalid login|invalid_credentials|invalid_grant/.test(t)) return 'Email atau kata sandi salah.';
    if (/not confirmed|email_not_confirmed/.test(t)) return 'Email belum dikonfirmasi. Buka kotak masuk emailmu.';
    if (/already registered|user_already_exists/.test(t)) return 'Email sudah terdaftar. Silakan masuk.';
    if (/weak|at least/.test(t)) return 'Kata sandi terlalu lemah (minimal 6 karakter).';
    if (r.status === 429 || /rate/.test(t)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
    return 'Gagal terhubung ke cloud (kode ' + r.status + ').';
  }
  const toSession = (r, old) => ({
    access_token: r.access_token, refresh_token: r.refresh_token || (old && old.refresh_token),
    expires_at: Date.now() + ((r.expires_in || 3600) - 60) * 1000,
    user: { id: (r.user && r.user.id) || (old && old.user.id), email: (((r.user && r.user.email) || (old && old.user.email)) || '').toLowerCase() }
  });
  async function token() {
    let s = getS(); if (!s) return null;
    if (Date.now() < s.expires_at) return s;
    const r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    if (!r.ok) { if (r.status === 400 || r.status === 401) putS(null); return null; }
    s = toSession(r.json, s); putS(s); return s;
  }
  async function getRow(s, full = true) {
    const r = await call('/rest/v1/journal_data?select=' + (full ? 'data,rev' : 'rev') + '&user_id=eq.' + s.user.id, { token: s.access_token });
    if (!r.ok) throw new Error('baca gagal ' + r.status);
    return (r.json && r.json[0]) || null;
  }

  function applyRemote(email, row) {
    Store.snapshot(email, 'restore');                       // data perangkat ini diamankan dulu
    localStorage.setItem(dkey(email), JSON.stringify(row.data));
    putMeta(email, { rev: row.rev, dirty: false });
    setStatus('Tersinkron ' + hhmm());
  }
  function refreshUI(email) {
    if (typeof D !== 'undefined' && D && cur === email) { D = Store.load(email); fillMonths(); render(); }
  }

  async function attempt(email) {
    const s = await token(); if (!s) return 'fail';
    const raw = localStorage.getItem(dkey(email)); if (!raw) return 'ok';
    const data = JSON.parse(raw), meta = getMeta(email), now = new Date().toISOString();
    const r = !meta.rev
      ? await call('/rest/v1/journal_data?on_conflict=user_id', { method: 'POST', token: s.access_token, prefer: 'resolution=ignore-duplicates,return=representation', body: { user_id: s.user.id, data, rev: 1, updated_at: now } })
      : await call('/rest/v1/journal_data?user_id=eq.' + s.user.id + '&rev=eq.' + meta.rev, { method: 'PATCH', token: s.access_token, prefer: 'return=representation', body: { data, rev: meta.rev + 1, updated_at: now } });
    if (!r.ok) throw new Error('kirim gagal ' + r.status);
    const row = r.json && r.json[0];
    if (!row) return 'conflict';
    putMeta(email, { rev: row.rev, dirty: false }); setStatus('Tersinkron ' + hhmm());
    return 'ok';
  }
  async function pushNow(email) {
    if (busy) return false; busy = true; let res;
    try { res = await attempt(email); } catch (e) { res = 'fail'; setStatus((e && e.name === 'TypeError') ? 'Menunggu koneksi. Perubahan dikirim otomatis nanti.' : 'Gagal mengirim (' + e.message + '). Periksa pengaturan Supabase.'); }
    busy = false;
    if (res === 'conflict') return conflict(email);
    return res === 'ok';
  }
  async function conflict(email) {
    let row;
    try { const s = await token(); if (!s) return false; row = await getRow(s); } catch (e) { return false; }
    const meta = getMeta(email);
    if (!row) { putMeta(email, { rev: 0, dirty: true }); return pushNow(email); }
    const useCloud = !meta.dirty || confirm('Data di cloud berubah dari perangkat lain, dan di perangkat ini ada perubahan yang belum terkirim.\n\nOK = pakai data cloud (perubahan di perangkat ini disimpan sebagai cadangan).\nBatal = pertahankan data perangkat ini dan timpa cloud.');
    if (useCloud) { applyRemote(email, row); refreshUI(email); return true; }
    putMeta(email, { rev: row.rev, dirty: true });
    return pushNow(email);
  }
  async function pullInitial(email) {
    let row;
    try { const s = getS(); row = await getRow(s); } catch (e) { setStatus((e && e.name === 'TypeError') ? 'Offline. Memakai data di perangkat ini.' : 'Gagal membaca cloud (' + e.message + '). Periksa pengaturan Supabase.'); return; }
    const meta = getMeta(email), has = !!localStorage.getItem(dkey(email));
    if (!row) { if (has) { putMeta(email, { rev: 0, dirty: true }); await pushNow(email); } return; }
    if (!has) { applyRemote(email, row); return; }
    if (row.rev === meta.rev) { if (meta.dirty) await pushNow(email); else setStatus('Tersinkron ' + hhmm()); return; }
    await conflict(email);
  }
  async function check() {
    if (!enabled || !cur || busy) return;
    const meta = getMeta(cur);
    try {
      const s = await token(); if (!s) return;
      const row = await getRow(s, false);
      if (row && row.rev !== meta.rev) return conflict(cur);
      if (meta.dirty) return pushNow(cur);
      setStatus('Tersinkron ' + hhmm());
    } catch (e) { setStatus((e && e.name === 'TypeError') ? 'Offline. Memakai data di perangkat ini.' : 'Gagal membaca cloud (' + e.message + '). Periksa pengaturan Supabase.'); }
  }
  function onSaved(u) {
    if (!enabled || !cur || u !== cur) return;
    const m = getMeta(u); m.dirty = true; putMeta(u, m); setStatus('Menyimpan…');
    clearTimeout(tmr); tmr = setTimeout(() => pushNow(u), 1500);
  }

  async function login(email, pw) {
    try {
      const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });
      if (!r.ok) return { msg: errMsg(r) };
      putS(toSession(r.json)); await pullInitial(email); return { ok: true };
    } catch (e) { return { msg: 'Tidak bisa terhubung ke cloud. Periksa koneksi internet.' }; }
  }
  async function signup(email, pw) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { msg: 'Masukkan alamat email yang valid.' };
    if (pw.length < 6) return { msg: 'Kata sandi minimal 6 karakter.' };
    try {
      const r = await call('/auth/v1/signup', { method: 'POST', body: { email, password: pw } });
      if (!r.ok) return { msg: errMsg(r) };
      if (r.json && r.json.access_token) { putS(toSession(r.json)); await pullInitial(email); return { ok: true }; }
      return { msg: 'Akun dibuat. Buka email konfirmasi, lalu masuk.' };
    } catch (e) { return { msg: 'Tidak bisa terhubung ke cloud. Periksa koneksi internet.' }; }
  }
  async function changePassword(old, nw) {
    const s0 = getS(); if (!s0) return { msg: 'Belum masuk.' };
    try {
      const v = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: s0.user.email, password: old } });
      if (!v.ok) return { msg: 'Sandi lama salah.' };
      putS(toSession(v.json, s0));
      const u = await call('/auth/v1/user', { method: 'PUT', token: getS().access_token, body: { password: nw } });
      return u.ok ? { ok: true } : { msg: errMsg(u) };
    } catch (e) { return { msg: 'Tidak bisa terhubung ke cloud.' }; }
  }
  async function resume() {
    if (!enabled) return null;
    const s0 = getS(); if (!s0) return null;
    try { const s = await token(); return s ? s.user.email : null; } catch (e) { return s0.user.email; }   // offline: percaya sesi tersimpan
  }
  function attach(email) {
    if (!enabled) return;
    cur = email; Store.onSaved = onSaved;
    if (!poll) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
        else if (cur && getMeta(cur).dirty) pushNow(cur);
      });
      addEventListener('online', check);
      poll = setInterval(check, 60000);
    }
    check();
  }
  function signOut() {
    const s = getS(); putS(null); cur = null; clearTimeout(tmr);
    if (enabled && s) call('/auth/v1/logout', { method: 'POST', token: s.access_token }).catch(() => {});
  }

  /* tampilan masuk memakai email saat cloud aktif */
  if (enabled && typeof document !== 'undefined') {
    const u = document.getElementById('u');
    if (u) { u.parentElement.firstChild.textContent = 'Email'; u.placeholder = 'nama@email.com'; u.type = 'email'; u.autocomplete = 'email'; }
  }
  return Object.assign(api, { login, signup, changePassword, resume, attach, signOut, hasSession: () => !!getS(),
    status: () => status, syncNow: () => check(), email: () => cur });
})();
