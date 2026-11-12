create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (length(trim(sku)) > 0),
  name text not null,
  brand text not null default '',
  category text not null default '',
  pack_size text not null default '',
  mrp numeric(12,2) not null check (mrp >= 0),
  base_price numeric(12,2) not null check (base_price >= 0),
  image_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.scheme_type as enum ('buy_x_get_y', 'percentage', 'slab');
create type public.scheme_status as enum ('draft', 'published', 'inactive');

create table if not exists public.schemes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  scheme_type public.scheme_type not null,
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  free_quantity integer not null default 0 check (free_quantity >= 0),
  discount_percentage numeric(5,2) not null default 0 check (discount_percentage between 0 and 100),
  repeat_offer boolean not null default false,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status public.scheme_status not null default 'draft',
  stackable boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create table if not exists public.scheme_slabs (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.schemes(id) on delete cascade,
  minimum_quantity integer not null check (minimum_quantity > 0),
  maximum_quantity integer,
  discount_percentage numeric(5,2) not null check (discount_percentage between 0 and 100),
  check (maximum_quantity is null or maximum_quantity >= minimum_quantity)
);

create table if not exists public.scheme_circulars (
  id uuid primary key default gen_random_uuid(),
  file_url text not null,
  file_name text not null,
  brand text,
  scheme_period text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

create table if not exists public.scheme_audit_logs (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid references public.schemes(id) on delete set null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create type public.order_status as enum ('new', 'confirmed', 'rejected', 'fulfilled');

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) > 1),
  customer_phone text not null check (length(trim(customer_phone)) >= 7),
  customer_business text,
  delivery_address text,
  notes text,
  status public.order_status not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  sku text not null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  effective_price numeric(12,2) not null check (effective_price >= 0),
  free_quantity integer not null default 0 check (free_quantity >= 0)
);

create index if not exists products_search_idx on public.products using gin (to_tsvector('simple', name || ' ' || sku || ' ' || brand));
create index if not exists schemes_product_status_idx on public.schemes(product_id, status, starts_at, expires_at);

alter table public.products enable row level security;
alter table public.schemes enable row level security;
alter table public.scheme_slabs enable row level security;
alter table public.scheme_circulars enable row level security;
alter table public.scheme_audit_logs enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "public reads active products" on public.products for select using (is_active);
create policy "public reads published schemes" on public.schemes for select using (status = 'published' and starts_at <= now() and (expires_at is null or expires_at > now()));
create policy "public reads published slabs" on public.scheme_slabs for select using (exists (select 1 from public.schemes s where s.id = scheme_id and s.status = 'published'));
create policy "authenticated admins manage products" on public.products for all to authenticated using (true) with check (true);
create policy "authenticated admins manage schemes" on public.schemes for all to authenticated using (true) with check (true);
create policy "authenticated admins manage slabs" on public.scheme_slabs for all to authenticated using (true) with check (true);
create policy "authenticated admins manage circulars" on public.scheme_circulars for all to authenticated using (true) with check (true);
create policy "authenticated admins read audit logs" on public.scheme_audit_logs for select to authenticated using (true);
create policy "public can create orders" on public.orders for insert to anon, authenticated with check (true);
create policy "public can create order items" on public.order_items for insert to anon, authenticated with check (true);
create policy "authenticated admins manage orders" on public.orders for all to authenticated using (true) with check (true);
create policy "authenticated admins manage order items" on public.order_items for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('scheme-circulars', 'scheme-circulars', false) on conflict (id) do nothing;
