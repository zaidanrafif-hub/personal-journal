'use strict';
/* Pustaka UI admin. Semua teks lewat textContent (tidak ada innerHTML dari data), supaya aman dari XSS dan cocok dengan CSP ketat. */
const UI = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', key: 'M14 10a4 4 0 1 0-3.9 4L21 14v3h-3v3h-3v-3h-2.4', palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z',
    file: 'M6 3h8l5 5v13H6zM14 3v5h5', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4', mail: 'M3 6h18v12H3zM3 7l9 7 9-7', chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    swap: 'M7 7h13l-4-4M17 17H4l4 4', wrench: 'M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2z', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z', layout: 'M3 4h18v16H3zM3 10h18M10 10v10', rocket: 'M5 15c-1 3-1 5-1 5s2 0 5-1M14 4c4 0 6 2 6 6-2 4-5 7-9 8l-5-5c1-4 4-7 8-9zM15 9h.01',
    menu: 'M4 6h16M4 12h16M4 18h16', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5 9-10', chev: 'M9 6l6 6-6 6', up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M5 12l7 7 7-7',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2', plus: 'M12 5v14M5 12h14', trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', edit: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
    out: 'M9 4H4v16h5M16 8l4 4-4 4M20 12H9', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', dl: 'M12 3v12M7 10l5 5 5-5M4 21h16', ul: 'M12 15V3M7 8l5-5 5 5M4 21h16', alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', dot: 'M12 12h.01'
  };
  function icon(name, size = 18) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', ICONS[name] || ICONS.dot); s.appendChild(p); return s;
  }
  /* h('div', {class:'x', onclick:fn, 'data-a':'1'}, child, 'teks', [array]) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'required' || k === 'multiple') { if (v) el[k] = true; }
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    add(el, kids); return el;
  }
  function add(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const fmtDate = d => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDay = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const fmtNum = n => Number(n || 0).toLocaleString('id-ID');
  const fmtBytes = n => n == null ? '-' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  /* ---- toast ---- */
  let toastBox;
  function toast(msg, kind = 'ok') {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast ' + kind }, msg); toastBox.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3200);
  }

  /* ---- dialog ---- */
  function dialog(title, body, actions = [], opts = {}) {
    const dlg = h('dialog', { class: 'dlg' + (opts.wide ? ' wide' : ''), 'aria-label': title });
    const close = () => { dlg.close(); dlg.remove(); };
    const foot = h('div', { class: 'dlg-foot' }, actions.map(a => h('button', { class: 'btn ' + (a.kind || ''), type: 'button', id: a.id, onclick: async ev => {
      if (a.keepOpen) return a.onclick && a.onclick(close, ev);
      const r = a.onclick ? await a.onclick(close, ev) : undefined; if (r !== false) close(); } }, a.label)));
    dlg.appendChild(h('div', { class: 'dlg-head' }, h('h3', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: close }, icon('x'))));
    dlg.appendChild(h('div', { class: 'dlg-body' }, body)); dlg.appendChild(foot);
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.body.appendChild(dlg); dlg.showModal(); return { close, el: dlg };
  }
  function confirm(title, message, { ok = 'Lanjutkan', danger = false, typed = null } = {}) {
    return new Promise(res => {
      let input = null;
      const body = h('div', null, h('p', null, message), typed ? (input = h('input', { class: 'inp', id: 'confirmTyped', placeholder: 'Ketik: ' + typed, autocomplete: 'off' })) : null);
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      const d = dialog(title, body, [
        { label: 'Batal', onclick: () => { fin(false); } },
        { label: ok, kind: danger ? 'danger' : 'primary', id: 'confirmOk', keepOpen: true, onclick: close => { if (typed && input.value.trim() !== typed) { toast('Ketik "' + typed + '" persis untuk melanjutkan.', 'err'); return; } fin(true); close(); } }]);
      d.el.addEventListener('close', () => fin(false));
    });
  }

  /* ---- keadaan ---- */
  const loading = (msg = 'Memuat…') => h('div', { class: 'state loading' }, h('span', { class: 'spin' }), msg);
  const empty = (msg, hint) => h('div', { class: 'state empty' }, h('strong', null, msg), hint ? h('span', null, hint) : null);
  const errorBox = (msg, retry) => h('div', { class: 'state error', role: 'alert' }, h('strong', null, 'Terjadi masalah'), h('span', null, msg), retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, 'Coba lagi') : null);
  async function load(el, fn, render) {
    clear(el).appendChild(loading());
    try { const data = await fn(); clear(el); const out = render(data); if (out) el.appendChild(out); }
    catch (e) { clear(el).appendChild(errorBox(e.message || String(e), () => load(el, fn, render))); }
  }

  /* ---- tabel ---- */
  function table(cols, rows, { empty: emptyMsg = 'Belum ada data.' } = {}) {
    if (!rows.length) return empty(emptyMsg);
    const t = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.class }, c.label)))),
      h('tbody', null, rows.map(r => h('tr', null, cols.map(c => h('td', { class: c.class, 'data-label': c.label }, c.render ? c.render(r) : (r[c.key] ?? '-')))))));
    return h('div', { class: 'tbl-wrap' }, t);
  }
  const badge = (text, kind = '') => h('span', { class: 'badge ' + kind }, text);
  const field = (label, control, hint) => h('label', { class: 'fld' }, h('span', null, label), control, hint ? h('small', null, hint) : null);
  const card = (title, ...kids) => h('section', { class: 'cardx' }, title ? h('h3', null, title) : null, ...kids);
  const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', null, label), h('strong', null, value), sub ? h('small', null, sub) : null);

  /* ---- grafik SVG sederhana ---- */
  function svgEl(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; }
  function lineChart(points, { w = 640, hgt = 180, label = 'Grafik' } = {}) {
    const max = Math.max(1, ...points.map(p => p.v)), n = points.length, padL = 28, padB = 22, padT = 8, padR = 8;
    const x = i => padL + (n <= 1 ? 0 : i * (w - padL - padR) / (n - 1)), y = v => padT + (hgt - padT - padB) * (1 - v / max);
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img', 'aria-label': label });
    for (let g = 0; g <= 2; g++) { const gy = padT + (hgt - padT - padB) * g / 2; svg.appendChild(svgEl('line', { x1: padL, x2: w - padR, y1: gy, y2: gy, class: 'grid' }));
      const tx = svgEl('text', { x: 2, y: gy + 4, class: 'axis' }); tx.textContent = Math.round(max * (1 - g / 2)); svg.appendChild(tx); }
    if (n) {
      svg.appendChild(svgEl('polyline', { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), class: 'line', fill: 'none' }));
      points.forEach((p, i) => { const c = svgEl('circle', { cx: x(i), cy: y(p.v), r: 3, class: 'dot' }); const t = svgEl('title'); t.textContent = `${p.k}: ${p.v}`; c.appendChild(t); svg.appendChild(c); });
      [0, Math.floor((n - 1) / 2), n - 1].forEach(i => { const tx = svgEl('text', { x: x(i), y: hgt - 4, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }); tx.textContent = points[i].k; svg.appendChild(tx); });
    }
    return svg;
  }
  function barChart(items, { label = 'Grafik batang' } = {}) {
    const max = Math.max(1, ...items.map(i => i.v));
    return h('div', { class: 'bars', role: 'img', 'aria-label': label }, items.map(i => h('div', { class: 'bar-row' }, h('span', { class: 'bar-l' }, i.k),
      h('div', { class: 'bar-t' }, (() => { const s = svgEl('svg', { viewBox: '0 0 100 10', preserveAspectRatio: 'none', class: 'bar-svg' }); s.appendChild(svgEl('rect', { x: 0, y: 0, width: Math.max(0.5, 100 * i.v / max), height: 10, rx: 2, class: 'bar-f' })); return s; })()),
      h('b', null, fmtNum(i.v)))));
  }

  /* ---- unduh dan CSV ---- */
  function download(name, content, mime = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };   // awalan ' mencegah injeksi rumus Excel
  const toCSV = (cols, rows) => '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n');
  function parseCSV(text) {
    text = text.replace(/^﻿/, ''); const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map(s => s.trim().toLowerCase());
    return rows.filter(r => r.some(x => x !== '')).map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').replace(/^'(?=[=+\-@])/, '')])));
  }
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  return { h, add, clear, icon, toast, dialog, confirm, loading, empty, errorBox, load, table, badge, field, card, stat, lineChart, barChart, download, toCSV, parseCSV, fmtDate, fmtDay, fmtNum, fmtBytes, debounce };
})();
if (typeof module !== 'undefined') module.exports = UI;
