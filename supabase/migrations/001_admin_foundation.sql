-- ============================================================================
-- 001 - Fondasi Admin Dashboard Personal Journal
-- Jalankan sekali di Supabase: SQL Editor -> New query -> tempel semua -> Run.
-- Aman diulang (idempotent). TIDAK menyentuh, mengubah, atau menghapus journal_data.
-- ============================================================================

-- ---------- Tabel ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  status     text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('super_admin','editor','customer_service')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.role_permissions (
  role       text not null check (role in ('editor','customer_service')),
  permission text not null,
  primary key (role, permission)
);

create table if not exists public.public_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.content_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 20000),
  published  boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 2000),
  status     text not null default 'draft' check (status in ('draft','sent')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create table if not exists public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject    text not null check (char_length(subject) between 1 and 120),
  body       text not null check (char_length(body) between 1 and 4000),
  status     text not null default 'open' check (status in ('open','closed')),
  reply      text check (reply is null or char_length(reply) <= 4000),
  replied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  replied_at timestamptz
);

create table if not exists public.media_assets (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique,
  name       text not null,
  mime       text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  folder     text not null default 'umum',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}'::jsonb,
  status      text not null default 'ok' check (status in ('ok','denied','error')),
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id);

create table if not exists public.system_backups (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('export','restore')),
  status      text not null check (status in ('ok','failed')),
  size_bytes  bigint not null default 0,
  detail      text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists support_user_idx on public.support_messages (user_id);
create index if not exists user_roles_user_idx on public.user_roles (user_id);

-- ---------- Data awal ----------
insert into public.role_permissions (role, permission) values
  ('editor','overview.read'), ('editor','cms.read'), ('editor','cms.write'),
  ('editor','media.read'), ('editor','media.write'), ('editor','branding.read'),
  ('customer_service','overview.read'), ('customer_service','users.read'),
  ('customer_service','support.read'), ('customer_service','support.write'),
  ('customer_service','comms.read'), ('customer_service','comms.write')
on conflict do nothing;

insert into public.public_settings (key, value) values
  ('branding',     '{"name":"Personal Journal","primary":"#6200EE","secondary":"#3700B3","font":"Inter","logo_url":null,"favicon_url":null}'),
  ('maintenance',  '{"on":false,"message":"Sedang ada pemeliharaan. Coba lagi beberapa saat lagi."}'),
  ('announcement', '{"on":false,"text":""}')
on conflict do nothing;

insert into public.app_settings (key, value) values
  ('modules', '{}'), ('version', '{"admin":"1.0.0"}')
on conflict do nothing;

-- ---------- Profil otomatis untuk akun baru dan akun yang sudah ada ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email) select id, lower(email) from auth.users on conflict (id) do nothing;

-- ---------- Fungsi bantu hak akses ----------
create or replace function public.all_permissions() returns text[]
language sql immutable as $$
  select array['overview.read','users.read','users.write','roles.read','roles.write',
    'branding.read','branding.write','cms.read','cms.write','media.read','media.write',
    'comms.read','comms.write','support.read','support.write','analytics.read',
    'settings.read','settings.write','maintenance.write','security.read','audit.read',
    'backup.read','backup.write','data.import','data.export']
$$;

-- izin yang TIDAK boleh didelegasikan ke peran selain Super Admin
create or replace function public.reserved_permissions() returns text[]
language sql immutable as $$ select array['roles.write','audit.read','security.read','backup.write'] $$;

create or replace function public.current_aal() returns text
language sql stable as $$ select coalesce(auth.jwt()->>'aal','aal1') $$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.status = 'disabled')
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.uid() is not null
    and public.current_aal() = 'aal2'
    and public.is_active_user()
    and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'super_admin'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.uid() is not null
    and public.current_aal() = 'aal2'
    and public.is_active_user()
    and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid()), false)
$$;

create or replace function public.has_permission(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.uid() is not null
    and public.current_aal() = 'aal2'
    and public.is_active_user()
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (ur.role = 'super_admin'
             or exists (select 1 from public.role_permissions rp where rp.role = ur.role and rp.permission = p))), false)
$$;

