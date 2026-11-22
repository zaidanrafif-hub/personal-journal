'use strict';
/* Ringkasan: hanya angka agregat dan metadata. Tidak ada isi jurnal/transaksi pengguna. */
Admin.register({ id: 'overview', name: 'Ringkasan', icon: 'home', group: 'Utama', order: 1, perm: 'overview.read', desc: 'Gambaran singkat pemakaian aplikasi (angka agregat saja).',
  async render(el) {
    const { h } = UI;
    await UI.load(el, async () => {
      const st = await Admin.rpc('admin_user_stats');
      let open = null, draft = null, maint = null;
      try { if (Admin.can('support.read')) open = (await Admin.select('support_messages', 'select=id&status=eq.open', { count: true })).total; } catch (e) { /* abaikan */ }
      try { if (Admin.can('layout.read')) draft = (await Admin.select('config_versions', 'select=key&status=eq.draft')).length; } catch (e) { /* abaikan */ }
      try { maint = (await Admin.select('public_settings', 'select=value&key=eq.maintenance'))[0]; } catch (e) { /* abaikan */ }
      return { st, open, draft, maint };
    }, ({ st, open, draft, maint }) => {
      const days = (st.signups_by_day || []).map(d => ({ k: String(d.day).slice(5), v: d.count }));
      return h('div', { class: 'page-b' },
        h('div', { class: 'grid' },
          UI.stat('Total pengguna', UI.fmtNum(st.total), 'terdaftar'), UI.stat('Aktif 7 hari', UI.fmtNum(st.active_7d), 'masuk dalam 7 hari terakhir'),
          UI.stat('Pendaftar baru 30 hari', UI.fmtNum(st.new_30d)), UI.stat('Akun dinonaktifkan', UI.fmtNum(st.disabled)),
          open != null ? UI.stat('Pesan menunggu balasan', UI.fmtNum(open)) : null, draft != null ? UI.stat('Draft tampilan', UI.fmtNum(draft), 'belum diterbitkan') : null),
        UI.card('Pendaftar per hari (30 hari)', days.length ? UI.lineChart(days, { label: 'Pendaftar baru per hari' }) : UI.empty('Belum ada pendaftar.')),
        UI.card('Status sistem', h('div', { class: 'toolbar' },
          UI.badge(maint && maint.value.on ? 'Maintenance AKTIF' : 'Aplikasi normal', maint && maint.value.on ? 'warn' : 'ok'),
          h('span', { class: 'muted small' }, 'Admin hanya melihat angka agregat. Isi jurnal dan transaksi pengguna tidak pernah dibaca di sini.'))));
    });
  } });
