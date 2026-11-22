'use strict';
Admin.register({ id: 'maintenance', name: 'Maintenance', icon: 'wrench', group: 'Sistem', order: 130, perm: 'maintenance.write', desc: 'Tutup sementara aplikasi pengguna dengan pesan perawatan.',
  async render(el) {
    const { h } = UI;
    await UI.load(el, async () => (await Admin.select('public_settings', 'select=value&key=eq.maintenance'))[0], row => {
      const v = (row && row.value) || {}, msg = h('textarea', { class: 'inp', id: 'mMsg', maxlength: 300 }, v.message || 'Aplikasi sedang dalam perawatan. Silakan kembali beberapa saat lagi.');
      const st = h('div', { id: 'mState' }, UI.badge(v.on ? 'AKTIF — pengguna melihat layar perawatan' : 'Nonaktif — aplikasi normal', v.on ? 'warn' : 'ok'));
      const set = async on => {
        if (on && !(await UI.confirm('Aktifkan maintenance?', 'Pengguna akan melihat layar perawatan sampai kamu menonaktifkannya. Halaman admin tidak terpengaruh.', { ok: 'Aktifkan', danger: true }))) return;
        try { await Admin.rpc('admin_set_public_setting', { p_key: 'maintenance', p_value: { on, message: msg.value.trim() } }); UI.toast(on ? 'Maintenance aktif.' : 'Maintenance dimatikan.'); AdminShell.bell(); UI.clear(el); Admin.mods.find(m => m.id === 'maintenance').render(el); } catch (e) { UI.toast(e.message, 'err'); }
      };
      return h('div', { class: 'page-b' }, UI.card('Status', st, UI.field('Pesan untuk pengguna (maks 300)', msg), h('div', { class: 'toolbar' }, h('button', { class: 'btn danger', id: 'mOn', disabled: !!v.on, onclick: () => set(true) }, 'Aktifkan'), h('button', { class: 'btn primary', id: 'mOff', disabled: !v.on, onclick: () => set(false) }, 'Matikan'), v.on ? h('button', { class: 'btn', id: 'mSaveMsg', onclick: () => set(true).catch(() => {}) }, 'Simpan pesan') : null)),
        h('p', { class: 'hint' }, 'Cara kerjanya: aplikasi pengguna membaca status ini saat dibuka dan menampilkan layar perawatan. Ini penutup tampilan, bukan kunci database; pengguna yang sudah membuka aplikasi akan melihatnya setelah memuat ulang. Data mereka tidak terhapus dan sinkronisasi tetap aman.'));
    });
  } });
