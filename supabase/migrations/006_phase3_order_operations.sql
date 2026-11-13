alter table public.orders
  add column if not exists assigned_to text,
  add column if not exists internal_notes text,
  add column if not exists acknowledged_at timestamptz;

alter table public.orders
  add constraint orders_assigned_to_length check (assigned_to is null or length(trim(assigned_to)) between 1 and 160),
  add constraint orders_internal_notes_length check (internal_notes is null or length(internal_notes) <= 2000);

create index if not exists orders_assigned_status_idx
  on public.orders(assigned_to, status, created_at desc);
