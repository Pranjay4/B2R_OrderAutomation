# TradeScheme Product Audit

**Audit date:** 12 November 2026  
**Scope:** Public catalogue, order-request flow, owner workspace, Next.js/Supabase implementation, schema/migrations, and live browser behavior.  
**Method:** Repository inspection, production build, live route probing, browser interaction, invalid-login testing, and read-only review of database policies. No application code, configuration, schema, or production data was modified.

## 1. Executive Summary

TradeScheme is a small distributor-to-retailer catalogue for publishing products and trade schemes, calculating effective prices, and collecting order requests. The core proposition is clear: help a retailer understand a promotion quickly and ask the distributor for stock and delivery confirmation.

The product has a credible early MVP shape, but it is **not ready for real customers or production operations**. The public catalogue and owner login are present, the build passes, and the main happy path is understandable. However, the system currently has a dangerous authorization design: every authenticated Supabase user is granted unrestricted administrative CRUD access. Public anonymous clients can also write arbitrary order and order-item payloads. These are P0/P1 issues because they expose the catalogue, orders, and operational data to unauthorized manipulation and abuse.

The order workflow is only a request capture, not a commerce workflow. It lacks server-side price validation, atomic order creation, customer confirmation or status tracking, notifications, inventory/availability controls, and a reliable operational handoff. Scheme management is incomplete: the UI cannot create or edit slab tiers, circular uploads have schema/storage but no product surface, and audit-log storage is never populated.

The current UX is visually coherent and reasonably focused, but it is not sufficiently accessible or resilient. Labels rely on placeholders, dialogs do not provide robust keyboard focus behavior, mobile hides the owner-login link, and transient runtime/network failures have already been observed on the public route. The product needs a security-first hardening phase before visual polish or advanced differentiation.

## 2. Product Overview and User Roles

### Product purpose

The implementation supports:

- A public, published-only product catalogue.
- Search by product name, SKU, or brand.
- Category filtering and sorting by name, base price, or effective scheme price.
- A scheme calculator for buy-X-get-Y, percentage, and slab pricing.
- A client-side order-request cart.
- An authenticated owner workspace for products, schemes, and order statuses.

Evidence: [src/app/page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/page.tsx), [src/components/catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx), [src/app/admin/page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/admin/page.tsx), and [supabase/migrations/001_initial.sql](/Users/pranjaymacbookpro/Documents/nimbu/supabase/migrations/001_initial.sql).

### Identified roles

| Role | Current capabilities | Assessment |
|---|---|---|
| Anonymous retailer/customer | Browse active products and published schemes; calculate; share to WhatsApp; submit order requests | Primary public journey exists, but identity, spam controls, confirmation delivery, and order lookup are missing. |
| Authenticated user | Full CRUD on products, schemes, slabs, circulars, orders, and order items under the current RLS policies | **Over-privileged. There is no owner/admin role model.** |
| Owner/operator | Intended administrator using `/admin` | UI calls this “Owner,” but backend authorization does not enforce owner identity or role. |
| Auditor | Audit-log table exists | No UI and no code writes audit events, so the role/workflow is not operational. |

There is no explicit distributor staff, sales representative, warehouse, finance, or customer-support role. There is also no customer account or order-history role.

## 3. Existing Feature Inventory

