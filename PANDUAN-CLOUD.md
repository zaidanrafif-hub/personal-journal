# Tutorial Supabase: data sama di HP dan laptop

Perkiraan waktu: 15 menit. Semua gratis.

## 0. Cadangkan data lama (jika ada)
Di aplikasi yang sekarang: bagian **Cadangan** -> **Simpan cadangan (.json)**. Simpan filenya.

## 1. Buat akun dan proyek
1. Buka https://supabase.com -> **Start your project** -> daftar (GitHub atau email).
2. **New project**. Isi: nama (mis. `personal-journal`), **Database password** (catat), **Region** terdekat (mis. Southeast Asia / Singapore). Klik **Create new project**. Tunggu 1-2 menit sampai selesai.

## 2. Buat tabel (SQL)
1. Menu kiri: **SQL Editor** -> **New query**.
2. Tempel seluruh isi `cloud/supabase.sql` -> **Run**. Harus muncul "Success. No rows returned".
3. Cek: menu **Table Editor** -> tabel `journal_data` ada.

## 3. Matikan konfirmasi email
**Authentication -> Sign In / Providers -> Email** -> matikan **Confirm email** -> **Save**.
(Jika dibiarkan aktif, kamu harus klik tautan di email sebelum bisa masuk.)

## 4. Ambil dua nilai
1. **Project Settings (ikon roda gigi) -> API Keys**: salin **Project URL**-nya (bentuk `https://xxxx.supabase.co`; ada juga di **Settings -> API / Data API**).
2. Di tab **Publishable and secret API keys**: salin **Publishable key** (`sb_publishable_...`). Jika tombol **Create new API Keys** muncul, klik dulu.
   Proyek lama boleh memakai kunci **anon** dari tab **Legacy API Keys** (diawali `eyJ`).
3. JANGAN pernah memakai **secret** atau **service_role**.

## 5. Pasang di aplikasi
Isi `config.js`:

    window.PJ_CONFIG = {
      url: 'https://xxxx.supabase.co',
      anonKey: 'sb_publishable_xxxxxxxx'
    };

Simpan, lalu: `git add .` -> `git commit -m "aktifkan cloud"` -> `git push`. Tunggu Vercel **Ready**.

## 6. Pakai
1. Buka web-nya, Ctrl + Shift + R dua kali. Layar masuk bertuliskan **Email**.
2. **Buat akun** (email + sandi min. 6 karakter).
3. Data lama: bagian **Cadangan** -> **Pulihkan dari cadangan** -> pilih file dari langkah 0.
4. Bagian **Sinkronisasi** harus menampilkan "Tersinkron" + jam.
5. Cek di Supabase: **Authentication -> Users** (emailmu ada) dan **Table Editor -> journal_data** (satu baris, kolom `rev` bertambah tiap perubahan).

## 7. Di HP
Buka alamat yang sama, masuk dengan email yang sama. Android: menu titik tiga -> **Install app**. iPhone (Safari): Bagikan -> **Add to Home Screen**.

## Masalah umum
| Tulisan di kartu Sinkronisasi / layar masuk | Penyebab dan solusi |
|---|---|
| Gagal terhubung ke cloud (kode 401) / Invalid JWT | Kunci salah tempel, atau memakai secret. Pakai **Publishable key** utuh. |
| Gagal terhubung ke cloud (kode 404) | `url` salah. Harus persis Project URL, tanpa garis miring di akhir. |
| Gagal mengirim (kirim gagal 401/403) / permission denied | SQL belum dijalankan penuh. Jalankan ulang `cloud/supabase.sql` (aman diulang). |
| Email belum dikonfirmasi | **Confirm email** masih aktif. Matikan (langkah 3), atau konfirmasi lewat email. |
| Email sudah terdaftar | Pakai **Masuk**, bukan Buat akun. |
| Menunggu koneksi | Tidak ada internet. Perubahan terkirim sendiri saat online. |
| Proyek tidak menjawab | Proyek gratis dijeda jika lama tidak dipakai. Buka dashboard dan klik **Restore**. |

## Catatan keamanan
- Data per pengguna dikunci oleh aturan RLS di database. Kunci publishable memang boleh publik.
- Data tidak dienkripsi ujung-ke-ujung: pemilik proyek Supabase bisa membacanya.
- Setelah keluar, salinan data tetap ada di browser perangkat itu. Jangan dipakai di perangkat umum.