-- Info peran milik sendiri. Boleh dipanggil sebelum 2FA supaya halaman admin tahu apakah perlu menantang TOTP.
create or replace function public.my_admin_info() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); roles text[]; perms text[];
begin
  if uid is null then return jsonb_build_object('roles','[]'::jsonb,'permissions','[]'::jsonb,'aal',public.current_aal(),'email',null,'active',false); end if;
  select coalesce(array_agg(role order by role), '{}') into roles from public.user_roles where user_id = uid;
  if 'super_admin' = any(roles) then perms := public.all_permissions();
  else select coalesce(array_agg(distinct rp.permission order by rp.permission), '{}') into perms
         from public.role_permissions rp where rp.role = any(roles);
  end if;
  return jsonb_build_object('roles', to_jsonb(roles), 'permissions', to_jsonb(perms),
    'aal', public.current_aal(), 'active', public.is_active_user(),
    'email', (select lower(email) from auth.users where id = uid));
end $$;

-- ---------- Audit log (hanya tambah) ----------
create or replace function public._audit(p_actor uuid, p_action text, p_target text, p_detail jsonb, p_status text default 'ok')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs (actor_id, actor_email, action, target, detail, status)
  values (p_actor, (select lower(email) from auth.users where id = p_actor), p_action, p_target, coalesce(p_detail,'{}'::jsonb), p_status);
end $$;
revoke all on function public._audit(uuid,text,text,jsonb,text) from public, anon, authenticated;

