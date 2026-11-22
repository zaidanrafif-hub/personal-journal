const C = 'pj-t4', FILES = ['./', 'index.html', 'style.css', 'app.js', 'store.js', 'config.js', 'cloud.js', 'keamanan.js', 'fitur.js', 'home.js', 'profil.js', 'platform.js', 'manifest.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // jangan menyentuh permintaan ke Supabase atau font
  if (u.pathname === '/admin' || u.pathname.startsWith('/admin/') || u.pathname === '/admin.html') return;   // halaman admin tidak pernah disimpan di cache
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
