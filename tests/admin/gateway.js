'use strict';
/* Gateway uji: server statis (meniru Vercel: cleanUrls + header dari vercel.json) + tiruan Supabase (GoTrue, PostgREST, Storage)
   yang dijalankan di atas Postgres 16 ASLI dan skema/RLS/fungsi dari migrasi. Ini BUKAN Supabase milikmu:
   kode TOTP palsu '123456', token bukan JWT sungguhan, Storage disimpan di memori. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const SOCK = process.env.PGSOCK || '/var/lib/postgresql/pjtest', PORT = process.env.PGPORT || '54329';
const PSQL = ['-h', SOCK, '-p', PORT, '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ID = { owner: '00000000-0000-0000-0000-0000000000a1', editor: '00000000-0000-0000-0000-0000000000a2', cs: '00000000-0000-0000-0000-0000000000a3',
  userA: '00000000-0000-0000-0000-0000000000b1', userB: '00000000-0000-0000-0000-0000000000b2', plain: '00000000-0000-0000-0000-0000000000b4' };
const USERS = { 'owner@example.com': ['owner', 'Sandi-Owner-1'], 'editor@example.com': ['editor', 'Sandi-Editor-1'], 'cs@example.com': ['cs', 'Sandi-CS-1'],
  'a@example.com': ['userA', 'Sandi-A-1'], 'b@example.com': ['userB', 'Sandi-B-1'], 'plain@example.com': ['plain', 'Sandi-P-1'] };

function psqlSync(db, sql) { const r = spawnSync('psql', [...PSQL, '-d', db, '-f', '-'], { input: sql, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; }
function setupDb(db) {
  psqlSync('postgres', `drop database if exists ${db}`); psqlSync('postgres', `create database ${db}`);
  const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const steps = [['tests/admin/supabase_stub.sql'], ['cloud/supabase.sql']];
  for (const [f] of steps) { const r = psqlSync(db, rd(f)); if (!r.ok) throw new Error(f + ': ' + r.err); }
  psqlSync(db, `insert into auth.users (id,email) values ${Object.entries(USERS).map(([e, [k]]) => `('${ID[k]}','${e}')`).join(',')}`);
  for (const f of ['001_admin_foundation', '002_storage_media', '004_platform']) { const r = psqlSync(db, rd(`supabase/migrations/${f}.sql`)); if (!r.ok) throw new Error(f + ': ' + r.err); }
  const r9 = psqlSync(db, rd('supabase/migrations/900_first_super_admin.sql').split('GANTI_DENGAN_EMAILMU').join('owner@example.com')); if (!r9.ok) throw new Error('900: ' + r9.err);
  psqlSync(db, `insert into public.user_roles (user_id, role) values ('${ID.editor}','editor'),('${ID.cs}','customer_service')`);
  psqlSync(db, `insert into public.journal_data (user_id,data,rev) values ('${ID.userA}','{"v":2,"wallets":[{"id":"w1","name":"Kas","type":"kartal","balance":100000},{"id":"w2","name":"Bank","type":"giral","balance":0}],"tx":[{"id":"t1","type":"out","amount":98765,"cat":"Makan","wallet":"w1","date":"2026-11-01","note":"RAHASIA-KEUANGAN-A"}],"journal":[{"id":"j","text":"RAHASIA-JURNAL"}],"goals":[],"rec":[],"budgets":{},"inv":{"dana":0,"emas":0,"obligasi":0,"saham":0},"gold":0,"imported":{},"profile":{"name":""}}',3)`);
  psqlSync(db, `insert into public.support_messages (user_id,subject,body) values ('${ID.userA}','Tidak bisa sinkron','Halo, data tidak tersinkron.')`);
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error('identifier tidak valid: ' + s), { http: 400 }); return '"' + s + '"'; };
function filterSql(params) {
  const parts = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s.exec(v); if (!m) throw Object.assign(new Error('filter tidak didukung: ' + k + '=' + v), { http: 400 });
    const [, neg, op, val] = m, c = ident(k); let s;
    if (op === 'is') s = `${c} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
    else if (op === 'in') s = `${c} in (${val.replace(/^\(|\)$/g, '').split(',').map(x => q(x.replace(/^"|"$/g, ''))).join(',')})`;
    else s = `${c} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op]} ${q(op.includes('like') ? val.replace(/\*/g, '%') : val)}`;
    parts.push(neg ? `not (${s})` : s);
  }
  return parts.length ? ' where ' + parts.join(' and ') : '';
}
const selSql = sel => !sel || sel === '*' ? '*' : sel.split(',').map(c => ident(c.trim())).join(',');
const ordSql = o => o ? ' order by ' + o.split(',').map(x => { const [c, d] = x.split('.'); return ident(c) + (d === 'desc' ? ' desc' : ' asc'); }).join(',') : '';

let FN = null; // metadata fungsi public
function loadFn(db) {
  const r = psqlSync(db, `select coalesce(jsonb_object_agg(proname, jsonb_build_object('set', proretset, 'ret', prorettype::regtype::text, 'names', to_jsonb(proargnames), 'types', (select jsonb_agg(t::regtype::text) from unnest(proargtypes::oid[]) t))), '{}') from pg_proc where pronamespace='public'::regnamespace`);
  FN = JSON.parse(r.out || '{}');
}
function rpcSql(fn, body) {
  const f = FN[fn]; if (!f) throw Object.assign(new Error('fungsi tidak ditemukan: ' + fn), { http: 404, code: 'PGRST202' });
  body = body || {}; const names = f.names || [], types = f.types || [];
  const args = names.slice(0, types.length).filter(n => n in body).map(n => {
    const t = types[names.indexOf(n)], v = body[n];
    let e;
    if (v === null) e = 'null';
    else if (t === 'jsonb' || t === 'json') e = q(JSON.stringify(v)) + '::jsonb';
    else if (t.endsWith('[]')) e = `array[${v.map(q).join(',')}]::${t}`;
    else e = q(typeof v === 'object' ? JSON.stringify(v) : v) + '::' + t;
    return `${ident(n)} => ${e}`;
  }).join(', ');
  const call = `public.${ident(fn)}(${args})`;
  if (f.ret === 'void') return { sql: `select ${call}; select 'VOID'`, void: true };
  if (f.set) return { sql: `select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ${call} r` };
  return { sql: `select coalesce(to_jsonb(${call}),'null'::jsonb)` };
}

function runAs(db, claims, sql) {
  return new Promise(res => {
    const role = claims ? 'authenticated' : 'anon';
    const pre = `begin;\nset local role ${role};\nselect set_config('request.jwt.claims', ${q(JSON.stringify(claims || {}))}, true) as _c \\gset\n`;
    const p = spawn('psql', [...PSQL, '-d', db, '-f', '-']); let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', code => res({ ok: code === 0, out: out.trim(), err: err.trim() }));
    p.stdin.end(pre + sql + ';\ncommit;\n');
  });
}
function pgErr(err) {
  const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(err) || [];
  const code = m[1] || 'P0001', message = (m[2] || err.split('\n')[0] || 'error').trim();
  const status = code === '42501' ? 403 : code === '23505' ? 409 : code === '23503' ? 409 : 400;
  return { status, body: { code, message, details: null, hint: null } };
}

function start({ db = 'pjt2', port = 0, fresh = true, log = false } = {}) {
  if (fresh) setupDb(db);
  loadFn(db);
  const tokens = new Map(), refresh = new Map(), factors = new Map(), media = new Map(), challenges = new Map();
  const sess = { calls: [], failTotp: 0 };
  const vercel = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')); } catch (e) { return {}; } })();
  const hdrRules = (vercel.headers || []).map(r => ({ re: new RegExp('^' + r.source.replace(/\(\.\*\)/g, '.*') + '$'), h: r.headers }));
  const uid = () => crypto.randomUUID();
  const issue = (user, aal, rt) => {
    const at = 'tok_' + crypto.randomBytes(16).toString('hex'), r = rt || ('ref_' + crypto.randomBytes(12).toString('hex'));
    tokens.set(at, { sub: user.id, email: user.email, aal }); refresh.set(r, { user, aal });
    return { access_token: at, refresh_token: r, expires_in: sess.expiresIn || 3600, token_type: 'bearer', user: { id: user.id, email: user.email } };
  };
  const claimsOf = req => { const a = req.headers.authorization || ''; const t = tokens.get(a.replace(/^Bearer\s+/i, '')); return t ? { sub: t.sub, role: 'authenticated', aal: t.aal, email: t.email } : null; };
  const send = (res, status, body, extra = {}) => { const s = body === undefined ? '' : JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json', ...extra }); res.end(s); };
  const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

  async function auth(req, res, url, body) {
    const p = url.pathname.replace('/auth/v1', '');
    if (p === '/token') {
      const gt = url.searchParams.get('grant_type'), b = JSON.parse(body.toString() || '{}');
      if (gt === 'password') {
        const em0 = String(b.email).toLowerCase(), u = Object.entries(USERS).find(([e, [, pw]]) => e === em0 && pw === b.password) || (sess.pw && sess.pw[em0] === b.password && b.password ? [em0] : null);
        if (!u) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        const row = psqlSync(db, `select id from auth.users where lower(email)=${q(String(b.email).toLowerCase())}`).out;
        psqlSync(db, `update auth.users set last_sign_in_at=now() where id='${row}'`);
        return send(res, 200, issue({ id: row, email: String(b.email).toLowerCase() }, 'aal1'));
      }
      if (gt === 'refresh_token') { const r = refresh.get(b.refresh_token); if (!r) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); return send(res, 200, issue(r.user, r.aal, b.refresh_token)); }
    }
    if (p === '/signup' && req.method === 'POST') {
      const b = JSON.parse(body.toString() || '{}'), em = String(b.email || '').toLowerCase();
      if (psqlSync(db, `select 1 from auth.users where lower(email)=${q(em)}`).out) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const id = uid(); psqlSync(db, `insert into auth.users (id,email) values ('${id}',${q(em)})`); sess.pw = sess.pw || {}; sess.pw[em] = b.password;
      return send(res, 200, issue({ id, email: em }, 'aal1'));
    }
    const t = tokens.get((req.headers.authorization || '').replace(/^Bearer\s+/i, '')); 
    if (p === '/logout') { return send(res, 204); }
    if (!t) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    const fl = () => factors.get(t.sub) || [];
    if (p === '/user' && req.method === 'GET') return send(res, 200, { id: t.sub, email: t.email, factors: fl().map(f => ({ id: f.id, factor_type: 'totp', status: f.status, friendly_name: f.name })) });
    if (p === '/user' && req.method === 'PUT') return send(res, 200, { id: t.sub, email: t.email });
    if (p === '/factors' && req.method === 'POST') {
      const f = { id: uid(), status: 'unverified', name: JSON.parse(body.toString() || '{}').friendly_name }; factors.set(t.sub, [...fl(), f]);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#fff"/><rect x="10" y="10" width="40" height="40"/><rect x="70" y="10" width="40" height="40"/><rect x="10" y="70" width="40" height="40"/></svg>';
      return send(res, 200, { id: f.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
    }
    let m = /^\/factors\/([^/]+)\/challenge$/.exec(p); if (m) { const c = uid(); challenges.set(c, m[1]); return send(res, 200, { id: c, expires_at: Date.now() / 1000 + 300 }); }
    m = /^\/factors\/([^/]+)\/verify$/.exec(p);
    if (m) {
      const b = JSON.parse(body.toString() || '{}');
      if (sess.failTotp > 0) { sess.failTotp--; return send(res, 400, { code: 400, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }); }
      if (challenges.get(b.challenge_id) !== m[1] || b.code !== '123456') return send(res, 400, { code: 400, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
      factors.set(t.sub, fl().map(f => f.id === m[1] ? { ...f, status: 'verified' } : f));
      return send(res, 200, issue({ id: t.sub, email: t.email }, 'aal2'));
    }
    m = /^\/factors\/([^/]+)$/.exec(p); if (m && req.method === 'DELETE') { factors.set(t.sub, fl().filter(f => f.id !== m[1])); return send(res, 200, {}); }
    return send(res, 404, { msg: 'not found ' + p });
  }

  async function rest(req, res, url, body) {
    const claims = claimsOf(req), tbl = url.pathname.replace('/rest/v1/', ''), prefer = req.headers.prefer || '', P = [...url.searchParams];
    sess.calls.push(req.method + ' ' + url.pathname + url.search);
    try {
      let sql, isVoid = false;
      if (tbl.startsWith('rpc/')) { const r = rpcSql(tbl.slice(4), body.length ? JSON.parse(body) : {}); sql = r.sql; isVoid = !!r.void; }
      else {
        const T = 'public.' + ident(tbl), where = filterSql(P), sel = selSql(url.searchParams.get('select'));
        if (req.method === 'GET' || req.method === 'HEAD') {
          const lim = url.searchParams.get('limit'), off = url.searchParams.get('offset');
          const inner = `select ${sel} from ${T}${where}${ordSql(url.searchParams.get('order'))}${lim ? ' limit ' + (+lim | 0) : ''}${off ? ' offset ' + (+off | 0) : ''}`;
          sql = prefer.includes('count=exact') ? `select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(r)) from (${inner}) r),'[]'::jsonb), 'total', (select count(*) from ${T}${where}))` : `select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (${inner}) r`;
        } else if (req.method === 'POST') {
          const rows = JSON.parse(body.toString()), arr = Array.isArray(rows) ? rows : [rows], cols = [...new Set(arr.flatMap(Object.keys))].map(ident).join(',');
          const oc = url.searchParams.get('on_conflict'), ign = /ignore-duplicates/.test(prefer), mrg = /merge-duplicates/.test(prefer);
          const conflict = oc ? ` on conflict (${oc.split(',').map(ident).join(',')}) ` + (ign ? 'do nothing' : mrg ? 'do update set ' + [...new Set(arr.flatMap(Object.keys))].map(c => `${ident(c)}=excluded.${ident(c)}`).join(',') : 'do nothing') : '';
          sql = `with r as (insert into ${T} (${cols}) select ${cols} from jsonb_populate_recordset(null::${T}, ${q(JSON.stringify(arr))}::jsonb)${conflict} returning *) select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from r`;
        } else if (req.method === 'PATCH') {
          const b = JSON.parse(body.toString()), set = Object.keys(b).map(k => `${ident(k)}=x.${ident(k)}`).join(',');
          sql = `with r as (update ${T} t set ${set} from jsonb_populate_record(null::${T}, ${q(JSON.stringify(b))}::jsonb) x${where.replace(/"([a-z_]+)"/gi, 't."$1"')} returning t.*) select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from r`;
        } else if (req.method === 'DELETE') sql = `with r as (delete from ${T}${where} returning *) select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from r`;
        else return send(res, 405, { message: 'method' });
      }
      if (!claims && !(tbl.startsWith('rpc/') || ['app_modules', 'published_config', 'public_settings', 'content_pages'].includes(tbl)) && req.headers.authorization && !/^Bearer eyJ/.test(req.headers.authorization)) return send(res, 401, { code: 'PGRST301', message: 'JWT expired or invalid' });
      const r = await runAs(db, claims, sql);
      if (!r.ok) { const e = pgErr(r.err); return send(res, e.status, e.body); }
      if (isVoid) return send(res, 204);
      const out = r.out.split('\n').filter(Boolean).pop() || 'null', j = JSON.parse(out);
      if (j && j.rows && 'total' in j) return send(res, 200, j.rows, { 'Content-Range': `0-${Math.max(0, j.rows.length - 1)}/${j.total}` });
      if (req.method === 'POST' && !tbl.startsWith('rpc/') && Array.isArray(j) && !/return=representation/.test(prefer)) return send(res, 201);
      if (req.method === 'POST' && !tbl.startsWith('rpc/') && Array.isArray(j) && !Array.isArray(JSON.parse(body.toString()))) return send(res, 201, j);
      return send(res, req.method === 'POST' && !tbl.startsWith('rpc/') ? 201 : 200, j);
    } catch (e) { return send(res, e.http || 400, { code: e.code || 'PGRST100', message: e.message }); }
  }

  async function storage(req, res, url, body) {
    const m = /^\/storage\/v1\/object\/(?:(public)\/)?media\/(.+)$/.exec(url.pathname); if (!m) return send(res, 404, { message: 'not found' });
    const key = decodeURIComponent(m[2]);
    if (m[1] === 'public' && req.method === 'GET') { const o = media.get(key); if (!o) return send(res, 404, { message: 'not found' }); res.writeHead(200, { 'Content-Type': o.mime }); return res.end(o.buf); }
    const claims = claimsOf(req); if (!claims) return send(res, 401, { message: 'Unauthorized' });
    const need = req.method === 'GET' ? 'media.read' : 'media.write';
    const ok = (await runAs(db, claims, `select public.has_permission('${need}')`)).out.split('\n').filter(Boolean).pop() === 't';
    if (!ok) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (req.method === 'POST') { const mime = req.headers['content-type'] || ''; if (!/^image\/(png|jpeg|webp|gif|x-icon)$/.test(mime)) return send(res, 400, { message: 'mime tidak diizinkan' }); if (body.length > 5 * 1048576) return send(res, 413, { message: 'terlalu besar' }); media.set(key, { buf: body, mime }); return send(res, 200, { Key: 'media/' + key }); }
    if (req.method === 'DELETE') { media.delete(key); return send(res, 200, { message: 'ok' }); }
    return send(res, 405, {});
  }

  function stat(req, res, url) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/admin.html' || (p.endsWith('.html') && p !== '/')) { res.writeHead(308, { Location: p.replace(/\.html$/, '').replace(/^\/index$/, '/') }); return res.end(); }
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(`window.PJ_CONFIG = { url: 'http://${req.headers.host}', anonKey: 'sb_publishable_test' };`); }
    if (p === '/') p = '/index.html'; else if (!path.extname(p)) p += '.html';
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT + path.sep) || /\/(tests|supabase|cloud)\//.test(p) || p === '/PANDUAN-CLOUD.md' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const h = { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' };
    for (const r of hdrRules) if (r.re.test(url.pathname)) for (const x of r.h) h[x.key] = x.value;
    res.writeHead(200, h); res.end(fs.readFileSync(f));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'Content-Range' }); return res.end(); }
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    const body = await readBody(req);
    try {
      if (log) console.log(req.method, req.url);
      if (url.pathname === '/__test/ctl') { Object.assign(sess, JSON.parse(body.toString() || '{}')); return send(res, 200, { ok: true }); }
      if (url.pathname === '/__test/calls') return send(res, 200, sess.calls);
      if (url.pathname === '/__test/sql') { const r = psqlSync(db, body.toString()); return send(res, 200, r); }
      if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url, body);
      if (url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url, body);
      if (url.pathname.startsWith('/storage/v1/')) return await storage(req, res, url, body);
      return stat(req, res, url);
    } catch (e) { send(res, 500, { message: e.message }); }
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, port: server.address().port, sess, db, ID, USERS, close: () => new Promise(c => server.close(c)) })));
}
module.exports = { start, ID, USERS, psqlSync };
if (require.main === module) start({ port: +process.env.PORT || 8099, fresh: process.argv.includes('--fresh') !== false, log: true }).then(g => console.log('gateway di http://127.0.0.1:' + g.port));
