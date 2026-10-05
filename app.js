'use strict';
const $ = (s, r = document) => r.querySelector(s);
const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const monthOf = d => d.slice(0, 7);
const dayName = d => new Date(d + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long' });
const monthName = m => new Date(m + '-01T00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const dateFmt = d => new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const CAT_OUT = ['Makan', 'Kopi/Kafe', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Sedekah', 'Lainnya'];
const CAT_IN = ['Gaji', 'Bonus', 'Usaha', 'Hadiah', 'Lainnya'];
const WANT = ['Kopi/Kafe', 'Hiburan', 'Belanja', 'Lainnya']; // kategori keinginan (bisa direlakan)
const INV = { dana: 'Dana darurat', emas: 'Emas', obligasi: 'Obligasi', saham: 'Saham' };
const COLORS = ['#0B3D91', '#14935B', '#FFC93C', '#1E63D6', '#3FD18F', '#E8A800', '#6FA3FF', '#0E6B43', '#9DB7E8'];

/* ---------- penyimpanan ---------- */
let user = null, D = null;
const users = () => JSON.parse(localStorage.getItem('pj_users') || '{}');
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const load = () => JSON.parse(localStorage.getItem('pj_data_' + user) || 'null') || {
  wallets: [
    { id: uid(), name: 'Kas', type: 'kartal', balance: 0 },
    { id: uid(), name: 'Bank Digital', type: 'giral', balance: 0 },
    { id: uid(), name: 'Jago Syariah', type: 'giral', balance: 0 },
    { id: uid(), name: 'GoPay', type: 'giral', balance: 0 },
    { id: uid(), name: 'ShopeePay', type: 'giral', balance: 0 }],
  tx: [], budgets: {}, inv: { dana: 0, emas: 0, obligasi: 0, saham: 0 }
};
const save = () => localStorage.setItem('pj_data_' + user, JSON.stringify(D));
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };

/* ---------- login ---------- */
let mode = 'login';
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
  $('#authBtn').textContent = mode === 'login' ? 'Masuk' : 'Buat akun & masuk';
  $('#authErr').textContent = '';
});
async function auth() {
  const u = $('#u').value.trim().toLowerCase(), p = $('#p').value, all = users();
  const err = m => $('#authErr').textContent = m;
  if (!u || p.length < 4) return err('Isi nama akun dan kata sandi (min. 4 karakter).');
  const h = await sha(u + ':' + p);
  if (mode === 'register') {
    if (all[u]) return err('Nama akun sudah dipakai. Pilih nama lain atau masuk.');
    all[u] = h; localStorage.setItem('pj_users', JSON.stringify(all));
  } else if (all[u] !== h) return err('Nama akun atau kata sandi salah.');
  sessionStorage.setItem('pj_session', u); start(u);
}
$('#authBtn').onclick = auth;
['#u', '#p'].forEach(s => $(s).addEventListener('keydown', e => e.key === 'Enter' && auth()));
$('#logout').onclick = () => { sessionStorage.removeItem('pj_session'); location.reload(); };

function start(u) {
  user = u; D = load();
  $('#auth').hidden = true; $('#app').hidden = false; $('#whoName').textContent = u;
  fillMonths(); render();
}

/* ---------- helper data ---------- */
const wById = id => D.wallets.find(w => w.id === id);
const curMonth = () => $('#filterMonth').value || monthOf(today());
function fillMonths() {
  const ms = new Set([monthOf(today()), ...D.tx.map(t => monthOf(t.date))]);
  const sel = $('#filterMonth'), keep = sel.value;
  sel.innerHTML = [...ms].sort().reverse().map(m => `<option value="${m}">${monthName(m)}</option>`).join('');
  if (keep && ms.has(keep)) sel.value = keep;
}
$('#filterMonth').onchange = render;

