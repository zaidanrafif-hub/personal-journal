'use strict';
Admin.register({ id: 'roles', name: 'Peran & Izin', icon: 'key', group: 'Pengelolaan', order: 20, perm: 'roles.read', desc: 'Siapa yang menjadi admin dan apa yang boleh dilakukan tiap peran. Dicek di database, bukan di tampilan.',
  async render(el) {
    const { h } = UI, canW = Admin.can('roles.write'), NAMES = { super_admin: 'Super Admin', editor: 'Editor', customer_service: 'Customer Service' };
    const members = h('div'), matrix = h('div');
    async function drawMembers() {
      await UI.load(members, () => Admin.rpc('admin_list_role_members'), rows => UI.table([
        { label: 'Email', render: r => r.email }, { label: 'Peran', render: r => UI.badge(NAMES[r.role] || r.role) }, { label: 'Sejak', render: r => UI.fmtDay(r.created_at) },
        canW ? { label: 'Aksi', render: r => h('button', { class: 'btn sm danger', 'data-act': 'revoke', 'data-email': r.email, onclick: async () => {
          if (!(await UI.confirm('Cabut peran?', `${r.email} tidak lagi menjadi ${NAMES[r.role] || r.role}.`, { ok: 'Cabut', danger: true }))) return;
          try { await Admin.rpc('admin_revoke_role', { p_user: r.user_id, p_role: r.role }); UI.toast('Peran dicabut.'); drawMembers(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Cabut') } : { label: ' ', render: () => '' }].filter(Boolean), rows));
    }
    async function drawMatrix() {
      await UI.load(matrix, async () => ({ rp: await Admin.rpc('admin_role_permissions') }), ({ rp }) => {
        const PERMS = ['overview.read', 'users.read', 'users.write', 'roles.read', 'branding.read', 'branding.write', 'cms.read', 'cms.write', 'media.read', 'media.write', 'comms.read', 'comms.write', 'support.read', 'support.write', 'analytics.read', 'settings.read', 'settings.write', 'maintenance.write', 'backup.read', 'data.import', 'data.export', 'modules.read', 'features.read', 'features.write', 'layout.read', 'layout.write', 'releases.read', 'releases.write'];
        const has = (role, p) => rp.some(x => x.role === role && x.permission === p), RES = ['roles.write', 'audit.read', 'security.read', 'backup.write', 'layout.publish', 'modules.write'];
        const cell = (role, p) => h('td', null, h('input', { type: 'checkbox', 'aria-label': role + ' ' + p, 'data-role': role, 'data-perm': p, checked: has(role, p), disabled: !canW, onchange: async ev => {
          const box = ev.target, want = box.checked;
          try { await Admin.rpc('admin_set_role_permission', { p_role: role, p_permission: p, p_allowed: want }); UI.toast('Izin diperbarui.'); } catch (e) { box.checked = !want; UI.toast(e.message, 'err'); } } }));
        const rowsEl = PERMS.map(p => h('tr', null, h('td', null, p), cell('editor', p), cell('customer_service', p)));
        const tbl = h('table', { class: 'tbl', id: 'permMatrix' }, h('thead', null, h('tr', null, h('th', null, 'Izin'), h('th', null, 'Editor'), h('th', null, 'Customer Service'))), h('tbody', null, rowsEl));
        return h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Izin sensitif (' + RES.join(', ') + ') hanya milik Super Admin dan tidak bisa diberikan ke peran lain.'), h('div', { class: 'tbl-wrap' }, tbl));
      });
    }
    const email = h('input', { class: 'inp', id: 'rEmail', type: 'email', placeholder: 'email akun yang sudah terdaftar' }), role = h('select', { class: 'inp', id: 'rRole' }, h('option', { value: 'editor' }, 'Editor'), h('option', { value: 'customer_service' }, 'Customer Service'), h('option', { value: 'super_admin' }, 'Super Admin'));
    el.append(UI.card('Anggota admin', members),
      canW ? UI.card('Beri peran', h('div', { class: 'row' }, UI.field('Email', email), UI.field('Peran', role), h('button', { class: 'btn primary', id: 'rGrant', onclick: async () => {
        if (!email.value.trim()) return UI.toast('Isi email.', 'err');
        if (role.value === 'super_admin' && !(await UI.confirm('Jadikan Super Admin?', 'Super Admin punya akses penuh ke semua pengaturan. Pastikan ini orang yang kamu percaya.', { ok: 'Ya, jadikan', danger: true, typed: 'SUPER' }))) return;
        try { await Admin.rpc('admin_grant_role', { p_email: email.value.trim(), p_role: role.value }); UI.toast('Peran diberikan. Orang ini tetap wajib memasang 2FA.'); email.value = ''; drawMembers(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Beri peran'))) : null,
      UI.card('Matriks izin peran', matrix)); drawMembers(); drawMatrix();
  } });
