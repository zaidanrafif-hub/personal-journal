# Admin Dashboard Personal Journal — Panduan

Alamat admin: `https://personal-journal-azure.vercel.app/admin` (setelah dipasang).

## 1. Apa yang ada (dan apa yang BELUM terbukti)

| Bagian | Status |
|---|---|
| Database admin (peran, izin, RLS, audit, 2FA di database) | Dibuat dan diuji di Postgres 16 asli dengan **simulasi** Supabase: 238 tes lulus |
| Halaman `/admin` (login, 2FA, 18 modul) | Dibuat dan diuji di browser Chromium memakai **gateway tiruan** Supabase: 156 tes lulus |
| Integrasi ke aplikasi pengguna (`platform.js`, `sw.js`, `vercel.json`) | Dibuat dan diuji (regresi 16 tes penyimpanan lama + alur login/sinkron/daftar lulus) |
| Supabase milikmu (asli) | **Belum diuji**. Kamu yang menjalankan SQL dan mencoba. |
| TOTP asli (aplikasi autentikator) | **Belum diuji**. Di tes, kode palsu 123456 dipakai. |
| Kebijakan Supabase Storage (unggah gambar) | **Belum diuji** di Storage asli |
| Header Vercel (CSP, noindex) | Diuji lewat tiruan lokal; belum dilihat di Vercel asli |
| Deploy / push ke GitHub | **Belum dilakukan** |

Aturan privasi yang ditegakkan database: admin **tidak bisa** membaca isi `journal_data` (jurnal, transaksi, nominal). Admin hanya melihat metadata (email, tanggal, status, jumlah revisi, ukuran data) dan angka agregat.

## 2. Pemasangan (urut, jangan loncat)

### A. Ambil kode ke project (VS Code)
1. Buka folder `personal-journal` di VS Code (`File → Open Folder`).
2. Buat cabang baru, jangan kerja di `main`: terminal VS Code → `git checkout -b admin-dashboard`
3. Ekstrak `personal-journal-admin.zip` ke folder project (timpa bila ditanya). Zip hanya berisi file baru + 4 file yang diubah: `index.html` (1 baris: `platform.js`), `sw.js`, `vercel.json`, `.vercelignore`.
4. Periksa perubahan: `git status` lalu `git diff` (file lama yang berubah hanya 4 itu).

### B. Jalankan SQL di Supabase (SQL Editor → New query, satu per satu, urut)
1. `supabase/migrations/001_admin_foundation.sql`
2. `supabase/migrations/002_storage_media.sql`
3. `supabase/migrations/004_platform.sql`
4. (Opsional) `supabase/migrations/003_disable_enforcement.sql` — membuat akun berstatus *Nonaktif* tidak bisa membaca/menulis data cloud. **Ini mengubah 4 kebijakan `journal_data`.** Tanpa file ini status Nonaktif hanya penanda. Baca dulu komentar di dalam file.
5. Buka `900_first_super_admin.sql`, ganti `GANTI_DENGAN_EMAILMU` dengan emailmu **yang sudah terdaftar** di aplikasi, lalu Run. Jangan commit file yang sudah diisi emailmu bila repo publik.

Semua file aman diulang dan tidak menghapus data. Tabel `journal_data` tidak disentuh (kecuali 003 yang opsional).

### C. Aktifkan 2FA di Supabase
Dashboard → Authentication → **Sign In / Providers** → bagian **Multi-Factor** → aktifkan **TOTP** (Enroll dan Verify). Tanpa ini halaman admin menampilkan "Tidak bisa menyiapkan 2FA".

### D. Deploy
`git add . && git commit -m "Admin dashboard"` → `git push -u origin admin-dashboard`. Vercel membuat alamat **Preview** untuk cabang itu. Coba di sana dulu. Jika sudah yakin, gabungkan ke `main` lewat Pull Request.

### E. Percobaan pertama
1. Buka `/admin` di Preview → masuk dengan emailmu → pindai QR dengan Google Authenticator/Authy → masuk.
2. Cek: menu Pengguna menampilkan daftar akun tanpa isi data; Audit Trail mencatat loginmu.
3. Beri peran ke orang lain lewat **Peran & Izin** (orang itu juga wajib memasang 2FA).

