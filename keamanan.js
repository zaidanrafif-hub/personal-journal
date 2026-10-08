'use strict';
/* Proteksi akun: sandi di-hash PBKDF2 + salt, kunci setelah gagal berulang,
   keluar otomatis saat tidak aktif, ganti sandi, dan angka tertutup otomatis. */
const Sec = (() => {
  const enc = new TextEncoder();
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const E = id => document.getElementById(id);
  const cur = () => sessionStorage.getItem('pj_session');
  const getUsers = () => JSON.parse(localStorage.getItem('pj_users') || '{}');
  const setUsers = o => localStorage.setItem('pj_users', JSON.stringify(o));

  async function pbkdf2(pw, salt) {
    const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, k, 256));
  }
  async function legacy(u, p) { // format lama (SHA-256 polos), dipakai akun yang dibuat sebelumnya
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(u + ':' + p)))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function make(pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { v: 2, s: b64(salt), h: await pbkdf2(pw, salt) };
  }
  async function check(u, pw, rec) {
    if (!rec) return false;
    return typeof rec === 'string' ? rec === await legacy(u, pw) : rec.h === await pbkdf2(pw, unb64(rec.s));
  }

  /* kunci setelah gagal 5x: 30 dtk, lalu 1 mnt, 2 mnt, dst */
  const LK = u => 'pj_lock_' + u;
  const lockInfo = u => JSON.parse(localStorage.getItem(LK(u)) || '{"n":0,"until":0}');
  const waitSec = u => Math.max(0, Math.ceil((lockInfo(u).until - Date.now()) / 1000));
  function fail(u) {
    const l = lockInfo(u); l.n++;
    if (l.n >= 5) l.until = Date.now() + 30000 * 2 ** Math.min(l.n - 5, 6);
    localStorage.setItem(LK(u), JSON.stringify(l));
  }

  async function login(u, pw) {
    const w = waitSec(u);
    if (w) return { msg: 'Terlalu banyak percobaan. Coba lagi dalam ' + w + ' detik.' };
    const all = getUsers(), rec = all[u];
    if (!(await check(u, pw, rec))) { fail(u); return { msg: 'Nama akun atau kata sandi salah.' }; }
    localStorage.removeItem(LK(u));
    if (typeof rec === 'string') { all[u] = await make(pw); setUsers(all); } // naikkan akun lama ke format aman
    return { ok: true };
  }
  async function register(u, pw) {
    if (!/^[a-z0-9._-]{3,20}$/.test(u)) return { msg: 'Nama akun 3-20 karakter: huruf kecil, angka, titik, strip.' };
    if (pw.length < 6) return { msg: 'Kata sandi minimal 6 karakter.' };
    const all = getUsers();
    if (all[u]) return { msg: 'Nama akun sudah dipakai. Pilih nama lain atau masuk.' };
    all[u] = await make(pw); setUsers(all);
    return { ok: true };
  }

  /* keluar otomatis saat tidak aktif */
  let timer, watching = false;
  const idleMin = () => +(localStorage.getItem('pj_idle') ?? '5');
  function out() { sessionStorage.removeItem('pj_session'); location.reload(); }
  function bump() { clearTimeout(timer); const m = idleMin(); if (m > 0 && cur()) timer = setTimeout(out, m * 60000); }
  function watch() {
    if (watching) return; watching = true;
    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(e => addEventListener(e, bump, { passive: true }));
    bump();
  }

  /* angka tertutup otomatis saat masuk (bisa dibuka lewat tombol mata) */
  function onLogin() {
    if (localStorage.getItem('pj_autohide') === '1') { HIDE = true; localStorage.setItem('pj_hide', '1'); }
  }

  /* jendela Keamanan */
  E('secBtn').onclick = () => {
    const f = E('fSec'); f.reset(); E('secMsg').textContent = '';
    f.elements.autohide.checked = localStorage.getItem('pj_autohide') === '1';
    f.elements.idle.value = String(idleMin());
    E('mSec').showModal();
  };
  E('fSec').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, msg = m => { E('secMsg').textContent = m; }, u = cur();
    if (f.elements.old.value || f.elements.n1.value || f.elements.n2.value) {
      if (f.elements.n1.value.length < 6) return msg('Sandi baru minimal 6 karakter.');
      if (f.elements.n1.value !== f.elements.n2.value) return msg('Ulangi sandi baru dengan sama persis.');
      try {
        const all = getUsers();
        if (!(await check(u, f.elements.old.value, all[u]))) return msg('Sandi lama salah.');
        all[u] = await make(f.elements.n1.value); setUsers(all);
      } catch (x) { return msg('Gagal: ' + x.message); }
    }
    localStorage.setItem('pj_autohide', f.elements.autohide.checked ? '1' : '0');
    localStorage.setItem('pj_idle', f.elements.idle.value); bump();
    E('mSec').close();
    if (typeof toast === 'function') toast('Pengaturan keamanan disimpan');
  };

  return { login, register, watch, onLogin };
})();
