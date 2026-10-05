# Personal Journal

Web app catatan keuangan pribadi. Statis murni (HTML + CSS + JS), tanpa build step.

## Jalankan lokal (VS Code)
Buka folder di VS Code → install ekstensi **Live Server** → klik "Go Live".
Atau: `npx serve .`

## Deploy: GitHub → Vercel
1. `git init && git add . && git commit -m "Personal Journal"`
2. Buat repo di GitHub, lalu `git remote add origin <url> && git push -u origin main`
3. Di vercel.com → **Add New Project** → import repo → **Deploy**.
   (Framework Preset: *Other*, tanpa Build Command, Output Directory dikosongkan.)

## Catatan
- Akun & data disimpan di `localStorage` browser: satu browser bisa dipakai banyak akun,
  tapi data tidak ikut pindah perangkat. Untuk sinkron antar perangkat, ganti fungsi
  `load()` / `save()` di `app.js` dengan database (mis. Supabase / Vercel KV).
- Ganti font: ubah link Google Fonts di `index.html` dan `--display` di `style.css`.
- Warna ada di `:root` pada `style.css`.