| Area | Implemented | Gaps / limitations |
|---|---|---|
| Public catalogue | Active products, product cards, search, category filter, sort, active-scheme filter | No pagination, no detail route, no product descriptions in the card, no stock/availability, no distributor identity/contact information. |
| Scheme calculator | Quantity controls, effective price, total payable, free units, next unlock, WhatsApp share | Client-side only; no server-authoritative quote; slab editing is absent; quantity and price semantics are not fully explained. |
| Order request | Cart, customer name/phone/business/address/notes, generated reference, success state | No atomic transaction, no server validation of price/scheme, no customer notification, no status tracking for customer, no duplicate-submit/idempotency protection, no delivery/stock commitment. |
| Authentication | Supabase email/password sign-in, session check, sign-out | No reset flow, invite flow, MFA, role/tenant boundary, lockout/rate-limit UX, or account administration. |
| Product admin | Create, edit, activate/deactivate, search, inactive toggle | No image upload, description editor, bulk import, validation messaging, archive/delete policy, pagination, or change history. |
| Scheme admin | Create draft, edit, publish/deactivate, product selection, dates, notes, percentage/buy-X-get-Y fields | No slab-tier editor despite schema support; no conflict detection; no preview; no scheduling clarity; no audit history. |
| Order admin | Search, status filter, status updates, item display | No assignment, communication, stock check, totals reconciliation, notes/history, export, pagination, or notification integration. |
| Circulars | Tables and storage buckets are declared | No UI, upload path, retrieval path, public/admin presentation, file validation, or lifecycle management. |
| Analytics | Overview counts for active products, published schemes, new orders | No revenue, conversion, scheme performance, response time, or customer analytics. |

## 4. User Journey Analysis

### Journey A: Retailer discovers a product and calculates a scheme

**Observed path:** `/` → search/filter → product card → “Calculate” → quantity input.

**What works**

- The product value proposition is visible immediately.
- Search and category/sort controls are discoverable.
- The calculator displays payable amount, units received, free units, effective price, savings, and next unlock.
- A buy-10-get-1 example correctly displayed ₹1,600 payable for 11 units and ₹145.45 effective/unit during browser testing.

**Problems**

1. The calculator is a modal rather than a shareable or bookmarkable product/offer detail. A retailer cannot return to a specific SKU or send a stable quote link.
2. Quantity entry can be edited directly, but there is no visible explanation of whether quantity means paid units, ordered units, cases, or received units.
3. “Next unlock” is shown as a number of units remaining, but the label is not explicit enough for a busy counter workflow.
4. The calculator has no loading or retry behavior because all calculations are local and catalogue data is loaded upstream; a catalogue failure produces a different experience.
5. WhatsApp sharing opens a generic `wa.me` URL without a distributor contact, order reference, expiry context, or direct deep link back to the product.

### Journey B: Retailer submits an order request

**Observed path:** Add to order → order modal → quantity controls → required name and phone → submit.

**What works**

- The cart is simple and has a clear success state with a reference number.
- Required fields prevent an entirely empty submission in the browser.
- The copy correctly says this is a request, not instant checkout.

**Problems**

1. The displayed “Estimated order value” uses base price × quantity, while the stored order items use calculated effective price and free quantity. The estimate can therefore disagree with the scheme result shown immediately before submission. This is a trust defect.
2. The browser inserts the order first and inserts items in a second request. If the second request fails, an order with no items remains. There is no transaction or cleanup path.
3. The customer receives only an on-screen reference. Closing the modal loses the reference; there is no email/SMS/WhatsApp confirmation or “look up my request” journey.
4. There is no idempotency key. A double click, retry after a timeout, or mobile network replay can create duplicates.
5. No delivery address is required, even though the distributor is expected to confirm delivery. No customer-business identity is verified.
6. There is no explicit consent or privacy notice before collecting phone, address, and notes.
7. An order request can be submitted even when the app is running on fallback sample data; the eventual Supabase submission then fails because sample IDs are not real database product IDs.

### Journey C: Owner signs in and operates the workspace

**Observed path:** `/admin` → email/password → overview → Orders / Products / Schemes.

**What works**

- The login surface is clear and invalid credentials were rejected with “Invalid login credentials.”
- Session checks and sign-out are implemented.
- The workspace has a useful high-level starting point and new-order count.
- Product and scheme navigation is understandable.

**Problems**

1. The owner workspace cannot be used safely as a multi-user operational system because all authenticated accounts have the same unrestricted backend access.
2. Status changes have no confirmation, transition rules, reason, timestamp history, or notification.
3. The owner cannot edit the scheme slabs that the public calculator depends on.
4. Data loading requests all products, schemes, and orders at once, with no pagination or server-side filtering.
5. There is no recovery path for forgotten passwords, expired access, or a locked account.

