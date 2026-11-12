drop policy if exists "owner uploads product images" on storage.objects;
drop policy if exists "owner updates product images" on storage.objects;
drop policy if exists "owner deletes product images" on storage.objects;

create policy "owner uploads product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_owner()
);

create policy "owner updates product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_owner()
)
with check (
  bucket_id = 'product-images'
  and public.is_owner()
);

create policy "owner deletes product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_owner()
);
