-- ============================================================================
-- 004 - Platform: modul, Feature Builder, tampilan (draft/publish/rollback), rilis
-- Jalankan SETELAH 001. Aman diulang. Tidak menyentuh journal_data.
-- Prinsip: tampilan diatur lewat KONFIGURASI yang divalidasi di database,
-- bukan HTML/JavaScript bebas. Modul "implemented" hanya bisa diubah lewat migrasi (kode),
-- sehingga admin tidak bisa mengaktifkan fitur yang kodenya belum ada.
-- ============================================================================

create or replace function public.all_permissions() returns text[]
language sql immutable as $$
  select array['overview.read','users.read','users.write','roles.read','roles.write',
    'branding.read','branding.write','cms.read','cms.write','media.read','media.write',
    'comms.read','comms.write','support.read','support.write','analytics.read',
    'settings.read','settings.write','maintenance.write','security.read','audit.read',
    'backup.read','backup.write','data.import','data.export',
    'modules.read','modules.write','features.read','features.write',
    'layout.read','layout.write','layout.publish','releases.read','releases.write']
$$;
create or replace function public.reserved_permissions() returns text[]
language sql immutable as $$ select array['roles.write','audit.read','security.read','backup.write','layout.publish','modules.write'] $$;

insert into public.role_permissions (role, permission) values
  ('editor','layout.read'), ('editor','layout.write'), ('editor','modules.read'),
  ('customer_service','modules.read')
on conflict do nothing;

