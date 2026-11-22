'use strict';
/* Alur masuk admin: email + sandi -> cek peran di database -> 2FA (TOTP) -> dasbor. Setelah itu router modul. */
(() => {
  const { h, clear, toast } = UI;
  const root = document.getElementById('root');
  const view = el => { clear(root); root.appendChild(el); };
  const cfgOk = !!(Admin.cfg.url && Admin.cfg.anonKey);

  function authCard(title, sub, ...body) {
    return h('main', { class: 'auth' }, h('div', { class: 'auth-card' }, h('div', { class: 'auth-logo' }, UI.icon('shield', 26), h('span', null, 'Admin')), h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null, ...body));
  }
  function showLogin(note, kind = 'info') {
    if (!cfgOk) return view(authCard('Konfigurasi belum lengkap', 'config.js belum berisi alamat Supabase dan kunci publik.'));
    const em = h('input', { class: 'inp', id: 'aEmail', type: 'email', autocomplete: 'username', required: true, placeholder: 'email admin' });
    const pw = h('input', { class: 'inp', id: 'aPass', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'kata sandi' });
    const err = h('p', { class: 'err', id: 'aErr', role: 'alert' }, note && kind === 'err' ? note : '');
    const btn = h('button', { class: 'btn primary wide', id: 'aGo', type: 'submit' }, 'Masuk');
    const form = h('form', { class: 'stack', onsubmit: async e => {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      try { const r = await Admin.signIn(em.value.trim().toLowerCase(), pw.value); if (!r.ok) { err.textContent = r.msg; return; } pw.value = ''; await afterPassword(); }
      catch (x) { err.textContent = 'Tidak bisa terhubung: ' + x.message; } finally { btn.disabled = false; } } },
      UI.field('Email', em), UI.field('Kata sandi', pw), err, btn);
    view(authCard('Masuk ke Admin', 'Halaman ini hanya untuk pemilik dan pengelola yang ditunjuk.', note && kind !== 'err' ? h('p', { class: 'note' }, note) : null, form,
      h('p', { class: 'muted small' }, 'Tidak ada pendaftaran admin. Akses hanya diberikan oleh Super Admin.')));
    em.focus();
  }
  function showDenied() {
    view(authCard('Akses ditolak', 'Akun ini tidak memiliki hak akses admin. Percobaan ini dicatat.', h('button', { class: 'btn wide', id: 'aBack', onclick: () => showLogin() }, 'Kembali')));
  }
  async function showMfaVerify(factor) {
    const code = h('input', { class: 'inp code', id: 'aCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456', required: true });
    const err = h('p', { class: 'err', id: 'aErr', role: 'alert' });
    const form = h('form', { class: 'stack', onsubmit: async e => { e.preventDefault(); err.textContent = '';
      const r = await Admin.mfa.verify(factor.id, code.value); if (!r.ok) { err.textContent = r.msg; code.select(); return; } await afterPassword(); } },
      UI.field('Kode 6 digit dari aplikasi autentikator', code), err, h('button', { class: 'btn primary wide', id: 'aVerify', type: 'submit' }, 'Verifikasi'),
      h('button', { class: 'btn ghost wide', type: 'button', onclick: async () => { await Admin.signOut(); showLogin(); } }, 'Batal'));
    view(authCard('Verifikasi dua langkah', 'Buka aplikasi autentikator (Google Authenticator, Authy, dll.) dan masukkan kode untuk Personal Journal.', form)); code.focus();
  }
  async function showMfaEnroll() {
    let en;
    try { en = await Admin.mfa.enroll(); } catch (x) { return view(authCard('Tidak bisa menyiapkan 2FA', x.message, h('p', { class: 'muted small' }, 'Pastikan MFA (TOTP) aktif di Supabase: Authentication → Sign In / Providers → Multi-Factor.'), h('button', { class: 'btn wide', onclick: async () => { await Admin.signOut(); showLogin(); } }, 'Kembali'))); }
    const code = h('input', { class: 'inp code', id: 'aCode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456', required: true });
    const err = h('p', { class: 'err', id: 'aErr', role: 'alert' });
    const qr = en.totp && en.totp.qr_code ? h('img', { class: 'qr', id: 'aQr', alt: 'Kode QR autentikator', src: en.totp.qr_code }) : null;
    const form = h('form', { class: 'stack', onsubmit: async e => { e.preventDefault(); err.textContent = '';
      const r = await Admin.mfa.verify(en.id, code.value); if (!r.ok) { err.textContent = r.msg; return; } toast('2FA aktif.'); await afterPassword(); } },
      qr, h('p', { class: 'muted small' }, 'Tidak bisa memindai? Masukkan kunci ini secara manual:'), h('code', { class: 'secret', id: 'aSecret' }, (en.totp && en.totp.secret) || ''),
      UI.field('Kode 6 digit untuk memastikan', code), err, h('button', { class: 'btn primary wide', id: 'aVerify', type: 'submit' }, 'Aktifkan dan masuk'));
    view(authCard('Aktifkan verifikasi dua langkah', 'Admin wajib memakai 2FA. Pindai kode QR dengan aplikasi autentikator.', form));
  }
  async function afterPassword() {
    const info = await Admin.loadInfo();
    if (!info.active || !info.roles.length) { await Admin.rpc('log_admin_attempt', { p_outcome: 'login.denied' }).catch(() => {}); await Admin.signOut(); return showDenied(); }
    if (info.aal !== 'aal2') {
      const f = (await Admin.mfa.factors()).find(x => x.status === 'verified');
      return f ? showMfaVerify(f) : showMfaEnroll();
    }
    Admin.markLogged(); Shell.mount(root);
  }

  /* ---- kerangka dasbor: sidebar, topbar, router ---- */
  const Shell = (() => {
    let main, crumb, nav, side, bellBox;
    const modFromHash = () => { const id = (location.hash.replace(/^#\/?/, '') || 'overview').split('/')[0]; return Admin.visibleMods().find(m => m.id === id) || null; };
    async function render() {
      const m = modFromHash(); const first = Admin.visibleMods()[0];
      if (!m) { if (first && location.hash) { location.hash = '#/' + first.id; return; } }
      const mod = m || first; if (!mod) { clear(main).appendChild(UI.empty('Tidak ada modul yang bisa kamu buka.', 'Hubungi Super Admin untuk mendapat izin.')); return; }
      Admin.state.route = mod.id; side.classList.remove('open');
      nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.id === mod.id));
      clear(crumb).append(h('span', null, 'Admin'), h('span', { class: 'sep' }, '/'), h('strong', null, mod.name));
      document.title = mod.name + ' · Admin Personal Journal';
      clear(main); const page = h('div', { class: 'page', id: 'page-' + mod.id }, h('div', { class: 'page-h' }, h('h2', null, mod.name), mod.desc ? h('p', { class: 'muted' }, mod.desc) : null)); const body = h('div', { class: 'page-b' }); page.appendChild(body); main.appendChild(page);
      try { await mod.render(body); } catch (e) { clear(body).appendChild(UI.errorBox(e.message || String(e))); }
      main.focus({ preventScroll: true });
    }
    async function bell() {
      const items = [];
      try {
        if (Admin.can('support.read')) { const r = await Admin.select('support_messages', 'select=id&status=eq.open', { count: true }); if (r.total) items.push(r.total + ' pesan pengguna menunggu balasan'); }
        if (Admin.can('layout.read')) { const r = await Admin.select('config_versions', 'select=key&status=eq.draft'); if (r.length) items.push(r.length + ' draft tampilan belum diterbitkan'); }
        const ms = await Admin.select('public_settings', 'select=value&key=eq.maintenance'); if (ms[0] && ms[0].value.on) items.push('Mode maintenance sedang AKTIF');
      } catch (e) { /* abaikan */ }
      clear(bellBox); const b = h('button', { class: 'icon-btn', id: 'bellBtn', 'aria-label': 'Notifikasi (' + items.length + ')', onclick: () => UI.dialog('Notifikasi', items.length ? h('ul', { class: 'plain' }, items.map(i => h('li', null, i))) : UI.empty('Tidak ada yang perlu perhatianmu.'), [{ label: 'Tutup' }]) }, UI.icon('mail'), items.length ? h('span', { class: 'cnt' }, items.length) : null);
      bellBox.appendChild(b);
    }
    function mount(rootEl) {
      const groups = {}; Admin.visibleMods().forEach(m => (groups[m.group] ||= []).push(m));
      nav = h('nav', { class: 'nav', 'aria-label': 'Navigasi admin' }, Object.entries(groups).map(([g, ms]) => h('div', { class: 'nav-g' }, h('span', { class: 'nav-t' }, g), ms.map(m => h('a', { href: '#/' + m.id, 'data-id': m.id, id: 'nav-' + m.id, title: m.name }, UI.icon(m.icon || 'dot'), h('span', { class: 'nav-l' }, m.name))))));
      side = h('aside', { class: 'side', id: 'side' }, h('div', { class: 'side-h' }, UI.icon('shield', 22), h('strong', null, 'Admin')), nav, h('div', { class: 'side-f' }, h('small', null, 'Personal Journal Admin 1.0')));
      crumb = h('div', { class: 'crumb', 'aria-label': 'Breadcrumb' });
      bellBox = h('span', { id: 'bellBox' });
      const who = h('div', { class: 'who' }, h('div', { class: 'who-t' }, h('strong', null, Admin.state.info.email || ''), h('small', null, Admin.state.info.roles.map(r => ({ super_admin: 'Super Admin', editor: 'Editor', customer_service: 'Customer Service' }[r] || r)).join(', '))),
        h('button', { class: 'btn ghost', id: 'logoutBtn', onclick: async () => { await Admin.signOut(); showLogin('Kamu sudah keluar.'); } }, UI.icon('out', 16), 'Keluar'));
      const top = h('header', { class: 'top' }, h('button', { class: 'icon-btn', id: 'menuBtn', 'aria-label': 'Buka atau tutup menu', onclick: () => { if (matchMedia('(max-width: 900px)').matches) side.classList.toggle('open'); else document.body.classList.toggle('collapsed'); } }, UI.icon('menu')), crumb, h('span', { class: 'grow' }), bellBox, who);
      main = h('main', { class: 'main', id: 'main', tabindex: -1 });
      clear(rootEl).append(h('div', { class: 'shell' }, side, h('div', { class: 'col' }, top, main)), h('div', { class: 'scrim', onclick: () => side.classList.remove('open') }));
      addEventListener('hashchange', render); Admin.bump(); bell(); render();
    }
    return { mount, render, bell };
  })();
  window.AdminShell = Shell;

  Admin.state.onLogout = m => showLogin(m);
  (async function start() {
    if (!cfgOk) return showLogin();
    if (!Admin.getS()) return showLogin();
    try { await afterPassword(); }
    catch (e) { showLogin(/sesi berakhir/i.test(e.message) ? 'Sesi berakhir. Masuk lagi.' : e.message, 'err'); }
  })();
})();
