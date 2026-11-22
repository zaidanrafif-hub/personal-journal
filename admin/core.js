'use strict';
/* Inti Admin: klien Supabase (REST + Auth + MFA), sesi admin (prefix pj_admin_), penjaga akses, registri modul, router.
   Tidak memakai cloud.js dan tidak berbagi variabel global dengan aplikasi pengguna. Semua keputusan hak akses ada di database. */
const Admin = (() => {
  const cfg = window.PJ_CONFIG || {};
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const SK = 'pj_admin_session', IDLE_K = 'pj_admin_idle', LOGGED_K = 'pj_admin_logged';
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* abaikan */ } } };
  const getS = () => { try { return JSON.parse(ss.get(SK)); } catch (e) { return null; } };
  const putS = s => ss.set(SK, s ? JSON.stringify(s) : null);
  const state = { info: null, route: null, onLogout: null };
  const mods = [];

  async function raw(path, { method = 'GET', body, token, headers = {}, rawBody } = {}) {
    const h = { apikey: cfg.anonKey, ...headers };
    const bearer = token || (/^eyJ/.test(cfg.anonKey || '') ? cfg.anonKey : null);
    if (bearer) h.Authorization = 'Bearer ' + bearer;
    if (body !== undefined && !rawBody) h['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method, headers: h, body: rawBody || (body !== undefined ? JSON.stringify(body) : undefined) });
    let j = null; try { const t = await r.text(); j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
    return { ok: r.ok, status: r.status, json: j, headers: r.headers };
  }
  const toSession = (r, old) => ({
    access_token: r.access_token, refresh_token: r.refresh_token || (old && old.refresh_token),
    expires_at: Date.now() + ((r.expires_in || 3600) - 60) * 1000,
    user: { id: (r.user && r.user.id) || (old && old.user && old.user.id), email: String((r.user && r.user.email) || (old && old.user && old.user.email) || '').toLowerCase() }
  });
  function msg(r) {
    const j = r.json || {}, m = j.message || j.msg || j.error_description || j.error || '';
    if (r.status === 401 || r.status === 403 || j.code === '42501' || /forbidden|permission denied/i.test(m)) return 'Akses ditolak. Akunmu tidak punya izin untuk tindakan ini.';
    if (/invalid login|invalid_credentials/i.test(JSON.stringify(j))) return 'Email atau kata sandi salah.';
    if (r.status === 429) return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    return m ? String(m) : 'Gagal terhubung ke server (kode ' + r.status + ').';
  }
  async function refresh() {
    const s = getS(); if (!s || !s.refresh_token) return null;
    const r = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    if (!r.ok) { if (r.status === 400 || r.status === 401) putS(null); return null; }
    const n = toSession(r.json, s); putS(n); return n;
  }
  async function session() { let s = getS(); if (!s) return null; if (Date.now() >= s.expires_at) s = await refresh(); return s; }
  async function call(path, opts = {}) {
    let s = await session(); if (!s) throw new Error('Sesi berakhir. Masuk lagi.');
    let r = await raw(path, { ...opts, token: s.access_token });
    if (r.status === 401) { s = await refresh(); if (!s) throw new Error('Sesi berakhir. Masuk lagi.'); r = await raw(path, { ...opts, token: s.access_token }); }
    return r;
  }
  const ensure = r => { if (!r.ok) { const e = new Error(msg(r)); e.status = r.status; e.code = r.json && r.json.code; throw e; } return r; };
  const rpc = async (fn, args) => ensure(await call('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} })).json;
  async function select(table, query = '', { count = false } = {}) {
    const r = ensure(await call('/rest/v1/' + table + (query ? '?' + query : ''), { headers: count ? { Prefer: 'count=exact' } : {} }));
    let total = null; const cr = r.headers.get && r.headers.get('content-range'); if (cr && /\/(\d+)$/.test(cr)) total = +cr.split('/')[1];
    return count ? { rows: r.json || [], total } : (r.json || []);
  }
  const insert = async (table, row) => ensure(await call('/rest/v1/' + table, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } })).json;
  const update = async (table, filter, patch) => ensure(await call('/rest/v1/' + table + '?' + filter, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } })).json;
  const remove = async (table, filter) => ensure(await call('/rest/v1/' + table + '?' + filter, { method: 'DELETE', headers: { Prefer: 'return=representation' } })).json;

  /* ---- autentikasi ---- */
  async function signIn(email, password) {
    const r = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (!r.ok) return { msg: msg(r) };
    putS(toSession(r.json)); ss.set(LOGGED_K, null); return { ok: true };
  }
  const getUser = async () => ensure(await call('/auth/v1/user')).json;
  const mfa = {
    async factors() { const u = await getUser(); return (u.factors || []).filter(f => f.factor_type === 'totp'); },
    async enroll() { return ensure(await call('/auth/v1/factors', { method: 'POST', body: { factor_type: 'totp', friendly_name: 'Admin ' + new Date().toISOString().slice(0, 16), issuer: 'Personal Journal' } })).json; },
    async verify(factorId, code) {
      const ch = await call('/auth/v1/factors/' + encodeURIComponent(factorId) + '/challenge', { method: 'POST', body: {} });
      if (!ch.ok) return { msg: msg(ch) };
      const v = await call('/auth/v1/factors/' + encodeURIComponent(factorId) + '/verify', { method: 'POST', body: { challenge_id: ch.json.id, code: String(code).trim() } });
      if (!v.ok) return { msg: /invalid|expired|code/i.test(JSON.stringify(v.json || {})) ? 'Kode salah atau kedaluwarsa. Coba kode terbaru.' : msg(v) };
      putS(toSession(v.json, getS())); return { ok: true };
    },
    async remove(id) { ensure(await call('/auth/v1/factors/' + encodeURIComponent(id), { method: 'DELETE' })); }
  };
  async function signOut(scope = 'local') {
    const s = getS();
    try { if (s && state.info && state.info.aal === 'aal2' && scope === 'local') await rpc('log_admin_attempt', { p_outcome: 'logout.ok' }).catch(() => {}); } catch (e) { /* abaikan */ }
    try { if (s) await raw('/auth/v1/logout?scope=' + (scope === 'global' ? 'global' : 'local'), { method: 'POST', token: s.access_token }); } catch (e) { /* abaikan */ }
    putS(null); ss.set(LOGGED_K, null); state.info = null; clearTimeout(idleT);
  }
  async function loadInfo() { state.info = await rpc('my_admin_info'); return state.info; }
  const can = p => !!(state.info && state.info.aal === 'aal2' && Array.isArray(state.info.permissions) && state.info.permissions.includes(p));
  const isSuper = () => !!(state.info && state.info.aal === 'aal2' && state.info.roles.includes('super_admin'));
  const markLogged = () => { if (!ss.get(LOGGED_K)) { ss.set(LOGGED_K, '1'); rpc('log_admin_attempt', { p_outcome: 'login.ok' }).catch(() => {}); } };

  /* ---- keluar otomatis (khusus admin) ---- */
  let idleT; const idleMin = () => { try { return Math.min(120, Math.max(1, +(localStorage.getItem(IDLE_K) || 15))); } catch (e) { return 15; } };
  const setIdle = m => { try { localStorage.setItem(IDLE_K, String(m)); } catch (e) { /* abaikan */ } bump(); };
  function bump() { clearTimeout(idleT); if (!getS()) return; idleT = setTimeout(async () => { await signOut(); if (state.onLogout) state.onLogout('Kamu keluar otomatis karena tidak aktif.'); }, idleMin() * 60000); }
  ['click', 'keydown', 'touchstart', 'mousemove'].forEach(e => addEventListener(e, () => { if (getS()) bump(); }, { passive: true }));

  /* ---- registri modul ---- */
  function register(def) { if (mods.some(m => m.id === def.id)) throw new Error('modul ganda: ' + def.id); mods.push({ order: 100, group: 'Utama', perm: null, ...def }); mods.sort((a, b) => a.order - b.order); }
  const visibleMods = () => mods.filter(m => !m.perm || (Array.isArray(m.perm) ? m.perm.some(can) : can(m.perm)));

  return { cfg, base, state, raw, call, rpc, select, insert, update, remove, signIn, signOut, mfa, getUser, loadInfo, can, isSuper, markLogged, session, getS, msg, register, mods, visibleMods, setIdle, idleMin, bump, ensure };
})();
