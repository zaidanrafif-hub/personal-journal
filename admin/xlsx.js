'use strict';
/* XLSX minimal tanpa pustaka luar (agar tidak perlu CDN/SRI). Menulis: zip tanpa kompresi + sheet teks.
   Membaca: zip (store atau deflate lewat DecompressionStream) -> sharedStrings + sheet1. Hanya sel teks/angka, tanpa rumus (rumus tidak dieksekusi). */
const XLSX = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  function zip(files) {
    const parts = [], cd = []; let off = 0;
    for (const [name, data] of files) {
      const nb = enc.encode(name), c = crc(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(h.buffer), nb, data);
      const d = new DataView(new ArrayBuffer(46)); d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true); d.setUint32(16, c, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, nb.length, true); d.setUint32(42, off, true);
      cd.push(new Uint8Array(d.buffer), nb); off += 30 + nb.length + data.length;
    }
    const csize = cd.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  /* rows: array of objects; cols: urutan kolom. Semua sel ditulis sebagai teks inline; awalan rumus dinetralkan. */
  function write(cols, rows, sheetName = 'Data') {
    const safe = v => { let s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
    const cell = (v, r, c) => `<c r="${col(c)}${r}" t="inlineStr"><is><t xml:space="preserve">${esc(safe(v))}</t></is></c>`;
    const body = [cols, ...rows.map(r => cols.map(c => r[c]))].map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, i + 1, c)).join('')}</row>`).join('');
    const f = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
    };
    return zip(Object.entries(f).map(([k, v]) => [k, enc.encode(v)]));
  }
  async function inflate(b) { const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(b); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function unzip(buf) {
    const u = new Uint8Array(buf), v = new DataView(buf); let e = u.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Berkas bukan XLSX/ZIP yang valid.');
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = {};
    if (n > 200) throw new Error('Berkas XLSX tidak wajar (terlalu banyak bagian).');
    for (let i = 0; i < n; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP rusak.');
      const meth = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), usz = v.getUint32(p + 24, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      if (usz > 8 * 1048576) throw new Error('Bagian berkas terlalu besar.');
      const ln = v.getUint16(lo + 26, true), le = v.getUint16(lo + 28, true), st = lo + 30 + ln + le, raw = u.subarray(st, st + csz);
      out[name] = meth === 0 ? raw : meth === 8 ? await inflate(raw) : null;
    }
    return out;
  }
  const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  async function read(buf) {
    const f = await unzip(buf), sheet = f['xl/worksheets/sheet1.xml']; if (!sheet) throw new Error('Sheet pertama tidak ditemukan.');
    const ss = []; if (f['xl/sharedStrings.xml']) for (const m of dec.decode(f['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
    const rows = [];
    for (const rm of dec.decode(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const r = [];
      for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(cm[1]); if (!ref) continue;
        const t = (/t="(\w+)"/.exec(cm[1]) || [])[1], inner = cm[2] || '';
        let val = '';
        if (t === 'inlineStr') val = xmlText([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (t === 's') val = ss[+((/<v>(\d+)<\/v>/.exec(inner) || [])[1])] ?? '';
        else { const m = /<v>([\s\S]*?)<\/v>/.exec(inner); val = m ? xmlText(m[1]) : ''; }
        r[colIdx(ref[1])] = val;   // rumus (<f>) diabaikan: hanya nilai yang dibaca
      }
      rows.push(Array.from(r, x => x ?? ''));
    }
    if (rows.length > 5001) throw new Error('Maksimal 5000 baris.');
    const head = (rows.shift() || []).map(x => String(x).trim().toLowerCase());
    return rows.filter(r => r.some(x => x !== '')).map(r => Object.fromEntries(head.map((k, i) => [k, String(r[i] ?? '').replace(/^'(?=[=+\-@])/, '')])));
  }
  return { write, read, _zip: zip, _unzip: unzip, _colIdx: colIdx };
})();
if (typeof module !== 'undefined') module.exports = XLSX;
