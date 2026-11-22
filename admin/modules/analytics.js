'use strict';
Admin.register({ id: 'analytics', name: 'Analitik', icon: 'chart', group: 'Pengelolaan', order: 70, perm: 'analytics.read', desc: 'Pertumbuhan dan pemakaian fitur. Hanya jumlah pengguna, tanpa nominal dan tanpa isi catatan.',
  async render(el) {
    const { h } = UI;
    await UI.load(el, () => Admin.rpc('admin_user_stats'), st => {
      const fu = st.feature_usage || {}, N = { transaksi: 'Mencatat transaksi', target: 'Punya target', berulang: 'Tagihan berulang', jurnal: 'Menulis jurnal', anggaran: 'Mengatur anggaran' };
      const days = (st.signups_by_day || []).map(d => ({ k: String(d.day).slice(5), v: d.count }));
      return h('div', { class: 'page-b' }, h('div', { class: 'grid' }, UI.stat('Total pengguna', UI.fmtNum(st.total)), UI.stat('Aktif 7 hari', UI.fmtNum(st.active_7d)), UI.stat('Baru 7 hari', UI.fmtNum(st.new_7d)), UI.stat('Baru 30 hari', UI.fmtNum(st.new_30d)), UI.stat('Sudah menyimpan data', UI.fmtNum(st.with_data), 'di cloud')),
        UI.card('Pendaftar per hari', days.length ? UI.lineChart(days, { label: 'Pendaftar per hari' }) : UI.empty('Belum ada data.')),
        UI.card('Pemakaian fitur (jumlah pengguna)', UI.barChart(Object.entries(N).map(([k, label]) => ({ k: label, v: fu[k] || 0 })), { label: 'Pemakaian fitur' }), h('p', { class: 'hint' }, 'Angka dihitung di database dan hanya berupa jumlah orang yang memakai tiap fitur. Pengguna yang belum mengaktifkan cloud tidak ikut terhitung.')),
        h('p', { class: 'muted small' }, 'Dibuat ' + UI.fmtDate(st.generated_at)));
    });
  } });
