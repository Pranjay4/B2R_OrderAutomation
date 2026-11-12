alter table public.orders
  add column if not exists order_number text;

update public.orders
set order_number = 'TS-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where order_number is null;

alter table public.orders
  alter column order_number set not null;

create unique index if not exists orders_order_number_idx
  on public.orders(order_number);
