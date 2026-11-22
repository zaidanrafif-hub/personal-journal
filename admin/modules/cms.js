'use strict';
/* CMS: halaman teks biasa (tanpa HTML/JS). Diterbitkan per halaman; yang belum terbit tidak terlihat publik. */
Admin.register({ id: 'cms', name: 'Konten (CMS)', icon: 'file', group: 'Tampilan', order: 40, perm: 'cms.read', desc: 'Halaman seperti Tentang, Bantuan, Kebijakan. Isi berupa teks biasa.',
  async render(el) {
    const { h } = UI, canW = Admin.can('cms.write'), box = h('div');
    function editor(row) {
      const slug = h('input', { class: 'inp', id: 'cSlug', value: row ? row.slug : '', disabled: !!row, placeholder: 'contoh: tentang' }), title = h('input', { class: 'inp', id: 'cTitle', value: row ? row.title : '', maxlength: 120 });
      const body = h('textarea', { class: 'inp', id: 'cBody', maxlength: 20000 }, row ? row.body : ''), pub = h('input', { type: 'checkbox', id: 'cPub', checked: !!(row && row.published) });
      UI.dialog(row ? 'Ubah halaman' : 'Halaman baru', h('div', { class: 'stack' }, UI.field('Alamat (slug)', slug, 'huruf kecil, angka, strip'), UI.field('Judul', title), UI.field('Isi (teks biasa)', body), h('label', { class: 'row' }, pub, 'Terbitkan (tampil ke publik)')),
        [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', id: 'cSave', onclick: async () => {
          const v = { title: title.value.trim(), body: body.value, published: pub.checked, updated_at: new Date().toISOString() };
          try { if (row) await Admin.update('content_pages', 'id=eq.' + row.id, v); else await Admin.insert('content_pages', { slug: slug.value.trim().toLowerCase(), ...v }); UI.toast('Halaman disimpan.'); draw(); }
          catch (e) { UI.toast(/check|violates/i.test(e.message) ? 'Isian tidak valid (cek alamat/judul/panjang).' : e.message, 'err'); return false; } } }], { wide: true });
    }
    async function draw() {
      await UI.load(box, () => Admin.select('content_pages', 'select=id,slug,title,body,published,updated_at&order=updated_at.desc'), rows => UI.table([
        { label: 'Judul', render: r => r.title }, { label: 'Alamat', render: r => r.slug }, { label: 'Status', render: r => UI.badge(r.published ? 'Terbit' : 'Draf', r.published ? 'ok' : 'warn') }, { label: 'Diubah', render: r => UI.fmtDate(r.updated_at) },
        canW ? { label: 'Aksi', render: r => h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', 'data-act': 'edit', 'data-slug': r.slug, onclick: () => editor(r) }, 'Ubah'),
          h('button', { class: 'btn sm danger', 'data-act': 'del', 'data-slug': r.slug, onclick: async () => { if (!(await UI.confirm('Hapus halaman?', `"${r.title}" akan dihapus permanen.`, { ok: 'Hapus', danger: true }))) return;
            try { await Admin.remove('content_pages', 'id=eq.' + r.id); UI.toast('Halaman dihapus.'); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Hapus')) } : null].filter(Boolean), rows, { empty: 'Belum ada halaman. Buat yang pertama.' }));
    }
    el.append(UI.card(null, h('div', { class: 'toolbar' }, canW ? h('button', { class: 'btn primary', id: 'cNew', onclick: () => editor(null) }, UI.icon('plus', 14), 'Halaman baru') : null), box)); draw();
  } });
