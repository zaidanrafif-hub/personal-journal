-- Jalankan sekali di Supabase: SQL Editor -> New query -> tempel semua -> Run.
create table if not exists public.journal_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.journal_data enable row level security;

drop policy if exists "baca data sendiri"   on public.journal_data;
drop policy if exists "tambah data sendiri" on public.journal_data;
drop policy if exists "ubah data sendiri"   on public.journal_data;
drop policy if exists "hapus data sendiri"  on public.journal_data;

create policy "baca data sendiri"   on public.journal_data for select using (auth.uid() = user_id);
create policy "tambah data sendiri" on public.journal_data for insert with check (auth.uid() = user_id);
create policy "ubah data sendiri"   on public.journal_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "hapus data sendiri"  on public.journal_data for delete using (auth.uid() = user_id);

-- Izin akses tabel untuk pengguna yang sudah masuk (aman: tetap dibatasi aturan RLS di atas).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.journal_data to authenticated;
