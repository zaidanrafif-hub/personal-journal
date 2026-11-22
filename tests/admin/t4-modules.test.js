'use strict';
/* T4: modul pengelolaan: Pengguna, Peran, Branding, Konten, Media, Komunikasi. */
const { start } = require('./gateway'); const L = require('./browser-lib'); const { chromium, makeRunner, ok, adminPage, openMod, toast, toastErr, confirmOk, download, api, userToken } = L;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const g = await start({ db: 'pjt2' }), base = 'http://127.0.0.1:' + g.port, R = makeRunner('T4-modules-manage'), browser = await chromium.launch();
  const sql = async q => (await fetch(base + '/__test/sql', { method: 'POST', body: q }).then(r => r.json())).out;
  const t = R.t;
  try {
    const O = await adminPage(browser, base, 'owner');
    // ---------- Pengguna ----------
    await t('Pengguna: daftar 6 akun, hanya metadata', async () => { await openMod(O, 'users'); await O.waitForSelector('.tbl'); const tx = await O.textContent('#page-users'); ok(/a@example.com/.test(tx) && /Revisi data/.test(tx)); ok(!/RAHASIA|98765/.test(tx)); ok((await O.$$('.tbl tbody tr')).length === 6, 'baris=' + (await O.$$('.tbl tbody tr')).length); });
    await t('Pengguna: pencarian email', async () => { await O.fill('#uSearch', 'editor'); await O.waitForFunction(() => document.querySelectorAll('.tbl tbody tr').length === 1); ok(/editor@example.com/.test(await O.textContent('.tbl'))); await O.fill('#uSearch', ''); await O.waitForFunction(() => document.querySelectorAll('.tbl tbody tr').length === 6); });
    await t('Pengguna: nonaktifkan lalu aktifkan akun (dengan konfirmasi) + tercatat audit', async () => {
      await O.click('button[data-act=toggle][data-email="b@example.com"]'); await confirmOk(O); await toast(O, 'Status diperbarui');
      ok((await sql(`select status from profiles where email='b@example.com'`)) === 'disabled'); ok(Number(await sql(`select count(*) from audit_logs where action='user.status'`)) >= 1);
      await O.waitForFunction(() => [...document.querySelectorAll('.badge')].some(b => b.textContent === 'Nonaktif'));
      await O.click('button[data-act=toggle][data-email="b@example.com"]'); await confirmOk(O); await toast(O, 'Status diperbarui'); ok((await sql(`select status from profiles where email='b@example.com'`)) === 'active'); });
    await t('Pengguna: Super Admin dilindungi (tanpa tombol nonaktifkan)', async () => { await O.waitForSelector('.tbl tbody tr'); ok(!(await O.$('button[data-act=toggle][data-email="owner@example.com"]'))); ok(/dilindungi/.test(await O.textContent('#page-users'))); });
    await t('Pengguna: ekspor CSV berisi email, tanpa data pribadi', async () => { const buf = await download(O, '#uCsv'); const s = buf.toString('utf8'); ok(/email,status/.test(s) && /a@example.com/.test(s)); ok(!/RAHASIA|98765/.test(s)); });
    await t('Pengguna: ekspor XLSX valid (dibaca ulang)', async () => { const buf = await download(O, '#uXlsx'); const rows = await O.evaluate(async b => XLSX.read(new Uint8Array(b).buffer), [...buf]); ok(rows.length === 6 && rows.some(r => r.email === 'a@example.com'), JSON.stringify(rows).slice(0, 200)); });
    // ---------- Peran ----------
    await t('Peran: daftar anggota admin', async () => { await openMod(O, 'roles'); await O.waitForSelector('.tbl'); const tx = await O.textContent('#page-roles'); ok(/owner@example.com/.test(tx) && /Editor/.test(tx) && /Customer Service/.test(tx)); });
    await t('Peran: beri lalu cabut peran editor', async () => {
      await O.fill('#rEmail', 'plain@example.com'); await O.selectOption('#rRole', 'editor'); await O.click('#rGrant'); await toast(O, 'Peran diberikan');
      ok(await sql(`select role from user_roles ur join auth.users u on u.id=ur.user_id where u.email='plain@example.com'`) === 'editor');
      await O.click('button[data-act=revoke][data-email="plain@example.com"]'); await confirmOk(O); await toast(O, 'Peran dicabut'); ok((await sql(`select count(*) from user_roles ur join auth.users u on u.id=ur.user_id where u.email='plain@example.com'`)) === '0'); });
    await t('Peran: email tidak terdaftar ditolak dengan pesan', async () => { await O.fill('#rEmail', 'tidakada@example.com'); await O.click('#rGrant'); const m = await toastErr(O); ok(/tidak ditemukan|terdaftar/i.test(m), m); });
    await t('Peran: Super Admin butuh ketik konfirmasi', async () => { await O.fill('#rEmail', 'plain@example.com'); await O.selectOption('#rRole', 'super_admin'); await O.click('#rGrant'); await O.waitForSelector('#confirmTyped'); await O.fill('#confirmTyped', 'salah'); await O.click('#confirmOk'); await toast(O, 'Ketik'); ok((await sql(`select count(*) from user_roles where role='super_admin'`)) === '1'); await O.keyboard.press('Escape'); await O.waitForSelector('#confirmTyped', { state: 'detached' }); });
    await t('Peran: matriks izin bisa diubah, tersimpan di database', async () => {
      await O.waitForSelector('#permMatrix'); const sel = 'input[data-role=editor][data-perm="media.write"]'; ok(await O.isChecked(sel)); await O.click(sel); await toast(O, 'Izin diperbarui');
      ok((await sql(`select count(*) from role_permissions where role='editor' and permission='media.write'`)) === '0'); await O.click(sel); await toast(O, 'Izin diperbarui'); ok((await sql(`select count(*) from role_permissions where role='editor' and permission='media.write'`)) === '1'); });
    await t('Peran: izin sensitif tidak ada di matriks dan ditolak database', async () => {
      ok(!/roles\.write|audit\.read|layout\.publish/.test(await O.textContent('#permMatrix')));
      const r = await O.evaluate(async () => { try { await Admin.rpc('admin_set_role_permission', { p_role: 'editor', p_permission: 'roles.write', p_allowed: true }); return 'ok'; } catch (e) { return e.message; } }); ok(r !== 'ok', r); });
    // ---------- Branding ----------
    await t('Branding: simpan nama, warna, font', async () => { await openMod(O, 'branding'); await O.fill('#b_name', 'Jurnalku'); await O.fill('#b_primary', '#112233'); await O.fill('#b_secondary', '#445566'); await O.selectOption('#b_font', 'Poppins'); await O.click('#bSave'); await toast(O, 'Branding disimpan');
      const v = JSON.parse(await sql(`select value from public_settings where key='branding'`)); ok(v.name === 'Jurnalku' && v.primary === '#112233' && v.font === 'Poppins', JSON.stringify(v)); });
    await t('Branding: warna tidak valid ditolak database', async () => { await O.fill('#b_primary', 'merah'); await O.click('#bSave'); const m = await toastErr(O); ok(/warna/i.test(m), m); ok(JSON.parse(await sql(`select value from public_settings where key='branding'`)).primary === '#112233'); });
    await t('Branding: URL logo non-https atau berisi skrip ditolak', async () => { await O.fill('#b_primary', '#112233'); await O.fill('#b_logo_url', 'javascript:alert(1)'); await O.click('#bSave'); const m = await toastErr(O); ok(/https/i.test(m), m); await O.fill('#b_logo_url', ''); });
    // ---------- CMS ----------
    await t('CMS: buat halaman draf (tidak terlihat publik)', async () => { await openMod(O, 'cms'); await O.click('#cNew'); await O.fill('#cSlug', 'tentang'); await O.fill('#cTitle', 'Tentang Kami'); await O.fill('#cBody', 'Halo dunia'); await O.click('#cSave'); await toast(O, 'Halaman disimpan');
      const pub = await api(base, '/rest/v1/content_pages?select=slug'); ok(pub.status === 200 && pub.json.length === 0, JSON.stringify(pub.json)); });
    await t('CMS: terbitkan -> terlihat publik tanpa login', async () => { await O.click('button[data-act=edit][data-slug=tentang]'); await O.check('#cPub'); await O.click('#cSave'); await toast(O, 'Halaman disimpan'); const pub = await api(base, '/rest/v1/content_pages?select=slug,title'); ok(pub.json.length === 1 && pub.json[0].title === 'Tentang Kami', JSON.stringify(pub.json)); });
    await t('CMS: slug tidak valid ditolak', async () => { await O.click('#cNew'); await O.fill('#cSlug', 'Slug Salah!'); await O.fill('#cTitle', 'x'); await O.click('#cSave'); const m = await toastErr(O); ok(/tidak valid/i.test(m), m); await O.keyboard.press('Escape'); });
    await t('CMS: isi HTML/skrip hanya tersimpan sebagai teks (tidak dieksekusi)', async () => { await O.waitForSelector('.dlg', { state: 'detached' }).catch(() => {}); await O.click('#cNew'); await O.fill('#cSlug', 'xss'); await O.fill('#cTitle', '<img src=x onerror=alert(1)>'); await O.fill('#cBody', '<script>window.__x=1</script>'); await O.click('#cSave'); await toast(O, 'Halaman disimpan'); await O.waitForSelector('.tbl');
      ok(await O.evaluate(() => window.__x === undefined)); ok(!(await O.$('#page-cms img[src=x]'))); ok(/<img src=x/.test(await O.textContent('#page-cms'))); });
    await t('CMS: hapus halaman (konfirmasi)', async () => { await O.click('button[data-act=del][data-slug=xss]'); await confirmOk(O); await toast(O, 'dihapus'); ok((await sql(`select count(*) from content_pages where slug='xss'`)) === '0'); });
    // ---------- Media ----------
    await t('Media: unggah PNG -> tampil dan dapat diakses publik', async () => { await openMod(O, 'media'); await O.setInputFiles('#mFile', { name: 'Logo Saya.png', mimeType: 'image/png', buffer: PNG }); await O.click('#mUp'); await toast(O, 'diunggah'); await O.waitForSelector('#mediaGrid .thumb');
      const path = await sql(`select path from media_assets limit 1`); ok(/^umum\/\d+-logo-saya\.png$/.test(path), path); const r = await fetch(base + '/storage/v1/object/public/media/' + path); ok(r.status === 200 && r.headers.get('content-type') === 'image/png'); });
    await t('Media: jenis berkas terlarang ditolak (teks/html/svg)', async () => { for (const [n, m] of [['a.txt', 'text/plain'], ['b.html', 'text/html'], ['c.svg', 'image/svg+xml']]) { await O.setInputFiles('#mFile', { name: n, mimeType: m, buffer: Buffer.from('<svg/>') }); await O.click('#mUp'); await toast(O, 'tidak diizinkan'); } ok((await sql(`select count(*) from media_assets`)) === '1'); });
    await t('Media: berkas >5MB ditolak', async () => { await O.setInputFiles('#mFile', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1048576 + 10) }); await O.click('#mUp'); await toast(O, 'lebih dari 5 MB'); ok((await sql(`select count(*) from media_assets`)) === '1'); });
    await t('Media: hapus (konfirmasi) menghapus berkas dan baris', async () => { await O.click('button[data-act=del]'); await confirmOk(O); await toast(O, 'Dihapus'); const n = await sql(`select count(*) from media_assets`); ok(n === '0', 'sisa baris=' + n); });
    await t('Media: Customer Service tidak punya modul Media (izin ditolak di database juga)', async () => {
      const C = await adminPage(browser, base, 'cs'); ok(!(await C.$('#nav-media')) && !(await C.$('#nav-cms')));
      const r = await C.evaluate(async () => { try { return 'rows:' + (await Admin.select('media_assets', 'select=id')).length; } catch (e) { return 'x'; } }); ok(r === 'rows:0' || r === 'x', r);
      const up = await C.evaluate(async () => (await Admin.call('/storage/v1/object/media/umum/x.png', { method: 'POST', rawBody: new Blob(['x']), headers: { 'Content-Type': 'image/png' } })).status); ok(up === 403, 'unggah status ' + up); await C.context().close(); });
    await t('Media: Editor boleh unggah (izin media.write) dan CMS', async () => { const E = await adminPage(browser, base, 'editor'); ok(await E.$('#nav-media') && await E.$('#nav-cms')); await openMod(E, 'media'); await E.setInputFiles('#mFile', { name: 'e.png', mimeType: 'image/png', buffer: PNG }); await E.click('#mUp'); await toast(E, 'diunggah'); await E.context().close(); });
    // ---------- Komunikasi ----------
    await t('Komunikasi: pesan pengguna tampil dan dibalas', async () => { await openMod(O, 'communication'); await O.waitForSelector('.tbl'); ok(/Tidak bisa sinkron/.test(await O.textContent('#page-communication'))); await O.click('button[data-act=open]'); await O.fill('#sReply', 'Sudah kami cek, coba lagi.'); await O.selectOption('#sStatus', 'closed'); await O.click('#sSend'); await toast(O, 'Balasan disimpan');
      ok((await sql(`select status||'|'||reply from support_messages`)) === 'closed|Sudah kami cek, coba lagi.'); });
    await t('Komunikasi: pengguna hanya melihat pesan miliknya (RLS)', async () => { const a = await userToken(base, 'userA'), b = await userToken(base, 'userB'); const ra = await api(base, '/rest/v1/support_messages?select=id', { token: a }), rb = await api(base, '/rest/v1/support_messages?select=id', { token: b }); ok(ra.json.length === 1 && rb.json.length === 0); });
    await t('Komunikasi: buat draf -> kirim; pengguna hanya melihat yang terkirim', async () => {
      await O.click('#tab-notif'); await O.fill('#nTitle', 'Fitur baru'); await O.fill('#nBody', 'Coba fitur anggaran'); await O.click('#nSave'); await toast(O, 'Draf disimpan');
      const a = await userToken(base, 'userA'); ok((await api(base, '/rest/v1/notifications?select=id', { token: a })).json.length === 0, 'draf bocor ke pengguna');
      await O.click('button[data-act=send]'); await confirmOk(O); await toast(O, 'Terkirim'); ok((await api(base, '/rest/v1/notifications?select=title', { token: a })).json.length === 1); });
    await t('Komunikasi: banner pengumuman tersimpan', async () => { await O.click('#tab-banner'); await O.waitForSelector('#aText'); await O.check('#aOn'); await O.fill('#aText', 'Libur akhir tahun'); await O.click('#aSave'); await toast(O, 'Banner disimpan'); ok(JSON.parse(await sql(`select value from public_settings where key='announcement'`)).on === true); });
    await t('Komunikasi: pengguna biasa tidak bisa mengirim pemberitahuan (RPC/REST ditolak)', async () => { const a = await userToken(base, 'userA'); const r = await api(base, '/rest/v1/notifications', { method: 'POST', token: a, body: { title: 'palsu', status: 'sent' } }); ok(r.status === 403 || r.status === 401, 'status ' + r.status); ok((await sql(`select count(*) from notifications where title='palsu'`)) === '0'); });
    await t('Audit: semua tindakan di atas tercatat', async () => { const n = Number(await sql(`select count(distinct action) from audit_logs`)); ok(n >= 8, 'jenis aksi=' + n); });
    await t('Tanpa galat JS/CSP selama tes', async () => { ok(!O.errors.length, O.errors.join(' | ')); ok(!O.cspViolations.length, O.cspViolations.join(' | ')); });
    const calls = await fetch(base + '/__test/calls').then(r => r.json());
    await t('Privasi: admin tidak pernah membaca journal_data', async () => { ok(!calls.some(c => /journal_data/.test(c))); });
  } finally { R.save(); await browser.close(); await g.close(); }
})().catch(e => { console.error(e); process.exit(1); });