### Journey D: Failure and recovery scenarios

- **Invalid login:** verified; an inline error is shown.
- **Initial public load:** a shared browser page recorded a 404, incomplete chunked encoding, and an unhandled “TypeError: network error” in the Next.js error overlay. A fresh public load later succeeded, so this is a verified observed reliability incident, not a consistently reproduced defect.
- **Supabase/API timeout:** admin code has a 15-second timeout and retry affordance for data loading; the public catalogue does not provide equivalent retry behavior.
- **Partial order failure:** no rollback or transaction exists.
- **Expired scheme:** server-side product filtering excludes expired schemes, but the slab RLS policy does not include the same time-window condition.

## 5. UI/UX Audit

### Strengths

- Consistent navy/mint visual language, cards, rounded controls, and clear primary actions.
- Public page has a strong headline and a focused “find → calculate → request” model.
- Admin navigation and status badges provide a reasonable MVP information architecture.
- Responsive Tailwind classes cover common desktop/mobile breakpoints.

### Findings

| Finding | Evidence | Impact |
|---|---|---|
| Form fields are labelled with placeholders rather than persistent `<label>` elements | Order fields and admin login in [src/components/catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx) and [src/app/admin/page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/admin/page.tsx) | Placeholder text disappears while typing, reducing orientation and accessibility. |
| Modal focus behavior is incomplete | Calculator and order dialogs in [src/components/catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx) | No focus trap, Escape handling, focus restoration, or labelled quantity +/- controls. Keyboard and screen-reader users can get lost behind the overlay. |
| Admin login link is hidden on small screens | Public header in [src/components/catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx) | Operators on phones have no visible route to owner login from the catalogue. |
| Product descriptions are stored but never presented | `description` exists in the product schema/types, but product cards do not render it | Retailers lack product context and may not distinguish similar SKUs. |
| Empty and error states are underdeveloped | Catalogue has a generic no-results state; public load error uses sample fallback | No retry, support contact, or actionable diagnosis. |
| Visual language implies stronger certainty than the workflow provides | “Published pricing,” “effective landed price,” and “order request” coexist with no stock/tax/freight disclaimer | Customers may interpret calculated price as final commercial price. |
| Date and time semantics are unclear | Admin converts `datetime-local` values to ISO; public display formats with UTC | A distributor in a non-UTC timezone can see a date/time different from what they entered. |
| No visible distributor identity or contact details | Public page header and success state | A retailer has no trusted human escalation path when a request fails or needs clarification. |
| No pagination or bulk operations | Admin list implementations | The interface will become unwieldy as catalogue/order volume grows. |

### Responsive and interaction assessment

The layout uses responsive grid and modal classes and the public catalogue rendered at desktop width during inspection. However, the mobile-specific behavior is not complete: the owner link disappears, modal content becomes a bottom sheet without verified focus/scroll behavior, and the form relies on generic inputs. A formal device matrix (small Android, iPhone, tablet, desktop) is still needed before launch.

## 6. Functional QA Findings

### Verified

- `npm run build` passes TypeScript checking, page generation, and production compilation.
- `/` and `/admin` return HTTP 200 from the running app.
- The public catalogue loaded two live products from Supabase during inspection.
- Search/filter/sort controls are rendered.
- Calculator interaction produced expected visible values for the live buy-X-get-Y example.
- Add-to-order and order modal opened successfully.
- Invalid admin credentials produced an inline authentication error.

