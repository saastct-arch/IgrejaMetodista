-- profiles table linked to auth.users, with an is_admin flag
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer helper so policies can check admin status without recursive RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "admin select all profiles" on public.profiles
  for select using (public.is_admin());

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

-- auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, is_admin)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    lower(new.email) in ('saas.tct@gmail.com', 'italoguisilva10@gmail.com')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
