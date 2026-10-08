/* Pengujian lapisan penyimpanan. Memakai akun uji "__uji__" saja dan tidak menyentuh data lain. */
(function () {
  const out = [], U = '__uji__';
  const check = (nama, ok, info) => out.push({ nama, ok: !!ok, info: info || '' });
  const wipe = () => { Object.keys(localStorage).filter(k => k.includes(U) || k.includes(encodeURIComponent(U))).forEach(k => localStorage.removeItem(k)); };
  const warn = []; const oldWarn = Store.onWarn; Store.onWarn = m => warn.push(m);
  const put = o => localStorage.setItem('pj_data_' + U, typeof o === 'string' ? o : JSON.stringify(o));
  const get = () => JSON.parse(localStorage.getItem('pj_data_' + U));
  const baks = k => Store.list(U).filter(b => b.kind === k).length;
  try {
    wipe();
    // 1. pengguna baru
    let d = Store.load(U); check('pengguna baru mendapat data bawaan v' + Store.SCHEMA, d.v === Store.SCHEMA && d.wallets.length === 5 && Array.isArray(d.goals));

    // 2. data lama tanpa nomor versi dimigrasi + dicadangkan dulu
    wipe(); put({ wallets: [{ id: 'a', name: 'Kas', type: 'kartal', balance: 100 }], tx: [{ id: 't', amount: 5 }], budgets: {}, inv: { dana: 1, emas: 0, obligasi: 0, saham: 0 } });
    d = Store.load(U);
    check('data lama dimigrasi ke v' + Store.SCHEMA, d.v === Store.SCHEMA && Array.isArray(d.rec) && Array.isArray(d.journal) && d.gold === 0);
    check('isi data lama tidak berubah', d.wallets[0].balance === 100 && d.tx.length === 1 && d.inv.dana === 1);
    check('cadangan "sebelum pembaruan" dibuat', baks('pre') === 1);
    check('hasil migrasi tersimpan', get().v === Store.SCHEMA);
    const pre = Store.list(U).find(b => b.kind === 'pre');
    check('cadangan lama masih berformat asli (tanpa versi)', JSON.parse(localStorage.getItem(pre.key)).v === undefined);

    // 3. data versi terbaru tidak migrasi ulang
    Store.load(U); check('data sudah v' + Store.SCHEMA + ' tidak membuat cadangan "pre" baru', baks('pre') === 1);

    // 4. cadangan harian hanya satu per hari
    check('cadangan harian ada tepat satu hari ini', baks('daily') === 1);

    // 5. batas 3 cadangan per jenis
    for (let i = 0; i < 6; i++) { Store.snapshot(U, 'pre', JSON.stringify({ wallets: [], tx: [], i })); }
    check('cadangan "pre" dibatasi maksimal 3', baks('pre') === 3);

    // 6. JSON rusak diamankan, tidak hilang
    wipe(); put('{ini bukan json'); warn.length = 0; d = Store.load(U);
    check('data rusak: aplikasi tetap jalan dengan data bawaan', d.wallets.length === 5 && warn.length === 1);
    check('data rusak: salinan mentah diamankan', Object.keys(localStorage).some(k => k.startsWith('pj_corrupt_' + encodeURIComponent(U))));

    // 7. data dari versi lebih baru: dikunci, tidak ditimpa
    wipe(); put({ v: 99, wallets: [], tx: [], misterius: true }); warn.length = 0; d = Store.load(U);
    const okSave = Store.save(U, d);
    check('versi lebih baru: penyimpanan dikunci', Store.isLocked() && okSave === false && get().misterius === true && warn.length === 1);

    // 8. pemulihan dari cadangan
    wipe(); put({ wallets: [{ id: 'a', name: 'Kas', type: 'kartal', balance: 777 }], tx: [], budgets: {}, inv: {} });
    const key = Store.snapshot(U, 'daily'); put({ wallets: [], tx: [], v: 1 });
    d = Store.restore(U, key);
    check('pemulihan mengembalikan data dan menyimpan salinan sebelumnya', d.wallets[0].balance === 777 && get().wallets[0].balance === 777 && baks('restore') === 1);

    // 9. tulis-baca
    d.tx.push({ id: 'x' }); Store.save(U, d); check('save lalu load konsisten', Store.load(U).tx.length === 1);
  } catch (e) { check('pengujian berjalan tanpa error', false, e.message); }
  finally { wipe(); Store.onWarn = oldWarn; }
  window.__hasil = out;
})();
