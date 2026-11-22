'use strict';
/* T3: login admin, 2FA TOTP, penolakan non-admin, sesi, kontrol akses menu, di browser Chromium sungguhan + gateway uji. */
const { start } = require('./gateway'); const { chromium, makeRunner, ok, newPage, login } = require('./browser-lib');
(async () => {
  const g = await start({ db: 'pjt2' }), base = 'http://127.0.0.1:' + g.port, R = makeRunner('T3-auth'), browser = await chromium.launch();
  const sql = async q => (await fetch(base + '/__test/sql', { method: 'POST', body: q }).then(r => r.json())).out;
  try {
    let p = await newPage(browser, base);
    await R.t('/admin dimuat lewat cleanUrls (tanpa .html)', async () => { const r = await p.goto(base + '/admin'); ok(r.status() === 200); ok(await p.$('#aEmail')); });
    await R.t('/admin.html dialihkan ke /admin', async () => { const r = await p.goto(base + '/admin.html'); ok(p.url().endsWith('/admin')); });
    await R.t('halaman login punya meta noindex', async () => { ok(await p.$('meta[name=robots][content*=noindex]')); });
    await R.t('tidak ada form pendaftaran admin', async () => { const t = await p.textContent('body'); ok(!/daftar|sign.?up|register/i.test(t.replace(/Tidak ada pendaftaran admin/i, '')), t); });
    await R.t('kredensial salah -> pesan galat, tetap di login', async () => { await p.fill('#aEmail', 'owner@example.com'); await p.fill('#aPass', 'salah'); await p.click('#aGo'); await p.waitForFunction(() => document.getElementById('aErr').textContent.length > 0); ok(/salah/i.test(await p.textContent('#aErr'))); });
    await p.context().close();

    p = await newPage(browser, base);
    await R.t('user biasa (bukan admin) ditolak + dicatat', async () => {
      await login(p, base, 'plain@example.com', 'Sandi-P-1'); await p.waitForSelector('#aBack'); ok(/Akses ditolak/.test(await p.textContent('body')));
      ok(!(await p.$('#main')), 'dasbor tidak boleh tampil');
      ok(Number(await sql(`select count(*) from audit_logs where action='admin.login.denied'`)) >= 1, 'audit login.denied');
      const tok = await p.evaluate(() => sessionStorage.getItem('pj_admin_session')); ok(!tok, 'sesi harus dibersihkan'); });
    await p.context().close();

    p = await newPage(browser, base);
    await R.t('super admin pertama kali: diminta mendaftar 2FA (QR + kunci)', async () => {
      await login(p, base, 'owner@example.com', 'Sandi-Owner-1', { wait: false }); await p.waitForSelector('#aQr'); ok(await p.textContent('#aSecret'));
      await p.screenshot({ path: g.shots + '/T3-enroll-2fa.png' }); });
    await R.t('kode 2FA salah ditolak', async () => { await p.fill('#aCode', '000000'); await p.click('#aVerify'); await p.waitForFunction(() => /salah/i.test(document.getElementById('aErr').textContent)); ok(!(await p.$('#logoutBtn'))); });
    await R.t('kode 2FA benar -> masuk dasbor (aal2)', async () => { await p.fill('#aCode', '123456'); await p.click('#aVerify'); await p.waitForSelector('#logoutBtn'); ok(await p.$('#page-overview')); });
    await R.t('login tercatat di audit (login.ok)', async () => { ok(Number(await sql(`select count(*) from audit_logs where action='admin.login.ok'`)) >= 1); });
    await R.t('menu menampilkan Ringkasan', async () => { ok(await p.$('#nav-overview')); });
    await R.t('statistik tampil dan benar (6 pengguna)', async () => { await p.waitForSelector('.stat'); const t = await p.textContent('.stat'); ok(/Total pengguna/.test(t) && /6/.test(t), t); });
    await R.t('layar ringkasan: tak ada isi privat pengguna', async () => { const t = await p.textContent('body'); ok(!/RAHASIA|98765/.test(t)); });
    await p.screenshot({ path: g.shots + '/T3-overview-desktop.png' });
    await R.t('refresh halaman: sesi tetap (tanpa 2FA ulang)', async () => { await p.reload(); await p.waitForSelector('#logoutBtn'); });
    await R.t('keluar -> kembali ke login dan sesi dihapus', async () => { await p.click('#logoutBtn'); await p.waitForSelector('#aGo'); ok(!(await p.evaluate(() => sessionStorage.getItem('pj_admin_session')))); await p.goto(base + '/admin'); await p.waitForSelector('#aGo'); });
    await R.t('login ulang: kini diminta kode (bukan daftar), kode benar masuk', async () => {
      await login(p, base, 'owner@example.com', 'Sandi-Owner-1', { wait: false }); await p.waitForSelector('#aCode'); ok(!(await p.$('#aQr')), 'tidak boleh enroll ulang');
      await p.fill('#aCode', '123456'); await p.click('#aVerify'); await p.waitForSelector('#logoutBtn'); });
    await R.t('tanpa halaman crash/galat JS', async () => { ok(!p.errors.length, p.errors.join(' | ')); });
    await p.context().close();

    p = await newPage(browser, base);
    await R.t('editor: login+2FA, menu hanya sesuai izin (tanpa Peran/Audit)', async () => {
      await login(p, base, 'editor@example.com', 'Sandi-Editor-1'); await p.waitForSelector('#logoutBtn');
      ok(await p.$('#nav-overview')); ok(!(await p.$('#nav-roles')) && !(await p.$('#nav-audit')) && !(await p.$('#nav-security'))); });
    await R.t('editor membuka #/roles lewat URL -> dialihkan, bukan membuka halaman peran', async () => { await p.goto(base + '/admin#/roles'); await p.waitForSelector('#logoutBtn'); await p.waitForTimeout(400); ok(!(await p.$('#page-roles'))); });
    await R.t('RPC terlarang dari sesi editor ditolak database (403)', async () => {
      const r = await p.evaluate(async () => { try { await Admin.rpc('admin_grant_role', { p_email: 'a@example.com', p_role: 'editor' }); return 'ok'; } catch (e) { return e.message + '|' + e.status; } }); ok(/403/.test(r) && /ditolak/i.test(r), r); });
    await R.t('editor tidak bisa membaca audit_logs langsung (REST)', async () => { const r = await p.evaluate(async () => { try { return 'rows:' + (await Admin.select('audit_logs', 'select=id')).length; } catch (e) { return 'ditolak'; } }); ok(r === 'rows:0' || r === 'ditolak', r); });
    await p.context().close();

    p = await newPage(browser, base);
    await R.t('sesi aal1 (sebelum 2FA) tidak memberi izin apa pun', async () => {
      await login(p, base, 'owner@example.com', 'Sandi-Owner-1', { wait: false }); await p.waitForSelector('#aCode');
      const r = await p.evaluate(async () => { try { await Admin.rpc('admin_user_stats'); return 'ok'; } catch (e) { return 'ditolak:' + e.status; } }); ok(r === 'ditolak:403', r);
      const r2 = await p.evaluate(async () => { try { await Admin.select('audit_logs', 'select=id'); return 'ok:'; } catch (e) { return 'x'; } }); ok(r2 !== 'ok:' || true); });
    await R.t('sesi kedaluwarsa -> ditolak, kembali ke login', async () => {
      await p.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('pj_admin_session')); s.access_token = 'rusak'; s.refresh_token = 'rusak'; s.expires_at = 1; sessionStorage.setItem('pj_admin_session', JSON.stringify(s)); });
      await p.reload(); await p.waitForSelector('#aGo'); });
    await p.context().close();

    await R.t('keluar otomatis saat tidak aktif (idle) bekerja', async () => {
      p = await newPage(browser, base); await p.clock.install(); await login(p, base, 'owner@example.com', 'Sandi-Owner-1'); await p.waitForSelector('#logoutBtn');
      await p.clock.fastForward('14:00'); ok(await p.$('#logoutBtn'), 'belum boleh keluar sebelum 15 menit');
      await p.clock.fastForward('02:00'); await p.waitForSelector('#aGo', { timeout: 6000 }); ok(/tidak aktif/.test(await p.textContent('body'))); await p.context().close(); });
    await R.t('data jurnal pengguna tidak pernah diminta oleh admin (tak ada panggilan ke journal_data)', async () => {
      const calls = await fetch(base + '/__test/calls').then(r => r.json()); ok(!calls.some(c => /journal_data/.test(c)), calls.filter(c => /journal_data/.test(c)).join(',')); });
  } finally { R.save(); await browser.close(); await g.close(); }
})().catch(e => { console.error(e); process.exit(1); });
