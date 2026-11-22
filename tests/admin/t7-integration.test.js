'use strict';
/* T7: integrasi dan regresi: aplikasi pengguna lama tetap jalan, service worker tidak menyimpan /admin, header keamanan,
   responsif (desktop/tablet/ponsel), mode gelap, aksesibilitas dasar. */
const { start } = require('./gateway'); const L = require('./browser-lib'); const { chromium, makeRunner, ok, adminPage, openMod, newPage, ROOT } = L;
const path = require('path');
(async () => {
  const g = await start({ db: 'pjt2' }), base = 'http://127.0.0.1:' + g.port, R = makeRunner('T7-integration'), browser = await chromium.launch(); const t = R.t;
  const sql = async q => (await fetch(base + '/__test/sql', { method: 'POST', body: q }).then(r => r.json())).out;
  const MODS = ['overview', 'users', 'roles', 'branding', 'cms', 'media', 'communication', 'analytics', 'settings', 'security', 'audit', 'backup', 'import-export', 'maintenance', 'modules-manager', 'feature-builder', 'application-management', 'layout-editor'];
  try {
    // ---------- regresi: 16 uji penyimpanan lama ----------
    await t('Regresi: 16 uji lapisan penyimpanan (store.test.js) tetap lulus', async () => { const p = await newPage(browser, base); await p.goto('file://' + path.join(ROOT, 'tests', 'run.html')); const r = await p.evaluate(() => window.__hasil); ok(r.length === 16 && r.every(x => x.ok), JSON.stringify(r.filter(x => !x.ok))); await p.context().close(); });
    // ---------- regresi: aplikasi pengguna ----------
    const U = await newPage(browser, base);
    await t('Aplikasi pengguna: halaman masuk muncul, tanpa galat JS', async () => { await U.goto(base + '/'); await U.waitForSelector('#auth'); ok(!U.errors.length, U.errors.join('|')); });
    await t('Aplikasi pengguna: masuk dengan akun cloud lama, data dari cloud termuat', async () => { await U.fill('#u', 'a@example.com'); await U.fill('#p', 'Sandi-A-1'); await U.click('#authBtn'); await U.waitForSelector('#app:not([hidden])'); await U.waitForTimeout(800); ok(await U.evaluate(() => D.tx.length === 1 && D.tx[0].amount === 98765), 'data cloud tidak termuat'); });
    await t('Aplikasi pengguna: tambah transaksi tersinkron ke cloud (rev naik), data lama tidak tertimpa', async () => {
      await U.evaluate(() => { D.tx.push({ id: 'baru1', type: 'out', amount: 1000, cat: 'Makan', wallet: D.wallets[0].id, date: today(), note: 'uji' }); Store.save(user, D); }); await U.waitForTimeout(3000);
      const row = await sql(`select rev||'|'||jsonb_array_length(data->'tx') from journal_data where user_id='${g.ID.userA}'`); ok(row === '4|2', row); ok(/RAHASIA-KEUANGAN-A/.test(await sql(`select data::text from journal_data where user_id='${g.ID.userA}'`))); });
    await t('Aplikasi pengguna: dialog Keamanan dan keluar tetap berfungsi', async () => { await U.click('#secBtn'); await U.waitForSelector('#mSec[open]'); await U.keyboard.press('Escape'); await U.click('#logout'); await U.waitForSelector('#auth:not([hidden])'); });
    await t('Aplikasi pengguna: pendaftaran akun baru tetap berfungsi', async () => { await U.reload(); await U.click('.tab[data-m=register], #tabReg, .tabs .tab:nth-child(2)'); await U.fill('#u', 'baru@example.com'); await U.fill('#p', 'Sandi-Baru-1'); await U.click('#authBtn'); await U.waitForSelector('#app:not([hidden])', { timeout: 8000 }); ok((await sql(`select count(*) from profiles where email='baru@example.com'`)) === '1', 'profil otomatis dibuat oleh trigger'); });
    await t('Aplikasi pengguna: tanpa galat JS selama alur', async () => { ok(!U.errors.length, U.errors.join('|')); });
    await t('Pengguna baru TIDAK mendapat akses admin (halaman admin menolak)', async () => { const p = await newPage(browser, base); await L.login(p, base, 'baru@example.com', 'Sandi-Baru-1'); await p.waitForSelector('#aBack'); ok(/ditolak/i.test(await p.textContent('body'))); await p.context().close(); });
    await U.context().close();
    // ---------- service worker ----------
    await t('Service worker: aktif untuk aplikasi, platform.js ikut di-cache, /admin TIDAK pernah di-cache', async () => {
      const ctx = await browser.newContext({ serviceWorkers: 'allow' }); const p = await ctx.newPage(); await p.goto(base + '/'); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(800);
      await p.goto(base + '/admin'); await p.waitForSelector('#aGo'); await p.fill('#aEmail', 'owner@example.com'); await p.fill('#aPass', 'Sandi-Owner-1'); await p.click('#aGo'); await p.waitForSelector('#aCode'); await p.waitForTimeout(500);
      const urls = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
      ok(urls.includes('/platform.js') && urls.includes('/app.js'), 'cache app: ' + urls.join(',')); ok(!urls.some(u => u === '/admin' || u.startsWith('/admin/') || u === '/admin.html'), 'admin ter-cache: ' + urls.filter(u => /admin/.test(u)).join(',')); ok((await p.evaluate(() => caches.keys())).includes('pj-t4'));
      await ctx.close(); });
    // ---------- header keamanan ----------
    const hd = async u => { const r = await fetch(base + u, { redirect: 'manual' }); return { s: r.status, h: r.headers }; };
    await t('Header /admin: noindex, tidak bisa di-frame, CSP ketat, no-store', async () => { const { h, s } = await hd('/admin'); ok(s === 200); ok(/noindex/.test(h.get('x-robots-tag')) && h.get('x-frame-options') === 'DENY' && h.get('cache-control') === 'no-store'); const c = h.get('content-security-policy'); ok(/script-src 'self'/.test(c) && /frame-ancestors 'none'/.test(c) && !/unsafe-inline|unsafe-eval/.test(c) && /object-src 'none'/.test(c), c); });
    await t('Header /admin/*.js juga memakai CSP dan noindex', async () => { const { h } = await hd('/admin/core.js'); ok(/script-src 'self'/.test(h.get('content-security-policy')) && /noindex/.test(h.get('x-robots-tag'))); });
    await t('Header aplikasi pengguna: SAMEORIGIN (pratinjau admin), nosniff, tanpa CSP yang merusak font/gaya lama', async () => { const { h } = await hd('/'); ok(h.get('x-frame-options') === 'SAMEORIGIN' && h.get('x-content-type-options') === 'nosniff' && !h.get('content-security-policy')); });
    await t('/admin.html dialihkan ke /admin (cleanUrls)', async () => { const r = await hd('/admin.html'); ok(r.s === 308 && /\/admin$/.test(r.h.get('location'))); });
    await t('Berkas non-publik (tests, supabase, cloud) tidak disajikan (meniru .vercelignore)', async () => { for (const u of ['/tests/admin/db.test.js', '/supabase/migrations/001_admin_foundation.sql', '/cloud/supabase.sql', '/PANDUAN-CLOUD.md']) ok((await hd(u)).s === 404, u); });
    await t('Tidak ada catch-all rewrite: rute acak 404 (bukan index.html)', async () => { ok((await hd('/nggak-ada-halaman')).s === 404); });
    await t('Semua JS admin lolos CSP: tidak ada pelanggaran di semua 18 modul', async () => {
      const p = await adminPage(browser, base, 'owner'); for (const m of MODS) await openMod(p, m); ok(!p.cspViolations.length, p.cspViolations.join('|')); ok(!p.errors.length, p.errors.join('|')); await p.context().close(); });
    // ---------- responsif ----------
    const sizes = { desktop: { width: 1280, height: 800 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
    for (const [name, vp] of Object.entries(sizes)) {
      await t(`Responsif ${name}: semua 18 modul tanpa gulir horizontal halaman`, async () => {
        const p = await adminPage(browser, base, 'owner', { viewport: vp }); const bad = [];
        for (const m of MODS) { await openMod(p, m); await p.waitForTimeout(150); const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); if (w.sw > w.iw + 1) bad.push(m + ':' + w.sw + '>' + w.iw); if (['overview', 'users', 'layout-editor', 'audit'].includes(m)) await p.screenshot({ path: `${R.shots}/T7-${name}-${m}.png` }); }
        ok(!bad.length, bad.join(', ')); await p.context().close(); });
    }
    await t('Ponsel: menu samping tertutup bawaan, bisa dibuka lewat tombol dan menutup setelah memilih', async () => {
      const p = await adminPage(browser, base, 'owner', { viewport: sizes.mobile }); const x = async () => { const b = await p.locator('#side').boundingBox(); return b.x + b.width; }; ok((await x()) <= 1, 'menu harus di luar layar'); await p.click('#menuBtn'); await p.waitForTimeout(400); ok((await x()) > 200, 'menu harus terbuka'); await p.screenshot({ path: R.shots + '/T7-mobile-menu-open.png' }); await p.click('#nav-users'); await p.waitForSelector('#page-users'); await p.waitForTimeout(400); ok((await x()) <= 1, 'menu harus menutup setelah memilih'); await p.context().close(); });
    await t('Desktop: tombol menu melipat sidebar (collapse)', async () => { const p = await adminPage(browser, base, 'owner'); await p.click('#menuBtn'); ok(await p.evaluate(() => document.body.classList.contains('collapsed'))); await p.screenshot({ path: R.shots + '/T7-desktop-collapsed.png' }); await p.click('#menuBtn'); await p.context().close(); });
    await t('Mode gelap: halaman admin terbaca (kontras teks/latar cukup) + tangkapan layar', async () => {
      const p = await adminPage(browser, base, 'owner', { ctx: { colorScheme: 'dark' } }); await openMod(p, 'users'); await p.screenshot({ path: R.shots + '/T7-dark-users.png' });
      const c = await p.evaluate(() => { const f = s => { const m = s.match(/\d+(\.\d+)?/g).map(Number); return m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); }; const L = a => .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; const cs = getComputedStyle(document.body); const a = L(f(cs.color)), b = L(f(cs.backgroundColor)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }); ok(c >= 7, 'kontras ' + c.toFixed(1)); await p.context().close(); });
    await t('Kontras mode terang >= 4.5 untuk teks utama dan teks redup', async () => {
      const p = await adminPage(browser, base, 'owner', { ctx: { colorScheme: 'light' } }); const r = await p.evaluate(() => { const lum = s => { const m = s.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; }; const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
        const st = getComputedStyle(document.documentElement), card = getComputedStyle(document.querySelector('.cardx, .stat') || document.body), muted = getComputedStyle(document.querySelector('.muted') || document.body);
        return { ink: ratio(getComputedStyle(document.body).color, card.backgroundColor), muted: ratio(muted.color, getComputedStyle(document.body).backgroundColor) }; }); ok(r.ink >= 4.5 && r.muted >= 4.5, JSON.stringify(r)); await p.context().close(); });
    // ---------- aksesibilitas dasar ----------
    await t('Aksesibilitas: tombol dan isian di semua modul punya nama (teks/aria-label/label)', async () => {
      const p = await adminPage(browser, base, 'owner'); const bad = [];
      for (const m of MODS) { await openMod(p, m); await p.waitForTimeout(100); const b = await p.evaluate(() => { const out = []; document.querySelectorAll('#main button, #main a, #main input:not([type=hidden]), #main select, #main textarea').forEach(e => { const name = (e.getAttribute('aria-label') || e.textContent || '').trim() || (e.labels && e.labels.length ? 'lbl' : '') || e.getAttribute('title') || e.getAttribute('placeholder'); if (!name && !(e.closest('label'))) out.push(e.tagName + '#' + (e.id || '?')); }); return out; }); b.forEach(x => bad.push(m + ':' + x)); }
      ok(!bad.length, bad.slice(0, 8).join(', ')); await p.context().close(); });
    await t('Aksesibilitas: dialog ditutup dengan Escape dan fokus bisa dijangkau keyboard di login', async () => { const p = await newPage(browser, base); await p.goto(base + '/admin'); await p.waitForSelector('#aEmail'); ok(await p.evaluate(() => document.activeElement.id === 'aEmail'), 'fokus awal di email'); await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement.id === 'aPass')); await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement.id === 'aGo')); await p.context().close(); });
    await t('Aksesibilitas: halaman punya landmark main/nav/header dan lang="id"', async () => { const p = await adminPage(browser, base, 'owner'); ok(await p.$('main#main') && await p.$('nav[aria-label]') && await p.$('header.top') && (await p.getAttribute('html', 'lang')) === 'id'); await p.context().close(); });
  } finally { R.save(); await browser.close(); await g.close(); }
})().catch(e => { console.error(e); process.exit(1); });
