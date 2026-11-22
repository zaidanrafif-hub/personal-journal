'use strict';
Admin.register({ id: 'feature-builder', name: 'Feature Builder', icon: 'bulb', group: 'Platform', order: 150, perm: 'features.read', desc: 'Catat ide fitur dan pantau tahapnya. Fitur baru tetap butuh kode; halaman ini mencatat dan menjaga status yang jujur.',
  async render(el) {
    const { h } = UI, w = Admin.can('features.write'), box = h('div'), ST = { idea: 'Ide', planned: 'Direncanakan', in_development: 'Dikembangkan', testing: 'Diuji', ready: 'Siap', active: 'Aktif', disabled: 'Dinonaktifkan' };
    let mods = [];
    function edit(f) {
      const title = h('input', { class: 'inp', id: 'fTitle', value: f ? f.title : '', maxlength: 100 }), goal = h('textarea', { class: 'inp', id: 'fGoal', maxlength: 500 }, f ? f.goal : ''), req = h('textarea', { class: 'inp', id: 'fReq', maxlength: 2000 }, f ? f.requirements : '');
      const pr = h('select', { class: 'inp', id: 'fPrio' }, ['low', 'medium', 'high'].map(p => h('option', { value: p, selected: (f ? f.priority : 'medium') === p }, { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' }[p])));
      const mod = h('select', { class: 'inp', id: 'fMod' }, h('option', { value: '' }, '(belum ada)'), mods.map(m => h('option', { value: m.id, selected: f && f.module_id === m.id }, m.name + (m.implemented ? '' : ' (belum ada kode)'))));
      UI.dialog(f ? 'Ubah fitur' : 'Fitur baru', h('div', { class: 'stack' }, UI.field('Judul', title), UI.field('Tujuan', goal), UI.field('Kebutuhan', req), UI.field('Prioritas', pr), UI.field('Modul terkait', mod)),
        [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', id: 'fSave', onclick: async () => { try { await Admin.rpc('admin_save_feature', { p: { id: f ? f.id : '', title: title.value.trim(), goal: goal.value, requirements: req.value, priority: pr.value, module_id: mod.value } }); UI.toast('Tersimpan.'); draw(); } catch (e) { UI.toast(/check|violates/i.test(e.message) ? 'Judul wajib diisi.' : e.message, 'err'); return false; } } }], { wide: true });
    }
    async function draw() {
      mods = await Admin.select('app_modules', 'select=id,name,implemented&order=sort_order.asc').catch(() => []);
      await UI.load(box, () => Admin.select('feature_requests', 'select=*&order=created_at.desc'), rows => UI.table([
        { label: 'Fitur', render: r => h('div', null, h('strong', null, r.title), h('div', { class: 'muted small' }, r.goal)) }, { label: 'Prioritas', render: r => r.priority }, { label: 'Modul', render: r => r.module_id || '-' },
        { label: 'Status', render: r => w ? h('select', { class: 'inp', 'aria-label': 'Status ' + r.title, 'data-id': r.id, onchange: async ev => { try { await Admin.rpc('admin_set_feature_status', { p_id: r.id, p_status: ev.target.value }); UI.toast('Status diperbarui.'); draw(); } catch (e) { UI.toast(e.message, 'err'); ev.target.value = r.status; } } }, Object.entries(ST).map(([k, v]) => h('option', { value: k, selected: r.status === k }, v))) : UI.badge(ST[r.status]) },
        w ? { label: 'Aksi', render: r => h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', 'data-act': 'edit', onclick: () => edit(r) }, 'Ubah'), h('button', { class: 'btn sm danger', 'data-act': 'del', onclick: async () => { if (!(await UI.confirm('Hapus fitur?', `"${r.title}" dihapus dari daftar.`, { ok: 'Hapus', danger: true }))) return; try { await Admin.rpc('admin_delete_feature', { p_id: r.id }); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Hapus')) } : null].filter(Boolean), rows, { empty: 'Belum ada fitur dicatat.' }));
    }
    el.append(UI.card(null, h('div', { class: 'toolbar' }, w ? h('button', { class: 'btn primary', id: 'fNew', onclick: () => edit(null) }, UI.icon('plus', 14), 'Fitur baru') : null),
      h('p', { class: 'hint' }, 'Status "Siap" dan "Aktif" hanya bisa dipilih jika modul terkait benar-benar sudah ada kodenya (dan, untuk "Aktif", sudah diaktifkan). Ini mencegah fitur yang belum jadi terlihat seolah-olah berfungsi.'), box)); draw();
  } });
