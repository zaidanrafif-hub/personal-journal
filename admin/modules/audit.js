'use strict';
Admin.register({ id: 'audit', name: 'Audit Trail', icon: 'list', group: 'Sistem', order: 100, perm: 'audit.read', desc: 'Catatan tindakan admin. Hanya bisa ditambah, tidak bisa diubah atau dihapus.',
  async render(el) {
    const { h } = UI; let page = 0, act = '', st = ''; const size = 25, box = h('div');
    const q = () => { const p = ['select=id,actor_email,action,target,status,created_at,detail', 'order=id.desc']; if (act) p.push('action=ilike.' + encodeURIComponent('*' + act + '*')); if (st) p.push('status=eq.' + st); return p; };
    const draw = () => UI.load(box, () => Admin.select('audit_logs', [...q(), 'limit=' + size, 'offset=' + page * size].join('&'), { count: true }), ({ rows, total }) => {
      const pages = Math.max(1, Math.ceil(total / size));
      return h('div', { class: 'stack' }, UI.table([{ label: 'Waktu', render: r => UI.fmtDate(r.created_at) }, { label: 'Pelaku', render: r => r.actor_email || '-' }, { label: 'Aksi', render: r => r.action }, { label: 'Target', render: r => r.target || '-' }, { label: 'Hasil', render: r => UI.badge(r.status, r.status === 'ok' ? 'ok' : 'bad') }], rows, { empty: 'Tidak ada catatan.' }),
        h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', id: 'auPrev', disabled: page === 0, onclick: () => { page--; draw(); } }, 'Sebelumnya'), h('span', { class: 'muted' }, `Halaman ${page + 1} dari ${pages} · ${UI.fmtNum(total)} catatan`), h('button', { class: 'btn sm', id: 'auNext', disabled: page + 1 >= pages, onclick: () => { page++; draw(); } }, 'Berikutnya')));
    });
    const fa = h('input', { class: 'inp', id: 'auAct', placeholder: 'Filter aksi, mis. role', 'aria-label': 'Filter aksi' }), fs = h('select', { class: 'inp', id: 'auSt', 'aria-label': 'Filter hasil' }, h('option', { value: '' }, 'Semua hasil'), h('option', { value: 'ok' }, 'ok'), h('option', { value: 'denied' }, 'denied'), h('option', { value: 'error' }, 'error'));
    fa.addEventListener('input', UI.debounce(() => { act = fa.value.trim(); page = 0; draw(); })); fs.addEventListener('change', () => { st = fs.value; page = 0; draw(); });
    el.append(UI.card(null, h('div', { class: 'row' }, UI.field('Aksi', fa), UI.field('Hasil', fs), Admin.can('data.export') ? h('button', { class: 'btn', id: 'auCsv', onclick: async () => {
      const r = await Admin.select('audit_logs', [...q(), 'limit=1000'].join('&')); const cols = ['created_at', 'actor_email', 'action', 'target', 'status']; UI.download('audit.csv', UI.toCSV(cols, r), 'text/csv'); } }, UI.icon('dl', 14), 'CSV') : null), box)); draw();
  } });