### High-risk functional defects

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| F-01 | P0 | A non-owner authenticated user can perform all admin CRUD operations | RLS policies grant `for all to authenticated using (true) with check (true)` for products, schemes, orders, and items in [001_initial.sql](/Users/pranjaymacbookpro/Documents/nimbu/supabase/migrations/001_initial.sql). |
| F-02 | P1 | Anonymous clients can create arbitrary orders and order items with no abuse controls or server-side reconciliation | “Public can create orders/order items” policies in [001_initial.sql](/Users/pranjaymacbookpro/Documents/nimbu/supabase/migrations/001_initial.sql); client inserts raw form and calculated values in [catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx). |
| F-03 | P1 | Order creation is not atomic | Separate `orders.insert` and `order_items.insert` calls in [catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx). |
| F-04 | P1 | Slab scheme administration is incomplete | Schema supports `scheme_slabs`, but the admin form only writes the parent `schemes` row; no slab CRUD is present in [admin/page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/admin/page.tsx). |
| F-05 | P1 | Fallback sample catalogue can lead to unusable order requests | `getProducts()` returns hard-coded sample IDs when env vars are absent in [data.ts](/Users/pranjaymacbookpro/Documents/nimbu/src/lib/data.ts), while order submission writes those IDs to Supabase in [catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx). |
| F-06 | P2 | Scheme and order state transitions are not validated | Any status is directly updated by UI handlers; there is no transition policy or confirmation in [admin/page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/admin/page.tsx). |
| F-07 | P2 | The visible estimate and persisted effective values can differ | Cart total uses `base_price * quantity`; item insertion uses `calculateScheme()` in [catalogue.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/components/catalogue.tsx). |
| F-08 | P2 | Public data freshness and failure behavior are inconsistent | Home uses `revalidate = 60` and catches errors into fallback UI in [page.tsx](/Users/pranjaymacbookpro/Documents/nimbu/src/app/page.tsx); admin has explicit timeout/retry behavior but public UI does not. |
| F-09 | P2 | No automated test suite exists for calculations, RLS, CRUD, or journeys | `package.json` contains build/dev/start/lint scripts but no test script; no test files are present under `src/` or `supabase/`. |

## 7. Database and Security Audit

### Critical authorization issue — P0

RLS is enabled, which is good, but the policies treat the `authenticated` role as an administrator. Any account that can authenticate can update or delete products, publish/deactivate schemes, read and mutate all orders, and mutate order items. There is no `profiles`, `organization_memberships`, role claim, owner allow-list, or policy predicate tying access to a distributor account.

This is a verified design vulnerability, not a suspicion. The fix must be server/database authorization, not merely hiding UI routes.

### Anonymous write and integrity risks — P1

Anonymous users can insert an order and order items with `with check (true)`. The schema validates basic types and foreign keys, but it does not prove that:

- The submitted SKU/name matches the product ID.
- The submitted unit/effective price matches the current product and scheme.
- The free quantity was calculated by trusted logic.
- The order is not a spam or replay.
- The order item belongs to a product currently active or offered.

The browser is an untrusted client. Price and promotion calculations must be recomputed in a trusted API/database function before persistence.

### Data integrity and schema gaps

- `order_items.order_id` and `order_items.product_id` have foreign keys but no explicit indexes; order-heavy queries can degrade as data grows.
- There are no indexes for order status or creation time despite the admin always sorting by `created_at` and filtering by status in memory.
- `updated_at` has no database trigger. It is manually set by some UI paths, so external SQL/API changes can leave stale timestamps.
- The order/reference migration is separate from the initial schema. The client has a special `42703` message if it was not run, which is helpful, but production deployment should enforce migration completeness rather than relying on runtime discovery.
- `scheme_slabs` public policy checks published status but not `starts_at`/`expires_at`, unlike the parent scheme policy. This can expose future or expired tier rows through direct API access.
- `scheme_audit_logs` has a table and read policy but no insert trigger or application writes. It cannot provide an audit trail.
- `scheme_circulars` has no file-size, MIME, ownership-path, or lifecycle policy visible in the migration.

### Secrets and configuration

`.env.local` contains a public Supabase URL and publishable/anon key, which are expected browser-side credentials, and `.gitignore` excludes `.env*`. No service-role key was found in source. The important risk is therefore policy overreach and client trust, not exposure of a server secret.