/* ---------- render ---------- */
function render() {
  const m = curMonth();
  const kartal = D.wallets.filter(w => w.type === 'kartal').reduce((a, w) => a + w.balance, 0);
  const giral = D.wallets.filter(w => w.type === 'giral').reduce((a, w) => a + w.balance, 0);
  const inv = Object.values(D.inv).reduce((a, b) => a + b, 0);
  $('#total').textContent = rp(kartal + giral);
  $('#kartal').textContent = rp(kartal); $('#giral').textContent = rp(giral); $('#invTotal').textContent = rp(inv);

  $('#wallets').innerHTML = D.wallets.map(w => `<div class="wallet ${w.type}"><button class="x" data-del-w="${w.id}" aria-label="Hapus ${esc(w.name)}">×</button>
    <small>${esc(w.name)} · ${w.type === 'kartal' ? 'Kartal' : 'Giral'}</small><b>${rp(w.balance)}</b></div>`).join('') || '<p class="empty">Belum ada dompet.</p>';

  const mTx = D.tx.filter(t => monthOf(t.date) === m && t.type === 'out');
  const byCat = {}; mTx.forEach(t => byCat[t.cat] = (byCat[t.cat] || 0) + t.amount);

  // anggaran
  const bs = Object.entries(D.budgets);
  $('#budgets').innerHTML = bs.length ? bs.map(([c, lim]) => {
    const used = byCat[c] || 0, pct = used / lim * 100, cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
    return `<div class="bud"><div class="bud-t"><span>${esc(c)}</span><span>${rp(used)} / ${rp(lim)}</span></div>
      <div class="bar"><i class="${cls}" style="width:${Math.min(pct, 100)}%"></i></div>
      <span class="muted">${pct >= 100 ? 'Lewat ' + rp(used - lim) : 'Sisa ' + rp(lim - used)} · <a href="#" data-del-b="${esc(c)}">hapus</a></span></div>`;
  }).join('') : '<p class="empty">Belum ada batas. Contoh: Kopi/Kafe maks Rp300.000 sebulan.</p>';

  // pie
  $('#monthLbl').textContent = monthName(m);
  const ents = Object.entries(byCat).sort((a, b) => b[1] - a[1]), tot = ents.reduce((a, e) => a + e[1], 0);
  if (!tot) $('#pie').innerHTML = '<p class="empty">Belum ada pengeluaran bulan ini. Catat transaksi pertamamu.</p>';
  else {
    let ang = -Math.PI / 2, paths = '';
    ents.forEach(([c, v], i) => {
      const a2 = ang + v / tot * Math.PI * 2, col = COLORS[i % COLORS.length];
      if (ents.length === 1) paths += `<circle cx="100" cy="100" r="90" fill="${col}"/>`;
      else {
        const [x1, y1, x2, y2] = [100 + 90 * Math.cos(ang), 100 + 90 * Math.sin(ang), 100 + 90 * Math.cos(a2), 100 + 90 * Math.sin(a2)];
        paths += `<path d="M100 100L${x1} ${y1}A90 90 0 ${a2 - ang > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z" fill="${col}"/>`;
      }
      ang = a2;
    });
    $('#pie').innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="Pie chart pengeluaran">${paths}<circle cx="100" cy="100" r="46" fill="var(--card)"/>
      <text x="100" y="97" text-anchor="middle" font-size="11" fill="var(--muted)">Keluar</text><text x="100" y="114" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${rp(tot)}</text></svg>
      <div class="legend">${ents.map(([c, v], i) => `<div><i class="dot" style="background:${COLORS[i % COLORS.length]}"></i>${esc(c)}<b>${Math.round(v / tot * 100)}% · ${rp(v)}</b></div>`).join('')}</div>`;
  }

  // investasi
  $('#inv').innerHTML = Object.entries(INV).map(([k, n]) => `<div><small>${n}</small><b>${rp(D.inv[k])}</b></div>`).join('');

  // tabel
  const rows = D.tx.filter(t => monthOf(t.date) === m).sort((a, b) => b.date.localeCompare(a.date));
  $('#txBody').innerHTML = rows.length ? rows.map(t => {
    const w = wById(t.wallet), st = w ? w.type : t.status;
    return `<tr><td>${dateFmt(t.date)}</td><td>${dayName(t.date)}</td><td>${esc(t.cat)}${t.note ? ' · ' + esc(t.note) : ''}</td><td>${esc(w ? w.name : t.walletName || '-')}</td>
      <td class="${t.type}">${t.type === 'in' ? '+' : '−'}${rp(t.amount)}</td>
      <td><span class="badge ${st}">${st === 'kartal' ? 'Uang Kartal' : 'Uang Giral'}</span></td>
      <td><button class="x" style="position:static" data-del-t="${t.id}" aria-label="Hapus transaksi">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">Belum ada transaksi di bulan ini.</td></tr>';

  evaluate(m, byCat);
}

/* ---------- evaluasi sebab-akibat ---------- */
function evaluate(m, byCat) {
  $('#evalLbl').textContent = monthName(m);
  const tx = D.tx.filter(t => monthOf(t.date) === m);
  const inc = tx.filter(t => t.type === 'in').reduce((a, t) => a + t.amount, 0);
  const out = tx.filter(t => t.type === 'out').reduce((a, t) => a + t.amount, 0);
  const box = $('#evalBox');
  if (!tx.length) { box.innerHTML = '<p class="empty">Evaluasi muncul setelah ada transaksi di bulan ini.</p>'; return; }

  const items = [], rela = [];
  const ev = (cls, h, sebab, akibat, saran) => items.push(`<div class="ev ${cls}"><h3>${h}</h3><p><b>Sebab</b>${sebab}</p><p><b>Akibat</b>${akibat}</p><p><b>Langkah</b>${saran}</p></div>`);

  // arus kas
  const net = inc - out, rate = inc ? net / inc * 100 : 0;
  if (out > inc) ev('bad', 'Pengeluaran lebih besar dari pemasukan',
    `Bulan ini keluar ${rp(out)} sedangkan masuk ${rp(inc)}.`, `Saldo tergerus ${rp(-net)}. Jika berulang, dana darurat jadi tumpuan dan investasi terhenti.`, 'Tentukan satu kategori keinginan yang dipangkas dulu sebelum minggu depan.');
  else if (inc && rate >= 20) ev('good', 'Arus kas sehat', `Kamu menyisihkan ${Math.round(rate)}% dari pemasukan (${rp(net)}).`, 'Ruang untuk menambah investasi terbuka.', 'Pindahkan sisa ini ke investasi sebelum terpakai.');
  else if (inc) ev('warn', 'Sisa uang tipis', `Hanya ${Math.round(rate)}% pemasukan yang tersisa.`, 'Satu pengeluaran tak terduga bisa membuat bulan ini minus.', 'Targetkan menabung minimal 20% di awal bulan, bukan dari sisa.');

  // anggaran jebol
  const over = Object.entries(D.budgets).filter(([c, l]) => (byCat[c] || 0) > l);
  over.forEach(([c, l]) => { const x = byCat[c] - l;
    ev('bad', `Anggaran ${esc(c)} jebol`, `Batas ${rp(l)}, terpakai ${rp(byCat[c])}.`, `Kelebihan ${rp(x)} diambil dari jatah kategori lain atau tabungan.`, `Turunkan frekuensi ${esc(c)} atau naikkan batas dengan sadar, bukan dibiarkan.`);
    rela.push(`${esc(c)}: relakan ${rp(x)} yang sudah lewat batas, dan jangan dikejar di akhir bulan.`); });

  // dominasi kategori
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (top && out && top[1] / out > 0.35) ev('warn', `${esc(top[0])} menguasai pengeluaran`, `${Math.round(top[1] / out * 100)}% uang keluar tersedot ke sini.`, 'Kategori lain jadi tertekan dan uangmu bergantung pada satu kebiasaan.', 'Periksa apakah ini kebutuhan atau kebiasaan yang bisa diganti.');

  // kebocoran kecil
  const small = tx.filter(t => t.type === 'out' && t.amount <= 30000);
  if (small.length >= 8) { const s = small.reduce((a, t) => a + t.amount, 0);
    ev('warn', 'Kebocoran kecil', `${small.length} transaksi kecil (≤ Rp30.000) berjumlah ${rp(s)}.`, 'Jumlah kecil terasa ringan saat dibayar, tetapi total bulanannya setara pengeluaran besar.', 'Gabungkan jadi satu jatah mingguan.'); }

  // dana darurat
  const dana = D.inv.dana, avg = out || 1;
  if (dana < avg * 3) ev('warn', 'Dana darurat belum aman', `Dana darurat ${rp(dana)}, kurang dari 3× pengeluaran bulanan (${rp(avg * 3)}).`, 'Kejadian mendadak memaksa kamu menjual investasi atau berutang.', 'Prioritaskan dana darurat sebelum saham.');

  // kartal besar
  const k = D.wallets.filter(w => w.type === 'kartal').reduce((a, w) => a + w.balance, 0), g = D.wallets.filter(w => w.type === 'giral').reduce((a, w) => a + w.balance, 0);
  if (k + g > 0 && k / (k + g) > 0.5) ev('warn', 'Terlalu banyak uang tunai', `Uang kartal ${Math.round(k / (k + g) * 100)}% dari total uang cair.`, 'Uang tunai lebih mudah habis tanpa tercatat.', 'Simpan sebagian di rekening giral dan catat setiap pengambilan tunai.');

  // yang direlakan
  const wants = WANT.map(c => [c, byCat[c] || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  wants.forEach(([c, v]) => rela.push(`${esc(c)} (${rp(v)}): kurangi 30% dan kamu menghemat ${rp(v * .3)} per bulan, atau ${rp(v * .3 * 12)} per tahun.`));
  const relaHtml = rela.length ? `<div class="relakan"><h3>Yang perlu direlakan</h3><p class="muted" style="margin:0">Pilih yang paling kecil rasa kehilangannya:</p><ul>${rela.map(r => `<li>${r}</li>`).join('')}</ul></div>`
    : '<div class="relakan"><h3>Yang perlu direlakan</h3><p style="margin:0">Belum ada yang perlu dikorbankan bulan ini. Pertahankan pola ini.</p></div>';
  box.innerHTML = (items.join('') || '<div class="ev good"><h3>Semua terkendali</h3><p>Tidak ada peringatan bulan ini.</p></div>') + relaHtml;
}

/* ---------- aksi ---------- */
const open = id => $(id).showModal();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
const fill = (sel, arr) => sel.innerHTML = arr.map(a => `<option value="${a[0]}">${esc(a[1])}</option>`).join('');
const walletOpts = () => D.wallets.map(w => [w.id, `${w.name} (${rp(w.balance)})`]);
function setCats() { const t = $('#fTx').type.value; fill($('#fTx').cat, (t === 'out' ? CAT_OUT : CAT_IN).map(c => [c, c])); }
document.querySelectorAll('#fTx [name=type]').forEach(r => r.onchange = setCats);

$('#quick').onclick = () => {
  if (!D.wallets.length) return toast('Tambah dompet dulu.');
  const f = $('#fTx'); f.reset(); setCats(); fill(f.wallet, walletOpts()); f.date.value = today(); open('#mTx'); f.amount.focus();
};
$('#fTx').onsubmit = e => {
  const f = e.target, w = wById(f.wallet.value), amt = +f.amount.value, type = f.type.value;
  if (!w || amt <= 0) return;
  w.balance += type === 'in' ? amt : -amt;
  D.tx.push({ id: uid(), date: f.date.value, type, wallet: w.id, walletName: w.name, status: w.type, cat: f.cat.value, amount: amt, note: f.note.value.trim() });
  save(); fillMonths(); $('#filterMonth').value = monthOf(f.date.value); render(); toast('Transaksi tersimpan');
};
$('#addWallet').onclick = () => { $('#fWallet').reset(); open('#mWallet'); };
$('#fWallet').onsubmit = e => { const f = e.target;
  D.wallets.push({ id: uid(), name: f.name.value.trim(), type: f.type.value, balance: +f.balance.value || 0 }); save(); render(); toast('Dompet ditambahkan'); };
$('#addBudget').onclick = () => { const f = $('#fBudget'); f.reset(); fill(f.cat, CAT_OUT.map(c => [c, c])); open('#mBudget'); };
$('#fBudget').onsubmit = e => { const f = e.target; D.budgets[f.cat.value] = +f.limit.value; save(); render(); toast('Batas disimpan'); };
$('#addInv').onclick = () => { const f = $('#fInv'); f.reset(); fill(f.wallet, walletOpts()); open('#mInv'); };
$('#fInv').onsubmit = e => { const f = e.target, w = wById(f.wallet.value), a = +f.amount.value;
  if (!w || a <= 0) return;
  if (a > w.balance) { e.preventDefault(); return toast('Saldo dompet tidak cukup'); }
  w.balance -= a; D.inv[f.k.value] += a; save(); render(); toast('Dialokasikan ke ' + INV[f.k.value]); };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-del-w],[data-del-b],[data-del-t]'); if (!t) return;
  e.preventDefault();
  if (t.dataset.delW) { const w = wById(t.dataset.delW);
    if (confirm(`Hapus dompet "${w.name}"? Saldo ${rp(w.balance)} ikut hilang dari total.`)) { D.wallets = D.wallets.filter(x => x.id !== w.id); } else return; }
  if (t.dataset.delB) delete D.budgets[t.dataset.delB];
  if (t.dataset.delT) { const x = D.tx.find(y => y.id === t.dataset.delT), w = x && wById(x.wallet);
    if (!confirm('Hapus transaksi ini? Saldo dompet dikembalikan.')) return;
    if (w) w.balance += x.type === 'in' ? -x.amount : x.amount; D.tx = D.tx.filter(y => y.id !== x.id); fillMonths(); }
  save(); render();
});

const s = sessionStorage.getItem('pj_session'); if (s && users()[s]) start(s);
