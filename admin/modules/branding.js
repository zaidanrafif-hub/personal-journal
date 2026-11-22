'use strict';
Admin.register({ id: 'branding', name: 'Branding', icon: 'palette', group: 'Tampilan', order: 30, perm: 'branding.read', desc: 'Nama, warna, font, logo dan favicon aplikasi. Disimpan sebagai pengaturan, divalidasi di database.',
  async render(el) {
    const { h } = UI, canW = Admin.can('branding.write');
    await UI.load(el, async () => (await Admin.select('public_settings', 'select=value&key=eq.branding'))[0], row => {
      const v = (row && row.value) || {}; const f = {};
      const inp = (k, a = {}) => (f[k] = h('input', { class: 'inp', id: 'b_' + k, value: v[k] ?? '', disabled: !canW, ...a }));
      f.font = h('select', { class: 'inp', id: 'b_font', disabled: !canW }, ['Inter', 'Poppins', 'Montserrat', 'Playfair Display', 'Roboto'].map(x => h('option', { value: x, selected: (v.font || 'Inter') === x }, x)));
      const sw = h('div', { class: 'swatch', id: 'b_sw', 'aria-hidden': 'true' }); const paint = () => { sw.style.background = /^#[0-9a-fA-F]{6}$/.test(f.primary.value) ? f.primary.value : 'transparent'; };
      inp('name', { maxlength: 40 }); inp('primary', { placeholder: '#6200EE' }); inp('secondary', { placeholder: '#3700B3' }); inp('logo_url', { placeholder: 'https://…' }); inp('favicon_url', { placeholder: 'https://…' });
      f.primary.addEventListener('input', paint); paint();
      return h('form', { class: 'cardx', id: 'brandForm', onsubmit: async e => { e.preventDefault();
        const val = { name: f.name.value.trim(), primary: f.primary.value.trim(), secondary: f.secondary.value.trim(), font: f.font.value };
        if (f.logo_url.value.trim()) val.logo_url = f.logo_url.value.trim(); if (f.favicon_url.value.trim()) val.favicon_url = f.favicon_url.value.trim();   // kosong = tidak dipakai
        try { await Admin.rpc('admin_set_public_setting', { p_key: 'branding', p_value: val }); UI.toast('Branding disimpan. Tampil di aplikasi setelah dimuat ulang.'); } catch (x) { UI.toast(x.message, 'err'); } } },
        h('div', { class: 'row' }, UI.field('Nama aplikasi', f.name), UI.field('Font', f.font)),
        h('div', { class: 'row' }, UI.field('Warna utama (#RRGGBB)', f.primary), sw, UI.field('Warna kedua (#RRGGBB)', f.secondary)),
        UI.field('URL logo (https)', f.logo_url, 'Unggah gambar di Media lalu tempel alamatnya.'), UI.field('URL favicon (https)', f.favicon_url),
        canW ? h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', id: 'bSave', type: 'submit' }, 'Simpan branding')) : h('p', { class: 'hint' }, 'Kamu hanya boleh melihat.'));
    });
  } });