-- ---------- Modul aplikasi ----------
create table if not exists public.app_modules (
  id          text primary key check (id ~ '^[a-z][a-z0-9-]{1,29}$'),
  name        text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  icon        text not null default 'dot' check (icon in ('wallet','target','bell','book','coin','chart','home','note','calendar','sparkles','globe','briefcase','library','dot')),
  category    text not null default 'umum' check (char_length(category) between 1 and 30),
  route       text not null check (route ~ '^#[a-z0-9-]{1,30}$'),
  enabled     boolean not null default false,
  visible     boolean not null default true,
  sort_order  int not null default 100,
  permission  text not null default 'user' check (permission in ('user','admin')),
  config      jsonb not null default '{}'::jsonb check (pg_column_size(config) <= 4000),
  version     text not null default '1.0.0' check (version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  implemented boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (not enabled or implemented)           -- tidak boleh aktif jika kodenya belum ada
);

insert into public.app_modules (id, name, description, icon, category, route, enabled, sort_order, implemented) values
  ('dompet','Dompet','Saldo per dompet dan transfer','wallet','Keuangan','#dompet',true,10,true),
  ('anggaran','Anggaran','Batas pengeluaran per kategori','target','Keuangan','#anggaran',true,20,true),
  ('laporan','Laporan','Grafik ke mana uang keluar','chart','Keuangan','#laporan',true,30,true),
  ('investasi','Investasi','Alokasi dana darurat, emas, obligasi, saham','coin','Keuangan','#investasi',true,40,true),
  ('target','Target tabungan','Target dan progres menabung','target','Keuangan','#target',true,50,true),
  ('tagihan','Tagihan','Transaksi berulang dan pengingat','bell','Keuangan','#tagihan',true,60,true),
  ('jurnal','Jurnal harian','Catatan harian dan suasana hati','book','Pribadi','#jurnal',true,70,true),
  ('zakat','Zakat dan sedekah','Pelacak sedekah dan hitungan zakat','coin','Pribadi','#zakat',true,80,true),
  ('catatan','Catatan transaksi','Daftar transaksi lengkap','note','Keuangan','#catatan',true,90,true),
  ('evaluasi','Evaluasi','Sebab, akibat, dan yang perlu direlakan','sparkles','Keuangan','#evaluasi',true,100,true),
  ('cadangan','Cadangan dan impor','Simpan dan pulihkan data','library','Sistem','#cadangan',true,110,true),
  ('notes','Catatan pribadi','Catatan bebas dengan tag dan pin','note','Rencana','#notes',false,200,false),
  ('ai','Asisten AI','Chat AI (butuh server dan API key)','sparkles','Rencana','#ai',false,210,false),
  ('world','Perkembangan dunia','Berita ekonomi dan pasar (butuh API berita)','globe','Rencana','#world',false,220,false),
  ('calendar','Kalender','Agenda, pengingat, planner','calendar','Rencana','#calendar',false,230,false),
  ('growth','Pengembangan diri','Goal, kebiasaan, evaluasi','target','Rencana','#growth',false,240,false),
  ('business','Bisnis dan proyek','Ide, tugas, target proyek','briefcase','Rencana','#business',false,250,false),
  ('knowledge','Pusat pengetahuan','Artikel, bookmark, materi','library','Rencana','#knowledge',false,260,false)
on conflict (id) do nothing;

-- ---------- Permintaan fitur ----------
create table if not exists public.feature_requests (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 100),
  goal         text not null default '' check (char_length(goal) <= 500),
  category     text not null default 'umum' check (char_length(category) between 1 and 30),
  requirements text not null default '' check (char_length(requirements) <= 2000),
  priority     text not null default 'medium' check (priority in ('low','medium','high')),
  status       text not null default 'idea' check (status in ('idea','planned','in_development','testing','ready','active','disabled')),
  module_id    text references public.app_modules(id) on delete set null,
  version      text not null default '0.0.0' check (version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  test_result  text not null default '' check (char_length(test_result) <= 1000),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Konfigurasi tampilan: draft, terbit, riwayat ----------
create table if not exists public.config_versions (
  id           bigint generated always as identity primary key,
  key          text not null check (key in ('theme','home','nav')),
  version      int not null,
  data         jsonb not null,
  status       text not null check (status in ('draft','published','archived')),
  note         text not null default '' check (char_length(note) <= 200),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  unique (key, version)
);
create unique index if not exists one_draft_per_key on public.config_versions (key) where status = 'draft';
create unique index if not exists one_published_per_key on public.config_versions (key) where status = 'published';

create table if not exists public.published_config (
  key          text primary key check (key in ('theme','home','nav')),
  version      int not null,
  data         jsonb not null,
  published_at timestamptz not null default now()
);

-- ---------- Rilis dan pembaruan ----------
create table if not exists public.app_releases (
  id         uuid primary key default gen_random_uuid(),
  version    text not null check (char_length(version) between 1 and 30),
  kind       text not null check (kind in ('configuration','content','code')),
  title      text not null check (char_length(title) between 1 and 120),
  notes      text not null default '' check (char_length(notes) <= 1000),
  status     text not null default 'recorded' check (status in ('recorded','planned','deployed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Validasi konfigurasi (satu-satunya pintu masuk) ----------
create or replace function public.validate_config(p_key text, p_data jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare w jsonb; seen text[] := '{}'; out jsonb; it jsonb; n int;
begin
  if jsonb_typeof(p_data) <> 'object' then raise exception 'konfigurasi harus objek' using errcode = '22023'; end if;
  if p_key = 'theme' then
    if jsonb_typeof(p_data->'radius') <> 'number' or (p_data->>'radius')::numeric not between 0 and 28 then raise exception 'radius harus 0-28' using errcode = '22023'; end if;
    if jsonb_typeof(p_data->'fontScale') <> 'number' or (p_data->>'fontScale')::numeric not between 0.85 and 1.25 then raise exception 'ukuran tulisan harus 0.85-1.25' using errcode = '22023'; end if;
    if coalesce(p_data->>'mode','') not in ('auto','light','dark') then raise exception 'mode tidak valid' using errcode = '22023'; end if;
    if coalesce(p_data->>'cardStyle','') not in ('flat','elevated','outline') then raise exception 'gaya kartu tidak valid' using errcode = '22023'; end if;
    if coalesce(p_data->>'buttonStyle','') not in ('filled','soft','outline') then raise exception 'gaya tombol tidak valid' using errcode = '22023'; end if;
    if coalesce(p_data->>'density','') not in ('compact','comfortable') then raise exception 'kerapatan tidak valid' using errcode = '22023'; end if;
    if p_data->>'background' is not null and p_data->>'background' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'warna latar harus #RRGGBB' using errcode = '22023'; end if;
    return jsonb_build_object('radius', (p_data->>'radius')::numeric, 'fontScale', (p_data->>'fontScale')::numeric, 'mode', p_data->>'mode',
      'cardStyle', p_data->>'cardStyle', 'buttonStyle', p_data->>'buttonStyle', 'density', p_data->>'density', 'background', p_data->'background');
  elsif p_key = 'home' then
    if char_length(coalesce(p_data->>'title','')) > 60 then raise exception 'judul maksimal 60 karakter' using errcode = '22023'; end if;
    if char_length(coalesce(p_data->>'subtitle','')) > 120 then raise exception 'subjudul maksimal 120 karakter' using errcode = '22023'; end if;
    if char_length(coalesce(p_data->>'welcome','')) > 160 then raise exception 'sambutan maksimal 160 karakter' using errcode = '22023'; end if;
    if jsonb_typeof(p_data->'widgets') <> 'array' or jsonb_array_length(p_data->'widgets') > 5 then raise exception 'widgets harus daftar (maks 5)' using errcode = '22023'; end if;
    out := '[]'::jsonb;
    for w in select * from jsonb_array_elements(p_data->'widgets') loop
      if jsonb_typeof(w) <> 'object' or coalesce(w->>'id','') not in ('recent','overview','budgets','goals','insight') then raise exception 'widget tidak dikenal' using errcode = '22023'; end if;
      if w->>'id' = any(seen) then raise exception 'widget ganda: %', w->>'id' using errcode = '22023'; end if;
      if jsonb_typeof(w->'visible') <> 'boolean' then raise exception 'visible harus true/false' using errcode = '22023'; end if;
      seen := seen || (w->>'id');
      out := out || jsonb_build_array(jsonb_build_object('id', w->>'id', 'visible', w->'visible'));
    end loop;
    return jsonb_build_object('title', coalesce(p_data->>'title',''), 'subtitle', coalesce(p_data->>'subtitle',''), 'welcome', coalesce(p_data->>'welcome',''), 'widgets', out);
  elsif p_key = 'nav' then
    if jsonb_typeof(p_data->'items') <> 'array' or jsonb_array_length(p_data->'items') > 20 then raise exception 'items harus daftar (maks 20)' using errcode = '22023'; end if;
    out := '[]'::jsonb;
    for it in select * from jsonb_array_elements(p_data->'items') loop
      if jsonb_typeof(it) <> 'object' then raise exception 'item tidak valid' using errcode = '22023'; end if;
      if not exists (select 1 from public.app_modules m where m.id = it->>'id' and m.implemented) then raise exception 'modul belum ada atau belum diimplementasikan: %', coalesce(it->>'id','?') using errcode = '22023'; end if;
      if it->>'id' = any(seen) then raise exception 'menu ganda: %', it->>'id' using errcode = '22023'; end if;
      if char_length(coalesce(it->>'label','')) not between 1 and 20 then raise exception 'label menu 1-20 karakter' using errcode = '22023'; end if;
      if coalesce(it->>'icon','') not in ('wallet','target','bell','book','coin','chart','home','note','calendar','sparkles','globe','briefcase','library','dot') then raise exception 'ikon tidak diizinkan' using errcode = '22023'; end if;
      if jsonb_typeof(it->'visible') <> 'boolean' then raise exception 'visible harus true/false' using errcode = '22023'; end if;
      seen := seen || (it->>'id');
      out := out || jsonb_build_array(jsonb_build_object('id', it->>'id', 'label', it->>'label', 'icon', it->>'icon', 'visible', it->'visible'));
    end loop;
    return jsonb_build_object('items', out);
  end if;
  raise exception 'kunci konfigurasi tidak dikenal' using errcode = '22023';
end $$;

-- ---------- Fungsi modul ----------
create or replace function public.admin_upsert_module(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare mid text := p->>'id'; exists_ boolean;
begin
  if not public.has_permission('modules.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if mid is null or mid !~ '^[a-z][a-z0-9-]{1,29}$' then raise exception 'ID modul tidak valid' using errcode = '22023'; end if;
  select exists(select 1 from public.app_modules where id = mid) into exists_;
  if exists_ then
    update public.app_modules set
      name = coalesce(p->>'name', name), description = coalesce(p->>'description', description), icon = coalesce(p->>'icon', icon),
      category = coalesce(p->>'category', category), visible = coalesce((p->>'visible')::boolean, visible),
      sort_order = coalesce((p->>'sort_order')::int, sort_order), permission = coalesce(p->>'permission', permission),
      config = coalesce(p->'config', config), version = coalesce(p->>'version', version), updated_at = now()
    where id = mid;
  else
    -- modul baru hanya berupa DEFINISI: tidak aktif dan belum diimplementasikan
    insert into public.app_modules (id, name, description, icon, category, route, visible, sort_order, permission, config, version, enabled, implemented)
    values (mid, p->>'name', coalesce(p->>'description',''), coalesce(p->>'icon','dot'), coalesce(p->>'category','umum'),
            coalesce(p->>'route', '#' || mid), coalesce((p->>'visible')::boolean, true), coalesce((p->>'sort_order')::int, 300),
            coalesce(p->>'permission','user'), coalesce(p->'config','{}'::jsonb), coalesce(p->>'version','1.0.0'), false, false);
  end if;
  perform public._audit(auth.uid(), case when exists_ then 'module.update' else 'module.create' end, mid, jsonb_build_object('name', p->>'name'));
end $$;

create or replace function public.admin_set_module_enabled(p_id text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.app_modules;
begin
  if not public.has_permission('modules.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into m from public.app_modules where id = p_id;
  if not found then raise exception 'modul tidak ditemukan' using errcode = 'P0002'; end if;
  if p_enabled and not m.implemented then raise exception 'modul % belum diimplementasikan (kode belum ada), tidak bisa diaktifkan', p_id using errcode = '22023'; end if;
  update public.app_modules set enabled = p_enabled, updated_at = now() where id = p_id;
  perform public._audit(auth.uid(), 'module.enabled', p_id, jsonb_build_object('enabled', p_enabled));
end $$;

create or replace function public.admin_reorder_modules(p_ids text[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare i int := 0; x text;
begin
  if not public.has_permission('modules.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if array_length(p_ids,1) is null or array_length(p_ids,1) > 60 then raise exception 'daftar tidak valid' using errcode = '22023'; end if;
  foreach x in array p_ids loop i := i + 10; update public.app_modules set sort_order = i, updated_at = now() where id = x; end loop;
  perform public._audit(auth.uid(), 'module.reorder', null, jsonb_build_object('count', array_length(p_ids,1)));
end $$;

-- ---------- Fungsi Feature Builder ----------
create or replace function public.admin_save_feature(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare fid uuid := nullif(p->>'id','')::uuid;
begin
  if not public.has_permission('features.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if fid is null then
    insert into public.feature_requests (title, goal, category, requirements, priority, module_id, created_by)
    values (p->>'title', coalesce(p->>'goal',''), coalesce(p->>'category','umum'), coalesce(p->>'requirements',''), coalesce(p->>'priority','medium'), nullif(p->>'module_id',''), auth.uid())
    returning id into fid;
    perform public._audit(auth.uid(), 'feature.create', fid::text, jsonb_build_object('title', p->>'title'));
  else
    update public.feature_requests set title = coalesce(p->>'title', title), goal = coalesce(p->>'goal', goal), category = coalesce(p->>'category', category),
      requirements = coalesce(p->>'requirements', requirements), priority = coalesce(p->>'priority', priority),
      module_id = case when p ? 'module_id' then nullif(p->>'module_id','') else module_id end,
      version = coalesce(p->>'version', version), test_result = coalesce(p->>'test_result', test_result), updated_at = now()
    where id = fid;
    if not found then raise exception 'permintaan fitur tidak ditemukan' using errcode = 'P0002'; end if;
    perform public._audit(auth.uid(), 'feature.update', fid::text, '{}'::jsonb);
  end if;
  return fid;
end $$;

create or replace function public.admin_set_feature_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.feature_requests; m public.app_modules;
begin
  if not public.has_permission('features.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('idea','planned','in_development','testing','ready','active','disabled') then raise exception 'status tidak valid' using errcode = '22023'; end if;
  select * into f from public.feature_requests where id = p_id;
  if not found then raise exception 'permintaan fitur tidak ditemukan' using errcode = 'P0002'; end if;
  if p_status in ('ready','active') then
    if f.module_id is null then raise exception 'status % butuh modul terkait yang kodenya sudah ada', p_status using errcode = '22023'; end if;
    select * into m from public.app_modules where id = f.module_id;
    if not found or not m.implemented then raise exception 'modul terkait belum diimplementasikan, fitur tidak bisa berstatus %', p_status using errcode = '22023'; end if;
    if p_status = 'active' and not m.enabled then raise exception 'aktifkan modul % di Module Management dulu', m.id using errcode = '22023'; end if;
  end if;
  update public.feature_requests set status = p_status, updated_at = now() where id = p_id;
  perform public._audit(auth.uid(), 'feature.status', p_id::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_delete_feature(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('features.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.feature_requests where id = p_id and status = 'active') then raise exception 'fitur aktif tidak bisa dihapus, nonaktifkan dulu' using errcode = '22023'; end if;
  delete from public.feature_requests where id = p_id;
  if not found then raise exception 'permintaan fitur tidak ditemukan' using errcode = 'P0002'; end if;
  perform public._audit(auth.uid(), 'feature.delete', p_id::text, '{}'::jsonb);
end $$;

-- ---------- Fungsi konfigurasi: draft -> terbit -> rollback ----------
create or replace function public.admin_save_draft(p_key text, p_data jsonb, p_note text default '') returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare clean jsonb; v int;
begin
  if not public.has_permission('layout.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  clean := public.validate_config(p_key, p_data);
  select version into v from public.config_versions where key = p_key and status = 'draft';
  if v is null then
    select coalesce(max(version),0) + 1 into v from public.config_versions where key = p_key;
    insert into public.config_versions (key, version, data, status, note, created_by) values (p_key, v, clean, 'draft', left(coalesce(p_note,''),200), auth.uid());
  else
    update public.config_versions set data = clean, note = left(coalesce(p_note,''),200), created_by = auth.uid(), created_at = now() where key = p_key and status = 'draft';
  end if;
  perform public._audit(auth.uid(), 'config.draft', p_key, jsonb_build_object('version', v));
  return v;
end $$;

create or replace function public.admin_discard_draft(p_key text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('layout.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.config_versions where key = p_key and status = 'draft';
  perform public._audit(auth.uid(), 'config.discard', p_key, '{}'::jsonb);
end $$;

create or replace function public._publish_row(p_key text, p_version int, p_data jsonb, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.config_versions set status = 'archived' where key = p_key and status = 'published';
  insert into public.published_config (key, version, data, published_at) values (p_key, p_version, p_data, now())
    on conflict (key) do update set version = excluded.version, data = excluded.data, published_at = now();
  insert into public.app_releases (version, kind, title, notes, status, created_by)
    values ('cfg-' || p_key || '-v' || p_version, 'configuration', 'Tampilan "' || p_key || '" versi ' || p_version, left(coalesce(p_note,''),1000), 'deployed', auth.uid());
end $$;
revoke all on function public._publish_row(text,int,jsonb,text) from public, anon, authenticated;

create or replace function public.admin_publish(p_key text, p_note text default '') returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.config_versions;
begin
  if not public.has_permission('layout.publish') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.config_versions where key = p_key and status = 'draft';
  if not found then raise exception 'tidak ada draft untuk diterbitkan' using errcode = 'P0002'; end if;
  d.data := public.validate_config(p_key, d.data);                    -- validasi ulang saat terbit
  perform public._publish_row(p_key, d.version, d.data, coalesce(nullif(p_note,''), d.note));
  update public.config_versions set status = 'published', published_at = now(), data = d.data, note = coalesce(nullif(p_note,''), note) where id = d.id;
  perform public._audit(auth.uid(), 'config.publish', p_key, jsonb_build_object('version', d.version));
  return d.version;
end $$;

create or replace function public.admin_rollback(p_key text, p_version int) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare src public.config_versions; v int;
begin
  if not public.has_permission('layout.publish') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into src from public.config_versions where key = p_key and version = p_version and status in ('published','archived');
  if not found then raise exception 'versi tidak ditemukan' using errcode = 'P0002'; end if;
  if exists (select 1 from public.published_config where key = p_key and version = p_version) then raise exception 'versi ini sudah berlaku' using errcode = '22023'; end if;
  src.data := public.validate_config(p_key, src.data);
  select coalesce(max(version),0) + 1 into v from public.config_versions where key = p_key;
  perform public._publish_row(p_key, v, src.data, 'Rollback ke versi ' || p_version);
  insert into public.config_versions (key, version, data, status, note, created_by, published_at)
    values (p_key, v, src.data, 'published', 'Rollback ke versi ' || p_version, auth.uid(), now());
  perform public._audit(auth.uid(), 'config.rollback', p_key, jsonb_build_object('to_version', p_version, 'new_version', v));
  return v;
end $$;

create or replace function public.admin_config_history(p_key text) returns table (version int, status text, note text, author text, created_at timestamptz, published_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_permission('layout.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.version, c.status, c.note, lower(u.email)::text, c.created_at, c.published_at
    from public.config_versions c left join auth.users u on u.id = c.created_by where c.key = p_key order by c.version desc limit 100;
end $$;

create or replace function public.admin_config_get(p_key text, p_version int default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.has_permission('layout.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_version is null then select data into r from public.config_versions where key = p_key and status = 'draft';
  else select data into r from public.config_versions where key = p_key and version = p_version; end if;
  return r;
end $$;

-- ---------- Rilis ----------
create or replace function public.admin_add_release(p_version text, p_kind text, p_title text, p_notes text default '', p_status text default 'recorded') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid;
begin
  if not public.has_permission('releases.write') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('configuration','content','code') or p_status not in ('recorded','planned','deployed') then raise exception 'nilai tidak valid' using errcode = '22023'; end if;
  insert into public.app_releases (version, kind, title, notes, status, created_by) values (p_version, p_kind, p_title, coalesce(p_notes,''), p_status, auth.uid()) returning id into rid;
  perform public._audit(auth.uid(), 'release.add', rid::text, jsonb_build_object('kind', p_kind, 'status', p_status));
  return rid;
end $$;

-- ---------- Percobaan akses admin (untuk Pusat Keamanan) ----------
create or replace function public.log_admin_attempt(p_outcome text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome not in ('login.ok','login.denied','logout.ok') then raise exception 'hasil tidak valid' using errcode = '22023'; end if;
  if p_outcome in ('login.ok','logout.ok') and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_outcome = 'login.denied' and public.is_admin() then return; end if;
  -- batasi: satu catatan per aksi per akun per 60 detik (mencegah log dibanjiri)
  if exists (select 1 from public.audit_logs where actor_id = auth.uid() and action = 'admin.' || p_outcome and created_at > now() - interval '60 seconds') then return; end if;
  perform public._audit(auth.uid(), 'admin.' || p_outcome, null, '{}'::jsonb, case when p_outcome = 'login.denied' then 'denied' else 'ok' end);
end $$;

-- ---------- RLS dan hak ----------
alter table public.app_modules      enable row level security;
alter table public.feature_requests enable row level security;
alter table public.config_versions  enable row level security;
alter table public.published_config enable row level security;
alter table public.app_releases     enable row level security;

drop policy if exists modules_public_read on public.app_modules;
create policy modules_public_read on public.app_modules for select to anon, authenticated using (true);
drop policy if exists features_admin_read on public.feature_requests;
create policy features_admin_read on public.feature_requests for select to authenticated using (public.has_permission('features.read'));
drop policy if exists cfgv_admin_read on public.config_versions;
create policy cfgv_admin_read on public.config_versions for select to authenticated using (public.has_permission('layout.read'));
drop policy if exists pubcfg_public_read on public.published_config;
create policy pubcfg_public_read on public.published_config for select to anon, authenticated using (true);
drop policy if exists releases_admin_read on public.app_releases;
create policy releases_admin_read on public.app_releases for select to authenticated using (public.has_permission('releases.read'));

revoke all on public.app_modules, public.feature_requests, public.config_versions, public.published_config, public.app_releases from anon, authenticated;
grant select on public.app_modules, public.published_config to anon, authenticated;
grant select on public.feature_requests, public.config_versions, public.app_releases to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'all_permissions()','reserved_permissions()','validate_config(text,jsonb)',
    'admin_upsert_module(jsonb)','admin_set_module_enabled(text,boolean)','admin_reorder_modules(text[])',
    'admin_save_feature(jsonb)','admin_set_feature_status(uuid,text)','admin_delete_feature(uuid)',
    'admin_save_draft(text,jsonb,text)','admin_discard_draft(text)','admin_publish(text,text)','admin_rollback(text,integer)',
    'admin_config_history(text)','admin_config_get(text,integer)','admin_add_release(text,text,text,text,text)','log_admin_attempt(text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Rilis awal (catatan, bukan bukti deployment)
insert into public.app_releases (version, kind, title, notes, status)
select '1.0.0', 'code', 'Admin Dashboard dipasang', 'Dicatat oleh migrasi 004. Ini catatan, bukan bukti deployment.', 'recorded'
where not exists (select 1 from public.app_releases where version = '1.0.0' and kind = 'code');
