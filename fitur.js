'use strict';
/* Fitur tambahan: target tabungan, transaksi berulang + pengingat, jurnal harian,
   zakat/sedekah, cadangan data, dan impor mutasi bank (CSV). */
const Fit = (() => {
  const MOOD = { 5: 'Senang', 4: 'Tenang', 3: 'Biasa', 2: 'Capek', 1: 'Stres / sedih' };
  const ensure = () => { D.goals ||= []; D.rec ||= []; D.journal ||= []; D.gold ||= 0; D.imported ||= {}; };
  const ym = (y, m) => y + '-' + String(m).padStart(2, '0');
  const nextMonth = s => { let [y, m] = s.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return ym(y, m); };
  const prevMonth = s => { let [y, m] = s.split('-').map(Number); m--; if (m < 1) { m = 12; y--; } return ym(y, m); };
  const dayDiff = d => Math.round((new Date(d + 'T00:00') - new Date(today() + 'T00:00')) / 864e5);
  const dueDate = r => nextMonth(r.last) + '-' + String(r.day).padStart(2, '0');
  const sum = a => a.reduce((x, y) => x + y, 0);

  function addTx(r, date) {
    const w = wById(r.wallet); if (!w) return;
    w.balance += r.type === 'in' ? r.amount : -r.amount;
    D.tx.push({ id: uid(), date, type: r.type, wallet: w.id, walletName: w.name, status: w.type, cat: r.cat, amount: r.amount, note: r.name });
  }
  /* catat otomatis transaksi berulang yang sudah jatuh tempo */
  function runRec() {
    const t = today(), tm = monthOf(t), td = +t.slice(8); let n = 0;
    D.rec.forEach(r => {
      if (!r.auto) return;
      for (let g = 0; g < 36; g++) {
        const nm = nextMonth(r.last);
        if (nm > tm || (nm === tm && td < r.day)) break;
        addTx(r, nm + '-' + String(r.day).padStart(2, '0')); r.last = nm; n++;
      }
    });
    if (n) { save(); toast(n + ' transaksi berulang dicatat otomatis'); }
  }

  /* ----- tampilan ----- */
  function renderGoals() {
    $('#goals').innerHTML = D.goals.length ? D.goals.map(g => {
      const pct = Math.min(100, g.saved / g.target * 100), done = g.saved >= g.target;
      let hint = '';
      if (!done && g.deadline) {
        const now = new Date(), dl = new Date(g.deadline + 'T00:00');
        const mo = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth());
        hint = dl < now ? 'Tenggat sudah lewat. ' : 'Sisihkan sekitar ' + rp((g.target - g.saved) / mo) + ' per bulan sampai ' + dateFmt(g.deadline) + '. ';
      }
      return `<div class="bud"><div class="bud-t"><span>${esc(g.name)}${done ? ' · Tercapai' : ''}</span><span>${rp(g.saved)} / ${rp(g.target)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span class="muted">${hint}${done ? '' : `<a href="#" data-gdep="${g.id}">+ setor</a> · `}<a href="#" data-gdel="${g.id}">hapus</a></span></div>`;
    }).join('') : '<p class="empty">Belum ada target. Contoh: laptop baru Rp8.000.000.</p>';
  }
  function renderRecs() {
    const soon = D.rec.filter(r => !r.auto && dayDiff(dueDate(r)) <= 7);
    const lbl = d => d < 0 ? 'terlambat ' + (-d) + ' hari' : d === 0 ? 'hari ini' : d + ' hari lagi';
    $('#recBanner').innerHTML = soon.length ? `<div class="ev warn" style="margin-bottom:12px"><h3>Segera jatuh tempo</h3>${soon.map(r =>
      `<p>${esc(r.name)} · ${rp(r.amount)} · ${lbl(dayDiff(dueDate(r)))} · <a href="#" data-rpay="${r.id}">catat sekarang</a></p>`).join('')}</div>` : '';
    $('#recs').innerHTML = D.rec.length ? D.rec.map(r => `<div class="bud"><div class="bud-t"><span>${esc(r.name)}</span><span>${r.type === 'in' ? '+' : '−'}${rp(r.amount)}</span></div>
      <span class="muted">Tiap tanggal ${r.day} · ${r.auto ? 'dicatat otomatis' : 'pengingat saja'} · berikutnya ${dateFmt(dueDate(r))} · <a href="#" data-rdel="${r.id}">hapus</a></span></div>`).join('')
      : '<p class="empty">Belum ada. Contoh: gaji tiap tanggal 25, kos tiap tanggal 1, langganan.</p>';
  }
  const spend = d => sum(D.tx.filter(t => t.date === d && t.type === 'out').map(t => t.amount));
  function renderJournal() {
    const f = $('#fJr').elements; if (!f.date.value) f.date.value = today();
    const list = D.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    $('#jrList').innerHTML = list.length ? list.map(j => `<div class="ev" style="margin-top:10px"><h3>${dateFmt(j.date)} · ${MOOD[j.mood]}</h3>
      <p>${esc(j.text || '-')}</p><p class="muted">Pengeluaran hari itu: ${rp(spend(j.date))} · <a href="#" data-jdel="${j.id}">hapus</a></p></div>`).join('') : '<p class="empty">Belum ada jurnal.</p>';
    const by = {}; D.journal.forEach(j => (by[j.mood] ||= []).push(spend(j.date)));
    const avg = Object.entries(by).map(([m, a]) => [m, sum(a) / a.length, a.length]).sort((a, b) => b[1] - a[1]);
    $('#jrInsight').innerHTML = avg.length >= 2 ? `<div class="relakan" style="margin-top:12px"><h3>Pola suasana hati</h3><ul>${avg.map(([m, v, n]) =>
      `<li>Saat ${MOOD[m]}: rata-rata ${rp(v)} per hari (${n} catatan)</li>`).join('')}</ul></div>` : '';
  }
  function renderZakat() {
    const f = $('#fGold').elements; if (document.activeElement !== f.gold) f.gold.value = D.gold || '';
    const harta = sum(D.wallets.map(w => w.balance)) + sum(Object.values(D.inv));
    const m = monthOf(today()), sed = p => sum(D.tx.filter(t => t.type === 'out' && t.cat === 'Sedekah' && t.date.startsWith(p)).map(t => t.amount));
    let h = `<p>Sedekah bulan ini: <b>${rp(sed(m))}</b> · tahun ini: <b>${rp(sed(m.slice(0, 4)))}</b></p>`;
    if (D.gold > 0) {
      const nisab = 85 * D.gold;
      h += `<p>Nisab (85 gram emas): <b>${rp(nisab)}</b><br>Harta tersimpan (dompet + investasi): <b>${rp(harta)}</b></p>` +
        (harta >= nisab ? `<p>Hartamu sudah mencapai nisab. Jika sudah dimiliki satu tahun (haul), zakat maal 2,5% sekitar <b>${rp(harta * .025)}</b>.</p>` : '<p>Hartamu belum mencapai nisab.</p>');
    }
    $('#zk').innerHTML = h + '<p class="muted">Perkiraan sederhana. Untuk ketentuan lengkap, tanyakan ke lembaga zakat atau ustaz.</p>';
  }
  function renderAutoBak() {
    const list = Store.list(sessionStorage.getItem('pj_session'));
    $('#autoBak').innerHTML = list.length ? '<p class="muted" style="margin:16px 0 6px">Cadangan otomatis di perangkat ini. Hanya untuk berjaga jika data bermasalah, bukan pengganti file cadangan.</p>' +
      list.map(b => `<div class="bud-t" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span>${esc(b.label)}</span><span>${b.kb} KB · <a href="#" data-restore="${esc(b.key)}">pulihkan</a></span></div>`).join('') : '';
  }
  const renderAll = () => { renderGoals(); renderRecs(); renderJournal(); renderZakat(); renderAutoBak(); };

  /* ----- target tabungan ----- */
  let depId = null;
  $('#addGoal').onclick = () => { $('#fGoal').reset(); open('#mGoal'); };
  $('#fGoal').onsubmit = e => { const f = e.target.elements;
    D.goals.push({ id: uid(), name: f.name.value.trim(), target: +f.target.value, saved: 0, deadline: f.deadline.value || '' }); save(); render(); toast('Target ditambahkan'); };
  $('#fGoalDep').onsubmit = e => {
    const f = e.target.elements, g = D.goals.find(x => x.id === depId), w = wById(f.wallet.value), a = +f.amount.value;
    if (!g || !w || a <= 0) return;
    if (a > w.balance) { e.preventDefault(); return toast('Saldo dompet tidak cukup'); }
    w.balance -= a; g.saved += a; save(); render(); toast('Setoran masuk ke ' + g.name);
  };

  /* ----- transaksi berulang ----- */
  const recCats = () => { const f = $('#fRec').elements; fill(f.cat, (f.type.value === 'out' ? CAT_OUT : CAT_IN).map(c => [c, c])); };
  $('#fRec').elements.type.onchange = recCats;
  $('#addRec').onclick = () => {
    if (!D.wallets.length) return toast('Tambah dompet dulu.');
    const f = $('#fRec'); f.reset(); fill(f.elements.wallet, walletOpts()); recCats(); open('#mRec');
  };
  $('#fRec').onsubmit = e => {
    const f = e.target.elements, day = Math.min(28, Math.max(1, +f.day.value || 1)), tm = monthOf(today());
    D.rec.push({ id: uid(), name: f.name.value.trim(), type: f.type.value, amount: +f.amount.value, wallet: f.wallet.value, cat: f.cat.value, day,
      auto: f.auto.checked, last: day >= +today().slice(8) ? prevMonth(tm) : tm });
    save(); render(); toast('Transaksi berulang disimpan');
  };

  /* ----- jurnal & zakat ----- */
  $('#fJr').onsubmit = e => {
    e.preventDefault(); const f = e.target.elements, date = f.date.value || today();
    D.journal = D.journal.filter(j => j.date !== date);
    D.journal.push({ id: uid(), date, mood: +f.mood.value, text: f.text.value.trim() });
    f.text.value = ''; save(); render(); toast('Jurnal tersimpan');
  };
  $('#fGold').onsubmit = e => { e.preventDefault(); D.gold = +e.target.elements.gold.value || 0; save(); render(); };

  /* ----- klik tautan di kartu ----- */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-gdep],[data-gdel],[data-rdel],[data-rpay],[data-jdel],[data-restore]'); if (!a) return;
    e.preventDefault(); const d = a.dataset;
    if (d.restore) {
      if (!confirm('Pulihkan data dari cadangan ini? Data saat ini akan diganti (salinannya tetap disimpan).')) return;
      try { D = Store.restore(sessionStorage.getItem('pj_session'), d.restore); location.reload(); } catch (x) { toast('Gagal memulihkan: ' + x.message); }
      return;
    }
    if (d.gdep) { depId = d.gdep; const f = $('#fGoalDep'); f.reset(); fill(f.elements.wallet, walletOpts()); return open('#mGoalDep'); }
    if (d.gdel) { const g = D.goals.find(x => x.id === d.gdel), w0 = D.wallets[0];
      if (!confirm(`Hapus target "${g.name}"?` + (g.saved && w0 ? ` Uang tersimpan ${rp(g.saved)} dikembalikan ke dompet "${w0.name}".` : ''))) return;
      if (g.saved && w0) w0.balance += g.saved; D.goals = D.goals.filter(x => x.id !== g.id); }
    if (d.rdel) { if (!confirm('Hapus transaksi berulang ini? Catatan yang sudah dibuat tetap ada.')) return; D.rec = D.rec.filter(x => x.id !== d.rdel); }
    if (d.rpay) { const r = D.rec.find(x => x.id === d.rpay); addTx(r, today()); r.last = nextMonth(r.last); fillMonths(); toast('Tercatat'); }
    if (d.jdel) { if (!confirm('Hapus catatan jurnal ini?')) return; D.journal = D.journal.filter(x => x.id !== d.jdel); }
    save(); render();
  });

  /* ----- cadangan ----- */
  $('#bkExp').onclick = () => {
    const u = sessionStorage.getItem('pj_session');
    const blob = new Blob([JSON.stringify({ app: 'personal-journal', v: 1, schema: D.v, user: u, date: today(), data: D }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'personal-journal-' + u + '-' + today() + '.json'; a.click();
    toast('Cadangan diunduh. Simpan file ini di tempat aman.');
  };
  $('#bkImp').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = e => {
    const file = e.target.files[0]; if (!file) return; const rd = new FileReader();
    rd.onload = () => {
      try {
        const x = JSON.parse(rd.result);
        if (!x.data || !Array.isArray(x.data.wallets) || !Array.isArray(x.data.tx)) throw new Error('bukan file cadangan Personal Journal');
        if (!confirm('Pulihkan cadangan tanggal ' + (x.date || '?') + '? Data saat ini akan DIGANTI.')) return;
        const u = sessionStorage.getItem('pj_session'); Store.snapshot(u, 'restore'); D = Store.migrate(x.data, u, null); Store.unlock(); ensure(); save(); location.reload();
      } catch (err) { toast('Gagal memulihkan: ' + err.message); }
      e.target.value = '';
    };
    rd.readAsText(file);
  };

  /* ----- impor mutasi bank (CSV) ----- */
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, aug: 8, ags: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
  function parseDate(s) {
    s = String(s || '').trim(); let m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) return ym(m[1], +m[2]) + '-' + m[3].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) return ym(m[3].length === 2 ? '20' + m[3] : m[3], +m[2]) + '-' + m[1].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/)) && MON[m[2].toLowerCase()]) return ym(m[3], MON[m[2].toLowerCase()]) + '-' + m[1].padStart(2, '0');
    return null;
  }
  function parseNum(s) {
    if (s == null) return NaN;
    let t = String(s).replace(/rp|idr/gi, '').replace(/[^\d.,()-]/g, '').trim();
    if (!/\d/.test(t)) return NaN;
    const neg = /^-|\(/.test(t); t = t.replace(/[()-]/g, '');
    const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
    if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (lc > -1) t = /,\d{1,2}$/.test(t) && t.split(',').length === 2 ? t.replace(',', '.') : t.replace(/,/g, '');
    else if (ld > -1) t = /\.\d{1,2}$/.test(t) && t.split('.').length === 2 ? t : t.replace(/\./g, '');
    const n = parseFloat(t); return neg ? -n : n;
  }
  function parseCSV(text) {
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const cnt = ch => first.split(ch).length - 1;
    const sep = [[';', cnt(';')], [',', cnt(',')], ['\t', cnt('\t')]].sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  const KEY = [[/kopi|coffee|starbucks|janji jiwa|kenangan/i, 'Kopi/Kafe'], [/gojek|grab(?!food)|krl|transjakarta|tol |parkir|bensin|pertamina/i, 'Transport'],
    [/pln|listrik|pulsa|telkom|indihome|bpjs|pdam|token/i, 'Tagihan'], [/gofood|grabfood|shopeefood|resto|warung|makan|kfc|mcd|bakso/i, 'Makan'],
    [/tokopedia|shopee|lazada|indomaret|alfamart|tiktok/i, 'Belanja'], [/sedekah|infaq|zakat|donasi|kitabisa|baznas/i, 'Sedekah'],
    [/apotek|klinik|rumah sakit|halodoc/i, 'Kesehatan'], [/netflix|spotify|bioskop|cgv|steam/i, 'Hiburan']];
  const guess = (d, type) => type === 'in' ? (/gaji|salary|payroll/i.test(d) ? 'Gaji' : 'Lainnya') : (KEY.find(k => k[0].test(d)) || [0, 'Lainnya'])[1];

  function importCsv(text, w, adjust) {
    const rows = parseCSV(text); if (rows.length < 1) throw new Error('file kosong');
    let h = rows.findIndex(r => r.some(c => /tanggal|tgl|date/i.test(c)));
    const head = h > -1 ? rows[h].map(c => c.toLowerCase()) : null, idx = re => head ? head.findIndex(c => re.test(c)) : -1;
    let ci = { date: idx(/tanggal|tgl|date/), desc: idx(/keterangan|uraian|deskripsi|description|remark|berita|transaksi/), deb: idx(/debit|keluar|\bdb\b|\bdr\b/), cre: idx(/kredit|credit|masuk|\bcr\b/), amt: idx(/jumlah|amount|nominal|mutasi/) };
    if (!head) ci = { date: 0, desc: 1, deb: -1, cre: -1, amt: rows[0].length - 1 };
    if (ci.date < 0 || (ci.amt < 0 && ci.deb < 0 && ci.cre < 0)) throw new Error('kolom tanggal atau jumlah tidak ditemukan');
    let n = 0, dup = 0;
    rows.slice(h + 1).forEach(r => {
      const date = parseDate(r[ci.date]); if (!date) return;
      const desc = (ci.desc > -1 ? r[ci.desc] || '' : '').trim(); let type, amount;
      const dv = ci.deb > -1 ? Math.abs(parseNum(r[ci.deb])) : NaN, cv = ci.cre > -1 ? Math.abs(parseNum(r[ci.cre])) : NaN;
      if (dv > 0) { type = 'out'; amount = dv; } else if (cv > 0) { type = 'in'; amount = cv; }
      else if (ci.amt > -1) {
        const raw = r[ci.amt] || '', v = parseNum(raw); if (!(Math.abs(v) > 0)) return;
        amount = Math.abs(v); type = v < 0 || /\b(DB|DR)\b/i.test(raw + ' ' + desc) ? 'out' : 'in'; if (/\bCR\b/i.test(raw)) type = 'in';
      } else return;
      const key = date + '|' + type + '|' + amount + '|' + desc.slice(0, 30).toLowerCase();
      if (D.imported[key]) { dup++; return; } D.imported[key] = 1;
      D.tx.push({ id: uid(), date, type, wallet: w.id, walletName: w.name, status: w.type, cat: guess(desc, type), amount, note: desc.slice(0, 60) });
      if (adjust) w.balance += type === 'in' ? amount : -amount;
      n++;
    });
    if (!n && !dup) throw new Error('tidak ada baris transaksi yang cocok');
    save(); fillMonths(); render();
    return n + ' transaksi diimpor' + (dup ? ', ' + dup + ' dilewati (sudah pernah diimpor)' : '');
  }
  $('#csvBtn').onclick = () => { if (!D.wallets.length) return toast('Tambah dompet dulu.'); const f = $('#fCsv'); f.reset(); fill(f.elements.wallet, walletOpts()); open('#mCsv'); };
  $('#fCsv').onsubmit = e => {
    e.preventDefault(); const f = e.target.elements, file = f.file.files[0]; if (!file) return toast('Pilih file CSV dulu.');
    const w = wById(f.wallet.value), rd = new FileReader();
    rd.onload = () => { try { const msg = importCsv(String(rd.result), w, f.adjust.checked); $('#mCsv').close(); toast(msg); } catch (x) { toast('Gagal membaca CSV: ' + x.message); } };
    rd.readAsText(file);
  };

  /* ----- sambungkan ke render bawaan ----- */
  const baseRender = render;
  render = function () { ensure(); runRec(); baseRender(); renderAll(); };
  if (D) render();
  return { importCsv, parseNum, parseDate, dueSoon: () => D.rec.filter(r => !r.auto && dayDiff(dueDate(r)) <= 7).map(r => ({ r, d: dayDiff(dueDate(r)) })) };
})();
