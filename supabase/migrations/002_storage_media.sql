-- ============================================================================
-- 002 - Penyimpanan media untuk Admin (bucket "media" di Supabase Storage)
-- Jalankan SETELAH 001. Aman diulang.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon'];

drop policy if exists media_obj_read   on storage.objects;
drop policy if exists media_obj_insert on storage.objects;
drop policy if exists media_obj_update on storage.objects;
drop policy if exists media_obj_delete on storage.objects;

-- File publik dibuka lewat alamat publiknya. Policy ini hanya untuk DAFTAR file di panel admin.
create policy media_obj_read   on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.has_permission('media.read'));
create policy media_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.has_permission('media.write'));
create policy media_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.has_permission('media.write'))
  with check (bucket_id = 'media' and public.has_permission('media.write'));
create policy media_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.has_permission('media.write'));
