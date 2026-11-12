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
  v_min integer;
  v_max integer;
  v_discount numeric;
  v_slab jsonb;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;
  if p_scheme_type = 'slab' and jsonb_array_length(coalesce(p_slabs, '[]'::jsonb)) = 0 then
    raise exception 'At least one slab is required';
  end if;
  if p_scheme_type <> 'slab' and jsonb_array_length(coalesce(p_slabs, '[]'::jsonb)) > 0 then
    raise exception 'Slabs are only valid for slab schemes';
  end if;

  if p_scheme_id is null then
    insert into public.schemes (
      product_id, scheme_type, minimum_quantity, free_quantity,
      discount_percentage, repeat_offer, starts_at, expires_at, notes, status
    ) values (
      p_product_id, p_scheme_type, p_minimum_quantity, p_free_quantity,
      p_discount_percentage, p_repeat_offer, p_starts_at, p_expires_at, p_notes, 'draft'
    )
    returning id into v_scheme_id;
  else
    update public.schemes
    set product_id = p_product_id,
        scheme_type = p_scheme_type,
        minimum_quantity = p_minimum_quantity,
        free_quantity = p_free_quantity,
        discount_percentage = p_discount_percentage,
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
  for v_slab in select value from jsonb_array_elements(coalesce(p_slabs, '[]'::jsonb)) order by (value->>'minimum_quantity')::integer loop
    v_min := (v_slab->>'minimum_quantity')::integer;
    v_max := nullif(v_slab->>'maximum_quantity', '')::integer;
    v_discount := (v_slab->>'discount_percentage')::numeric;
    if v_min is null or v_min < 1 or (v_max is not null and v_max < v_min) or v_discount is null or v_discount < 0 or v_discount > 100 then
      raise exception 'Invalid slab tier';
    end if;
    if v_previous_max is not null and v_previous_max >= v_min then
      raise exception 'Overlapping slab ranges';
    end if;
    insert into public.scheme_slabs (scheme_id, minimum_quantity, maximum_quantity, discount_percentage)
    values (v_scheme_id, v_min, v_max, v_discount);
    v_previous_max := v_max;
  end loop;
  return v_scheme_id;
end;
$$;

revoke all on function public.save_scheme_with_slabs(uuid, uuid, public.scheme_type, integer, integer, numeric, boolean, timestamptz, timestamptz, text, jsonb) from public;
grant execute on function public.save_scheme_with_slabs(uuid, uuid, public.scheme_type, integer, integer, numeric, boolean, timestamptz, timestamptz, text, jsonb) to authenticated;
