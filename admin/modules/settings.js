'use strict';
Admin.register({ id: 'settings', name: 'Pengaturan', icon: 'gear', group: 'Sistem', order: 80, perm: 'settings.read', desc: 'Pengaturan internal (hanya admin yang bisa membaca) dan batas waktu keluar otomatis admin.',
  async render(el) {
    const { h } = UI, w = Admin.can('settings.write'), box = h('div');
    const idle = h('select', { class: 'inp', id: 'sIdle' }, [5, 10, 15, 30, 60].map(m => h('option', { value: m, selected: Admin.idleMin() === m }, m + ' menit')));
    const key = h('input', { class: 'inp', id: 'sKey', placeholder: 'contoh: app.kontak' }), val = h('textarea', { class: 'inp', id: 'sVal', placeholder: '{"email":"halo@contoh.com"}' });
    const draw = () => UI.load(box, () => Admin.select('app_settings', 'select=key,value,updated_at&order=key.asc'), rows => UI.table([{ label: 'Kunci', render: r => r.key }, { label: 'Nilai', render: r => h('code', null, JSON.stringify(r.value)) }, { label: 'Diubah', render: r => UI.fmtDate(r.updated_at) },
      w ? { label: 'Aksi', render: r => h('button', { class: 'btn sm', onclick: () => { key.value = r.key; val.value = JSON.stringify(r.value); key.focus(); } }, 'Ubah') } : null].filter(Boolean), rows, { empty: 'Belum ada pengaturan internal.' }));
    el.append(UI.card('Keluar otomatis admin', h('div', { class: 'row' }, UI.field('Keluar jika tidak aktif', idle), h('button', { class: 'btn primary', id: 'sIdleSave', onclick: () => { Admin.setIdle(+idle.value); UI.toast('Disimpan untuk browser ini.'); } }, 'Simpan')), h('p', { class: 'hint' }, 'Berlaku di browser ini saja. Bawaan 15 menit.')),
      UI.card('Pengaturan internal', box, w ? h('div', { class: 'stack' }, UI.field('Kunci', key, 'huruf kecil, angka, titik, garis bawah'), UI.field('Nilai (JSON)', val), h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', id: 'sSave', onclick: async () => {
        let v; try { v = JSON.parse(val.value); } catch (e) { return UI.toast('Nilai harus JSON yang valid.', 'err'); }
        try { await Admin.rpc('admin_set_app_setting', { p_key: key.value.trim(), p_value: v }); UI.toast('Tersimpan.'); key.value = ''; val.value = ''; draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Simpan'))) : null,
        h('p', { class: 'hint' }, 'Nilai di sini tersimpan di database dan dicatat di Audit Trail. Aplikasi pengguna tidak membacanya otomatis; untuk tampilan gunakan Branding atau Editor Tampilan.'))); draw();
  } });