## 3. Cara kerja singkat tiap modul
- **Ringkasan / Analitik**: angka agregat.
- **Pengguna**: daftar akun (metadata), nonaktifkan/aktifkan, ekspor CSV/XLSX.
- **Peran & Izin**: Super Admin, Editor, Customer Service. Izin sensitif hanya Super Admin dan tidak bisa dibagikan.
- **Branding, Konten, Media, Komunikasi**: nama/warna/font, halaman teks, gambar, balasan pesan + pemberitahuan + banner.
- **Pusat Keamanan, Audit Trail**: status 2FA, percobaan masuk ditolak, log tindakan (hanya bisa ditambah).
- **Backup & Restore**: cadangan konfigurasi + halaman + metadata. **Bukan** backup penuh database dan tidak berisi data jurnal.
- **Impor / Ekspor**: CSV dan XLSX untuk halaman CMS dan pengguna (metadata). Impor dicek dulu; galat dilaporkan per baris.
- **Maintenance**: layar perawatan untuk pengguna. Ini penutup tampilan, bukan kunci database.
- **Modul, Feature Builder, Aplikasi & Pembaruan**: daftar modul, pencatat fitur, catatan rilis (konfigurasi / konten / kode).
- **Editor Tampilan**: tema, beranda, menu. Alur: ubah → pratinjau langsung → simpan draft → bandingkan → terbitkan → riwayat/rollback. Hanya Super Admin yang menerbitkan.

## 4. Batas yang jujur
- Status **Nonaktif** hanya memblokir data cloud bila migrasi 003 dipasang; login Supabase itu sendiri tidak diblokir dari admin.
- Batas percobaan login/pemblokiran IP diatur Supabase (Authentication → Rate Limits).
- Paket Supabase Free tidak punya backup harian otomatis. Cek Database → Backups.
- Admin **tidak** mengubah atau men-deploy kode. Pembaruan kode tetap lewat GitHub → Vercel; admin hanya mencatat rilis.
- Modul rencana (Notes, AI, World, Calendar, Growth, Business, Knowledge) hanya terdaftar; **database menolak** mengaktifkannya sebelum kodenya ada.
- Pratinjau Editor Tampilan memakai data contoh, bukan data pengguna.

## 5. Menambah fitur baru di masa depan
Contoh: modul "Catatan" (`notes`) yang sudah terdaftar sebagai rencana.
1. **Kode dulu.** Tambahkan bagian di `index.html` (`<section id="notes" class="card" hidden>`), logikanya di file JS baru (mis. `notes.js`) yang membungkus `render` seperti `fitur.js`, dan tautan menu `<a href="#notes">`. Simpan data lewat `Store`/`D` agar ikut sinkron.
2. Daftarkan file baru di `index.html` (`<script>`) dan di `FILES` di `sw.js`; naikkan nama cache (`pj-t5`, dst.).
3. **Migrasi SQL baru** `supabase/migrations/005_notes_module.sql`: `update public.app_modules set implemented = true, enabled = true where id = 'notes';` (hanya migrasi yang boleh mengubah `implemented`; admin tidak bisa).
4. Tambahkan uji di `tests/admin/` mengikuti pola yang ada, jalankan `tests/admin/run-all.sh`.
5. Push cabang baru → cek Preview → merge. Setelah itu modul muncul di **Modul** dan bisa diatur menunya di **Editor Tampilan**.
6. Catat rilis jenis *Kode* di **Aplikasi & Pembaruan**.

Fitur yang butuh server (AI, berita) butuh backend/Edge Function dan kunci rahasia di sisi server. **Jangan** menaruh kunci rahasia di frontend.

## 6. Menjalankan tes sendiri (opsional)
Butuh Node 20+, Playwright + Chromium, dan PostgreSQL 16 lokal (bukan Supabase). Lihat `tests/admin/run-all.sh`. Hasil tersimpan di `tests/results/*.json` dan ringkasannya di `tests/results/LAPORAN-UJI.md`.
