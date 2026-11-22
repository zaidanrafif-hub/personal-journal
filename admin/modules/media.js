'use strict';
Admin.register({ id: 'media', name: 'Media', icon: 'image', group: 'Tampilan', order: 50, perm: 'media.read', desc: 'Unggah gambar (PNG, JPG, WEBP, GIF, ICO; maksimal 5 MB) untuk logo atau konten.',
  async render(el) {
    const { h } = UI, canW = Admin.can('media.write'), box = h('div'), MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon'], MAX = 5 * 1048576;
    const pub = p => Admin.base + '/storage/v1/object/public/media/' + p.split('/').map(encodeURIComponent).join('/');
    async function upload(file, folder) {
      if (!MIMES.includes(file.type)) return UI.toast('Jenis berkas tidak diizinkan. Pakai PNG, JPG, WEBP, GIF atau ICO.', 'err');
      if (file.size > MAX) return UI.toast('Berkas lebih dari 5 MB.', 'err');
      const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'gambar', path = (folder || 'umum') + '/' + Date.now() + '-' + safe;
      try {
        const r = await Admin.call('/storage/v1/object/media/' + path, { method: 'POST', rawBody: file, headers: { 'Content-Type': file.type } }); Admin.ensure(r);
        try { await Admin.insert('media_assets', { path, name: file.name.slice(0, 120), mime: file.type, size_bytes: file.size, folder: folder || 'umum' }); }
        catch (e) { await Admin.call('/storage/v1/object/media/' + path, { method: 'DELETE' }).catch(() => {}); throw e; }
        UI.toast('Berkas diunggah.'); draw();
      } catch (e) { UI.toast(e.message, 'err'); }
    }
    async function draw() {
      await UI.load(box, () => Admin.select('media_assets', 'select=id,path,name,mime,size_bytes,folder,created_at&order=created_at.desc&limit=100'), rows => !rows.length ? UI.empty('Belum ada media.', canW ? 'Unggah gambar pertamamu.' : '') :
        h('div', { class: 'grid', id: 'mediaGrid' }, rows.map(r => h('div', { class: 'cardx', 'data-path': r.path },
          h('img', { src: pub(r.path), alt: r.name, loading: 'lazy', width: 160, height: 100, class: 'thumb' }), h('strong', null, r.name), h('small', { class: 'muted' }, `${r.folder} · ${UI.fmtBytes(r.size_bytes)}`),
          h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', 'data-act': 'copy', onclick: async () => { try { await navigator.clipboard.writeText(pub(r.path)); UI.toast('Alamat disalin.'); } catch (e) { UI.dialog('Alamat gambar', h('input', { class: 'inp', value: pub(r.path), readonly: true }), [{ label: 'Tutup' }]); } } }, 'Salin alamat'),
            canW ? h('button', { class: 'btn sm danger', 'data-act': 'del', onclick: async () => { if (!(await UI.confirm('Hapus gambar?', r.name + ' akan dihapus permanen. Halaman yang memakainya akan kehilangan gambar.', { ok: 'Hapus', danger: true }))) return;
              try { Admin.ensure(await Admin.call('/storage/v1/object/media/' + r.path, { method: 'DELETE' })); await Admin.remove('media_assets', 'id=eq.' + r.id); UI.toast('Dihapus.'); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Hapus') : null)))));
    }
    const file = h('input', { type: 'file', id: 'mFile', accept: MIMES.join(','), 'aria-label': 'Pilih gambar' }), folder = h('input', { class: 'inp', id: 'mFolder', value: 'umum', maxlength: 30, 'aria-label': 'Folder' });
    el.append(UI.card(null, canW ? h('div', { class: 'row' }, UI.field('Berkas gambar', file), UI.field('Folder', folder), h('button', { class: 'btn primary', id: 'mUp', onclick: () => { const f = file.files[0]; if (!f) return UI.toast('Pilih berkas dulu.', 'err'); upload(f, folder.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'umum'); } }, UI.icon('ul', 14), 'Unggah')) : h('p', { class: 'hint' }, 'Kamu hanya boleh melihat.'), box)); draw();
  } });
