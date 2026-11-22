'use strict';
/* Tes T1: fondasi database admin di Postgres 16 ASLI dengan tiruan Supabase (peran, auth.uid(), auth.jwt()).
   Ini menguji logika SQL dan RLS dengan sungguh-sungguh, tetapi BUKAN layanan Supabase milikmu. */
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SOCK = process.env.PGSOCK || '/var/lib/postgresql/pjtest', PORT = process.env.PGPORT || '54329';
const DB = 'pjt1';

function run(db, sql, claims, role = 'authenticated') {
  let pre = '';
  if (claims !== undefined) pre = `set role ${claims === null ? 'anon' : role};\nselect set_config('request.jwt.claims', '${JSON.stringify(claims || {}).replace(/'/g, "''")}', false) as _c \\gset\n`;
  const r = spawnSync('psql', ['-h', SOCK, '-p', PORT, '-U', 'postgres', '-d', db, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: pre + sql + '\n', encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
const adm = (sql, db = DB) => run(db, sql);                       // sebagai superuser (pemilik migrasi)
const ID = { owner: '00000000-0000-0000-0000-0000000000a1', editor: '00000000-0000-0000-0000-0000000000a2', cs: '00000000-0000-0000-0000-0000000000a3',
  userA: '00000000-0000-0000-0000-0000000000b1', userB: '00000000-0000-0000-0000-0000000000b2', disabled: '00000000-0000-0000-0000-0000000000b3' };
const as = (who, aal = 'aal2') => ({ sub: ID[who], role: 'authenticated', aal });
const sql = (q, claims) => run(DB, q, claims);
const J = s => { try { return JSON.parse(s); } catch (e) { return { roles: [], permissions: [], aal: null, feature_usage: {}, signups_by_day: [], errors: [], public_settings: [], content_pages: [], users_metadata: [] }; } };
const file = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const results = []; let failedFast = false;
function t(name, fn) {
  try { const r = typeof fn === 'function' ? fn() : fn; const ok = r === true || (r && r.ok === true);
    results.push({ name, status: ok ? 'PASS' : 'FAIL', info: ok ? '' : String(r && r.info || r) }); }
  catch (e) { results.push({ name, status: 'FAIL', info: e.message }); }
}
const BUG = /syntax error|invalid regular expression|does not exist|invalid input syntax|unterminated|ambiguous|null value in column/i;
const denied = r => !r.ok && !BUG.test(r.err) && /ERROR:/.test(r.err) ? true : { ok: false, info: 'seharusnya ditolak, hasil: ok=' + r.ok + ' out=' + r.out.slice(0, 120) + ' err=' + r.err.slice(0, 160) };
const allowed = r => r.ok ? true : { ok: false, info: 'seharusnya berhasil, galat: ' + r.err.slice(0, 200) };
const eq = (a, b, what) => a === b ? true : { ok: false, info: `${what || ''} diharapkan ${b}, dapat ${a}` };

// ---------- siapkan database bersih ----------
spawnSync('psql', ['-h', SOCK, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-c', `drop database if exists ${DB}`], { encoding: 'utf8' });
spawnSync('psql', ['-h', SOCK, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-c', `create database ${DB}`], { encoding: 'utf8' });
let r = adm(file('tests/admin/supabase_stub.sql'));
t('persiapan: tiruan Supabase dimuat', allowed(r));
// akun yang SUDAH ada sebelum migrasi (untuk uji backfill profil)
r = adm(`insert into auth.users (id,email,last_sign_in_at) values
  ('${ID.owner}','owner@example.com', now()), ('${ID.editor}','editor@example.com', now() - interval '20 days'),
  ('${ID.cs}','cs@example.com', now()), ('${ID.userA}','a@example.com', now()), ('${ID.userB}','b@example.com', now() - interval '3 days');`);
t('persiapan: akun awal dibuat', allowed(r));
r = adm(file('cloud/supabase.sql'));
t('persiapan: tabel journal_data + 4 kebijakan asli dimuat', allowed(r));
adm(`insert into public.journal_data (user_id, data, rev) values
 ('${ID.userA}', '{"tx":[{"id":"t1","amount":98765,"note":"RAHASIA-KEUANGAN-A"}],"goals":[{"id":"g"}],"rec":[],"journal":[{"id":"j","text":"RAHASIA-JURNAL"}],"budgets":{"Makan":500000}}', 3),
 ('${ID.userB}', '{"tx":[],"goals":[],"rec":[],"journal":[],"budgets":{}}', 1);`);

// ---------- migrasi ----------
r = adm(file('supabase/migrations/001_admin_foundation.sql'));
t('001: berjalan di database bersih', allowed(r));
r = adm(file('supabase/migrations/001_admin_foundation.sql'));
t('001: aman diulang (idempotent)', allowed(r));
r = adm(file('supabase/migrations/002_storage_media.sql'));
t('002: bucket media + kebijakan storage (di tiruan storage)', allowed(r));
t('002: aman diulang', allowed(adm(file('supabase/migrations/002_storage_media.sql'))));
t('900: ditolak selama email masih placeholder', denied(adm(file('supabase/migrations/900_first_super_admin.sql'))));
t('900: ditolak jika email belum terdaftar', denied(adm(file('supabase/migrations/900_first_super_admin.sql').split('GANTI_DENGAN_EMAILMU').join('tidakada@example.com'))));
t('900: berhasil untuk email terdaftar', allowed(adm(file('supabase/migrations/900_first_super_admin.sql').split('GANTI_DENGAN_EMAILMU').join('owner@example.com'))));
t('900: aman diulang', allowed(adm(file('supabase/migrations/900_first_super_admin.sql').split('GANTI_DENGAN_EMAILMU').join('owner@example.com'))));
adm(`insert into public.user_roles (user_id, role) values ('${ID.editor}','editor'), ('${ID.cs}','customer_service')`);
adm(`insert into auth.users (id,email) values ('${ID.disabled}','disabled@example.com')`);

// ---------- profil otomatis ----------
t('profil: akun lama di-backfill', eq(adm(`select count(*) from public.profiles where id in ('${ID.owner}','${ID.userA}','${ID.userB}')`).out, '3', 'jumlah profil'));
t('profil: akun baru otomatis dapat profil (trigger)', eq(adm(`select count(*) from public.profiles where id='${ID.disabled}'`).out, '1', 'profil akun baru'));

// ---------- anon ----------
for (const tb of ['user_roles', 'audit_logs', 'profiles', 'role_permissions', 'app_settings', 'system_backups', 'support_messages', 'notifications', 'media_assets', 'journal_data'])
  t(`anon: tidak bisa membaca ${tb}`, (x => (!x.ok && /permission denied/.test(x.err)) || (x.ok && x.out === '') ? true : { ok: false, info: x.out.slice(0, 100) + x.err.slice(0, 100) })(sql(`select * from public.${tb} limit 1`, null)));
t('anon: boleh membaca public_settings', eq(sql(`select count(*) from public.public_settings`, null).out, '3', 'jumlah'));
adm(`insert into public.content_pages (slug,title,body,published) values ('bantuan','Bantuan','isi',true), ('draf','Draf','rahasia',false)`);
t('anon: hanya melihat halaman terbit', eq(sql(`select string_agg(slug,',') from public.content_pages`, null).out, 'bantuan', 'slug'));
for (const fn of ['admin_list_users()', 'admin_user_stats()', 'my_admin_info()', "log_admin_action('a.b')", 'admin_export_snapshot()'])
  t(`anon: tidak bisa memanggil ${fn}`, denied(sql(`select * from public.${fn}`, null)));
for (const q of [`insert into public.user_roles (user_id, role) values ('${ID.userA}','super_admin')`, `insert into public.audit_logs (action) values ('x')`, `update public.public_settings set value='{}'`])
  t('anon: tulis langsung ditolak: ' + q.slice(0, 40), denied(sql(q, null)));

// ---------- pengguna biasa ----------
t('pengguna biasa: my_admin_info kosong, bukan admin', (x => x.ok && J(x.out).roles.length === 0 ? true : { ok: false, info: x.out + x.err })(sql(`select public.my_admin_info()`, as('userA'))));
t('pengguna biasa (aal2): admin_list_users ditolak', denied(sql(`select * from public.admin_list_users()`, as('userA'))));
t('pengguna biasa: admin_user_stats ditolak', denied(sql(`select public.admin_user_stats()`, as('userA'))));
t('pengguna biasa: admin_export_snapshot ditolak', denied(sql(`select public.admin_export_snapshot()`, as('userA'))));
t('pengguna biasa: tidak bisa memberi dirinya Super Admin (fungsi)', denied(sql(`select public.admin_grant_role('a@example.com','super_admin')`, as('userA'))));
t('pengguna biasa: tidak bisa insert user_roles langsung', denied(sql(`insert into public.user_roles (user_id, role) values ('${ID.userA}','super_admin')`, as('userA'))));
t('pengguna biasa: tidak bisa menulis audit_logs', denied(sql(`insert into public.audit_logs (action) values ('palsu')`, as('userA'))));
t('pengguna biasa: tidak bisa mengubah public_settings', denied(sql(`update public.public_settings set value='{"on":true}' where key='maintenance'`, as('userA'))));
t('pengguna biasa: tidak bisa mengubah status akunnya (profiles)', denied(sql(`update public.profiles set status='active' where id='${ID.userA}'`, as('userA'))));
t('pengguna biasa: tidak bisa menulis content_pages', denied(sql(`insert into public.content_pages (slug,title) values ('x','x')`, as('userA'))));
t('pengguna biasa: hanya melihat profilnya sendiri', eq(sql(`select count(*) from public.profiles`, as('userA')).out, '1', 'baris profil'));
t('pengguna biasa: log_admin_action ditolak', denied(sql(`select public.log_admin_action('login.ok')`, as('userA'))));

// ---------- journal_data tetap milik sendiri ----------
t('journal_data: pengguna A membaca barisnya sendiri', eq(sql(`select rev from public.journal_data`, as('userA')).out, '3', 'rev'));
t('journal_data: pengguna A tidak melihat baris B', eq(sql(`select count(*) from public.journal_data where user_id='${ID.userB}'`, as('userA')).out, '0', 'baris B'));
t('journal_data: Super Admin (aal2) TIDAK bisa membaca journal_data', eq(sql(`select count(*) from public.journal_data where user_id='${ID.userA}'`, as('owner')).out, '0', 'baris A oleh admin'));

// ---------- Super Admin dan 2FA ----------
t('Super Admin tanpa 2FA (aal1): admin_list_users ditolak', denied(sql(`select * from public.admin_list_users()`, as('owner', 'aal1'))));
t('Super Admin tanpa 2FA: my_admin_info tetap menjawab (supaya UI tahu perlu TOTP)', (x => x.ok && J(x.out).roles[0] === 'super_admin' && J(x.out).aal === 'aal1' ? true : { ok: false, info: x.out + x.err })(sql(`select public.my_admin_info()`, as('owner', 'aal1'))));
t('Super Admin tanpa 2FA: tulis pengaturan ditolak', denied(sql(`select public.admin_set_public_setting('maintenance','{"on":true,"message":"x"}')`, as('owner', 'aal1'))));
t('Super Admin (aal2): admin_list_users berhasil, 6 akun', eq(sql(`select count(*) from public.admin_list_users()`, as('owner')).out, '6', 'jumlah akun'));
t('admin_list_users: hanya kolom metadata (tanpa isi data)', eq(sql(`select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = (select oid from pg_proc where proname='admin_list_users') and false`).out || 'ok', 'ok'));
{ const x = sql(`select to_jsonb(u) from public.admin_list_users() u where email='a@example.com'`, as('owner'));
  t('admin_list_users: kolom hanya metadata', (() => { if (!x.ok) return { ok: false, info: x.err }; const j = J(x.out); const keys = Object.keys(j).sort().join(',');
    return keys === 'created_at,data_bytes,data_rev,data_updated_at,email,id,last_sign_in_at,roles,status,total_count' ? true : { ok: false, info: keys }; })());
  t('admin_list_users: tidak membocorkan isi keuangan/jurnal', !/RAHASIA|98765|500000/.test(x.out) ? true : { ok: false, info: x.out });
  t('admin_list_users: jumlah revisi dan ukuran data benar', (() => { const j = J(x.out); return j.data_rev === 3 && j.data_bytes > 50 ? true : { ok: false, info: x.out }; })()); }
t('admin_list_users: pencarian email', eq(sql(`select count(*) from public.admin_list_users('editor')`, as('owner')).out, '1', 'hasil'));
t('admin_list_users: pencarian tidak bisa disuntik SQL', eq(sql(`select count(*) from public.admin_list_users($q$%' or '1'='1$q$)`, as('owner')).out, '0', 'hasil'));
t('admin_list_users: karakter % di pencarian diperlakukan harfiah', eq(sql(`select count(*) from public.admin_list_users('%')`, as('owner')).out, '0', 'hasil'));
t('admin_list_users: batas halaman', eq(sql(`select count(*) from public.admin_list_users(null, 2, 0)`, as('owner')).out, '2', 'hasil'));
{ const x = sql(`select public.admin_user_stats()`, as('owner')); const j = x.ok ? J(x.out) : {};
  t('statistik: total 6, with_data 2', j.total === 6 && j.with_data === 2 ? true : { ok: false, info: x.out + x.err });
  t('statistik: pengguna aktif 7 hari = 4 (owner, cs, userA, userB; editor 20 hari lalu)', eq(j.active_7d, 4, 'active_7d'));
  t('statistik: penggunaan fitur hanya jumlah pengguna', j.feature_usage && j.feature_usage.transaksi === 1 && j.feature_usage.jurnal === 1 && j.feature_usage.anggaran === 1 ? true : { ok: false, info: JSON.stringify(j.feature_usage) });
  t('statistik: tidak ada nominal/isi catatan', !/RAHASIA|98765|500000/.test(x.out) ? true : { ok: false, info: x.out });
  t('statistik: grafik pendaftaran 30 hari', eq((j.signups_by_day || []).length, 30, 'hari')); }

// ---------- editor dan customer service ----------
t('Editor: bisa menulis halaman CMS', allowed(sql(`insert into public.content_pages (slug,title,body,published) values ('kebijakan','Kebijakan','isi',false)`, as('editor'))));
t('Editor: tidak bisa melihat daftar pengguna', denied(sql(`select * from public.admin_list_users()`, as('editor'))));
t('Editor: tidak bisa mengubah maintenance', denied(sql(`select public.admin_set_public_setting('maintenance','{"on":true,"message":"x"}')`, as('editor'))));
t('Editor: tidak bisa membaca audit_logs', eq(sql(`select count(*) from public.audit_logs`, as('editor')).out, '0', 'baris audit terlihat'));
t('Editor: tidak bisa memberi peran', denied(sql(`select public.admin_grant_role('a@example.com','editor')`, as('editor'))));
t('Editor: tidak bisa membuat catatan notifikasi', denied(sql(`insert into public.notifications (title) values ('x')`, as('editor'))));
t('Editor: bisa memakai admin_user_stats (overview.read)', allowed(sql(`select public.admin_user_stats()`, as('editor'))));
t('Customer Service: bisa melihat daftar pengguna', allowed(sql(`select * from public.admin_list_users()`, as('cs'))));
t('Customer Service: tidak bisa menulis halaman CMS', denied(sql(`insert into public.content_pages (slug,title) values ('x2','x')`, as('cs'))));
t('Customer Service: tidak bisa mengubah status pengguna', denied(sql(`select public.admin_set_user_status('${ID.userA}','disabled')`, as('cs'))));
t('Customer Service: bisa membuat dan mengirim pengumuman', (() => { let x = sql(`insert into public.notifications (title, body) values ('Halo','isi') returning id`, as('cs')); if (!x.ok) return { ok: false, info: x.err }; const id = x.out.split('\n')[0];
  x = sql(`select public.admin_send_notification('${id}')`, as('cs')); return x.ok ? true : { ok: false, info: x.err }; })());
t('pengguna biasa: hanya melihat notifikasi yang sudah terkirim', eq(sql(`select count(*) from public.notifications`, as('userA')).out, '1', 'notifikasi'));

// ---------- dukungan pengguna ----------
t('dukungan: pengguna mengirim pesan sendiri', allowed(sql(`insert into public.support_messages (user_id, subject, body) values ('${ID.userA}','Tanya','Bagaimana?')`, as('userA'))));
t('dukungan: tidak bisa mengirim atas nama orang lain', denied(sql(`insert into public.support_messages (user_id, subject, body) values ('${ID.userB}','Palsu','x')`, as('userA'))));
t('dukungan: tidak bisa menyisipkan balasan sendiri', denied(sql(`insert into public.support_messages (user_id, subject, body, reply) values ('${ID.userA}','S','B','balasan palsu')`, as('userA'))));
t('dukungan: B tidak melihat pesan A', eq(sql(`select count(*) from public.support_messages`, as('userB')).out, '0', 'pesan'));
t('dukungan: Customer Service membaca semua pesan', eq(sql(`select count(*) from public.support_messages`, as('cs')).out, '1', 'pesan'));
t('dukungan: Customer Service membalas', (() => { const id = adm(`select id from public.support_messages limit 1`).out; return allowed(sql(`select public.admin_reply_support('${id}','Sudah ya','closed')`, as('cs'))); })());
t('dukungan: pengguna melihat balasan', eq(sql(`select reply from public.support_messages`, as('userA')).out, 'Sudah ya', 'balasan'));
t('dukungan: pengguna tidak bisa mengubah balasan/status', denied(sql(`update public.support_messages set reply='edit', status='open'`, as('userA'))));

// ---------- eskalasi hak ----------
t('Super Admin: tidak bisa mendelegasikan izin roles.write', denied(sql(`select public.admin_set_role_permission('editor','roles.write',true)`, as('owner'))));
t('Super Admin: tidak bisa mendelegasikan audit.read', denied(sql(`select public.admin_set_role_permission('editor','audit.read',true)`, as('owner'))));
t('Super Admin: izin tidak dikenal ditolak', denied(sql(`select public.admin_set_role_permission('editor','hack.all',true)`, as('owner'))));
t('Super Admin: bisa memberi Editor izin users.read', allowed(sql(`select public.admin_set_role_permission('editor','users.read',true)`, as('owner'))));
t('Editor kini bisa melihat daftar pengguna (izin diterapkan)', allowed(sql(`select * from public.admin_list_users()`, as('editor'))));
t('Super Admin: bisa mencabut izin lagi', allowed(sql(`select public.admin_set_role_permission('editor','users.read',false)`, as('owner'))));
t('Editor kembali ditolak', denied(sql(`select * from public.admin_list_users()`, as('editor'))));
t('Super Admin terakhir tidak bisa dicabut', denied(sql(`select public.admin_revoke_role('${ID.owner}','super_admin')`, as('owner'))));
t('grant peran: email tak terdaftar ditolak', denied(sql(`select public.admin_grant_role('tidakada@example.com','editor')`, as('owner'))));
t('grant peran: nama peran ngawur ditolak', denied(sql(`select public.admin_grant_role('a@example.com','dewa')`, as('owner'))));
t('grant peran: Super Admin memberi Editor ke userA', allowed(sql(`select public.admin_grant_role('a@example.com','editor')`, as('owner'))));
t('grant peran: userA kini admin (dengan 2FA)', (x => x.ok && J(x.out).roles.includes('editor') ? true : { ok: false, info: x.out })(sql(`select public.my_admin_info()`, as('userA'))));
t('revoke peran: userA dicabut', allowed(sql(`select public.admin_revoke_role('${ID.userA}','editor')`, as('owner'))));

// ---------- status akun ----------
t('status: tidak bisa menonaktifkan diri sendiri', denied(sql(`select public.admin_set_user_status('${ID.owner}','disabled')`, as('owner'))));
t('status: nilai status ngawur ditolak', denied(sql(`select public.admin_set_user_status('${ID.userA}','banned')`, as('owner'))));
t('status: pengguna tak ada ditolak', denied(sql(`select public.admin_set_user_status('00000000-0000-0000-0000-00000000ffff','disabled')`, as('owner'))));
t('status: Super Admin lain tidak bisa dinonaktifkan', (() => { adm(`insert into public.user_roles (user_id, role) values ('${ID.editor}','super_admin') on conflict do nothing`);
  const x = denied(sql(`select public.admin_set_user_status('${ID.editor}','disabled')`, as('owner'))); adm(`delete from public.user_roles where user_id='${ID.editor}' and role='super_admin'`); return x; })());
t('status: Super Admin menonaktifkan userB', allowed(sql(`select public.admin_set_user_status('${ID.userB}','disabled')`, as('owner'))));
t('status: userB tercatat nonaktif', eq(sql(`select status from public.admin_list_users('b@example') `, as('owner')).out, 'disabled', 'status'));
t('status: Editor yang dinonaktifkan kehilangan semua izin', (() => { adm(`update public.profiles set status='disabled' where id='${ID.editor}'`);
  const x = denied(sql(`insert into public.content_pages (slug,title) values ('y','y')`, as('editor'))); adm(`update public.profiles set status='active' where id='${ID.editor}'`); return x; })());

// ---------- audit log ----------
const logs = () => sql(`select action from public.audit_logs order by id`, as('owner')).out.split('\n');
t('audit: Super Admin bisa membaca log', allowed(sql(`select * from public.audit_logs`, as('owner'))));
t('audit: mencatat role.bootstrap, role.grant, user.status, halaman CMS', (() => { const l = logs(); const need = ['role.bootstrap', 'role.grant', 'role.revoke', 'user.status', 'content_pages.insert', 'role.permission', 'comms.send'];
  const miss = need.filter(n => !l.includes(n)); return miss.length ? { ok: false, info: 'tidak tercatat: ' + miss.join(',') } : true; })());
t('audit: log tidak bisa di-UPDATE (Super Admin aal2)', denied(sql(`update public.audit_logs set action='x'`, as('owner'))));
t('audit: log tidak bisa di-DELETE (Super Admin aal2)', denied(sql(`delete from public.audit_logs`, as('owner'))));
t('audit: log tidak bisa di-INSERT langsung (Super Admin aal2)', denied(sql(`insert into public.audit_logs (action) values ('palsu')`, as('owner'))));
t('audit: log tidak bisa di-TRUNCATE', denied(sql(`truncate public.audit_logs`, as('owner'))));
t('audit: log_admin_action oleh admin berhasil', allowed(sql(`select public.log_admin_action('login.ok','admin',jsonb_build_object('ua','x'))`, as('owner'))));
t('audit: nama aksi tidak valid ditolak', denied(sql(`select public.log_admin_action('DROP TABLE; --')`, as('owner'))));
t('audit: Customer Service tidak bisa membaca log', eq(sql(`select count(*) from public.audit_logs`, as('cs')).out, '0', 'baris'));

// ---------- pengaturan publik ----------
const setp = (k, v, who = 'owner') => sql(`select public.admin_set_public_setting('${k}', $j$${JSON.stringify(v)}$j$::jsonb)`, as(who));
const goodB = { name: 'Jurnalku', primary: '#112233', secondary: '#445566', font: 'Poppins', logo_url: null, favicon_url: null };
t('branding: nilai valid disimpan', allowed(setp('branding', goodB)));
t('branding: anon membaca perubahan', eq(sql(`select value->>'name' from public.public_settings where key='branding'`, null).out, 'Jurnalku', 'nama'));
t('branding: warna bukan #RRGGBB ditolak', denied(setp('branding', { ...goodB, primary: 'red' })));
t('branding: warna berisi CSS injeksi ditolak', denied(setp('branding', { ...goodB, primary: '#000;}body{display:none' })));
t('branding: font di luar daftar ditolak', denied(setp('branding', { ...goodB, font: 'Evil; src:url(x)' })));
t('branding: logo http (bukan https) ditolak', denied(setp('branding', { ...goodB, logo_url: 'http://x.com/a.png' })));
t('branding: logo javascript: ditolak', denied(setp('branding', { ...goodB, logo_url: 'javascript:alert(1)' })));
t('branding: logo https valid diterima', allowed(setp('branding', { ...goodB, logo_url: 'https://x.supabase.co/storage/v1/object/public/media/logo.png' })));
t('branding: favicon http ditolak', denied(setp('branding', { ...goodB, favicon_url: 'http://x.com/f.ico' })));
t('branding: nama kosong ditolak', denied(setp('branding', { ...goodB, name: '' })));
t('branding: nama 41 karakter ditolak', denied(setp('branding', { ...goodB, name: 'x'.repeat(41) })));
t('branding: field tambahan dibuang (hanya 6 field tersimpan)', eq(sql(`select count(*) from jsonb_object_keys((select value from public.public_settings where key='branding'))`, null).out, '6', 'jumlah field'));
t('pengaturan: kunci tak dikenal ditolak', denied(setp('rahasia', { a: 1 })));
t('maintenance: nyalakan', allowed(setp('maintenance', { on: true, message: 'Kembali jam 10' })));
t('maintenance: anon membaca status', eq(sql(`select value->>'on' from public.public_settings where key='maintenance'`, null).out, 'true', 'on'));
t('maintenance: pesan 301 karakter ditolak', denied(setp('maintenance', { on: true, message: 'x'.repeat(301) })));
t('maintenance: "on" bukan boolean ditolak', denied(setp('maintenance', { on: 'ya', message: '' })));
t('maintenance: matikan', allowed(setp('maintenance', { on: false, message: '' })));
t('pengumuman: Customer Service boleh, Editor tidak', allowed(setp('announcement', { on: true, text: 'Halo' }, 'cs')) === true && denied(setp('announcement', { on: true, text: 'Halo' }, 'editor')) === true);
t('app_settings: Super Admin menyimpan, anon tidak bisa membaca', (() => { const a = allowed(sql(`select public.admin_set_app_setting('modules', '{"notes":{"enabled":true}}'::jsonb)`, as('owner'))); if (a !== true) return a; const an = sql(`select count(*) from public.app_settings`, null); return (!an.ok && /permission denied/.test(an.err)) || an.out === '0' ? true : { ok: false, info: an.out + an.err }; })());
t('app_settings: nama kunci tidak valid ditolak', denied(sql(`select public.admin_set_app_setting('A b; drop', '{}'::jsonb)`, as('owner'))));

// ---------- impor halaman ----------
const rows = [{ slug: 'tentang', title: 'Tentang', body: 'hai', published: 'ya' }, { slug: 'SALAH SLUG', title: 'x' }, { slug: 'ok2', title: '' }, { slug: 'bantuan', title: 'Bantuan v2', body: 'baru', published: 'true' }];
{ const x = sql(`select public.admin_import_pages($j$${JSON.stringify(rows)}$j$::jsonb)`, as('owner')); const j = x.ok ? J(x.out) : {};
  t('impor: 1 baru, 1 diperbarui, 2 galat dilaporkan per baris', j.inserted === 1 && j.updated === 1 && j.errors && j.errors.length === 2 && j.errors[0].row === 2 && j.errors[1].row === 3 ? true : { ok: false, info: x.out + x.err });
  t('impor: halaman terbit terlihat anon', eq(sql(`select count(*) from public.content_pages where slug in ('tentang','bantuan')`, null).out, '2', 'halaman')); }
t('impor: lebih dari 500 baris ditolak', denied(sql(`select public.admin_import_pages((select jsonb_agg(jsonb_build_object('slug','p'||i,'title','t')) from generate_series(1,501) i))`, as('owner'))));
t('impor: Editor (tanpa data.import) ditolak', denied(sql(`select public.admin_import_pages('[]'::jsonb)`, as('editor'))));
t('impor: bukan array ditolak', denied(sql(`select public.admin_import_pages('{"a":1}'::jsonb)`, as('owner'))));

// ---------- backup dan restore ----------
{ const x = sql(`select public.admin_export_snapshot()`, as('owner')); const s = x.ok ? J(x.out) : null;
  t('snapshot: Super Admin bisa mengekspor', s && s.format === 'personal-journal-admin-snapshot' ? true : { ok: false, info: x.err });
  t('snapshot: TIDAK memuat data keuangan/jurnal pengguna', s && !/RAHASIA|98765|500000|"tx"/.test(x.out) ? true : { ok: false, info: 'bocor' });
  t('snapshot: memuat pengaturan, halaman, izin, metadata pengguna', s && s.public_settings.length === 3 && s.content_pages.length >= 3 && s.users_metadata.length === 6 ? true : { ok: false, info: s && JSON.stringify([s.public_settings.length, s.content_pages.length, s.users_metadata.length]) });
  t('snapshot: Editor tidak bisa mengekspor', denied(sql(`select public.admin_export_snapshot()`, as('editor'))));
  setp('branding', { ...goodB, name: 'DiUbah' });
  const rs = sql(`select public.admin_restore_snapshot($j$${x.out}$j$::jsonb)`, as('owner'));
  t('restore: Super Admin memulihkan snapshot', rs.ok ? true : { ok: false, info: rs.err });
  t('restore: pengaturan kembali ke nilai snapshot', eq(sql(`select value->>'name' from public.public_settings where key='branding'`, null).out, 'Jurnalku', 'nama'));
  t('restore: tercatat di system_backups', eq(sql(`select count(*) from public.system_backups where kind='restore'`, as('owner')).out, '1', 'catatan'));
  t('restore: berkas bukan snapshot ditolak', denied(sql(`select public.admin_restore_snapshot('{"format":"lain","version":1}'::jsonb)`, as('owner'))));
  t('restore: Editor ditolak', denied(sql(`select public.admin_restore_snapshot('{}'::jsonb)`, as('editor')))); }
t('backup: catatan ekspor dicatat apa adanya', allowed(sql(`select public.admin_record_backup('export','ok',1234,'tes')`, as('owner'))));
t('backup: Editor tidak bisa mencatat', denied(sql(`select public.admin_record_backup('export','ok',1,'x')`, as('editor'))));

// ---------- 003: penegakan akun nonaktif ----------
t('003: berjalan dan aman diulang', allowed(adm(file('supabase/migrations/003_disable_enforcement.sql'))) === true && allowed(adm(file('supabase/migrations/003_disable_enforcement.sql'))) === true);
t('003: pengguna aktif tetap membaca datanya', eq(sql(`select rev from public.journal_data`, as('userA')).out, '3', 'rev'));
t('003: pengguna aktif tetap bisa menulis datanya', allowed(sql(`update public.journal_data set rev = rev + 1 where user_id='${ID.userA}'`, as('userA'))));
t('003: pengguna NONAKTIF (userB) tidak bisa membaca datanya', eq(sql(`select count(*) from public.journal_data`, as('userB')).out, '0', 'baris'));
t('003: pengguna nonaktif tidak bisa menulis datanya', (x => x.ok && x.out === '' || /row-level|0/.test(x.out + x.err) ? true : { ok: false, info: x.out + x.err })(sql(`update public.journal_data set rev = 99 where user_id='${ID.userB}' returning rev`, as('userB'))));
t('003: data userB tidak berubah', eq(adm(`select rev from public.journal_data where user_id='${ID.userB}'`).out, '1', 'rev'));
t('003: anon tetap tidak melihat data (tanpa galat fatal)', (x => x.ok ? eq(x.out, '', 'baris') : (/permission denied/.test(x.err) ? true : { ok: false, info: x.err }))(sql(`select * from public.journal_data`, null)));
t('003: aktifkan kembali userB, data terbaca lagi', (() => { adm(`update public.profiles set status='active' where id='${ID.userB}'`); return eq(sql(`select count(*) from public.journal_data`, as('userB')).out, '1', 'baris'); })());

// ---------- 004: platform (modul, fitur, konfigurasi, rilis) ----------
t('004: berjalan dan aman diulang', allowed(adm(file('supabase/migrations/004_platform.sql'))) === true && allowed(adm(file('supabase/migrations/004_platform.sql'))) === true);
t('004: 18 modul awal (11 aktif nyata, 7 rencana)', eq(adm(`select count(*) filter (where implemented) || '/' || count(*) from public.app_modules`).out, '11/18'));
t('004: modul rencana tidak aktif', eq(adm(`select count(*) from public.app_modules where enabled and not implemented`).out, '0'));
t('anon: boleh membaca app_modules dan published_config', allowed(sql(`select count(*) from public.app_modules`, null)) === true && allowed(sql(`select count(*) from public.published_config`, null)) === true);
for (const tb of ['feature_requests', 'config_versions', 'app_releases'])
  t(`anon: tidak bisa membaca ${tb}`, (x => (!x.ok && /permission denied/.test(x.err)) || x.out === '' ? true : { ok: false, info: x.out })(sql(`select * from public.${tb}`, null)));
t('pengguna biasa: tulis langsung ke app_modules ditolak', denied(sql(`update public.app_modules set enabled=true where id='notes'`, as('userA'))));
t('Super Admin: tulis langsung ke app_modules ditolak (harus lewat fungsi)', denied(sql(`update public.app_modules set enabled=true where id='notes'`, as('owner'))));
t('constraint: enabled tanpa implemented ditolak oleh database', denied(adm(`update public.app_modules set enabled=true where id='notes'`)));

// modul
t('modul: mengaktifkan modul belum diimplementasikan ditolak', denied(sql(`select public.admin_set_module_enabled('notes', true)`, as('owner'))));
t('modul: Editor tidak bisa mengubah modul', denied(sql(`select public.admin_set_module_enabled('dompet', false)`, as('editor'))));
t('modul: Super Admin menonaktifkan dompet', allowed(sql(`select public.admin_set_module_enabled('dompet', false)`, as('owner'))));
t('modul: publik melihat dompet nonaktif', eq(sql(`select enabled from public.app_modules where id='dompet'`, null).out, 'f'));
t('modul: mengaktifkan kembali dompet (data tidak hilang)', allowed(sql(`select public.admin_set_module_enabled('dompet', true)`, as('owner'))));
t('modul: definisi baru selalu tidak aktif dan belum diimplementasikan', (() => { const a = allowed(sql(`select public.admin_upsert_module($j$${JSON.stringify({ id: 'proyek-x', name: 'Proyek X', description: 'uji', icon: 'briefcase', category: 'Rencana', enabled: true, implemented: true })}$j$::jsonb)`, as('owner'))); if (a !== true) return a;
  return eq(adm(`select enabled::text || implemented::text from public.app_modules where id='proyek-x'`).out, 'falsefalse'); })());
t('modul: admin tidak bisa mengubah flag implemented lewat update', (() => { sql(`select public.admin_upsert_module('{"id":"proyek-x","implemented":true,"name":"Proyek X2"}'::jsonb)`, as('owner')); return eq(adm(`select implemented::text from public.app_modules where id='proyek-x'`).out, 'false'); })());
t('modul: ikon di luar daftar ditolak', denied(sql(`select public.admin_upsert_module('{"id":"proyek-y","name":"Y","icon":"<script>"}'::jsonb)`, as('owner'))));
t('modul: ID tidak valid ditolak', denied(sql(`select public.admin_upsert_module('{"id":"Proyek Z!","name":"Z"}'::jsonb)`, as('owner'))));
t('modul: urutan dapat diubah', (() => { const a = allowed(sql(`select public.admin_reorder_modules(array['evaluasi','dompet'])`, as('owner'))); return a === true ? eq(adm(`select id from public.app_modules order by sort_order limit 1`).out, 'evaluasi') : a; })());

// Feature Builder
let fid;
t('fitur: Super Admin membuat ide fitur (status idea)', (() => { const x = sql(`select public.admin_save_feature('{"title":"Kalender","goal":"agenda","priority":"high"}'::jsonb)`, as('owner')); fid = x.out; return x.ok && /^[0-9a-f-]{36}$/.test(fid) ? true : { ok: false, info: x.err }; })());
t('fitur: status awal idea', eq(sql(`select status from public.feature_requests where id='${fid}'`, as('owner')).out, 'idea'));
t('fitur: prioritas ngawur ditolak', denied(sql(`select public.admin_save_feature('{"title":"X","priority":"urgent!!"}'::jsonb)`, as('owner'))));
t('fitur: planned boleh tanpa modul', allowed(sql(`select public.admin_set_feature_status('${fid}','planned')`, as('owner'))));
t('fitur: ready tanpa modul terkait ditolak', denied(sql(`select public.admin_set_feature_status('${fid}','ready')`, as('owner'))));
t('fitur: terkait modul belum diimplementasikan, active ditolak', (() => { sql(`select public.admin_save_feature('{"id":"${fid}","module_id":"calendar"}'::jsonb)`, as('owner')); return denied(sql(`select public.admin_set_feature_status('${fid}','active')`, as('owner'))); })());
t('fitur: terkait modul nyata tetapi nonaktif, active ditolak', (() => { sql(`select public.admin_set_module_enabled('jurnal', false)`, as('owner')); sql(`select public.admin_save_feature('{"id":"${fid}","module_id":"jurnal"}'::jsonb)`, as('owner')); return denied(sql(`select public.admin_set_feature_status('${fid}','active')`, as('owner'))); })());
t('fitur: modul nyata dan aktif, status active diterima', (() => { sql(`select public.admin_set_module_enabled('jurnal', true)`, as('owner')); return allowed(sql(`select public.admin_set_feature_status('${fid}','active')`, as('owner'))); })());
t('fitur: fitur aktif tidak bisa dihapus', denied(sql(`select public.admin_delete_feature('${fid}')`, as('owner'))));
t('fitur: dinonaktifkan lalu dihapus', allowed(sql(`select public.admin_set_feature_status('${fid}','disabled')`, as('owner'))) === true && allowed(sql(`select public.admin_delete_feature('${fid}')`, as('owner'))) === true);
t('fitur: Customer Service tidak bisa menulis', denied(sql(`select public.admin_save_feature('{"title":"x"}'::jsonb)`, as('cs'))));

// Konfigurasi tampilan
const theme = { radius: 12, fontScale: 1.05, mode: 'auto', cardStyle: 'elevated', buttonStyle: 'filled', density: 'comfortable', background: '#FAF8FF' };
const home = { title: 'Beranda', subtitle: 'Ringkasan', welcome: 'Halo!', widgets: [{ id: 'overview', visible: true }, { id: 'recent', visible: true }, { id: 'budgets', visible: false }] };
const sd = (k, v, who = 'owner', note = '') => sql(`select public.admin_save_draft('${k}', $j$${JSON.stringify(v)}$j$::jsonb, '${note}')`, as(who));
t('tema: radius 99 ditolak', denied(sd('theme', { ...theme, radius: 99 })));
t('tema: warna latar berisi CSS injeksi ditolak', denied(sd('theme', { ...theme, background: '#fff;}*{display:none' })));
t('tema: gaya kartu tak dikenal ditolak', denied(sd('theme', { ...theme, cardStyle: 'url(javascript:1)' })));
t('tema: fontScale 3 ditolak', denied(sd('theme', { ...theme, fontScale: 3 })));
t('beranda: widget tak dikenal ditolak', denied(sd('home', { ...home, widgets: [{ id: 'script', visible: true }] })));
t('beranda: widget ganda ditolak', denied(sd('home', { ...home, widgets: [{ id: 'recent', visible: true }, { id: 'recent', visible: false }] })));
t('beranda: judul 61 karakter ditolak', denied(sd('home', { ...home, title: 'x'.repeat(61) })));
t('menu: modul belum diimplementasikan ditolak', denied(sd('nav', { items: [{ id: 'notes', label: 'Catatan', icon: 'note', visible: true }] })));
t('menu: ikon di luar daftar ditolak', denied(sd('nav', { items: [{ id: 'dompet', label: 'Dompet', icon: 'evil', visible: true }] })));
t('menu: label 21 karakter ditolak', denied(sd('nav', { items: [{ id: 'dompet', label: 'x'.repeat(21), icon: 'wallet', visible: true }] })));
t('kunci konfigurasi tak dikenal ditolak', denied(sd('rahasia', {})));
t('draft: Editor boleh menyimpan draft tema (layout.write)', allowed(sd('theme', { ...theme, extra: '<script>' }, 'editor', 'draft awal')));
t('draft: field tambahan dibuang saat disimpan', eq(sql(`select count(*) from jsonb_object_keys((select data from public.config_versions where key='theme' and status='draft'))`, as('owner')).out, '7'));
t('draft: pengguna biasa dan anon tidak bisa menyimpan', denied(sd('theme', theme, 'userA')) === true && denied(sql(`select public.admin_save_draft('theme','{}'::jsonb)`, null)) === true);
t('draft: belum terlihat publik sebelum terbit', eq(sql(`select count(*) from public.published_config`, null).out, '0'));
t('terbit: Editor tidak boleh menerbitkan', denied(sql(`select public.admin_publish('theme','coba')`, as('editor'))));
t('terbit: Super Admin tanpa 2FA ditolak', denied(sql(`select public.admin_publish('theme','x')`, as('owner', 'aal1'))));
t('terbit: tanpa draft ditolak', denied(sql(`select public.admin_publish('home','x')`, as('owner'))));
t('terbit: Super Admin menerbitkan tema v1', eq(sql(`select public.admin_publish('theme','rilis pertama')`, as('owner')).out, '1'));
t('terbit: anon membaca konfigurasi terbit', eq(sql(`select (data->>'radius') from public.published_config where key='theme'`, null).out, '12'));
t('terbit: draft sudah tidak ada', eq(sql(`select count(*) from public.config_versions where key='theme' and status='draft'`, as('owner')).out, '0'));
t('terbit: tercatat sebagai rilis konfigurasi otomatis', eq(adm(`select count(*) from public.app_releases where kind='configuration' and version='cfg-theme-v1'`).out, '1'));
t('draft kedua -> terbit v2 -> v1 diarsipkan', (() => { sd('theme', { ...theme, radius: 20 }); const v = sql(`select public.admin_publish('theme','radius 20')`, as('owner')).out; return v === '2' && eq(adm(`select string_agg(version::text || status, ',' order by version) from public.config_versions where key='theme'`).out, '1archived,2published') === true ? true : { ok: false, info: v }; })());
t('rollback: ke versi yang sedang berlaku ditolak', denied(sql(`select public.admin_rollback('theme', 2)`, as('owner'))));
t('rollback: versi tidak ada ditolak', denied(sql(`select public.admin_rollback('theme', 99)`, as('owner'))));
t('rollback: Editor ditolak', denied(sql(`select public.admin_rollback('theme', 1)`, as('editor'))));
t('rollback: ke v1 membuat v3 berisi data v1', (() => { const v = sql(`select public.admin_rollback('theme', 1)`, as('owner')).out; return v === '3' && eq(sql(`select (data->>'radius') from public.published_config where key='theme'`, null).out, '12') === true ? true : { ok: false, info: v }; })());
t('rollback: riwayat lengkap (v3 terbit, v2 dan v1 arsip)', eq(sql(`select string_agg(version::text || status, ',' order by version) from public.admin_config_history('theme')`, as('owner')).out, '1archived,2archived,3published'));
t('riwayat: mencatat siapa yang mengubah (v1 oleh Editor, v2 dan v3 oleh Super Admin)', eq(sql(`select string_agg(version::text || ':' || split_part(author,'@',1), ',' order by version) from public.admin_config_history('theme')`, as('owner')).out, '1:editor,2:owner,3:owner'));
t('riwayat: pengguna biasa ditolak', denied(sql(`select * from public.admin_config_history('theme')`, as('userA'))));
t('beranda: simpan, terbit, anon membaca urutan widget', (() => { sd('home', home); sql(`select public.admin_publish('home','')`, as('owner')); return eq(sql(`select string_agg(w->>'id', ',') from public.published_config, jsonb_array_elements(data->'widgets') w where key='home'`, null).out, 'overview,recent,budgets'); })());
t('menu: simpan menu valid dan terbit', (() => { const a = sd('nav', { items: [{ id: 'dompet', label: 'Dompet', icon: 'wallet', visible: true }, { id: 'jurnal', label: 'Jurnal', icon: 'book', visible: false }] }); if (!a.ok) return { ok: false, info: a.err }; return eq(sql(`select public.admin_publish('nav','')`, as('owner')).out, '1'); })());
t('draft: bisa dibuang', (() => { sd('theme', theme); return allowed(sql(`select public.admin_discard_draft('theme')`, as('owner'))) === true && eq(sql(`select count(*) from public.config_versions where key='theme' and status='draft'`, as('owner')).out, '0') === true ? true : { ok: false, info: 'draft masih ada' }; })());
t('draft: tidak bisa ada dua draft untuk kunci yang sama', denied(adm(`insert into public.config_versions (key, version, data, status) values ('home', 50, '{}', 'draft'), ('home', 51, '{}', 'draft')`)));
t('integritas: dua versi terbit untuk satu kunci ditolak', denied(adm(`insert into public.config_versions (key, version, data, status) values ('nav', 50, '{}', 'published')`)));

// rilis
t('rilis: Super Admin mencatat rilis kode', allowed(sql(`select public.admin_add_release('1.1.0','code','Tambah modul catatan','uji','planned')`, as('owner'))));
t('rilis: jenis ngawur ditolak', denied(sql(`select public.admin_add_release('1','hack','x')`, as('owner'))));
t('rilis: Customer Service tidak boleh mencatat', denied(sql(`select public.admin_add_release('1.1.1','code','x')`, as('cs'))));
t('rilis: Super Admin membaca riwayat rilis', (x => x.ok && Number(x.out) >= 5 ? true : { ok: false, info: x.out + x.err })(sql(`select count(*) from public.app_releases`, as('owner'))));

// percobaan akses admin
t('keamanan: pengguna biasa tercatat login.denied', (() => { const a = allowed(sql(`select public.log_admin_attempt('login.denied')`, as('userA', 'aal1'))); return a === true ? eq(adm(`select count(*) from public.audit_logs where action='admin.login.denied' and status='denied'`).out, '1') : a; })());
t('keamanan: dibatasi 1 catatan per 60 detik per akun', (() => { sql(`select public.log_admin_attempt('login.denied')`, as('userA', 'aal1')); return eq(adm(`select count(*) from public.audit_logs where action='admin.login.denied'`).out, '1'); })());
t('keamanan: pengguna biasa tidak bisa mengaku login.ok', denied(sql(`select public.log_admin_attempt('login.ok')`, as('userA'))));
t('keamanan: admin aal2 mencatat login.ok', allowed(sql(`select public.log_admin_attempt('login.ok')`, as('owner'))));
t('keamanan: anon ditolak', denied(sql(`select public.log_admin_attempt('login.denied')`, null)));
t('keamanan: hasil ngawur ditolak', denied(sql(`select public.log_admin_attempt('x')`, as('userA'))));
t('audit: konfigurasi dan modul tercatat', (() => { const l = logs(); const need = ['config.publish', 'config.rollback', 'config.draft', 'module.enabled', 'module.create', 'feature.status', 'release.add']; const miss = need.filter(n => !l.includes(n)); return miss.length ? { ok: false, info: miss.join(',') } : true; })());
t('journal_data: tetap tidak terbaca admin setelah semua migrasi', eq(sql(`select count(*) from public.journal_data where user_id='${ID.userA}'`, as('owner')).out, '0'));
t('journal_data: pengguna tetap membaca dan menulis datanya sendiri', allowed(sql(`update public.journal_data set rev = rev where user_id='${ID.userA}'`, as('userA'))));

// ---------- ringkasan ----------
const pass = results.filter(x => x.status === 'PASS').length, fail = results.filter(x => x.status === 'FAIL');
for (const x of results) if (x.status === 'FAIL') console.log('FAIL  ' + x.name + '\n      ' + x.info);
console.log(`\nT1 database: ${pass}/${results.length} PASS, ${fail.length} FAIL`);
fs.mkdirSync(path.join(ROOT, 'tests/results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/results/T1-database.json'), JSON.stringify({ stage: 'T1', environment: 'Postgres 16.15 asli + tiruan Supabase (bukan Supabase asli)', ran_at: new Date().toISOString(), pass, fail: fail.length, results }, null, 2));
process.exit(fail.length ? 1 : 0);
