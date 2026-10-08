'use strict';
/* Beranda (dashboard): ringkasan terpisah per konteks, ikon mata global, notifikasi, snapshot. */
const Home = (() => {
  const sum = a => a.reduce((x, y) => x + y, 0);
  const pct = (a, b) => b > 0 ? a / b * 100 : 0;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const prevM = m => { let [y, mo] = m.split('-').map(Number); mo--; if (mo < 1) { mo = 12; y--; } return y + '-' + pad(mo); };
  const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const status = p => p >= 100 ? ['bad', 'Melewati batas'] : p >= 80 ? ['warn', 'Waspada'] : ['ok', 'Aman'];
  let period = '30D';

  function state() {
    const t = today(), m = monthOf(t), mt = D.tx.filter(x => monthOf(x.date) === m), byCat = {};
    mt.filter(x => x.type === 'out').forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + x.amount);
    return { t, m, byCat, inc: sum(mt.filter(x => x.type === 'in').map(x => x.amount)), out: sum(mt.filter(x => x.type === 'out').map(x => x.amount)) };
  }

  function alerts() {
    const s = state(), a = [];
    Object.entries(D.budgets).forEach(([c, l]) => {
      const p = pct(s.byCat[c] || 0, l);
      if (p >= 100) a.push(['bad', `Anggaran ${c} sudah melewati batas (${Math.round(p)}%).`]);
      else if (p >= 80) a.push(['warn', `Anggaran ${c} sudah mencapai ${Math.round(p)}%.`]);
    });
    Fit.dueSoon().forEach(({ r, d }) => a.push([d < 0 ? 'bad' : 'warn',
      `${r.name} (${rp(r.amount)}) ${d < 0 ? 'terlambat ' + (-d) + ' hari' : d === 0 ? 'jatuh tempo hari ini' : 'jatuh tempo ' + d + ' hari lagi'}.`]));
    D.goals.forEach(g => { const p = pct(g.saved, g.target);
      if (p >= 100) a.push(['good', `Target ${g.name} tercapai.`]); else if (p >= 70) a.push(['good', `Target ${g.name} sudah ${Math.round(p)}%.`]); });
    return a;
  }

  function buckets(p) {
    const now = new Date(today() + 'T00:00'), out = [];
    if (p === '6M' || p === '1Y') {
      for (let i = (p === '6M' ? 6 : 12) - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1), key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        out.push({ label: d.toLocaleDateString('id-ID', { month: 'short' }), test: x => monthOf(x.date) === key });
      }
    } else {
      const [days, step] = p === '7D' ? [7, 1] : p === '30D' ? [30, 5] : [90, 15];
      for (let b = days / step - 1; b >= 0; b--) {
        const end = new Date(now); end.setDate(end.getDate() - b * step);
        const st = new Date(end); st.setDate(st.getDate() - (step - 1));
        const s = iso(st), e = iso(end);
        out.push({ label: end.getDate() + '/' + (end.getMonth() + 1), test: x => x.date >= s && x.date <= e });
      }
    }
    return out;
  }

  function overview() {
    document.querySelectorAll('#ovTabs button').forEach(b => b.classList.toggle('on', b.dataset.per === period));
    const bk = buckets(period).map(b => ({ label: b.label,
      i: sum(D.tx.filter(x => x.type === 'in' && b.test(x)).map(x => x.amount)), o: sum(D.tx.filter(x => x.type === 'out' && b.test(x)).map(x => x.amount)) }));
    const mx = Math.max(1, ...bk.flatMap(x => [x.i, x.o])), n = bk.length, gw = 580 / n, bw = Math.min(26, gw / 2.6);
    const bars = bk.map((x, k) => {
      const cx = 10 + gw * k + gw / 2, h1 = x.i / mx * 140, h2 = x.o / mx * 140;
      return `<rect class="b1" x="${cx - bw - 1}" y="${160 - h1}" width="${bw}" height="${h1}" rx="4" style="--d:${k * 50}ms"><title>Masuk ${rp(x.i)}</title></rect>
        <rect class="b2" x="${cx + 1}" y="${160 - h2}" width="${bw}" height="${h2}" rx="4" style="--d:${k * 50 + 30}ms"><title>Keluar ${rp(x.o)}</title></rect>
        <text x="${cx}" y="180" text-anchor="middle" font-size="11" fill="var(--muted)">${x.label}</text>`;
    }).join('');
    const ti = sum(bk.map(x => x.i)), to = sum(bk.map(x => x.o));
    $('#ovChart').innerHTML = `<svg viewBox="0 0 600 190" class="trend" role="img" aria-label="Pemasukan dan pengeluaran periode ${period}"><line x1="6" x2="594" y1="160" y2="160" stroke="var(--line)"/>${bars}</svg>
      <div class="ovsum"><span><i class="dot g"></i> Masuk <b>${rp(ti)}</b></span><span><i class="dot b"></i> Keluar <b>${rp(to)}</b></span><span>Selisih <b>${ti - to < 0 ? '−' : '+'}${rp(Math.abs(ti - to))}</b></span></div>`;
  }

  function draw() {
    const s = state();
    const h = new Date().getHours();
    $('#greet').textContent = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
    $('#hName').textContent = user;
    const al = alerts(), nb = $('#notifCount'); nb.textContent = al.length; nb.hidden = !al.length;

    // ringkasan keuangan: setiap angka berdiri sendiri
    $('#sumIn').textContent = '+' + rp(s.inc); $('#sumOut').textContent = '−' + rp(s.out);
    $('#sumSav').textContent = rp(sum(D.goals.map(g => g.saved)) + D.inv.dana);
    $('#invTotal').textContent = rp(D.inv.emas + D.inv.obligasi + D.inv.saham);

    // transaksi terbaru
    const rec = D.tx.slice().reverse().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $('#recent').innerHTML = rec.length ? rec.map(t => {
      const w = wById(t.wallet);
      return `<div class="trow"><span class="tic ${t.type}">${ic(t.type === 'in' ? 'down-left' : 'up-right')}</span>
        <div class="tmid"><div>${esc(t.note || t.cat)}</div><div class="muted">${esc(t.cat)} · ${esc(w ? w.name : t.walletName || '-')} · ${dateFmt(t.date)}</div></div>
        <div class="tamt ${t.type}">${t.type === 'in' ? '+' : '−'}${rp(t.amount)}</div></div>`;
    }).join('') : '<p class="empty">Belum ada transaksi. Mulai dengan tombol Pemasukan atau Pengeluaran.</p>';

    overview();

    // snapshot anggaran
    const bs = Object.entries(D.budgets);
    if (!bs.length) $('#bsnap').innerHTML = '<p class="empty">Belum ada batas anggaran.</p>';
    else {
      const lim = sum(bs.map(b => b[1])), used = sum(bs.map(([c]) => s.byCat[c] || 0)), tp = pct(used, lim);
      const top = bs.map(([c, l]) => [c, pct(s.byCat[c] || 0, l)]).sort((a, b) => b[1] - a[1]).slice(0, 2);
      $('#bsnap').innerHTML = `<div class="bud-t"><span>Terpakai</span><span>${rp(used)} / ${rp(lim)}</span></div>
        <div class="bar"><i class="${status(tp)[0] === 'ok' ? '' : status(tp)[0]}" style="width:${Math.min(100, tp)}%"></i></div><p class="muted" style="margin:0 0 10px">${tp.toFixed(1).replace('.', ',')}% dari total anggaran</p>` +
        top.map(([c, p]) => `<div class="bud-t sm"><span>${esc(c)}</span><span>${Math.round(p)}% · <span class="st ${status(p)[0]}">${status(p)[1]}</span></span></div>`).join('');
    }

    // snapshot target
    const gs = D.goals.slice().sort((a, b) => (a.saved >= a.target) - (b.saved >= b.target) || pct(b.saved, b.target) - pct(a.saved, a.target)).slice(0, 2);
    $('#gsnap').innerHTML = gs.length ? gs.map(g => { const p = pct(g.saved, g.target);
      return `<div class="bud"><div class="bud-t"><span>${esc(g.name)}</span><span>${rp(g.saved)} / ${rp(g.target)}</span></div>
        <div class="bar"><i style="width:${Math.min(100, p)}%"></i></div><span class="muted">${Math.round(p)}%</span></div>`; }).join('') : '<p class="empty">Belum ada target tabungan.</p>';

    // insight ringkas
    const L = [], pOut = sum(D.tx.filter(x => monthOf(x.date) === prevM(s.m) && x.type === 'out').map(x => x.amount));
    if (pOut > 0 && s.out > 0) { const c = (s.out - pOut) / pOut * 100; L.push(`Pengeluaran bulan ini ${Math.abs(Math.round(c))}% ${c >= 0 ? 'lebih tinggi' : 'lebih rendah'} dibanding bulan lalu.`); }
    const topC = Object.entries(s.byCat).sort((a, b) => b[1] - a[1])[0];
    if (topC) L.push(`${topC[0]} adalah pengeluaran terbesar bulan ini.`);
    const bad = al.find(a => a[0] !== 'good');
    if (bad) L.push(bad[1]); else if (bs.length) L.push('Semua anggaran masih aman.');
    if (!L.length) L.push('Catat beberapa transaksi untuk mendapatkan insight.');
    $('#isnap').innerHTML = L.slice(0, 3).map(x => `<p>${ic('sparkles')}<span>${esc(x)}</span></p>`).join('');
  }

  /* ----- kontrol ----- */
  $('#qaIn').onclick = () => openTx('in');
  $('#qaOut').onclick = () => openTx('out');
  $('#qaTf').onclick = () => $('#addTf').click();
  $('#qaGoal').onclick = () => $('#addGoal').click();
  $('#bnPlus').onclick = () => openTx('out');
  $('#bnProfil').onclick = () => $('#secBtn').click();
  const toAnalisis = () => { $('#evaluasi').scrollIntoView({ behavior: 'smooth' }); };
  $('#aiBtn').onclick = toAnalisis; $('#askBtn').onclick = toAnalisis;
  $('#notifBtn').onclick = () => {
    const al = alerts();
    $('#notifList').innerHTML = al.length ? al.map(a => `<div class="ev ${a[0]}" style="margin-bottom:8px"><p style="margin:0">${esc(a[1])}</p></div>`).join('') : '<p class="empty">Tidak ada pemberitahuan.</p>';
    $('#mNotif').showModal();
  };
  $('#ovTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.per; overview(); });

  /* ----- sambungkan ke render ----- */
  const baseRender = render;
  render = function () { baseRender(); draw(); };
  if (D) render();
  return { draw, alerts };
})();
