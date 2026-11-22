'use strict';
Admin.register({ id: 'import-export', name: 'Impor / Ekspor', icon: 'swap', group: 'Sistem', order: 120, perm: ['data.import', 'data.export'], desc: 'Ekspor dan impor data admin dalam CSV atau XLSX. Impor dicek dulu sebelum disimpan.',
  async render(el) {
    const { h } = UI, canI = Admin.can('data.import') && Admin.can('cms.write'), canE = Admin.can('data.export'), out = h('div', { id: 'ieOut' }), file = h('input', { type: 'file', id: 'ieFile', accept: '.csv,.xlsx' });
    const COLS = ['slug', 'title', 'body', 'published'];
    const dl = (name, rows, fmt, cols) => fmt === 'csv' ? UI.download(name + '.csv', UI.toCSV(cols, rows), 'text/csv') : UI.download(name + '.xlsx', XLSX.write(cols, rows, name));
    const exportPages = fmt => async () => { try { const rows = await Admin.select('content_pages', 'select=slug,title,body,published&order=slug.asc'); dl('halaman', rows, fmt, COLS); Admin.rpc('log_admin_action', { p_action: 'export.pages', p_target: fmt, p_detail: { rows: rows.length } }).catch(() => {}); } catch (e) { UI.toast(e.message, 'err'); } };
    const exportUsers = fmt => async () => { try { const rows = await Admin.rpc('admin_list_users', { p_limit: 200, p_offset: 0 }); const cols = ['email', 'status', 'created_at', 'last_sign_in_at']; dl('pengguna', rows, fmt, cols); Admin.rpc('log_admin_action', { p_action: 'export.users', p_target: fmt, p_detail: { rows: rows.length } }).catch(() => {}); } catch (e) { UI.toast(e.message, 'err'); } };
    let parsed = null;
    async function preview() {
      UI.clear(out); parsed = null; const f = file.files[0]; if (!f) return UI.toast('Pilih berkas dulu.', 'err');
      if (f.size > 5 * 1048576) return UI.toast('Berkas lebih dari 5 MB.', 'err');
      try {
        const rows = /\.xlsx$/i.test(f.name) ? await XLSX.read(await f.arrayBuffer()) : UI.parseCSV(await f.text());
        if (!rows.length) return out.appendChild(UI.errorBox('Berkas kosong atau tidak punya baris data.'));
        const miss = ['slug', 'title'].filter(c => !(c in rows[0])); if (miss.length) return out.appendChild(UI.errorBox('Kolom wajib tidak ada: ' + miss.join(', ') + '. Unduh templat untuk melihat format.'));
        if (rows.length > 500) return out.appendChild(UI.errorBox('Maksimal 500 baris per impor (berkas ini ' + rows.length + ').'));
        parsed = rows.map(r => Object.fromEntries(COLS.map(c => [c, r[c] ?? ''])));
        out.append(UI.card('Pratinjau (' + parsed.length + ' baris)', UI.table([{ label: 'Slug', render: r => r.slug }, { label: 'Judul', render: r => r.title }, { label: 'Terbit', render: r => r.published || 'false' }], parsed.slice(0, 20)), parsed.length > 20 ? h('p', { class: 'muted small' }, '… dan ' + (parsed.length - 20) + ' baris lain.') : null,
          h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', id: 'ieGo', onclick: run }, 'Impor sekarang'), h('span', { class: 'muted small' }, 'Slug yang sudah ada akan diperbarui; yang baru dibuat. Baris tidak valid dilewati dan dilaporkan.'))));
      } catch (e) { out.appendChild(UI.errorBox(e.message)); }
    }
    async function run() {
      if (!parsed || !(await UI.confirm('Impor halaman?', parsed.length + ' baris akan disimpan ke Konten (CMS).', { ok: 'Impor' }))) return;
      try {
        const r = await Admin.rpc('admin_import_pages', { p_rows: parsed }); UI.clear(out);
        out.append(UI.card('Hasil impor', h('div', { class: 'grid' }, UI.stat('Dibuat', r.inserted), UI.stat('Diperbarui', r.updated), UI.stat('Gagal', r.errors.length)),
          r.errors.length ? h('div', { class: 'stack' }, UI.table([{ label: 'Baris', render: e => e.row + 1 }, { label: 'Masalah', render: e => e.message }], r.errors.map(e => ({ ...e, row: e.row }))), h('button', { class: 'btn', id: 'ieErr', onclick: () => UI.download('galat-impor.csv', UI.toCSV(['row', 'message'], r.errors), 'text/csv') }, 'Unduh laporan galat')) : h('p', { class: 'hint' }, 'Semua baris berhasil.')));
      } catch (e) { UI.toast(e.message, 'err'); }
    }
    el.append(canE ? UI.card('Ekspor', h('div', { class: 'toolbar' }, h('span', { class: 'muted' }, 'Halaman:'), h('button', { class: 'btn sm', id: 'xpCsv', onclick: exportPages('csv') }, 'CSV'), h('button', { class: 'btn sm', id: 'xpXlsx', onclick: exportPages('xlsx') }, 'XLSX'),
      Admin.can('users.read') ? [h('span', { class: 'muted' }, 'Pengguna (metadata):'), h('button', { class: 'btn sm', id: 'xuCsv', onclick: exportUsers('csv') }, 'CSV'), h('button', { class: 'btn sm', id: 'xuXlsx', onclick: exportUsers('xlsx') }, 'XLSX')] : null)) : null,
      canI ? UI.card('Impor halaman', h('div', { class: 'row' }, UI.field('Berkas CSV atau XLSX', file), h('button', { class: 'btn', id: 'ieTpl', onclick: () => UI.download('templat-halaman.csv', UI.toCSV(COLS, [{ slug: 'tentang', title: 'Tentang', body: 'Isi halaman', published: 'true' }]), 'text/csv') }, 'Unduh templat'), h('button', { class: 'btn primary', id: 'iePrev', onclick: preview }, 'Periksa berkas')), out,
        h('p', { class: 'hint' }, 'Sel yang diawali = + - @ dinetralkan agar tidak menjadi rumus Excel. Rumus di XLSX tidak dijalankan.')) : h('p', { class: 'hint' }, 'Impor memerlukan izin data.import dan cms.write.')); 
  } });
