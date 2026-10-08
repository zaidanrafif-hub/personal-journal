'use strict';
/* Lapisan penyimpanan: nomor versi skema, migrasi aman, dan cadangan otomatis.
   Aturan: data pengguna TIDAK PERNAH ditimpa jika migrasi gagal atau datanya lebih baru. */
const Store = (() => {
  const SCHEMA = 1;
  const uid = () => Math.random().toString(36).slice(2, 9);
  const dayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const DKEY = u => 'pj_data_' + u;
  const BP = u => 'pj_bak:' + encodeURIComponent(u) + ':';
  let locked = false, lastStamp = 0;
  const nextStamp = () => { lastStamp = Math.max(Date.now(), lastStamp + 1); return String(lastStamp).padStart(14, '0'); };
  const api = { onWarn: m => { try { alert(m); } catch (e) { /* abaikan */ } } };

  const defaults = () => ({
    v: SCHEMA,
    wallets: [
      { id: uid(), name: 'Kas', type: 'kartal', balance: 0 },
      { id: uid(), name: 'Bank Digital', type: 'giral', balance: 0 },
      { id: uid(), name: 'Jago Syariah', type: 'giral', balance: 0 },
      { id: uid(), name: 'GoPay', type: 'giral', balance: 0 },
      { id: uid(), name: 'ShopeePay', type: 'giral', balance: 0 }],
    tx: [], budgets: {}, inv: { dana: 0, emas: 0, obligasi: 0, saham: 0 },
    goals: [], rec: [], journal: [], gold: 0, imported: {}
  });

  /* Daftar migrasi: kunci = versi asal, fungsi mengubah data ke versi berikutnya.
     Tahap berikutnya (ledger) menambahkan migrasi 1 -> 2 di sini. */
  const MIGRATIONS = {
    0: d => { d.goals ||= []; d.rec ||= []; d.journal ||= []; d.gold ||= 0; d.imported ||= {}; return d; }
  };

  /* ----- cadangan otomatis ----- */
  function keys(u) {
    const p = BP(u), out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) out.push(k); }
    return out;
  }
  function prune(u, kind, keep) {
    const p = BP(u);
    keys(u).filter(k => k.slice(p.length).startsWith(kind + ':')).sort().reverse().slice(keep).forEach(k => localStorage.removeItem(k));
  }
  function snapshot(u, kind, raw) {
    raw = raw ?? localStorage.getItem(DKEY(u)); if (!raw) return null;
    const key = BP(u) + kind + ':' + (kind === 'daily' ? dayStr() : nextStamp());
    if (kind === 'daily' && localStorage.getItem(key)) return key; // cadangan harian pertama dipertahankan
    try { localStorage.setItem(key, raw); }
    catch (e) { prune(u, kind, 0); try { localStorage.setItem(key, raw); } catch (e2) { return null; } }
    prune(u, kind, 3);
    return key;
  }
  function list(u) {
    const p = BP(u);
    return keys(u).map(k => {
      const rest = k.slice(p.length), i = rest.indexOf(':'), kind = rest.slice(0, i), stamp = rest.slice(i + 1);
      const at = kind === 'daily' ? stamp : new Date(+stamp).toLocaleString('id-ID');
      const label = (kind === 'daily' ? 'Harian ' : kind === 'pre' ? 'Sebelum pembaruan data ' : 'Sebelum pemulihan ') + at;
      return { key: k, kind, stamp, label, kb: Math.max(1, Math.round((localStorage.getItem(k) || '').length / 1024)) };
    }).sort((a, b) => (b.stamp > a.stamp ? 1 : b.stamp < a.stamp ? -1 : 0));
  }

  /* ----- migrasi ----- */
  function migrate(d, u, backupRaw) {
    let v = d.v ?? 0;
    if (v > SCHEMA) throw new Error('Data berasal dari versi aplikasi yang lebih baru (v' + v + ').');
    if (v < SCHEMA && backupRaw) snapshot(u, 'pre', backupRaw);
    while (v < SCHEMA) {
      if (!MIGRATIONS[v]) throw new Error('Migrasi v' + v + ' tidak tersedia.');
      d = MIGRATIONS[v](d); v++; d.v = v;
    }
    return d;
  }

  /* ----- baca dan tulis ----- */
  function load(u) {
    locked = false;
    const raw = localStorage.getItem(DKEY(u));
    if (!raw) return defaults();
    let d;
    try {
      d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !Array.isArray(d.wallets) || !Array.isArray(d.tx)) throw new Error('bentuk data tidak dikenal');
    } catch (e) {
      localStorage.setItem('pj_corrupt_' + encodeURIComponent(u) + '_' + Date.now(), raw);
      api.onWarn('Data lama tidak terbaca (' + e.message + '). Salinannya diamankan dan aplikasi dimulai dari data kosong. Kamu bisa memulihkan dari Cadangan.');
      return defaults();
    }
    snapshot(u, 'daily', raw);
    try {
      const before = d.v ?? 0;
      d = migrate(d, u, raw);
      if ((d.v ?? 0) !== before) localStorage.setItem(DKEY(u), JSON.stringify(d));
    } catch (e) {
      locked = true;
      api.onWarn('Data tidak bisa dibuka: ' + e.message + ' Perubahan tidak akan disimpan agar data aman.');
    }
    return d;
  }
  function save(u, d) {
    if (locked) return false;
    d.v = SCHEMA;
    try { localStorage.setItem(DKEY(u), JSON.stringify(d)); return true; }
    catch (e) { api.onWarn('Penyimpanan penuh atau diblokir browser. Perubahan terakhir mungkin tidak tersimpan. Unduh cadangan sekarang.'); return false; }
  }
  function restore(u, key) {
    const raw = localStorage.getItem(key); if (!raw) throw new Error('cadangan tidak ditemukan');
    const d = migrate(JSON.parse(raw), u, null);
    snapshot(u, 'restore');
    locked = false;
    localStorage.setItem(DKEY(u), JSON.stringify(d));
    return d;
  }

  return Object.assign(api, {
    SCHEMA, defaults, load, save, migrate, snapshot, list, restore,
    unlock() { locked = false; }, isLocked: () => locked
  });
})();
