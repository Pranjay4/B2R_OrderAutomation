-- Run with the Supabase pgTAP test runner after migrations 001-004.
-- The test database must contain one product and one row in admin_users.
begin;

select plan(13);
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.admin_users limit 1),
  true
);

select lives_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":10,"discount_percentage":5},
      {"minimum_quantity":11,"maximum_quantity":20,"discount_percentage":10}]'::jsonb
  )$$,
  'accepts adjacent slab ranges'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":10,"discount_percentage":5},
      {"minimum_quantity":10,"maximum_quantity":20,"discount_percentage":10}]'::jsonb
  )$$,
  'Overlapping slab ranges',
  'rejects overlapping slab ranges'
);

select lives_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":10,"discount_percentage":5},
      {"minimum_quantity":11,"maximum_quantity":null,"discount_percentage":10}]'::jsonb
  )$$,
  'accepts an open-ended final tier'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":null,"discount_percentage":5},
      {"minimum_quantity":11,"maximum_quantity":20,"discount_percentage":10}]'::jsonb
  )$$,
  'No slab tier may follow an unlimited tier',
  'rejects a tier after an open-ended tier'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null, '[]'::jsonb
  )$$,
  'At least one slab is required',
  'requires tiers for slab schemes'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'percentage', 1, 0, 5, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":10,"discount_percentage":5}]'::jsonb
  )$$,
  'Slabs are only valid for slab schemes',
  'rejects slabs for percentage schemes'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":0,"discount_percentage":5}]'::jsonb
  )$$,
  'Each slab maximum_quantity must be a whole number or null',
  'rejects maximum quantities below one'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":-1,"maximum_quantity":10,"discount_percentage":5}]'::jsonb
  )$$,
  'Each slab minimum_quantity must be a positive whole number',
  'rejects negative slab quantities'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null,
    '[{"minimum_quantity":1,"maximum_quantity":10,"discount_percentage":101}]'::jsonb
  )$$,
  'Each slab discount_percentage must be between 0 and 100',
  'rejects discounts above one hundred'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, null, 'percentage', 1, 0, 5, false,
    now(), null, null, '[]'::jsonb
  )$$,
  'product_id is required',
  'requires a product id'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'buy_x_get_y', 0, 1, 99, false,
    now(), null, null, '[]'::jsonb
  )$$,
  'minimum_quantity must be positive',
  'requires a positive parent minimum'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'buy_x_get_y', 1, 0, 99, false,
    now(), null, null, '[]'::jsonb
  )$$,
  'buy_x_get_y requires a positive free_quantity',
  'requires a positive free quantity for buy-x-get-y'
);

select throws_ok(
  $$select public.save_scheme_with_slabs(
    null, (select id from public.products limit 1), 'slab', 1, 0, 0, false,
    now(), null, null, '{"minimum_quantity":1}'::jsonb
  )$$,
  'p_slabs must be a JSON array',
  'rejects a non-array slab payload'
);

select * from finish();
rollback;
