'use strict';
/* Editor Tampilan berbasis konfigurasi (bukan HTML/JS bebas). Alur: ubah -> pratinjau langsung -> simpan draft -> bandingkan -> terbitkan -> riwayat/rollback.
   Semua nilai divalidasi ulang di database (validate_config) sebelum disimpan dan saat diterbitkan. */
Admin.register({ id: 'layout-editor', name: 'Editor Tampilan', icon: 'layout', group: 'Platform', order: 135, perm: 'layout.read', desc: 'Atur tema, beranda, dan menu aplikasi dengan pratinjau langsung. Perubahan baru berlaku setelah diterbitkan.',
  async render(el) {
    const { h } = UI, canW = Admin.can('layout.write'), canP = Admin.can('layout.publish');
    const KEYS = { theme: 'Tema', home: 'Beranda', nav: 'Menu' }, WN = { recent: 'Transaksi terbaru', overview: 'Ringkasan arus kas', budgets: 'Anggaran', goals: 'Target saya', insight: 'Insight keuangan' };
    const clone = o => JSON.parse(JSON.stringify(o));
    let mods, pub, drafts, branding, work, saved, hasDraft, tab = 'theme', device = 'desktop';
    const defTheme = () => ({ radius: 12, fontScale: 1, mode: 'auto', cardStyle: 'elevated', buttonStyle: 'filled', density: 'comfortable' });
    const defHome = () => ({ title: '', subtitle: '', welcome: '', widgets: Object.keys(WN).map(id => ({ id, visible: true })) });
    const defNav = () => ({ items: mods.filter(m => m.implemented && m.enabled).sort((a, b) => a.sort_order - b.sort_order).map(m => ({ id: m.id, label: m.name.slice(0, 20), icon: 'dot', visible: true })) });
    const DEF = { theme: defTheme, home: defHome, nav: defNav };
    const norm = (k, d) => { const x = clone(d); if (k === 'theme' && x.background == null) delete x.background; return x; };
    async function load() {
      mods = await Admin.select('app_modules', 'select=id,name,implemented,enabled,sort_order&order=sort_order.asc');
      pub = Object.fromEntries((await Admin.select('published_config', 'select=key,version,data')).map(r => [r.key, r]));
      branding = ((await Admin.select('public_settings', 'select=value&key=eq.branding'))[0] || {}).value || null;
      work = {}; saved = {}; hasDraft = {}; drafts = {};
      for (const k of Object.keys(KEYS)) { const d = await Admin.rpc('admin_config_get', { p_key: k }); hasDraft[k] = !!d; saved[k] = norm(k, d || (pub[k] && pub[k].data) || DEF[k]()); work[k] = clone(saved[k]); }
    }
    const base = k => norm(k, (pub[k] && pub[k].data) || DEF[k]());
    const dirty = k => JSON.stringify(work[k]) !== JSON.stringify(saved[k]);
    function flat(o, p = '', out = {}) { if (o && typeof o === 'object' && !Array.isArray(o)) Object.entries(o).forEach(([k, v]) => flat(v, p ? p + '.' + k : k, out)); else out[p] = JSON.stringify(o); return out; }
    function diff(a, b) { const fa = flat(a), fb = flat(b), keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])]; return keys.filter(k => fa[k] !== fb[k]).map(k => ({ path: k, old: fa[k] ?? '(kosong)', now: fb[k] ?? '(kosong)' })); }

    /* ---- pratinjau ---- */
    let frame, frameReady = false;
    const push = () => { if (frame && frame.contentWindow && frameReady) frame.contentWindow.postMessage({ type: 'pj-preview', config: { theme: work.theme, home: work.home, nav: work.nav, branding } }, location.origin); };
    const onMsg = ev => { if (ev.origin === location.origin && frame && ev.source === frame.contentWindow && ev.data && ev.data.type === 'pj-preview-ready') { frameReady = true; push(); } };
    addEventListener('message', onMsg);

    /* ---- form per tab ---- */
    const upd = () => { push(); refreshBar(); };
    function themeForm() {
      const t = work.theme, mk = (k, list) => h('select', { class: 'inp', id: 'th_' + k, disabled: !canW, onchange: e => { t[k] = e.target.value; upd(); } }, list.map(([v, l]) => h('option', { value: v, selected: t[k] === v }, l)));
      const rng = (k, min, max, step, id) => h('input', { type: 'range', id, min, max, step, value: t[k], disabled: !canW, 'aria-label': k, oninput: e => { t[k] = +e.target.value; e.target.nextSibling.textContent = t[k]; upd(); } });
      const bg = h('input', { class: 'inp', id: 'th_bg', value: t.background || '', placeholder: '#RRGGBB (kosongkan = bawaan)', disabled: !canW, oninput: e => { const v = e.target.value.trim(); if (!v) delete t.background; else t.background = v; upd(); } });
      return h('div', { class: 'stack' }, UI.field('Kelengkungan sudut', h('div', { class: 'row' }, rng('radius', 0, 28, 1, 'th_radius'), h('b', null, t.radius))), UI.field('Ukuran tulisan', h('div', { class: 'row' }, rng('fontScale', 0.85, 1.25, 0.05, 'th_font'), h('b', null, t.fontScale))),
        UI.field('Mode warna', mk('mode', [['auto', 'Ikuti perangkat'], ['light', 'Terang'], ['dark', 'Gelap']])), UI.field('Gaya kartu', mk('cardStyle', [['elevated', 'Bayangan'], ['flat', 'Datar'], ['outline', 'Garis tepi']])),
        UI.field('Gaya tombol utama', mk('buttonStyle', [['filled', 'Terisi'], ['soft', 'Lembut'], ['outline', 'Garis']])), UI.field('Kerapatan', mk('density', [['comfortable', 'Nyaman'], ['compact', 'Rapat']])), UI.field('Warna latar', bg),
        h('p', { class: 'hint' }, 'Warna utama dan font diatur di menu Branding.'));
    }
    function move(list, i, d, redraw) { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; upd(); redraw(); }
    function homeForm() {
      const hm = work.home, box = h('div', { class: 'orderlist', id: 'widgetList' });
      const txt = (k, label, max, id) => UI.field(label, h('input', { class: 'inp', id, value: hm[k], maxlength: max, disabled: !canW, oninput: e => { hm[k] = e.target.value; upd(); } }));
      const draw = () => { UI.clear(box); hm.widgets.forEach((w, i) => box.appendChild(h('div', { class: 'oi', 'data-id': w.id },
        h('input', { type: 'checkbox', checked: w.visible, disabled: !canW, 'aria-label': 'Tampilkan ' + WN[w.id], onchange: e => { w.visible = e.target.checked; upd(); } }), h('span', { class: 'grow' }, WN[w.id]),
        h('button', { class: 'btn sm', type: 'button', 'data-act': 'up', 'aria-label': 'Naik', disabled: !canW || i === 0, onclick: () => move(hm.widgets, i, -1, draw) }, UI.icon('up', 14)), h('button', { class: 'btn sm', type: 'button', 'data-act': 'down', 'aria-label': 'Turun', disabled: !canW || i === hm.widgets.length - 1, onclick: () => move(hm.widgets, i, 1, draw) }, UI.icon('down', 14))))); }; draw();
      return h('div', { class: 'stack' }, txt('title', 'Sapaan (mengganti "Selamat pagi…")', 60, 'hm_title'), txt('subtitle', 'Subjudul', 120, 'hm_sub'), txt('welcome', 'Pesan sambutan', 160, 'hm_wel'), h('h3', null, 'Urutan kartu beranda'), box);
    }
    function navForm() {
      const nv = work.nav, box = h('div', { class: 'orderlist', id: 'navList' }), add = h('select', { class: 'inp', id: 'nvAdd', 'aria-label': 'Tambah menu' });
      const draw = () => {
        UI.clear(box); nv.items.forEach((it, i) => box.appendChild(h('div', { class: 'oi', 'data-id': it.id },
          h('input', { type: 'checkbox', checked: it.visible, disabled: !canW, 'aria-label': 'Tampilkan ' + it.id, onchange: e => { it.visible = e.target.checked; upd(); } }), h('input', { class: 'inp grow', value: it.label, maxlength: 20, disabled: !canW, 'aria-label': 'Label ' + it.id, oninput: e => { it.label = e.target.value; upd(); } }),
          h('button', { class: 'btn sm', type: 'button', 'data-act': 'up', 'aria-label': 'Naik', disabled: !canW || i === 0, onclick: () => move(nv.items, i, -1, draw) }, UI.icon('up', 14)), h('button', { class: 'btn sm', type: 'button', 'data-act': 'down', 'aria-label': 'Turun', disabled: !canW || i === nv.items.length - 1, onclick: () => move(nv.items, i, 1, draw) }, UI.icon('down', 14)),
          h('button', { class: 'btn sm danger', type: 'button', 'data-act': 'rm', 'aria-label': 'Hapus dari daftar', disabled: !canW, onclick: () => { nv.items.splice(i, 1); upd(); draw(); } }, UI.icon('x', 14)))));
        UI.clear(add); add.appendChild(h('option', { value: '' }, '+ Tambah menu…')); mods.filter(m => m.implemented && !nv.items.some(x => x.id === m.id)).forEach(m => add.appendChild(h('option', { value: m.id }, m.name)));
      };
      add.addEventListener('change', () => { const m = mods.find(x => x.id === add.value); if (m) { nv.items.push({ id: m.id, label: m.name.slice(0, 20), icon: 'dot', visible: true }); upd(); draw(); } }); draw();
      return h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Mengatur urutan, label, dan tampil/sembunyi menu atas. Modul yang dinonaktifkan di menu Modul otomatis disembunyikan, apa pun pengaturannya di sini.'), box, canW ? add : null);
    }

    /* ---- aksi ---- */
    const bar = h('div', { class: 'toolbar', id: 'lyBar' }), status = h('span', { id: 'lyStatus', class: 'muted small' }), form = h('div', { id: 'lyForm' });
    function refreshBar() {
      UI.clear(bar); const d = dirty(tab);
      bar.append(canW ? h('button', { class: 'btn primary', id: 'lySave', disabled: !d, onclick: saveDraft }, 'Simpan draft') : null, h('button', { class: 'btn', id: 'lyCompare', onclick: compare }, 'Bandingkan'),
        canP ? h('button', { class: 'btn', id: 'lyPublish', disabled: d || !hasDraft[tab], title: d ? 'Simpan draft dulu' : !hasDraft[tab] ? 'Tidak ada draft' : '', onclick: publish }, UI.icon('rocket', 14), 'Terbitkan') : null,
        canW ? h('button', { class: 'btn', id: 'lyDiscard', disabled: !hasDraft[tab] && !d, onclick: discard }, 'Buang perubahan') : null, h('button', { class: 'btn', id: 'lyHistory', onclick: history }, 'Riwayat'));
      status.textContent = d ? 'Ada perubahan yang belum disimpan.' : hasDraft[tab] ? 'Draft tersimpan, belum diterbitkan.' : pub[tab] ? 'Sama dengan yang terbit (v' + pub[tab].version + ').' : 'Memakai tampilan bawaan.';
      document.querySelectorAll('#lyTabs button').forEach(b => { b.classList.toggle('on', b.dataset.t === tab); const k = b.dataset.t; b.firstChild.textContent = KEYS[k] + (dirty(k) ? ' •' : hasDraft[k] ? ' ◦' : ''); });
    }
    async function saveDraft() { try { await Admin.rpc('admin_save_draft', { p_key: tab, p_data: work[tab], p_note: '' }); saved[tab] = clone(work[tab]); hasDraft[tab] = true; UI.toast('Draft disimpan. Belum terlihat oleh pengguna.'); refreshBar(); AdminShell.bell(); } catch (e) { UI.toast(e.message, 'err'); } }
    async function discard() { if (!(await UI.confirm('Buang perubahan?', hasDraft[tab] ? 'Draft dan perubahan yang belum disimpan dibuang. Tampilan yang terbit tidak berubah.' : 'Perubahan yang belum disimpan dibuang.', { ok: 'Buang', danger: true }))) return;
      try { if (hasDraft[tab]) await Admin.rpc('admin_discard_draft', { p_key: tab }); hasDraft[tab] = false; saved[tab] = base(tab); work[tab] = clone(saved[tab]); show(tab); push(); AdminShell.bell(); } catch (e) { UI.toast(e.message, 'err'); } }
    function compare() {
      const rows = diff(base(tab), work[tab]);
      UI.dialog('Bandingkan: ' + KEYS[tab], h('div', { class: 'stack', id: 'cmpBody' }, rows.length ? UI.table([{ label: 'Bagian', render: r => r.path }, { label: 'Yang terbit sekarang', render: r => h('code', null, r.old) }, { label: 'Versi baru', render: r => h('code', null, r.now) }], rows) : UI.empty('Tidak ada perbedaan dengan yang terbit.'),
        h('div', { class: 'cmp' }, h('div', null, h('strong', null, 'Terbit'), h('pre', null, JSON.stringify(base(tab), null, 1))), h('div', null, h('strong', null, 'Baru'), h('pre', null, JSON.stringify(work[tab], null, 1))))), [{ label: 'Tutup' }], { wide: true });
    }
    async function publish() {
      const rows = diff(base(tab), work[tab]);
      if (!(await UI.confirm('Terbitkan ' + KEYS[tab] + '?', rows.length ? rows.length + ' perubahan akan terlihat oleh SEMUA pengguna: ' + rows.slice(0, 4).map(r => r.path).join(', ') + (rows.length > 4 ? ', …' : '') + '. Kamu bisa mengembalikannya lewat Riwayat.' : 'Tidak ada perbedaan dengan yang terbit.', { ok: 'Terbitkan' }))) return;
      try { const v = await Admin.rpc('admin_publish', { p_key: tab, p_note: '' }); pub[tab] = { key: tab, version: v, data: clone(work[tab]) }; hasDraft[tab] = false; saved[tab] = clone(work[tab]); UI.toast('Diterbitkan sebagai versi ' + v + '.'); refreshBar(); AdminShell.bell(); } catch (e) { UI.toast(e.message, 'err'); }
    }
    async function history() {
      const box = h('div'); const draw = () => UI.load(box, () => Admin.rpc('admin_config_history', { p_key: tab }), rows => UI.table([{ label: 'Versi', render: r => 'v' + r.version }, { label: 'Status', render: r => UI.badge({ draft: 'Draft', published: 'Berlaku', archived: 'Arsip' }[r.status], r.status === 'published' ? 'ok' : r.status === 'draft' ? 'warn' : '') }, { label: 'Oleh', render: r => r.author || '-' }, { label: 'Waktu', render: r => UI.fmtDate(r.published_at || r.created_at) }, { label: 'Catatan', render: r => r.note || '-' },
        { label: 'Aksi', render: r => h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', 'data-act': 'view', onclick: async () => { const d = await Admin.rpc('admin_config_get', { p_key: tab, p_version: r.version }); UI.dialog('Versi ' + r.version, h('pre', { class: 'cmp' }, JSON.stringify(d, null, 1)), [{ label: 'Tutup' }]); } }, 'Lihat'),
          canP && r.status === 'archived' ? h('button', { class: 'btn sm', 'data-act': 'rollback', 'data-v': r.version, onclick: async () => { if (!(await UI.confirm('Kembalikan ke versi ' + r.version + '?', 'Versi ini diterbitkan ulang sebagai versi baru dan langsung berlaku untuk semua pengguna.', { ok: 'Kembalikan', danger: true }))) return;
            try { const v = await Admin.rpc('admin_rollback', { p_key: tab, p_version: r.version }); UI.toast('Dikembalikan (versi baru ' + v + ').'); dlg.close(); await load(); show(tab); push(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Kembalikan') : null) }], rows, { empty: 'Belum ada riwayat.' }));
      const dlg = UI.dialog('Riwayat ' + KEYS[tab], box, [{ label: 'Tutup' }], { wide: true }); draw();
    }

    /* ---- susunan halaman ---- */
    function show(k) { tab = k; UI.clear(form).appendChild(k === 'theme' ? themeForm() : k === 'home' ? homeForm() : navForm()); refreshBar(); }
    const tabs = h('div', { class: 'tabs', id: 'lyTabs', role: 'tablist' }, Object.entries(KEYS).map(([k, l]) => h('button', { class: 'btn', id: 'lyTab-' + k, 'data-t': k, role: 'tab', onclick: () => show(k) }, h('span', null, l))));
    const devs = h('div', { class: 'tabs', id: 'lyDev' }, [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['mobile', 'Ponsel']].map(([d, l]) => h('button', { class: 'btn sm' + (d === device ? ' on' : ''), id: 'pv-' + d, onclick: () => { device = d; frame.className = 'pv ' + d; devs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.id === 'pv-' + d)); } }, l)));
    try { await load(); } catch (e) { return el.appendChild(UI.errorBox(e.message)); }
    frame = h('iframe', { class: 'pv desktop', id: 'lyFrame', title: 'Pratinjau aplikasi', src: '/?pjpreview=1' }); frame.addEventListener('load', () => { frameReady = true; setTimeout(push, 50); });
    el.append(h('div', { class: 'le' }, UI.card(null, tabs, status, form, bar, !canW ? h('p', { class: 'hint' }, 'Kamu hanya boleh melihat. Mengubah butuh izin layout.write.') : null,
      !canP ? h('p', { class: 'hint' }, 'Menerbitkan hanya untuk Super Admin. Simpan draft, lalu minta Super Admin menerbitkan.') : null),
      UI.card('Pratinjau langsung', devs, h('div', { class: 'pv-wrap' }, frame), h('p', { class: 'muted small' }, 'Pratinjau memakai data contoh, bukan data pengguna, dan tidak menyimpan apa pun.'))));
    show('theme');
    const mo = new MutationObserver(() => { if (!document.body.contains(el)) { removeEventListener('message', onMsg); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true });
  } });
