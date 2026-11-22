-- ============================================================================
-- 003 - OPSIONAL: tegakkan status "nonaktif" pada data pengguna
-- Mengganti 4 kebijakan RLS di journal_data agar akun berstatus "disabled"
-- tidak bisa membaca atau menulis datanya. Isi tabel TIDAK diubah.
-- Kalau kamu tidak mau menyentuh journal_data, lewati file ini: admin tetap
-- berfungsi, hanya saja "nonaktifkan akun" belum memblokir akses data.
-- Aman diulang. Untuk membatalkan: jalankan ulang cloud/supabase.sql.
-- ============================================================================
grant execute on function public.is_active_user() to anon, authenticated;

drop policy if exists "baca data sendiri"   on public.journal_data;
drop policy if exists "tambah data sendiri" on public.journal_data;
drop policy if exists "ubah data sendiri"   on public.journal_data;
drop policy if exists "hapus data sendiri"  on public.journal_data;

create policy "baca data sendiri"   on public.journal_data for select
  using (auth.uid() = user_id and public.is_active_user());
create policy "tambah data sendiri" on public.journal_data for insert
  with check (auth.uid() = user_id and public.is_active_user());
create policy "ubah data sendiri"   on public.journal_data for update
  using (auth.uid() = user_id and public.is_active_user())
  with check (auth.uid() = user_id and public.is_active_user());
create policy "hapus data sendiri"  on public.journal_data for delete
  using (auth.uid() = user_id and public.is_active_user());
