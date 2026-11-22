'use strict';
/* Platform: menerapkan pengaturan dari Admin ke aplikasi pengguna.
   Aturan: (1) hanya MEMBACA data publik (published_config, public_settings, app_modules) dengan kunci publik;
   (2) semua nilai divalidasi lagi di sini dan hanya masuk lewat properti/ CSS yang kita susun sendiri (tanpa HTML/JS dari data);
   (3) kalau apa pun gagal, aplikasi tetap berjalan dengan tampilan bawaan (fail-safe);
   (4) tidak menyentuh data pengguna dan tidak memanggil Store.save/Cloud. */
const PJPlatform = (() => {
  const cfg = window.PJ_CONFIG || {}, KEY = 'pj_platform_v1';
  const E = id => document.getElementById(id);
  const PREVIEW = (() => { try { return window.parent !== window && /[?&]pjpreview=1\b/.test(location.search) && document.referrer.startsWith(location.origin + '/admin'); } catch (e) { return false; } })();
  const HEX = /^#[0-9a-fA-F]{6}$/, FONTS = { Inter: 'Inter', Poppins: 'Poppins', Montserrat: 'Montserrat', 'Playfair Display': 'Playfair+Display', Roboto: 'Roboto' };
  const WIDGET = { recent: 'recentCard', overview: 'overviewCard', budgets: 'bsnapCard', goals: 'gsnapCard', insight: 'isnapCard' };
  let state = { theme: null, home: null, nav: null, branding: null, maintenance: null, announcement: null, modules: null };
  let styleEl = null, applied = false;

  const num = (v, a, b, d) => typeof v === 'number' && v >= a && v <= b ? v : d;
  const oneOf = (v, list, d) => list.includes(v) ? v : d;
  const shade = (hex, amt) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 + amt)))).toString(16).padStart(2, '0')).join('');

  function css() {
    const t = state.theme || {}, b = state.branding || {}, r = [];
    const radius = num(t.radius, 0, 28, null), fs = num(t.fontScale, 0.85, 1.25, null);
    if (radius !== null) r.push(`.card,.balcard,.auth-card,.wallet,.ev,.relakan,.inv div{border-radius:${radius}px}dialog{border-radius:${Math.min(28, radius + 4)}px}input,select,textarea,.btn,.seg span{border-radius:${Math.max(0, Math.round(radius * 0.75))}px}`);
    if (fs !== null) r.push(`html{font-size:${(fs * 100).toFixed(0)}%}`);
    if (oneOf(t.density, ['compact', 'comfortable'], 'comfortable') === 'compact') r.push('.card{padding:14px}.grid{gap:12px}.home{gap:10px}');
    const cs = oneOf(t.cardStyle, ['flat', 'elevated', 'outline'], 'elevated');
    if (cs === 'flat') r.push('.card,.balcard{box-shadow:none;border-color:transparent}'); else if (cs === 'outline') r.push('.card,.balcard{box-shadow:none;border:2px solid var(--line)}');
    const bs = oneOf(t.buttonStyle, ['filled', 'soft', 'outline'], 'filled');
    if (bs === 'soft') r.push('.btn.primary{background:var(--p-soft);color:var(--p-dark)}'); else if (bs === 'outline') r.push('.btn.primary{background:transparent;color:var(--p);box-shadow:inset 0 0 0 2px var(--p)}');
    const mode = oneOf(t.mode, ['auto', 'light', 'dark'], 'auto');
    if (mode === 'dark') r.push(':root{--ink:#EDE8FA;--muted:#A9A3C2;--line:#2C2548;--bg:#0F0B1E;--card:#181330;--p-soft:#221A44;--p-soft2:#2E2358;--teal-soft:#10302F;--red-soft:#3A1420}');
    if (mode === 'light') r.push(':root{--ink:#1D1B2E;--muted:#6B6880;--line:#E7E2F1;--bg:#FAF8FF;--card:#FFFFFF;--p-soft:#F3EBFF;--p-soft2:#E8DCFB;--teal-soft:#E3F3F2;--red-soft:#FBEAEE}.logo{color:var(--p-dark)}');
    if (typeof t.background === 'string' && HEX.test(t.background)) r.push(`body{background:${t.background}}`);
    if (typeof b.primary === 'string' && HEX.test(b.primary)) r.push(`:root{--p:${b.primary};--p-light:${shade(b.primary, 0.35)}}`);
    if (typeof b.secondary === 'string' && HEX.test(b.secondary)) r.push(`:root{--p-dark:${b.secondary}}`);
    if (b.font && FONTS[b.font]) r.push(`:root{--body:'${b.font}',system-ui,-apple-system,'Segoe UI',sans-serif}`);
    r.push('.pj-maint{position:fixed;inset:0;z-index:9999;background:var(--bg);color:var(--ink);display:grid;place-items:center;padding:24px;text-align:center}.pj-maint div{max-width:420px;display:grid;gap:12px}.pj-ban{background:var(--p-dark);color:#fff;padding:9px 40px 9px 16px;font-size:.9rem;position:relative;text-align:center}.pj-ban button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#fff;font-size:1.2rem;cursor:pointer;min-width:32px;min-height:32px}.pj-wel{max-width:1100px;margin:10px auto 0;padding:0 16px}.pj-wel p{background:var(--p-soft);padding:10px 14px;border-radius:10px;margin:0}');
    return r.join('\n');
  }
  function paintStyle() { if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'pj-platform-style'; document.head.appendChild(styleEl); } styleEl.textContent = css(); }

  function brand() {
    const b = state.branding || {};
    if (typeof b.name === 'string' && b.name.trim()) { const n = b.name.trim().slice(0, 40); document.querySelectorAll('.logo').forEach(l => { if (!l.querySelector('img')) l.textContent = n; }); if (!PREVIEW) document.title = n; }
    if (b.font && FONTS[b.font] && b.font !== 'Inter' && b.font !== 'Playfair Display' && !document.getElementById('pj-font')) {
      const l = document.createElement('link'); l.id = 'pj-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[b.font] + ':wght@300;400;500&display=swap'; document.head.appendChild(l); }
    const safeUrl = u => typeof u === 'string' && /^https:\/\/[^\s'"<>]+$/.test(u) && u.length <= 500;
    if (safeUrl(b.favicon_url)) { let l = document.querySelector('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); } l.href = b.favicon_url; }
    if (safeUrl(b.logo_url)) document.querySelectorAll('.logo.sm').forEach(l => { if (!l.querySelector('img')) { const i = document.createElement('img'); i.src = b.logo_url; i.alt = ''; i.className = 'pj-logo'; i.style.height = '28px'; i.style.verticalAlign = 'middle'; i.style.marginRight = '8px'; l.insertBefore(i, l.firstChild); } });
  }
  function nav() {
    const links = [...document.querySelectorAll('.top nav a')]; if (!links.length) return;
    const items = state.nav && Array.isArray(state.nav.items) ? state.nav.items : [], idx = Object.fromEntries(items.map((it, i) => [it.id, i + 1]));
    const mods = Object.fromEntries((state.modules || []).map(m => [m.id, m]));
    links.forEach((a, i) => {
      const id = (a.getAttribute('href') || '').replace('#', ''), it = items.find(x => x.id === id), m = mods[id];
      a.style.order = it ? String(idx[id]) : String(items.length + 1 + i);
      if (a.dataset.pjLabel === undefined) a.dataset.pjLabel = a.textContent;
      a.textContent = it && typeof it.label === 'string' && it.label.trim() ? it.label.trim().slice(0, 20) : a.dataset.pjLabel;
      a.hidden = !!((it && it.visible === false) || (m && (!m.enabled || m.visible === false)));
    });
    (state.modules || []).forEach(m => { const sec = E(m.id); if (sec && sec.tagName === 'SECTION') sec.hidden = !m.enabled; });
    guard();
  }
  function guard() { const id = location.hash.replace('#', ''), m = (state.modules || []).find(x => x.id === id); if (m && !m.enabled) location.hash = '#home'; }
  function home() {
    const h = state.home; if (!h) return;
    if (typeof h.title === 'string' && h.title.trim()) { const g = E('greet'); if (g) g.textContent = h.title.trim().slice(0, 60); }
    const hh = document.querySelector('.hhead > div'); if (hh) { let s = E('pjSub'); if (typeof h.subtitle === 'string' && h.subtitle.trim()) { if (!s) { s = document.createElement('p'); s.id = 'pjSub'; s.className = 'muted'; hh.appendChild(s); } s.textContent = h.subtitle.trim().slice(0, 120); } else if (s) s.remove(); }
    const homeEl = E('home'); if (homeEl) { let w = E('pjWel'); if (typeof h.welcome === 'string' && h.welcome.trim()) { if (!w) { w = document.createElement('div'); w.id = 'pjWel'; w.className = 'pj-wel'; w.appendChild(document.createElement('p')); homeEl.parentNode.insertBefore(w, homeEl.nextSibling); } w.firstChild.textContent = h.welcome.trim().slice(0, 160); } else if (w) w.remove(); }
    const widgets = Array.isArray(h.widgets) ? h.widgets : [];
    widgets.forEach((w, i) => { const c = E(WIDGET[w.id]); if (!c) return; c.style.order = String(i + 1); c.hidden = w.visible === false; });
  }
  function banner() {
    const a = state.announcement; let bn = E('pjBan');
    if (!a || !a.on || !a.text || PREVIEW) { if (bn) bn.remove(); return; }
    let dismissed = null; try { dismissed = sessionStorage.getItem('pj_ban_x'); } catch (e) { /* abaikan */ }
    if (dismissed === a.text) return;
    if (!bn) { bn = document.createElement('div'); bn.id = 'pjBan'; bn.className = 'pj-ban'; bn.setAttribute('role', 'status'); const s = document.createElement('span'); bn.appendChild(s); const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Tutup pengumuman'); x.textContent = '×'; x.onclick = () => { try { sessionStorage.setItem('pj_ban_x', state.announcement.text); } catch (e) { /* abaikan */ } bn.remove(); }; bn.appendChild(x); document.body.insertBefore(bn, document.body.firstChild); }
    bn.firstChild.textContent = String(a.text).slice(0, 200);
  }
  function maint() {
    const m = state.maintenance; let o = E('pjMaint');
    if (!m || !m.on || PREVIEW) { if (o) o.remove(); return; }
    if (!o) { o = document.createElement('div'); o.id = 'pjMaint'; o.className = 'pj-maint'; o.setAttribute('role', 'alertdialog'); o.setAttribute('aria-label', 'Perawatan'); const d = document.createElement('div'); const h = document.createElement('h2'); h.textContent = 'Sedang dalam perawatan'; const p = document.createElement('p'); p.id = 'pjMaintMsg'; const bt = document.createElement('button'); bt.className = 'btn primary'; bt.type = 'button'; bt.textContent = 'Muat ulang'; bt.onclick = () => location.reload(); d.append(h, p, bt); o.appendChild(d); document.body.appendChild(o); }
    E('pjMaintMsg').textContent = String(m.message || 'Aplikasi sedang dalam perawatan. Silakan kembali beberapa saat lagi.').slice(0, 300);
  }
  function applyAll() { try { paintStyle(); brand(); nav(); home(); banner(); maint(); applied = true; } catch (e) { /* fail-safe */ } }

  async function fetchJ(path) {
    const h = { apikey: cfg.anonKey }; if (/^eyJ/.test(cfg.anonKey || '')) h.Authorization = 'Bearer ' + cfg.anonKey;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try { const r = await fetch(String(cfg.url).replace(/\/+$/, '') + path, { headers: h, signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function refresh() {
    if (!cfg.url || !cfg.anonKey || PREVIEW) return;
    try {
      const [pc, ps, am] = await Promise.all([fetchJ('/rest/v1/published_config?select=key,data'), fetchJ('/rest/v1/public_settings?select=key,value'), fetchJ('/rest/v1/app_modules?select=id,enabled,visible')]);
      const next = { ...state }; ['theme', 'home', 'nav'].forEach(k => { const r = pc.find(x => x.key === k); next[k] = r ? r.data : null; });
      ['branding', 'maintenance', 'announcement'].forEach(k => { const r = ps.find(x => x.key === k); next[k] = r ? r.value : null; }); next.modules = am;
      state = next; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* abaikan */ }
      applyAll();
    } catch (e) { /* offline atau galat: pakai cache/bawaan */ }
  }

  /* ---- mode pratinjau (hanya di dalam iframe Admin, satu origin) ---- */
  function previewBoot() {
    try {
      Store.save = () => false; Store.onSaved = null;                       // pratinjau tidak pernah menulis data
      const t = new Date(), d = n => { const x = new Date(t); x.setDate(x.getDate() - n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
      user = 'pratinjau'; D = Store.defaults(); D.profile = { name: 'Contoh' };
      D.wallets[0].balance = 1500000; D.wallets[1].balance = 4200000;
      D.tx = [{ id: 'p1', type: 'out', amount: 45000, cat: 'Makan', wallet: D.wallets[0].id, date: d(0), note: 'Contoh' }, { id: 'p2', type: 'in', amount: 3000000, cat: 'Gaji', wallet: D.wallets[1].id, date: d(2), note: 'Contoh' }, { id: 'p3', type: 'out', amount: 120000, cat: 'Transport', wallet: D.wallets[0].id, date: d(3), note: 'Contoh' }];
      D.budgets = { Makan: 800000 }; D.goals = [{ id: 'g1', name: 'Dana darurat', target: 10000000, saved: 2500000 }];
      E('auth').hidden = true; E('app').hidden = false; E('whoName').textContent = 'Pratinjau'; fillMonths(); render();
    } catch (e) { /* tampilan masuk tetap bisa dipratinjau */ }
  }
  addEventListener('message', ev => {
    if (!PREVIEW || ev.origin !== location.origin || ev.source !== window.parent || !ev.data || ev.data.type !== 'pj-preview') return;
    const c = ev.data.config || {}; state = { ...state, theme: c.theme ?? state.theme, home: c.home ?? state.home, nav: c.nav ?? state.nav, branding: c.branding ?? state.branding };
    applyAll();
  });

  /* ---- mulai ---- */
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && typeof c === 'object' && !PREVIEW) state = { ...state, ...c }; } catch (e) { /* abaikan */ }
  const boot = () => { if (PREVIEW) { previewBoot(); try { window.parent.postMessage({ type: 'pj-preview-ready' }, location.origin); } catch (e) { /* abaikan */ } } applyAll(); refresh(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  addEventListener('hashchange', guard);
  /* render() milik aplikasi dibungkus supaya pengaturan Beranda tetap berlaku setelah tiap gambar ulang */
  if (typeof render === 'function') { const prev = render; render = function () { const r = prev.apply(this, arguments); try { home(); nav(); } catch (e) { /* abaikan */ } return r; }; }
  return { applyAll, refresh, _state: () => state, PREVIEW };
})();
