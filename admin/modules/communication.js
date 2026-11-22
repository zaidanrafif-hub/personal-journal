'use strict';
Admin.register({ id: 'communication', name: 'Komunikasi', icon: 'mail', group: 'Pengelolaan', order: 60, perm: ['comms.read', 'support.read'], desc: 'Balas pesan pengguna, buat pengumuman, dan pasang banner di aplikasi.',
  async render(el) {
    const { h } = UI, tabs = h('div', { class: 'tabs', role: 'tablist' }), body = h('div'); let cur = null;
    const T = [];
    if (Admin.can('support.read')) T.push(['support', 'Pesan pengguna', supportTab]);
    if (Admin.can('comms.read')) T.push(['notif', 'Pemberitahuan', notifTab], ['banner', 'Banner pengumuman', bannerTab]);
    async function supportTab(box) {
      const w = Admin.can('support.write');
      await UI.load(box, () => Admin.select('support_messages', 'select=id,subject,body,status,reply,created_at,replied_at&order=created_at.desc&limit=100'), rows => UI.table([
        { label: 'Subjek', render: r => r.subject }, { label: 'Pesan', render: r => r.body.length > 90 ? r.body.slice(0, 90) + '…' : r.body }, { label: 'Status', render: r => UI.badge(r.status === 'open' ? 'Menunggu' : 'Selesai', r.status === 'open' ? 'warn' : 'ok') }, { label: 'Masuk', render: r => UI.fmtDate(r.created_at) },
        { label: 'Aksi', render: r => h('button', { class: 'btn sm', 'data-act': 'open', onclick: () => {
          const rep = h('textarea', { class: 'inp', id: 'sReply', maxlength: 4000, disabled: !w }, r.reply || ''), st = h('select', { class: 'inp', id: 'sStatus', disabled: !w }, h('option', { value: 'open', selected: r.status === 'open' }, 'Menunggu'), h('option', { value: 'closed', selected: r.status === 'closed' }, 'Selesai'));
          UI.dialog(r.subject, h('div', { class: 'stack' }, h('p', null, r.body), UI.field('Balasan', rep), UI.field('Status', st)), [{ label: 'Tutup' }, w ? { label: 'Kirim balasan', kind: 'primary', id: 'sSend', onclick: async () => {
            try { await Admin.rpc('admin_reply_support', { p_id: r.id, p_reply: rep.value, p_status: st.value }); UI.toast('Balasan disimpan.'); supportTab(box); } catch (e) { UI.toast(e.message, 'err'); return false; } } } : null].filter(Boolean)); } }, 'Buka') }], rows, { empty: 'Belum ada pesan dari pengguna.' }));
    }
    async function notifTab(box) {
      const w = Admin.can('comms.write'), list = h('div'), title = h('input', { class: 'inp', id: 'nTitle', maxlength: 120 }), text = h('textarea', { class: 'inp', id: 'nBody', maxlength: 2000 });
      const draw = () => UI.load(list, () => Admin.select('notifications', 'select=id,title,body,status,created_at,sent_at&order=created_at.desc&limit=50'), rows => UI.table([
        { label: 'Judul', render: r => r.title }, { label: 'Status', render: r => UI.badge(r.status === 'sent' ? 'Terkirim' : 'Draf', r.status === 'sent' ? 'ok' : 'warn') }, { label: 'Dibuat', render: r => UI.fmtDate(r.created_at) },
        w ? { label: 'Aksi', render: r => r.status === 'draft' ? h('div', { class: 'toolbar' }, h('button', { class: 'btn sm primary', 'data-act': 'send', onclick: async () => { if (!(await UI.confirm('Kirim pemberitahuan?', `"${r.title}" akan terlihat oleh semua pengguna. Tidak bisa ditarik kembali.`, { ok: 'Kirim' }))) return; try { await Admin.rpc('admin_send_notification', { p_id: r.id }); UI.toast('Terkirim.'); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Kirim'),
          h('button', { class: 'btn sm danger', 'data-act': 'del', onclick: async () => { try { await Admin.remove('notifications', 'id=eq.' + r.id); draw(); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Hapus')) : h('span', { class: 'muted small' }, UI.fmtDate(r.sent_at)) } : null].filter(Boolean), rows, { empty: 'Belum ada pemberitahuan.' }));
      box.append(w ? UI.card('Pemberitahuan baru (draf)', UI.field('Judul', title), UI.field('Isi', text), h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', id: 'nSave', onclick: async () => { try { await Admin.insert('notifications', { title: title.value.trim(), body: text.value }); title.value = ''; text.value = ''; UI.toast('Draf disimpan.'); draw(); } catch (e) { UI.toast('Judul wajib diisi (maks 120).', 'err'); } } }, 'Simpan draf'))) : null,
        UI.card('Daftar', list), h('p', { class: 'hint' }, 'Pemberitahuan berstatus Terkirim dapat dibaca pengguna yang masuk. Tampilan di aplikasi pengguna menunggu fitur kotak masuk (belum ada).')); draw();
    }
    async function bannerTab(box) {
      const w = Admin.can('comms.write');
      await UI.load(box, async () => (await Admin.select('public_settings', 'select=value&key=eq.announcement'))[0], row => {
        const v = (row && row.value) || {}, on = h('input', { type: 'checkbox', id: 'aOn', checked: !!v.on, disabled: !w }), tx = h('input', { class: 'inp', id: 'aText', value: v.text || '', maxlength: 200, disabled: !w });
        return UI.card('Banner di atas aplikasi', h('label', { class: 'row' }, on, 'Tampilkan banner'), UI.field('Teks (maks 200)', tx),
          w ? h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', id: 'aSave', onclick: async () => { try { await Admin.rpc('admin_set_public_setting', { p_key: 'announcement', p_value: { on: on.checked, text: tx.value.trim() } }); UI.toast('Banner disimpan.'); } catch (e) { UI.toast(e.message, 'err'); } } }, 'Simpan')) : null);
      });
    }
    function show(id) { cur = id; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === id)); UI.clear(body); T.find(t => t[0] === id)[2](body); }
    T.forEach(([id, label]) => tabs.appendChild(h('button', { class: 'btn', 'data-t': id, id: 'tab-' + id, role: 'tab', onclick: () => show(id) }, label)));
    el.append(tabs, body); show(T[0][0]);
  } });
