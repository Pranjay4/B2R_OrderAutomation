# Phase 1 Implementation Progress

**Phase:** Security and data integrity  
**Status:** Implemented in code; Supabase migration pending manual application and owner provisioning.  
**Date:** 12 November 2026

## Completed tasks

- Added an owner allow-list table and `is_owner()` database authorization helper.
- Replaced unrestricted authenticated-user CRUD policies with owner-only policies.
- Removed direct anonymous insert policies for `orders` and `order_items`.
- Added current-validity checks to public scheme-slab reads.
- Added order idempotency storage and indexes for order/status and foreign-key access paths.
- Added a transactional `submit_order_request` PostgreSQL RPC.
- Moved order submission from browser-direct table inserts to `/api/orders`.
- Added server-side request validation using the existing `zod` dependency.
- Made the RPC derive product names, SKUs, prices, schemes, discounts, and free quantities from database records.
- Added duplicate-submit protection using an idempotency key.
- Marked fallback catalogue data as preview mode.
- Disabled ordering when preview data is shown or the live catalogue fails to load.
- Updated the visible cart estimate to use scheme-adjusted payable values.

## Files modified

- `src/app/page.tsx`
- `src/components/catalogue.tsx`
- `src/lib/data.ts`
- `src/lib/types.ts`
- `src/app/api/orders/route.ts`
- `supabase/migrations/003_phase1_security.sql`
- `IMPLEMENTATION_PROGRESS.md`

## Database migration

New migration:

```text
supabase/migrations/003_phase1_security.sql
```

It adds:

- `public.admin_users`
- `public.is_owner()`
- `orders.idempotency_key`
- Idempotency, status, and foreign-key indexes
- Owner-only administrative RLS policies
- Current-validity public slab policy
- `public.submit_order_request(...)`

The RPC is `SECURITY DEFINER`, has a fixed `search_path`, and is executable by anonymous and authenticated callers. It is the only intended public order-write path.

## Manual Supabase actions required

The migration has **not** been applied to the live Supabase project by this implementation.

Before applying it:

1. Confirm a current database backup exists.
2. Identify the designated owner’s Supabase Auth UUID.
3. Apply migrations `003_phase1_security.sql` after `001_initial.sql` and `002_order_references.sql`.
4. Provision the owner explicitly:

   ```sql
   insert into public.admin_users (user_id, role)
   values ('DESIGNATED_OWNER_AUTH_UUID', 'owner');
   ```

5. Verify the owner can sign in and load `/admin`.
6. Verify an authenticated user not present in `admin_users` cannot access administrative data.
7. Verify anonymous users can submit only through the RPC and cannot directly insert into either order table.

Do not commit the owner UUID or any service-role credential.

## Tests and actual results

### Passed

- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

The production build compiled `/api/orders` and completed Next.js type checking and static generation successfully.

### Not run / blocked

- `npm run lint` was not completed because the repository has no ESLint configuration and Next.js opened its interactive setup prompt. No lint configuration was added as part of Phase 1.
- Database/RLS tests were not run against Supabase because applying the migration or executing production-data mutations was not authorized.
- RPC integration tests were not run because no local Supabase test instance or SQL test runner is configured.
- Browser order submission against the live database was intentionally not performed before migration application.

## Known limitations

- Rate limiting and bot protection are not yet implemented. The RPC has payload, quantity, and line-count limits plus idempotency, but production abuse protection still needs an Edge Function, hosting-provider control, or CAPTCHA/Turnstile.
- The database RPC supports the existing buy-X-get-Y, percentage, and slab scheme models, but the admin UI still lacks slab-tier CRUD. That belongs to Phase 2.
- Customer notifications, secure order-status lookup, audit-event writes, and order lifecycle history remain Phase 2 work.
- The browser creates the idempotency key when the order modal mounts. A retry in the same modal is protected; a new modal creates a new request key by design.
- Owner provisioning is intentionally manual so the migration cannot guess which existing Auth user is trusted.

## Remaining risks

1. Until the migration is applied and the owner is provisioned, the old permissive RLS policies remain active in the live database.
2. Until rate limiting is deployed, anonymous callers can still intentionally invoke the valid RPC at high volume.
3. Existing historical orders have a null idempotency key and are not retroactively deduplicated.
4. Direct owner-level writes remain possible for the designated owner, as intended for the current single-owner model; future staff roles should use narrower permissions.

## Phase 1 completion gate

Code implementation and local build validation are complete, but Phase 1 is not fully production-complete until the migration is applied and the owner/anonymous/unlisted-user RLS scenarios are verified in a test or controlled Supabase environment.

Stop here for approval before beginning Phase 2.
