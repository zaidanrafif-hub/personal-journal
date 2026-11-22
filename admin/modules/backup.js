'use strict';
Admin.register({ id: 'backup', name: 'Backup & Restore', icon: 'db', group: 'Sistem', order: 110, perm: 'backup.read', desc: 'Cadangan konfigurasi, halaman, dan metadata pengguna.',
  async render(el) {
    const { h } = UI, canW = Admin.can('backup.write'), hist = h('div'), file = h('input', { type: 'file', id: 'bFile', accept: '.json,application/json' });
    const drawHist = () => UI.load(hist, () => Admin.select('system_backups', 'select=kind,status,size_bytes,detail,created_at&order=created_at.desc&limit=20'), rows => UI.table([{ label: 'Waktu', render: r => UI.fmtDate(r.created_at) }, { label: 'Jenis', render: r => r.kind === 'export' ? 'Ekspor' : 'Pemulihan' }, { label: 'Hasil', render: r => UI.badge(r.status === 'ok' ? 'Berhasil' : 'Gagal', r.status === 'ok' ? 'ok' : 'bad') }, { label: 'Ukuran', render: r => UI.fmtBytes(r.size_bytes) }, { label: 'Catatan', render: r => r.detail || '-' }], rows, { empty: 'Belum ada riwayat.' }));
    const rec = (kind, status, size, detail) => canW ? Admin.rpc('admin_record_backup', { p_kind: kind, p_status: status, p_size: size, p_detail: detail }).then(drawHist).catch(() => {}) : null;
    async function doExport() {
      try { const snap = await Admin.rpc('admin_export_snapshot'), txt = JSON.stringify(snap, null, 1); UI.download('backup-admin-' + new Date().toISOString().slice(0, 10) + '.json', txt, 'application/json'); UI.toast('Cadangan diunduh.'); rec('export', 'ok', txt.length, 'unduh JSON'); }
      catch (e) { UI.toast(e.message, 'err'); rec('export', 'failed', 0, e.message.slice(0, 100)); }
    }
    async function doRestore() {
      const f = file.files[0]; if (!f) return UI.toast('Pilih berkas cadangan dulu.', 'err');
      if (f.size > 8 * 1048576) return UI.toast('Berkas terlalu besar.', 'err');
      let snap; try { snap = JSON.parse(await f.text()); } catch (e) { return UI.toast('Berkas bukan JSON yang valid.', 'err'); }
      if (snap.format !== 'personal-journal-admin-snapshot') return UI.toast('Ini bukan berkas cadangan admin Personal Journal.', 'err');
      const sum = `Pengaturan: ${(snap.public_settings || []).length}, halaman: ${(snap.content_pages || []).length}, dibuat: ${snap.taken_at || '-'}`;
      if (!(await UI.confirm('Pulihkan dari cadangan?', 'Yang dipulihkan: pengaturan publik (branding, maintenance, banner) dan halaman CMS. ' + sum + '. Data jurnal pengguna TIDAK disentuh. Perubahan sekarang tertimpa.', { ok: 'Pulihkan', danger: true, typed: 'PULIHKAN' }))) return;
      try { const r = await Admin.rpc('admin_restore_snapshot', { p_snapshot: snap }); UI.toast('Pemulihan selesai.'); rec('restore', 'ok', f.size, JSON.stringify(r).slice(0, 100)); }
      catch (e) { UI.toast(e.message, 'err'); rec('restore', 'failed', f.size, e.message.slice(0, 100)); }
    }
    el.append(h('p', { class: 'hint', id: 'bbNote' }, 'PENTING: ini cadangan konfigurasi admin, halaman CMS, dan metadata pengguna (email, tanggal). Ini BUKAN backup penuh database PostgreSQL dan TIDAK berisi jurnal/transaksi pengguna. Untuk backup database penuh gunakan fitur backup Supabase (paket Free tidak menyediakan backup harian; periksa Database → Backups).'),
      UI.card('Ekspor', h('div', { class: 'toolbar' }, Admin.can('data.export') ? h('button', { class: 'btn primary', id: 'bExport', onclick: doExport }, UI.icon('dl', 14), 'Unduh cadangan (JSON)') : h('span', { class: 'muted' }, 'Tidak ada izin ekspor.'))),
      Admin.isSuper() ? UI.card('Pemulihan (khusus Super Admin)', h('div', { class: 'row' }, UI.field('Berkas cadangan', file), h('button', { class: 'btn danger', id: 'bRestore', onclick: doRestore }, UI.icon('ul', 14), 'Pulihkan'))) : null,
      UI.card('Riwayat', hist)); drawHist();
  } });
