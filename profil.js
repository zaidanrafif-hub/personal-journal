'use strict';
/* Kartu Akun dan Sinkronisasi: nama tampilan, status cloud, keluar. */
(() => {
  const prof = () => (D.profile ||= { name: '' });
  function renderProfile() {
    $('#profAcc').textContent = user + (Cloud.enabled ? '' : ' (akun lokal)');
    const f = $('#fProf').elements; if (document.activeElement !== f.name) f.name.value = prof().name || '';
    $('#syncState').textContent = Cloud.enabled ? Cloud.status() : 'Mode lokal: data hanya tersimpan di perangkat ini.';
    $('#syncHelp').hidden = Cloud.enabled; $('#syncNow').hidden = !Cloud.enabled;
  }
  $('#fProf').onsubmit = e => { e.preventDefault(); prof().name = e.target.elements.name.value.trim().slice(0, 30); save(); render(); toast('Nama disimpan'); };
  $('#profSec').onclick = () => $('#secBtn').click();
  $('#profOut').onclick = () => $('#logout').click();
  $('#syncNow').onclick = async () => { await Cloud.syncNow(); toast(Cloud.status()); };
  Cloud.onStatus = () => { if (typeof D !== 'undefined' && D) renderProfile(); };
  if (Cloud.enabled) { const ft = document.querySelector('.foot'); if (ft) ft.textContent = 'Data tersinkron ke akun cloud-mu.'; }

  const baseRender = render;
  render = function () { baseRender(); renderProfile(); };
  if (D) render();
})();