## 8. Performance and Scalability Audit

### Current behavior

- Public product fetch selects products with nested schemes and slabs in one request and is cached/revalidated every 60 seconds.
- Admin loads all products, all schemes with slabs, and all orders with items concurrently on every load.
- Public search, filtering, and sorting are in-memory over the initial product set.
- The build reports a 164 kB first-load JS size for `/admin` and 94.6 kB for `/`, which is acceptable for an MVP but does not include future data volume or image weight.

### Risks

1. Admin memory and payload size grow linearly with order history and catalogue size; there is no pagination or server-side filtering.
2. The public search index created in the database is not used by the application; all search is client-side after loading the full active catalogue.
3. Remote product images have no explicit dimensions, loading strategy, optimization component, or broken-image fallback. This can cause layout shift and bandwidth waste.
4. Re-fetching all admin datasets after every mutation is simple but becomes expensive and can overwrite concurrent operator changes.
5. No monitoring, structured error reporting, request correlation, or performance budget is configured.
6. The observed incomplete chunked response and unhandled runtime error indicate that the app needs production-like reliability testing, not only build validation.

## 9. Missing Features and Product Opportunities

### Essential before customer launch

- Role-based, tenant-aware authorization with owner/staff roles.
- Server-authoritative order creation and pricing calculation.
- Atomic order transaction and idempotency.
- Customer confirmation and order-status lookup.
- Stock/availability and final-price disclaimer/confirmation.
- Slab-tier CRUD and validation.
- Audit trail for price, scheme, product, and status changes.
- Rate limiting, bot protection, input normalization, and abuse monitoring.
- Password recovery, account provisioning, and at least baseline MFA for owners.
- Accessible labels, keyboard-safe dialogs, responsive mobile navigation, and actionable error recovery.

### High-value improvements

- Distributor contact card and WhatsApp/call escalation.
- Shareable product/scheme links with expiry and distributor context.
- Bulk product import/export and image upload.
- Scheme conflict detection, preview, scheduled publishing, and approval workflow.
- Order assignment, internal notes, customer communication templates, and CSV export.
- Email/WhatsApp notifications for new requests and status changes.
- Customer-specific pricing or distributor-specific catalogues if the business model requires it.
- Analytics for catalogue views, calculator use, request conversion, average response time, and scheme performance.

### Potential differentiation

- “Best order quantity” recommendations that balance threshold savings with cash outlay.
- Distributor-specific promotion calendars and expiry alerts.
- Retailer reorder suggestions based on history.
- Offline-friendly catalogue/PWA for field sales.
- Multi-distributor or multi-tenant workspaces with scoped catalogues.

These are recommendations, not claims that the current product must implement every competitor feature.

## 10. Prioritized Issue Register

