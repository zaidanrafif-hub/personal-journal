'use strict';
/* Manajemen pengguna: HANYA metadata (email, tanggal, status, jumlah revisi, ukuran data). Isi jurnal/transaksi tidak dibaca. */
Admin.register({ id: 'users', name: 'Pengguna', icon: 'users', group: 'Pengelolaan', order: 10, perm: 'users.read', desc: 'Daftar akun dan statusnya. Isi data pribadi tidak ditampilkan.',
  async render(el) {
    const { h } = UI; let search = '', page = 0; const size = 20;
    const box = h('div'), q = h('input', { class: 'inp', id: 'uSearch', type: 'search', placeholder: 'Cari email…', 'aria-label': 'Cari email' });
    const exp = fmt => async () => { const rows = await Admin.rpc('admin_list_users', { p_search: search || null, p_limit: 200, p_offset: 0 }); if (!Admin.can('data.export')) return UI.toast('Tidak punya izin ekspor.', 'err');
      const cols = ['email', 'status', 'created_at', 'last_sign_in_at', 'data_rev', 'data_bytes']; const data = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
      if (fmt === 'csv') UI.download('pengguna.csv', UI.toCSV(cols, data), 'text/csv'); else UI.download('pengguna.xlsx', XLSX.write(cols, data, 'Pengguna'));
      Admin.rpc('log_admin_action', { p_action: 'export.users', p_target: fmt, p_detail: { rows: rows.length } }).catch(() => {}); };
    async function draw() {
      await UI.load(box, () => Admin.rpc('admin_list_users', { p_search: search || null, p_limit: size, p_offset: page * size }), rows => {
        const total = rows[0] ? Number(rows[0].total_count) : 0, pages = Math.max(1, Math.ceil(total / size));
        const cols = [
          { label: 'Email', render: r => r.email }, { label: 'Status', render: r => UI.badge(r.status === 'active' ? 'Aktif' : 'Nonaktif', r.status === 'active' ? 'ok' : 'bad') },
          { label: 'Peran', render: r => r.roles.length ? r.roles.map(x => UI.badge(x)) : '-' }, { label: 'Daftar', render: r => UI.fmtDay(r.created_at) }, { label: 'Terakhir masuk', render: r => UI.fmtDate(r.last_sign_in_at) },
          { label: 'Revisi data', render: r => r.data_rev ?? '-' }, { label: 'Ukuran data', render: r => UI.fmtBytes(r.data_bytes) }];
        if (Admin.can('users.write')) cols.push({ label: 'Aksi', render: r => r.roles.includes('super_admin') ? h('span', { class: 'muted small' }, 'dilindungi') : h('button', { class: 'btn sm ' + (r.status === 'active' ? '' : 'primary'), 'data-act': 'toggle', 'data-email': r.email, onclick: async () => {
          const to = r.status === 'active' ? 'disabled' : 'active';
          if (!(await UI.confirm(to === 'disabled' ? 'Nonaktifkan akun?' : 'Aktifkan akun?', r.email + (to === 'disabled' ? ' ditandai nonaktif. Ini tidak menghapus data.' : ' akan ditandai aktif lagi.'), { ok: to === 'disabled' ? 'Nonaktifkan' : 'Aktifkan', danger: to === 'disabled' }))) return;
          try { await Admin.rpc('admin_set_user_status', { p_user: r.id, p_status: to }); UI.toast('Status diperbarui.'); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, r.status === 'active' ? 'Nonaktifkan' : 'Aktifkan') });
        return h('div', { class: 'stack' }, UI.table(cols, rows, { empty: 'Tidak ada pengguna yang cocok.' }),
          h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', id: 'uPrev', disabled: page === 0, onclick: () => { page--; draw(); } }, 'Sebelumnya'), h('span', { class: 'muted' }, `Halaman ${page + 1} dari ${pages} · ${UI.fmtNum(total)} akun`), h('button', { class: 'btn sm', id: 'uNext', disabled: page + 1 >= pages, onclick: () => { page++; draw(); } }, 'Berikutnya')));
      });
    }
    q.addEventListener('input', UI.debounce(() => { search = q.value.trim(); page = 0; draw(); }));
    el.append(UI.card(null, h('div', { class: 'toolbar' }, q, h('span', { class: 'grow' }), Admin.can('data.export') ? [h('button', { class: 'btn sm', id: 'uCsv', onclick: exp('csv') }, UI.icon('dl', 14), 'CSV'), h('button', { class: 'btn sm', id: 'uXlsx', onclick: exp('xlsx') }, UI.icon('dl', 14), 'XLSX')] : null),
      h('p', { class: 'hint' }, 'Admin hanya melihat metadata. Catatan keuangan dan jurnal milik pengguna tidak dapat dibuka dari sini. Status "Nonaktif" menjadi pemblokiran nyata hanya jika migrasi 003 dipasang di Supabase.'), box));
    draw();
  } });
