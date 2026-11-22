'use strict';
Admin.register({ id: 'security', name: 'Pusat Keamanan', icon: 'shield', group: 'Sistem', order: 90, perm: 'security.read', desc: 'Status keamanan akunmu, upaya masuk yang ditolak, dan kontrol sesi.',
  async render(el) {
    const { h } = UI;
    await UI.load(el, async () => {
      const [factors, denied, members, off] = await Promise.all([Admin.mfa.factors(), Admin.select('audit_logs', 'select=actor_email,action,created_at&status=eq.denied&order=created_at.desc&limit=15'), Admin.rpc('admin_list_role_members'), Admin.select('profiles', 'select=id&status=eq.disabled', { count: true })]);
      return { factors, denied, members, off: off.total };
    }, ({ factors, denied, members, off }) => {
      const verified = factors.filter(f => f.status === 'verified'), supers = members.filter(m => m.role === 'super_admin').length;
      const chk = [['2FA aktif untuk akun ini', verified.length > 0, 'ok'], ['Sesi ini diverifikasi 2FA (aal2)', Admin.state.info.aal === 'aal2', 'ok'], ['Lebih dari satu Super Admin (cadangan akses)', supers > 1, 'warn'], ['Keluar otomatis admin ' + Admin.idleMin() + ' menit', Admin.idleMin() <= 30, 'warn']];
      return h('div', { class: 'page-b' },
        UI.card('Daftar periksa', h('ul', { class: 'plain', id: 'secChecks' }, chk.map(([t, okv, lv]) => h('li', null, UI.badge(okv ? 'Baik' : 'Perlu perhatian', okv ? 'ok' : lv), ' ', t)))),
        UI.card('Verifikasi dua langkah', UI.table([{ label: 'Perangkat', render: f => f.friendly_name || 'Autentikator' }, { label: 'Status', render: f => UI.badge(f.status === 'verified' ? 'Aktif' : 'Belum diverifikasi', f.status === 'verified' ? 'ok' : 'warn') },
          { label: 'Aksi', render: f => h('button', { class: 'btn sm danger', 'data-act': 'reset2fa', onclick: async () => { if (!(await UI.confirm('Atur ulang 2FA?', 'Faktor ini dihapus dan kamu keluar. Saat masuk lagi kamu mendaftarkan autentikator baru.', { ok: 'Atur ulang', danger: true }))) return; try { await Admin.mfa.remove(f.id); await Admin.signOut(); location.reload(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Atur ulang') }], factors, { empty: 'Belum ada.' })),
        UI.card('Sesi', h('div', { class: 'toolbar' }, h('button', { class: 'btn', id: 'gLogout', onclick: async () => { if (!(await UI.confirm('Keluar dari semua perangkat?', 'Semua sesi akunmu (di semua perangkat) diakhiri.', { ok: 'Keluar semua' }))) return; await Admin.signOut('global'); location.reload(); } }, UI.icon('out', 14), 'Keluar dari semua perangkat'))),
        UI.card('Percobaan masuk ditolak (15 terbaru)', UI.table([{ label: 'Akun', render: r => r.actor_email || '-' }, { label: 'Aksi', render: r => r.action }, { label: 'Waktu', render: r => UI.fmtDate(r.created_at) }], denied, { empty: 'Tidak ada.' })),
        UI.card('Catatan jujur', h('ul', { class: 'plain' }, h('li', null, 'Akun nonaktif: ' + off + '. Pemblokiran login hanya efektif untuk data cloud jika migrasi 003 dipasang; login Supabase itu sendiri tidak diblokir dari sini.'), h('li', null, 'Batas percobaan login dan pemblokiran IP diatur oleh Supabase (Authentication → Rate Limits), bukan oleh halaman ini.'), h('li', null, 'Semua izin diperiksa di database. Menyembunyikan menu hanya soal tampilan.'))));
    });
  } });