| # | Priority | Category | Issue | Evidence / why it matters | Recommended solution | Complexity | Confidence |
|---:|:---:|---|---|---|---|:---:|:---:|
| 1 | P0 | Security | Any authenticated user is an unrestricted admin | RLS policies at [001_initial.sql](/Users/pranjaymacbookpro/Documents/nimbu/supabase/migrations/001_initial.sql) use `true` for all admin tables. Enables catalogue/order tampering. | Add tenant/user membership tables and restrictive policies; expose admin operations through authorized server actions/API; test with owner, staff, and unrelated users. | High | 10/10 |
| 2 | P1 | Data integrity/security | Anonymous order writes trust client prices and allow spam | Public insert policies and client-side payload construction permit forged amounts and high-volume submissions. | Create a server endpoint/RPC that validates product, active scheme, quantity, totals, and rate limits; persist only server-derived values. | High | 10/10 |
| 3 | P1 | Reliability | Order and items are separate writes | Item failure leaves orphan orders; retry can duplicate. | Use one database transaction/RPC with idempotency key and explicit rollback. | Medium | 10/10 |
| 4 | P1 | Functionality | Slab schemes cannot be managed | Schema supports slabs but admin only saves parent scheme. Slab products cannot be reliably configured by operators. | Add tier editor with non-overlap/coverage validation and transactional parent+tiers save. | Medium | 10/10 |
| 5 | P1 | Product/reliability | Fallback sample data is orderable but not submit-able | Missing env returns fake product IDs and public order flow remains enabled. | Disable ordering in preview mode, or use a fully mocked submit path; fail closed with setup guidance in deployed environments. | Low | 9/10 |
| 6 | P1 | Operations | No customer confirmation or status visibility | Reference exists only in transient modal; distributor/customer workflows stop after insert. | Send confirmation, provide secure reference lookup, and notify on status changes. | High | 10/10 |
| 7 | P2 | UX/trust | Estimated cart total ignores promotion economics | Cart displays base-price total while item records use effective prices/free units. | Show base total, scheme savings, payable estimate, free units, and a final-price disclaimer consistently. | Low | 10/10 |
| 8 | P2 | Accessibility | Placeholder-only forms and weak modal keyboard behavior | Inputs lack persistent labels; dialogs lack Escape/focus management; +/- buttons lack names. | Add labels, descriptions, `aria-label`s, focus trap/restoration, Escape close, and automated accessibility tests. | Medium | 9/10 |
| 9 | P2 | Governance | Audit-log and circular features are schema-only | No writes/UI means no traceability or document workflow. | Implement event writes/triggers, history UI, secure upload flow, file validation, and permissions. | Medium | 9/10 |
| 10 | P2 | Scalability | Admin fetches all datasets and filters client-side | Payload and render cost grow with history; indexes are not aligned with queries. | Add server-side pagination/filtering, order/status indexes, and incremental refresh. | Medium | 9/10 |
| 11 | P2 | Reliability | Public transient failure has no retry and an unhandled runtime overlay was observed | Browser recorded 404/incomplete chunked response and “TypeError: network error” before a later fresh load succeeded. | Add production error boundary, retry/reload CTA, monitoring, and investigate hosting/chunk delivery. | Medium | 8/10 |
| 12 | P2 | Security/privacy | No privacy consent, retention, or abuse controls for phone/address | Personal data is collected into an anonymous-write system without visible policy or throttling. | Add privacy notice/consent, retention policy, rate limiting, CAPTCHA/Turnstile where appropriate, and access logging. | Medium | 9/10 |
| 13 | P3 | Product | No product detail/shareable offer URL | Modal-only details limit repeat use and sales sharing. | Add stable product/scheme detail routes and structured WhatsApp share links. | Medium | 9/10 |
| 14 | P3 | Operations | No analytics or response-time reporting | Owner sees counts but cannot manage commercial performance. | Instrument funnel and order SLA metrics with privacy-aware analytics. | Medium | 9/10 |

## 11. Quick Wins

1. Hide/disable order submission whenever the app is in sample-preview mode.
2. Reconcile cart totals with effective price, savings, and free units.
3. Add persistent labels and accessible names to every input, close button, and quantity control.
4. Add Escape-to-close and focus restoration to both dialogs.
5. Add a visible mobile owner-login route.
6. Add a public retry/error boundary and a support contact.
7. Add explicit “estimate only; stock, freight, tax, and final price confirmed by distributor” copy.
8. Add order-submit busy state protection plus a client-generated idempotency token, backed by a database uniqueness constraint.
9. Add database indexes for `orders(created_at, status)` and order-item foreign keys.
10. Add automated unit tests for every scheme type, boundary quantity, expired/future offer, zero/invalid quantity, and rounding.

## 12. Major Improvements

### Security and trust foundation

Build a tenant-aware authorization model first. Define owner/staff roles, scope every record to a distributor/tenant, remove unrestricted authenticated policies, and test authorization at the database level. Move order creation and pricing to a trusted transaction boundary.

### Operational order system