create or replace function public.log_admin_action(p_action text, p_target text default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action !~ '^[a-z]+\.[a-z_.]+$' or char_length(p_action) > 60 then raise exception 'aksi tidak valid' using errcode = '22023'; end if;
  perform public._audit(auth.uid(), p_action, left(p_target, 200), p_detail, 'ok');
end $$;

-- ---------- Pengguna (hanya metadata, TIDAK ada isi keuangan) ----------
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, status text,
               roles text[], data_rev bigint, data_bytes integer, data_updated_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pat text;
begin
  if not public.has_permission('users.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  pat := case when coalesce(p_search,'') = '' then null
              else '%' || replace(replace(replace(lower(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
    select u.id, lower(u.email)::text, u.created_at, u.last_sign_in_at,
           coalesce(pr.status, 'active')::text,
           coalesce((select array_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = u.id), '{}'::text[]),
           jd.rev, octet_length(jd.data::text), jd.updated_at,
           count(*) over()
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    left join public.journal_data jd on jd.user_id = u.id
    where pat is null or lower(u.email) like pat escape '\'
    order by u.created_at desc
    limit p_limit offset p_offset;
end $$;

create or replace function public.admin_user_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not (public.has_permission('overview.read') or public.has_permission('analytics.read')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'total',        (select count(*) from auth.users),
    'active_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'new_7d',       (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d',      (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'disabled',     (select count(*) from public.profiles where status = 'disabled'),
    'with_data',    (select count(*) from public.journal_data),
    'signups_by_day', coalesce((
        select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join (select created_at::date as day, count(*) n from auth.users
                   where created_at >= current_date - 29 group by 1) c on c.day = d::date), '[]'::jsonb),
    -- Hanya JUMLAH pengguna yang memakai tiap fitur. Tidak ada nominal dan tidak ada isi catatan.
    'feature_usage', jsonb_build_object(
        'transaksi', (select count(*) from public.journal_data where jsonb_array_length(coalesce(data->'tx','[]'::jsonb)) > 0),
        'target',    (select count(*) from public.journal_data where jsonb_array_length(coalesce(data->'goals','[]'::jsonb)) > 0),
        'berulang',  (select count(*) from public.journal_data where jsonb_array_length(coalesce(data->'rec','[]'::jsonb)) > 0),
        'jurnal',    (select count(*) from public.journal_data where jsonb_array_length(coalesce(data->'journal','[]'::jsonb)) > 0),
        'anggaran',  (select count(*) from public.journal_data where coalesce(data->'budgets','{}'::jsonb) <> '{}'::jsonb))
  ) into r;
  return r;
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('users.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','disabled') then raise exception 'status tidak valid' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'tidak bisa mengubah status akun sendiri' using errcode = '22023'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'tidak bisa mengubah status Super Admin' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'pengguna tidak ditemukan' using errcode = 'P0002'; end if;
  insert into public.profiles (id, email, status) select id, lower(email), p_status from auth.users where id = p_user
    on conflict (id) do update set status = excluded.status;
  perform public._audit(auth.uid(), 'user.status', p_user::text, jsonb_build_object('status', p_status));
end $$;

-- ---------- Peran dan izin ----------
create or replace function public.admin_list_role_members() returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('roles.read') and not public.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select ur.user_id, lower(u.email)::text, ur.role, ur.created_at
               from public.user_roles ur join auth.users u on u.id = ur.user_id order by ur.role, u.email;
end $$;

create or replace function public.admin_role_permissions() returns table (role text, permission text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select rp.role, rp.permission from public.role_permissions rp order by rp.role, rp.permission;
end $$;

create or replace function public.admin_grant_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  if not public.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('super_admin','editor','customer_service') then raise exception 'peran tidak valid' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'email belum terdaftar sebagai pengguna' using errcode = 'P0002'; end if;
  insert into public.user_roles (user_id, role, granted_by) values (uid, p_role, auth.uid()) on conflict do nothing;
  perform public._audit(auth.uid(), 'role.grant', uid::text, jsonb_build_object('role', p_role, 'email', lower(trim(p_email))));
end $$;

create or replace function public.admin_revoke_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'super_admin' and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
    raise exception 'tidak bisa mencabut Super Admin terakhir' using errcode = '22023'; end if;
  delete from public.user_roles where user_id = p_user and role = p_role;
  perform public._audit(auth.uid(), 'role.revoke', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_set_role_permission(p_role text, p_permission text, p_allowed boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('editor','customer_service') then raise exception 'peran tidak valid' using errcode = '22023'; end if;
  if not (p_permission = any(public.all_permissions())) then raise exception 'izin tidak dikenal' using errcode = '22023'; end if;
  if p_permission = any(public.reserved_permissions()) then raise exception 'izin ini hanya untuk Super Admin' using errcode = '22023'; end if;
  if p_allowed then insert into public.role_permissions (role, permission) values (p_role, p_permission) on conflict do nothing;
  else delete from public.role_permissions where role = p_role and permission = p_permission; end if;
  perform public._audit(auth.uid(), 'role.permission', p_role || ':' || p_permission, jsonb_build_object('allowed', p_allowed));
end $$;

-- ---------- Pengaturan publik (branding, maintenance, pengumuman) ----------
create or replace function public.admin_set_public_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare perm text;
begin
  perm := case p_key when 'branding' then 'branding.write' when 'maintenance' then 'maintenance.write'
                     when 'announcement' then 'comms.write' else null end;
  if perm is null then raise exception 'kunci pengaturan tidak dikenal' using errcode = '22023'; end if;
  if not public.has_permission(perm) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'nilai harus objek' using errcode = '22023'; end if;

  if p_key = 'branding' then
    if char_length(coalesce(p_value->>'name','')) not between 1 and 40 then raise exception 'nama aplikasi 1-40 karakter' using errcode = '22023'; end if;
    if coalesce(p_value->>'primary','')   !~ '^#[0-9a-fA-F]{6}$' then raise exception 'warna utama harus format #RRGGBB' using errcode = '22023'; end if;
    if coalesce(p_value->>'secondary','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'warna sekunder harus format #RRGGBB' using errcode = '22023'; end if;
    if coalesce(p_value->>'font','') not in ('Inter','Poppins','Montserrat','Playfair Display','Roboto') then raise exception 'font tidak diizinkan' using errcode = '22023'; end if;
    if p_value->>'logo_url' is not null and (char_length(p_value->>'logo_url') > 500 or p_value->>'logo_url' !~ '^https://[^\s''"<>]+$') then raise exception 'logo harus alamat https' using errcode = '22023'; end if;
    if p_value->>'favicon_url' is not null and (char_length(p_value->>'favicon_url') > 500 or p_value->>'favicon_url' !~ '^https://[^\s''"<>]+$') then raise exception 'favicon harus alamat https' using errcode = '22023'; end if;
    p_value := jsonb_build_object('name', p_value->>'name', 'primary', p_value->>'primary', 'secondary', p_value->>'secondary',
                                  'font', p_value->>'font', 'logo_url', p_value->'logo_url', 'favicon_url', p_value->'favicon_url');
  elsif p_key = 'maintenance' then
    if jsonb_typeof(p_value->'on') <> 'boolean' then raise exception 'field on harus true/false' using errcode = '22023'; end if;
    if char_length(coalesce(p_value->>'message','')) > 300 then raise exception 'pesan maksimal 300 karakter' using errcode = '22023'; end if;
    p_value := jsonb_build_object('on', p_value->'on', 'message', coalesce(p_value->>'message',''));
  else
    if jsonb_typeof(p_value->'on') <> 'boolean' then raise exception 'field on harus true/false' using errcode = '22023'; end if;
    if char_length(coalesce(p_value->>'text','')) > 300 then raise exception 'teks maksimal 300 karakter' using errcode = '22023'; end if;
    p_value := jsonb_build_object('on', p_value->'on', 'text', coalesce(p_value->>'text',''));
  end if;

  insert into public.public_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public._audit(auth.uid(), 'setting.' || p_key, p_key, p_value);
end $$;

create or replace function public.admin_set_app_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('settings.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key !~ '^[a-z][a-z0-9_.]{0,39}$' then raise exception 'nama pengaturan tidak valid' using errcode = '22023'; end if;
  if pg_column_size(p_value) > 20000 then raise exception 'nilai terlalu besar' using errcode = '22023'; end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public._audit(auth.uid(), 'setting.app', p_key, jsonb_build_object('key', p_key));
end $$;

-- ---------- Dukungan pengguna ----------
create or replace function public.admin_reply_support(p_id uuid, p_reply text, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('support.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('open','closed') then raise exception 'status tidak valid' using errcode = '22023'; end if;
  if char_length(coalesce(p_reply,'')) > 4000 then raise exception 'balasan terlalu panjang' using errcode = '22023'; end if;
  update public.support_messages set reply = nullif(trim(p_reply),''), status = p_status,
         replied_by = auth.uid(), replied_at = now() where id = p_id;
  if not found then raise exception 'pesan tidak ditemukan' using errcode = 'P0002'; end if;
  perform public._audit(auth.uid(), 'support.reply', p_id::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_send_notification(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('comms.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.notifications set status = 'sent', sent_at = now() where id = p_id and status = 'draft';
  if not found then raise exception 'draf tidak ditemukan atau sudah terkirim' using errcode = 'P0002'; end if;
  perform public._audit(auth.uid(), 'comms.send', p_id::text, '{}'::jsonb);
end $$;

-- ---------- Impor halaman dari CSV (validasi + laporan galat per baris) ----------
create or replace function public.admin_import_pages(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; i int := 0; ins int := 0; upd int := 0; errs jsonb := '[]'::jsonb; s text; t text; b text; pub boolean; existed boolean;
begin
  if not (public.has_permission('data.import') and public.has_permission('cms.write')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'data harus berupa daftar baris' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'maksimal 500 baris per impor' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    s := lower(trim(coalesce(r->>'slug','')));  t := trim(coalesce(r->>'title','')); b := coalesce(r->>'body','');
    if s !~ '^[a-z0-9][a-z0-9-]{0,59}$' then errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'message', 'slug tidak valid (huruf kecil, angka, strip)')); continue; end if;
    if char_length(t) not between 1 and 120 then errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'message', 'judul wajib 1-120 karakter')); continue; end if;
    if char_length(b) > 20000 then errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'message', 'isi terlalu panjang')); continue; end if;
    pub := lower(coalesce(r->>'published','false')) in ('true','1','ya','yes');
    existed := exists (select 1 from public.content_pages where slug = s);
    insert into public.content_pages (slug, title, body, published, updated_by) values (s, t, b, pub, auth.uid())
      on conflict (slug) do update set title = excluded.title, body = excluded.body, published = excluded.published, updated_at = now(), updated_by = auth.uid();
    if existed then upd := upd + 1; else ins := ins + 1; end if;
  end loop;
  perform public._audit(auth.uid(), 'import.pages', null, jsonb_build_object('inserted', ins, 'updated', upd, 'errors', jsonb_array_length(errs)));
  return jsonb_build_object('inserted', ins, 'updated', upd, 'errors', errs);
end $$;

-- ---------- Backup (konfigurasi admin + metadata pengguna, BUKAN backup database penuh) ----------
create or replace function public.admin_export_snapshot() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare snap jsonb;
begin
  if not (public.has_permission('backup.read') and public.has_permission('data.export')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'format', 'personal-journal-admin-snapshot', 'version', 1, 'taken_at', now(),
    'public_settings', coalesce((select jsonb_agg(to_jsonb(s)) from (select key, value from public.public_settings order by key) s), '[]'::jsonb),
    'content_pages',   coalesce((select jsonb_agg(to_jsonb(c)) from (select slug, title, body, published from public.content_pages order by slug) c), '[]'::jsonb),
    'role_permissions',coalesce((select jsonb_agg(to_jsonb(p)) from (select role, permission from public.role_permissions order by role, permission) p), '[]'::jsonb),
    'users_metadata',  coalesce((select jsonb_agg(to_jsonb(u)) from (
        select lower(u.email) as email, u.created_at, coalesce(pr.status,'active') as status
        from auth.users u left join public.profiles pr on pr.id = u.id order by u.created_at limit 5000) u), '[]'::jsonb)
  ) into snap;
  perform public._audit(auth.uid(), 'backup.export', null, jsonb_build_object('bytes', pg_column_size(snap)));
  return snap;
end $$;

create or replace function public.admin_record_backup(p_kind text, p_status text, p_size bigint, p_detail text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('backup.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('export','restore') or p_status not in ('ok','failed') then raise exception 'nilai tidak valid' using errcode = '22023'; end if;
  insert into public.system_backups (kind, status, size_bytes, detail, created_by)
    values (p_kind, p_status, greatest(coalesce(p_size,0),0), left(p_detail, 300), auth.uid());
end $$;

create or replace function public.admin_restore_snapshot(p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n_set int := 0; n_pg int := 0; e jsonb;
begin
  if not (public.is_super_admin() and public.has_permission('backup.write')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_snapshot->>'format' is distinct from 'personal-journal-admin-snapshot' or (p_snapshot->>'version')::int <> 1 then
    raise exception 'berkas bukan snapshot yang dikenal' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_snapshot->'public_settings','[]'::jsonb)) loop
    if e->>'key' in ('branding','maintenance','announcement') then
      perform public.admin_set_public_setting(e->>'key', e->'value'); n_set := n_set + 1; end if;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p_snapshot->'content_pages','[]'::jsonb)) loop
    insert into public.content_pages (slug, title, body, published, updated_by)
      values (e->>'slug', e->>'title', coalesce(e->>'body',''), coalesce((e->>'published')::boolean,false), auth.uid())
      on conflict (slug) do update set title = excluded.title, body = excluded.body, published = excluded.published, updated_at = now(), updated_by = auth.uid();
    n_pg := n_pg + 1;
  end loop;
  perform public._audit(auth.uid(), 'backup.restore', null, jsonb_build_object('settings', n_set, 'pages', n_pg));
  insert into public.system_backups (kind, status, size_bytes, detail, created_by)
    values ('restore','ok', pg_column_size(p_snapshot), 'pengaturan ' || n_set || ', halaman ' || n_pg, auth.uid());
  return jsonb_build_object('settings', n_set, 'pages', n_pg);
end $$;

-- ---------- Trigger audit untuk tabel konten ----------
create or replace function public.trg_audit_content() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare tgt text;
begin
  if tg_op = 'DELETE' then tgt := coalesce(old.slug, old.id::text); else tgt := coalesce(new.slug, new.id::text); end if;
  perform public._audit(auth.uid(), tg_table_name || '.' || lower(tg_op), tgt, '{}'::jsonb);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.trg_audit_content() from public, anon, authenticated;

create or replace function public.trg_audit_media() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._audit(auth.uid(), 'media.' || lower(tg_op), coalesce(new.path, old.path), '{}'::jsonb);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.trg_audit_media() from public, anon, authenticated;

create or replace function public.trg_audit_notifications() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._audit(auth.uid(), 'notifications.' || lower(tg_op), coalesce(new.id, old.id)::text, '{}'::jsonb);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.trg_audit_notifications() from public, anon, authenticated;

drop trigger if exists audit_content_pages on public.content_pages;
create trigger audit_content_pages after insert or update or delete on public.content_pages
  for each row execute function public.trg_audit_content();
drop trigger if exists audit_media on public.media_assets;
create trigger audit_media after insert or update or delete on public.media_assets
  for each row execute function public.trg_audit_media();
drop trigger if exists audit_notifications on public.notifications;
create trigger audit_notifications after insert or update or delete on public.notifications
  for each row execute function public.trg_audit_notifications();

-- ---------- RLS ----------
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.role_permissions enable row level security;
alter table public.public_settings  enable row level security;
alter table public.app_settings     enable row level security;
alter table public.content_pages    enable row level security;
alter table public.notifications    enable row level security;
alter table public.support_messages enable row level security;
alter table public.media_assets     enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.system_backups   enable row level security;

drop policy if exists profiles_self_read  on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_self_read  on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin_read on public.profiles for select to authenticated using (public.has_permission('users.read'));

drop policy if exists roles_self_read on public.user_roles;
create policy roles_self_read on public.user_roles for select to authenticated using (user_id = auth.uid());

drop policy if exists public_settings_read on public.public_settings;
create policy public_settings_read on public.public_settings for select to anon, authenticated using (true);

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (public.has_permission('settings.read'));

drop policy if exists pages_public_read on public.content_pages;
drop policy if exists pages_admin_read  on public.content_pages;
drop policy if exists pages_admin_write on public.content_pages;
create policy pages_public_read on public.content_pages for select to anon, authenticated using (published);
create policy pages_admin_read  on public.content_pages for select to authenticated using (public.has_permission('cms.read'));
create policy pages_admin_write on public.content_pages for all to authenticated
  using (public.has_permission('cms.write')) with check (public.has_permission('cms.write'));

drop policy if exists notif_user_read   on public.notifications;
drop policy if exists notif_admin_read  on public.notifications;
drop policy if exists notif_admin_write on public.notifications;
create policy notif_user_read   on public.notifications for select to authenticated using (status = 'sent');
create policy notif_admin_read  on public.notifications for select to authenticated using (public.has_permission('comms.read'));
create policy notif_admin_write on public.notifications for all to authenticated
  using (public.has_permission('comms.write')) with check (public.has_permission('comms.write'));

drop policy if exists support_user_read    on public.support_messages;
drop policy if exists support_user_insert  on public.support_messages;
drop policy if exists support_admin_read   on public.support_messages;
create policy support_user_read   on public.support_messages for select to authenticated using (user_id = auth.uid());
create policy support_user_insert on public.support_messages for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and reply is null and replied_by is null and replied_at is null and public.is_active_user());
create policy support_admin_read  on public.support_messages for select to authenticated using (public.has_permission('support.read'));

drop policy if exists media_admin_read  on public.media_assets;
drop policy if exists media_admin_write on public.media_assets;
create policy media_admin_read  on public.media_assets for select to authenticated using (public.has_permission('media.read'));
create policy media_admin_write on public.media_assets for all to authenticated
  using (public.has_permission('media.write')) with check (public.has_permission('media.write'));

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.has_permission('audit.read'));

drop policy if exists backups_admin_read on public.system_backups;
create policy backups_admin_read on public.system_backups for select to authenticated using (public.has_permission('backup.read'));

-- ---------- Hak tabel: cabut semuanya, lalu beri hanya yang perlu ----------
revoke all on public.profiles, public.user_roles, public.role_permissions, public.public_settings, public.app_settings,
              public.content_pages, public.notifications, public.support_messages, public.media_assets,
              public.audit_logs, public.system_backups from anon, authenticated;

grant select on public.public_settings to anon, authenticated;
grant select on public.content_pages   to anon;
grant select, insert, update, delete on public.content_pages  to authenticated;
grant select on public.profiles, public.user_roles, public.app_settings, public.audit_logs, public.system_backups to authenticated;
grant select, insert, update, delete on public.notifications, public.media_assets to authenticated;
grant select, insert on public.support_messages to authenticated;
-- role_permissions: tanpa akses langsung, hanya lewat admin_role_permissions()
-- audit_logs: hanya SELECT; menulis hanya lewat fungsi. Tidak ada UPDATE/DELETE untuk siapa pun lewat API.

-- ---------- Hak eksekusi fungsi: hanya pengguna yang sudah masuk ----------
do $$
declare f text;
begin
  foreach f in array array[
    'all_permissions()','reserved_permissions()','current_aal()','is_active_user()','is_super_admin()','is_admin()',
    'has_permission(text)','my_admin_info()','log_admin_action(text,text,jsonb)',
    'admin_list_users(text,integer,integer)','admin_user_stats()','admin_set_user_status(uuid,text)',
    'admin_list_role_members()','admin_role_permissions()','admin_grant_role(text,text)','admin_revoke_role(uuid,text)',
    'admin_set_role_permission(text,text,boolean)','admin_set_public_setting(text,jsonb)','admin_set_app_setting(text,jsonb)',
    'admin_reply_support(uuid,text,text)','admin_send_notification(uuid)','admin_import_pages(jsonb)',
    'admin_export_snapshot()','admin_record_backup(text,text,bigint,text)','admin_restore_snapshot(jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
