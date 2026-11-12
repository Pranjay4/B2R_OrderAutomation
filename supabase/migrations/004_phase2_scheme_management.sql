create or replace function public.save_scheme_with_slabs(
  p_scheme_id uuid,
  p_product_id uuid,
  p_scheme_type public.scheme_type,
  p_minimum_quantity integer,
  p_free_quantity integer,
  p_discount_percentage numeric,
  p_repeat_offer boolean,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_notes text,
  p_slabs jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheme_id uuid;
  v_previous_max integer;
  v_previous_open_ended boolean := false;
  v_min integer;
  v_max integer;
  v_discount numeric;
  v_slab jsonb;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_product_id is null then
    raise exception 'product_id is required';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found';
  end if;
  if p_scheme_type is null then
    raise exception 'scheme_type is required';
  end if;
  if p_minimum_quantity is null or p_minimum_quantity < 1 then
    raise exception 'minimum_quantity must be positive';
  end if;
  if p_scheme_type = 'buy_x_get_y' then
    if p_free_quantity is null or p_free_quantity < 1 then
      raise exception 'buy_x_get_y requires a positive free_quantity';
    end if;
  elsif p_scheme_type = 'percentage' then
    if p_discount_percentage is null
      or p_discount_percentage < 0
      or p_discount_percentage > 100 then
      raise exception 'percentage requires discount_percentage between 0 and 100';
    end if;
  end if;
  if p_slabs is null or jsonb_typeof(p_slabs) <> 'array' then
    raise exception 'p_slabs must be a JSON array';
  end if;
  if p_starts_at is null then
    raise exception 'starts_at is required';
  end if;
  if p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'expires_at must be later than starts_at';
  end if;
  if p_scheme_type = 'slab' and jsonb_array_length(p_slabs) = 0 then
    raise exception 'At least one slab is required';
  end if;
  if p_scheme_type <> 'slab' and jsonb_array_length(p_slabs) > 0 then
    raise exception 'Slabs are only valid for slab schemes';
  end if;

  for v_slab in select value from jsonb_array_elements(p_slabs) loop
    if jsonb_typeof(v_slab) <> 'object' then
      raise exception 'Each slab tier must be a JSON object';
    end if;
    if not (v_slab ? 'minimum_quantity') or jsonb_typeof(v_slab->'minimum_quantity') <> 'number' then
      raise exception 'Each slab tier requires a numeric minimum_quantity';
    end if;
    if (v_slab->>'minimum_quantity') !~ '^[0-9]+$'
      or (v_slab->>'minimum_quantity')::numeric < 1
      or (v_slab->>'minimum_quantity')::numeric > 2147483647 then
      raise exception 'Each slab minimum_quantity must be a positive whole number';
    end if;
    if not (v_slab ? 'maximum_quantity') then
      raise exception 'Each slab tier requires maximum_quantity; use null for unlimited';
    end if;
    if jsonb_typeof(v_slab->'maximum_quantity') not in ('number', 'null') then
      raise exception 'Each slab maximum_quantity must be a whole number or null';
    end if;
    if jsonb_typeof(v_slab->'maximum_quantity') = 'number'
      and ((v_slab->>'maximum_quantity') !~ '^[0-9]+$'
        or (v_slab->>'maximum_quantity')::numeric < 1
        or (v_slab->>'maximum_quantity')::numeric > 2147483647) then
      raise exception 'Each slab maximum_quantity must be a whole number or null';
    end if;
    if not (v_slab ? 'discount_percentage') or jsonb_typeof(v_slab->'discount_percentage') <> 'number' then
      raise exception 'Each slab tier requires a numeric discount_percentage';
    end if;
    if (v_slab->>'discount_percentage')::numeric < 0
      or (v_slab->>'discount_percentage')::numeric > 100 then
      raise exception 'Each slab discount_percentage must be between 0 and 100';
    end if;
  end loop;

  if p_scheme_id is null then
    insert into public.schemes (
      product_id, scheme_type, minimum_quantity, free_quantity,
      discount_percentage, repeat_offer, starts_at, expires_at, notes, status
    ) values (
      p_product_id, p_scheme_type, p_minimum_quantity,       case when p_scheme_type = 'buy_x_get_y' then p_free_quantity else 0 end,
      case when p_scheme_type = 'percentage' then p_discount_percentage else 0 end, p_repeat_offer, p_starts_at, p_expires_at, p_notes, 'draft'
    )
    returning id into v_scheme_id;
  else
    update public.schemes
    set product_id = p_product_id,
        scheme_type = p_scheme_type,
        minimum_quantity = p_minimum_quantity,
        free_quantity = case when p_scheme_type = 'buy_x_get_y' then p_free_quantity else 0 end,
        discount_percentage = case when p_scheme_type = 'percentage' then p_discount_percentage else 0 end,
        repeat_offer = p_repeat_offer,
        starts_at = p_starts_at,
        expires_at = p_expires_at,
        notes = p_notes,
        updated_at = now()
    where id = p_scheme_id
    returning id into v_scheme_id;
    if v_scheme_id is null then
      raise exception 'Scheme not found';
    end if;
  end if;

  delete from public.scheme_slabs where scheme_id = v_scheme_id;
  for v_slab in select value from jsonb_array_elements(p_slabs) order by (value->>'minimum_quantity')::integer loop
    v_min := (v_slab->>'minimum_quantity')::integer;
    v_max := case when jsonb_typeof(v_slab->'maximum_quantity') = 'null' then null else (v_slab->>'maximum_quantity')::integer end;
    v_discount := (v_slab->>'discount_percentage')::numeric;
    if v_max is not null and v_max < v_min then
      raise exception 'Each slab maximum_quantity must be greater than or equal to minimum_quantity';
    end if;
    if v_previous_open_ended then
      raise exception 'No slab tier may follow an unlimited tier';
    end if;
    if v_previous_max is not null and v_previous_max >= v_min then
      raise exception 'Overlapping slab ranges';
    end if;
    insert into public.scheme_slabs (scheme_id, minimum_quantity, maximum_quantity, discount_percentage)
    values (v_scheme_id, v_min, v_max, v_discount);
    v_previous_max := v_max;
    v_previous_open_ended := v_max is null;
  end loop;
  return v_scheme_id;
end;
$$;

revoke all on function public.save_scheme_with_slabs(uuid, uuid, public.scheme_type, integer, integer, numeric, boolean, timestamptz, timestamptz, text, jsonb) from public;
grant execute on function public.save_scheme_with_slabs(uuid, uuid, public.scheme_type, integer, integer, numeric, boolean, timestamptz, timestamptz, text, jsonb) to authenticated;