Turn the request inbox into a real workflow: server validation, stock review, assigned owner, internal notes, customer communication, explicit transition rules, confirmation timestamps, and notification delivery. Preserve a full immutable event history.

### Scheme management

Add a proper scheme editor with tiers, preview calculations, start/end timezone clarity, overlap detection, approval/publish controls, and rollback/version history. Make the public calculator and stored order quote consume the same server-side calculation rules.

### Scalable catalogue

Add paginated APIs, server-side search, optimized images, product detail routes, bulk import/export, and structured metadata. Keep public catalogue availability separate from admin management data.

### Accessibility and reliability

Adopt an accessibility baseline (labels, focus management, keyboard support, contrast, screen-reader announcements), an error boundary, monitoring, retry behavior, and a browser/device regression suite.

## 13. Recommended Product Roadmap

### Phase 1: Critical fixes

1. Lock down RLS with explicit owner/staff/tenant authorization.
2. Replace anonymous raw inserts with a server-authoritative transactional order endpoint/RPC.
3. Add rate limiting, idempotency, spam protection, input normalization, and privacy disclosure.
4. Add migration/deployment checks and production error monitoring.
5. Disable sample-mode ordering and resolve public runtime/chunk reliability issues.
6. Add automated security, calculation, and order-integrity tests.

### Phase 2: Core product improvements

1. Complete slab-tier CRUD and scheme validation.
2. Add customer confirmation, secure order lookup, and status notifications.
3. Add stock/availability and final-price confirmation semantics.
4. Add owner/staff account provisioning, password recovery, and MFA.
5. Add audit history for products, schemes, prices, and orders.
6. Add paginated server-side catalogue/admin APIs and query-aligned indexes.

### Phase 3: UX and operational excellence

1. Make dialogs and forms WCAG-oriented and mobile-complete.
2. Add product detail/share links, descriptions, distributor contact, and clear disclaimers.
3. Add image upload/validation and bulk product tools.
4. Add order assignment, internal notes, exports, templates, and SLA indicators.
5. Add funnel, scheme, and response-time analytics.

### Phase 4: Advanced features and differentiation

1. Multi-tenant/multi-distributor workspaces with scoped pricing.
2. Reorder recommendations and best-quantity optimization.
3. Promotion calendars, expiry alerts, and approval workflows.
4. Retailer history, saved lists, and offline/PWA field use.
5. Integrations with CRM, ERP, inventory, WhatsApp Business, and accounting systems.

## Honest Assessment

### Is this ready for real customers?

**No.** It is a promising demo/early MVP and the build is technically healthy enough to continue, but the authorization vulnerability, anonymous trust boundary, non-atomic orders, incomplete scheme administration, and missing customer/operational follow-through make production launch unsafe.

### Five biggest weaknesses

1. No real authorization boundary between owners and arbitrary authenticated users.
2. Client-trusted, anonymous order and price writes with weak abuse protection.
3. An order request is not a complete customer or distributor workflow.
4. Scheme management is incomplete, especially for slab promotions.
5. Accessibility, error recovery, and scale-readiness are below a paid-product bar.

### Ten most important things to fix

1. Restrict RLS to authorized tenant members.
2. Move order creation and pricing calculation server-side.
3. Make order creation atomic and idempotent.
4. Add rate limiting and privacy controls.
5. Prevent sample-mode orders.
6. Complete slab CRUD and scheme validation.
7. Add customer confirmation/status lookup/notifications.
8. Add audit logging and operational history.
9. Add pagination, indexes, monitoring, and error recovery.
10. Fix form labels, modal keyboard behavior, mobile navigation, and price/estimate clarity.

### What I would prioritize personally

I would stop feature expansion and spend the first release cycle on security and trusted data boundaries. In practical order: (1) authorization model, (2) server-side transactional order/pricing path, (3) customer/operator confirmation loop, (4) complete scheme administration and auditability, and (5) reliability/accessibility hardening. Only after these pass adversarial QA would I invest in analytics, integrations, or differentiation.
