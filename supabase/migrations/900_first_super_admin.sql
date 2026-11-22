-- ============================================================================
-- 900 - Jadikan AKUNMU Super Admin pertama (jalankan sekali, oleh kamu sendiri)
-- 1. Cari baris "v_email text := ..." di bawah, lalu ganti tulisan di dalam tanda kutip
--    dengan email yang kamu pakai mendaftar di aplikasi (huruf besar/kecil bebas).
-- 2. Jalankan di SQL Editor. Harus muncul "Success".
-- Tidak ada cara lain untuk menjadi admin pertama: tidak ada pendaftaran admin publik.
-- ============================================================================
do $$
declare v_email text := lower('GANTI_DENGAN_EMAILMU'); v_id uuid;
begin
  if v_email like 'ganti_dengan%' then raise exception 'Isi dulu emailmu pada baris v_email.'; end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then raise exception 'Email % belum terdaftar. Daftar dulu di aplikasi, lalu jalankan ulang.', v_email; end if;
  insert into public.user_roles (user_id, role, granted_by) values (v_id, 'super_admin', v_id) on conflict do nothing;
  insert into public.audit_logs (actor_id, actor_email, action, target, detail)
    values (v_id, v_email, 'role.bootstrap', v_id::text, '{"role":"super_admin"}');
end $$;
