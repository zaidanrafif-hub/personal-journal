'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
function makeRunner(stage) {
  const results = [], shots = path.join(ROOT, 'tests', 'results', 'screenshots'); fs.mkdirSync(shots, { recursive: true });
  const api = {
    results,
    async t(name, fn) { const t0 = Date.now(); try { const r = await fn(); results.push({ name, status: r === 'BLOCKED' ? 'BLOCKED' : 'PASS', ms: Date.now() - t0 }); } catch (e) { results.push({ name, status: 'FAIL', info: String(e.message).split('\n')[0].slice(0, 300), ms: Date.now() - t0 }); } },
    skip(name, why) { results.push({ name, status: 'NOT TESTED', info: why }); },
    save() { const s = { stage, at: new Date().toISOString(), pass: results.filter(r => r.status === 'PASS').length, fail: results.filter(r => r.status === 'FAIL').length, notTested: results.filter(r => r.status === 'NOT TESTED').length, blocked: results.filter(r => r.status === 'BLOCKED').length, results };
      fs.writeFileSync(path.join(ROOT, 'tests', 'results', stage + '.json'), JSON.stringify(s, null, 1)); console.log(`${stage}: PASS ${s.pass} / FAIL ${s.fail} / NOT TESTED ${s.notTested} / BLOCKED ${s.blocked}`); results.filter(r => r.status === 'FAIL').forEach(r => console.log('  FAIL', r.name, '-', r.info)); return s; },
    shots
  };
  return api;
}
const ok = (c, m) => { if (!c) throw new Error(m || 'asersi gagal'); };
async function newPage(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block', ...opts.ctx });
  const page = await ctx.newPage(); page.errors = []; page.cspViolations = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push('console: ' + m.text()); if (/Content Security Policy/i.test(m.text())) page.cspViolations.push(m.text()); });
  page.on('dialog', d => d.accept());
  return page;
}
async function login(page, base, email, pw, { code = '123456', wait = true } = {}) {
  await page.goto(base + '/admin'); await page.fill('#aEmail', email); await page.fill('#aPass', pw); await page.click('#aGo');
  if (!wait) return;
  await page.waitForSelector('#aCode, #aErr:not(:empty), #logoutBtn, #aBack, #aQr', { timeout: 8000 });
  if (await page.$('#aCode')) { await page.fill('#aCode', code); await page.click('#aVerify'); await page.waitForSelector('#logoutBtn, #aErr:not(:empty)', { timeout: 8000 }); }
}
module.exports = { chromium, makeRunner, ok, newPage, login, ROOT };
const CRED = { owner: ['owner@example.com', 'Sandi-Owner-1'], editor: ['editor@example.com', 'Sandi-Editor-1'], cs: ['cs@example.com', 'Sandi-CS-1'], plain: ['plain@example.com', 'Sandi-P-1'], userA: ['a@example.com', 'Sandi-A-1'], userB: ['b@example.com', 'Sandi-B-1'] };
async function adminPage(browser, base, who = 'owner', opts) {
  const p = await newPage(browser, base, opts); await login(p, base, ...CRED[who]); await p.waitForSelector('#logoutBtn'); return p;
}
async function openMod(p, id) {
  await p.evaluate(i => { location.hash = '#/' + i; }, id); await p.waitForSelector('#page-' + id, { timeout: 8000 });
  await p.waitForFunction(i => { const e = document.querySelector('#page-' + i); return e && !e.querySelector('.loading'); }, id, { timeout: 8000 });
}
/* menunggu toast baru yang cocok, lalu membersihkan semua toast supaya tes berikutnya tidak cocok dengan toast lama */
const toast = async (p, re) => { await p.waitForFunction(r => [...document.querySelectorAll('.toast')].some(t => new RegExp(r, 'i').test(t.textContent)), re instanceof RegExp ? re.source : re, { timeout: 8000 }); const err = await p.evaluate(() => { const e = !!document.querySelector('.toast.err'); document.querySelectorAll('.toast').forEach(t => t.remove()); return e; }); return { err }; };
const toastErr = async p => { await p.waitForSelector('.toast.err', { timeout: 8000 }); const t = await p.textContent('.toast.err'); await p.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); return t; };
const confirmOk = async (p, typed) => { await p.waitForSelector('#confirmOk'); if (typed) await p.fill('#confirmTyped', typed); await p.click('#confirmOk'); };
async function download(p, selector) { const [d] = await Promise.all([p.waitForEvent('download'), p.click(selector)]); return fs.readFileSync(await d.path()); }
async function api(base, pathq, { method = 'GET', token, body, headers = {} } = {}) {
  const r = await fetch(base + pathq, { method, headers: { apikey: 'sb_publishable_test', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* kosong */ } return { status: r.status, json: j };
}
async function userToken(base, who) { const r = await api(base, '/auth/v1/token?grant_type=password', { method: 'POST', body: { email: CRED[who][0], password: CRED[who][1] } }); return r.json.access_token; }
Object.assign(module.exports, { CRED, adminPage, openMod, toast, toastErr, confirmOk, download, api, userToken });
