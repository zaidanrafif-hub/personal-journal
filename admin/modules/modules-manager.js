'use strict';
Admin.register({ id: 'modules-manager', name: 'Modul', icon: 'box', group: 'Platform', order: 140, perm: 'modules.read', desc: 'Daftar modul aplikasi. Modul yang kodenya belum ada tidak bisa diaktifkan.',
  async render(el) {
    const { h } = UI, w = Admin.can('modules.write'), box = h('div'), ICONS = ['wallet', 'target', 'bell', 'book', 'coin', 'chart', 'home', 'note', 'calendar', 'sparkles', 'globe', 'briefcase', 'library', 'dot'];
    const redraw = () => draw();
    async function save(p) { try { await Admin.rpc('admin_upsert_module', { p }); UI.toast('Modul disimpan.'); redraw(); } catch (e) { UI.toast(e.message, 'err'); return false; } }
    function edit(m) {
      const id = h('input', { class: 'inp', id: 'mdId', value: m ? m.id : '', disabled: !!m, placeholder: 'contoh: habit' }), name = h('input', { class: 'inp', id: 'mdName', value: m ? m.name : '', maxlength: 40 }), desc = h('input', { class: 'inp', id: 'mdDesc', value: m ? m.description : '', maxlength: 200 });
      const ic = h('select', { class: 'inp', id: 'mdIcon' }, ICONS.map(i => h('option', { value: i, selected: m && m.icon === i }, i))), cat = h('input', { class: 'inp', id: 'mdCat', value: m ? m.category : 'Rencana', maxlength: 30 }), vis = h('input', { type: 'checkbox', id: 'mdVis', checked: m ? m.visible : true });
      UI.dialog(m ? 'Ubah modul' : 'Modul rencana baru', h('div', { class: 'stack' }, UI.field('ID', id, 'huruf kecil/angka/strip'), UI.field('Nama', name), UI.field('Deskripsi', desc), UI.field('Ikon', ic), UI.field('Kategori', cat), h('label', { class: 'row' }, vis, 'Tampil di daftar'),
        m ? null : h('p', { class: 'hint' }, 'Modul baru berstatus "belum tersedia" sampai kodenya dibuat dan dipasang lewat migrasi.')),
        [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', id: 'mdSave', onclick: () => save({ id: id.value.trim(), name: name.value.trim(), description: desc.value.trim(), icon: ic.value, category: cat.value.trim() || 'umum', visible: vis.checked }) }]);
    }
    async function move(rows, i, d) { const ids = rows.map(r => r.id), j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; try { await Admin.rpc('admin_reorder_modules', { p_ids: ids }); redraw(); } catch (e) { UI.toast(e.message, 'err'); } }
    async function draw() {
      await UI.load(box, () => Admin.select('app_modules', 'select=*&order=sort_order.asc'), rows => UI.table([
        { label: 'Modul', render: r => h('div', null, h('strong', null, r.name), h('div', { class: 'muted small' }, r.id + ' · ' + r.category)) },
        { label: 'Kode', render: r => UI.badge(r.implemented ? 'Sudah ada' : 'Belum ada', r.implemented ? 'ok' : 'warn') }, { label: 'Status', render: r => UI.badge(r.enabled ? 'Aktif' : 'Nonaktif', r.enabled ? 'ok' : '') }, { label: 'Versi', render: r => r.version },
        w ? { label: 'Aksi', render: r => { const i = rows.indexOf(r); return h('div', { class: 'toolbar' },
          h('button', { class: 'btn sm', 'data-act': 'toggle', 'data-id': r.id, disabled: !r.implemented && !r.enabled, title: !r.implemented ? 'Kode belum ada, tidak bisa diaktifkan' : '', onclick: async () => {
            if (r.enabled && !(await UI.confirm('Nonaktifkan modul?', `"${r.name}" akan disembunyikan dari pengguna. Data pengguna tidak dihapus.`, { ok: 'Nonaktifkan', danger: true }))) return;
            try { await Admin.rpc('admin_set_module_enabled', { p_id: r.id, p_enabled: !r.enabled }); UI.toast('Diperbarui.'); redraw(); } catch (e) { UI.toast(e.message, 'err'); } } }, r.enabled ? 'Nonaktifkan' : 'Aktifkan'),
          h('button', { class: 'btn sm', 'aria-label': 'Naik', 'data-act': 'up', disabled: i === 0, onclick: () => move(rows, i, -1) }, UI.icon('up', 14)), h('button', { class: 'btn sm', 'aria-label': 'Turun', 'data-act': 'down', disabled: i === rows.length - 1, onclick: () => move(rows, i, 1) }, UI.icon('down', 14)),
          h('button', { class: 'btn sm', 'data-act': 'edit', onclick: () => edit(r) }, 'Ubah')); } } : null].filter(Boolean), rows));
    }
    el.append(UI.card(null, h('div', { class: 'toolbar' }, w ? h('button', { class: 'btn primary', id: 'mdNew', onclick: () => edit(null) }, UI.icon('plus', 14), 'Modul rencana') : null),
      h('p', { class: 'hint' }, 'Mengaktifkan modul hanya berlaku bila kodenya sudah dipasang. Database menolak pengaktifan modul "Belum ada". Cara menambah modul baru ada di panduan.'), box)); draw();
  } });
