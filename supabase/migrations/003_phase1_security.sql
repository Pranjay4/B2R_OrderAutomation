create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role = 'owner'
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

alter table public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_key_idx
  on public.orders(idempotency_key)
  where idempotency_key is not null;
create index if not exists orders_status_created_at_idx
  on public.orders(status, created_at desc);
create index if not exists order_items_order_id_idx
  on public.order_items(order_id);
create index if not exists order_items_product_id_idx
  on public.order_items(product_id);

drop policy if exists "authenticated admins manage products" on public.products;
drop policy if exists "authenticated admins manage schemes" on public.schemes;
drop policy if exists "authenticated admins manage slabs" on public.scheme_slabs;
drop policy if exists "authenticated admins manage circulars" on public.scheme_circulars;
drop policy if exists "authenticated admins read audit logs" on public.scheme_audit_logs;
drop policy if exists "public can create orders" on public.orders;
drop policy if exists "public can create order items" on public.order_items;
drop policy if exists "authenticated admins manage orders" on public.orders;
drop policy if exists "authenticated admins manage order items" on public.order_items;

create policy "owner manages products" on public.products
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages schemes" on public.schemes
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages slabs" on public.scheme_slabs
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages circulars" on public.scheme_circulars
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads audit logs" on public.scheme_audit_logs
  for select to authenticated using (public.is_owner());
create policy "owner manages orders" on public.orders
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner manages order items" on public.order_items
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "public reads published slabs" on public.scheme_slabs;
create policy "public reads current published slabs" on public.scheme_slabs
  for select using (
    exists (
      select 1
      from public.schemes s
      where s.id = scheme_id
        and s.status = 'published'
        and s.starts_at <= now()
        and (s.expires_at is null or s.expires_at > now())
    )
  );

create or replace function public.submit_order_request(
  p_customer_name text,
  p_customer_phone text,
  p_customer_business text,
  p_delivery_address text,
  p_notes text,
  p_idempotency_key text,
  p_lines jsonb
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_line jsonb;
  v_product public.products%rowtype;
  v_scheme public.schemes%rowtype;
  v_quantity integer;
  v_free_quantity integer := 0;
  v_effective_price numeric(12,2);
  v_unit_price numeric(12,2);
  v_has_scheme boolean;
  v_discount numeric := 0;
  v_groups integer;
  v_total_quantity integer := 0;
  v_line_count integer := 0;
begin
  if length(trim(coalesce(p_customer_name, ''))) < 2 or length(p_customer_name) > 160 then
    raise exception using errcode = '22023', message = 'Customer name is invalid.';
  end if;
  if length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g')) < 7 or length(p_customer_phone) > 40 then
    raise exception using errcode = '22023', message = 'Customer phone is invalid.';
  end if;
  if length(coalesce(p_customer_business, '')) > 160 or length(coalesce(p_delivery_address, '')) > 500 or length(coalesce(p_notes, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Order details are too long.';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 16 or length(p_idempotency_key) > 100 then
    raise exception using errcode = '22023', message = 'Order submission key is invalid.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 50 then
    raise exception using errcode = '22023', message = 'An order must contain between 1 and 50 products.';
  end if;

  select o.id, o.order_number into v_order_id, v_order_number
  from public.orders o
  where o.idempotency_key = p_idempotency_key;
  if v_order_id is not null then
    return query select v_order_id, v_order_number;
    return;
  end if;

  v_order_number := 'TS-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.orders(order_number, idempotency_key, customer_name, customer_phone, customer_business, delivery_address, notes)
  values (v_order_number, p_idempotency_key, trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_business), ''), nullif(trim(p_delivery_address), ''), nullif(trim(p_notes), ''))
  returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_count := v_line_count + 1;
    if not (v_line ? 'product_id') or not (v_line ? 'quantity') then
      raise exception using errcode = '22023', message = 'Each order line requires a product and quantity.';
    end if;
    select * into v_product
    from public.products
    where id = (v_line->>'product_id')::uuid and is_active = true;
    if not found then
      raise exception using errcode = '22023', message = 'One or more products are unavailable.';
    end if;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 100000 then
      raise exception using errcode = '22023', message = 'Product quantity is invalid.';
    end if;
    v_total_quantity := v_total_quantity + v_quantity;
    if v_total_quantity > 1000000 then
      raise exception using errcode = '22023', message = 'Total order quantity is too large.';
    end if;

    select * into v_scheme
    from public.schemes
    where product_id = v_product.id
      and status = 'published'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    order by updated_at desc
    limit 1;

    v_unit_price := v_product.base_price;
    v_free_quantity := 0;
    v_discount := 0;
    v_has_scheme := found;
    if v_has_scheme and v_scheme.scheme_type = 'buy_x_get_y' then
      v_groups := case when v_scheme.repeat_offer then floor(v_quantity::numeric / greatest(1, v_scheme.minimum_quantity)) else case when v_quantity >= v_scheme.minimum_quantity then 1 else 0 end end;
      v_free_quantity := v_groups * v_scheme.free_quantity;
    elsif v_has_scheme and v_scheme.scheme_type = 'percentage' and v_quantity >= v_scheme.minimum_quantity then
      v_discount := v_scheme.discount_percentage;
    elsif v_has_scheme and v_scheme.scheme_type = 'slab' then
      select ss.discount_percentage into v_discount
      from public.scheme_slabs ss
      where ss.scheme_id = v_scheme.id
        and v_quantity >= ss.minimum_quantity
        and (ss.maximum_quantity is null or v_quantity <= ss.maximum_quantity)
      order by ss.minimum_quantity desc
      limit 1;
      v_discount := coalesce(v_discount, 0);
    end if;
    v_effective_price := round(v_unit_price * (1 - v_discount / 100), 2);
    insert into public.order_items(order_id, product_id, sku, product_name, quantity, unit_price, effective_price, free_quantity)
    values (v_order_id, v_product.id, v_product.sku, v_product.name, v_quantity, v_unit_price, v_effective_price, v_free_quantity);
  end loop;

  return query select v_order_id, v_order_number;
exception
  when unique_violation then
    select o.id, o.order_number into v_order_id, v_order_number
    from public.orders o where o.idempotency_key = p_idempotency_key;
    if v_order_id is not null then
      return query select v_order_id, v_order_number;
    else
      raise;
    end if;
end;
$$;

revoke all on function public.submit_order_request(text, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_order_request(text, text, text, text, text, text, jsonb) to anon, authenticated;
