# Checkout access: structural cut

Status: contracts, additive persistence, isolated transaction service and administrative recovery service. The migration is NOT applied.
No current public/admin route imports the v2 schemas or reads the new models.
Existing authorization remains unsafe until the coordinated activation cut.

The isolated first-charge guard now reuses the prepared charge-attempt structure.
See `checkout-charge-guard.md`: durable intent before POST, blocked uncertain
results and GET-only verified reconciliation. It remains disconnected from routes
and the previous prepared integration; no migration or rollout was performed.

Integration descriptors, a shared transactional sale factory and server-specific
read-only payment adapters are now prepared but inactive. See
`checkout-v2-preparation.md` for the audit of both servers, exclusive cutover
protocol, 56 isolated tests and proven activation blockers. No existing route or
payment callback was replaced/activated by that preparation.

## Administrative recovery cut (2026-10-14)

`recoverCheckoutAccess` and `revokeCheckoutAccess` extend the existing common
service, still absent from package exports and all routes. They reuse the v2
contracts and prepared access/audit models without schema/migration changes.

- Actor/tenant must come from authenticated backend context, never the body.
  The service rechecks the tenant's current ACTIVE SUPER_ADMIN account under a
  SHARE lock, event ownership and the PUBLIC registration under its row lock.
  Contact relation ownership is checked before reading the effective destination;
  contacts and old tokens never locate or authorize the registration.
- New RECOVER/REISSUE actions require paymentStatus PENDING or PAID and the
  complete human-verification attestation. They never promote participant,
  payment, waitlist, app, credential or check-in eligibility.
- Effective destination precedence is local checkoutEmail, Person email, Visitor
  email. Existing destinations cannot be overwritten. Only RECOVER may supply
  the missing destination, stored on this Registration without touching shared
  contacts or other registrations. REISSUE accepts no email and fails when the
  effective destination is absent. No existing email-sending consumer was changed.
- Caller retains a newly generated private key before the request. The service
  persists only its hash and issues ADMIN_RECOVERY with an absolute 24-hour TTL
  and no public-attempt fingerprint/payment-method replacement. Keys already
  bound anywhere, including expired/revoked keys, cannot be reused as fresh keys.
- RECOVER does not silently replace an unrevoked grant: it requires explicit
  REISSUE instead, even after expiry. REISSUE revokes previous unrevoked grants
  and inserts the new grant/audit atomically. Historical fingerprints/methods,
  provider IDs, financial links, amounts, snapshots and sent-email markers stay
  intact. REVOKE removes only the current scoped checkout grant and records the
  required reason; it remains possible after a financial reversal.
- Tenant-wide operation UUID lock precedes the existing key/event/registration
  lock ordering. Append-only audit is in the same transaction as destination,
  grant and revocation effects. Failure of any write rolls the whole action back.
  The audit stores actor, action and minimal verification/channel references or
  revocation reason, never raw credentials, identity documents or provider data.
- Idempotence binds normalized UUID, actor, scope, action, payload and fresh key
  through a keyed fingerprint. Revocation uses the target's 256-bit credential
  digest as its HMAC key, so a lost key is unnecessary. A completed replay returns
  the original access with CURRENT expiry/revocation metadata and never renews or
  restores it; revocation replay cannot revoke a later reissued access.
- Recovery additionally retries the specific operation-UUID/single-unrevoked
  uniqueness races after rollback, using the existing bounded retry policy.
  Unrelated constraints and uncertain timeouts still fail without automatic retry.

Validation: all 41 isolated tests passed (23 previous + 18 recovery tests), with
TypeScript passed for events, events-api, api-br and the isolated tests; diff
check passed. The protocol double proves neither real
PostgreSQL locks/constraints nor human verification or actual delivery.
Operational evidence policy, delivery through the verified channel and an
authorized isolated PostgreSQL concurrency test remain activation gates.
No API route, delivery adapter, migration application, data access, provider call,
commit/push or charge-creation guard was added in this cut.

## Second cut: transaction service (2026-10-14)

`checkout-access.service.ts` now provides `generateCheckoutCredential`,
`createCheckoutAttempt` and `withCheckoutAuthorization`. It is deliberately not
exported from the package entry point or imported by any route. Existing unsafe
contact/legacy-token paths are unchanged; this service does not activate security.

- Generation uses 32 cryptographically random bytes; only SHA-256 is persisted.
  Canonical normalized v2 input has an HMAC fingerprint keyed by the private
  credential, including scope, CPF, answers and the semantic payment method.
- Transactions use Serializable isolation, global credential advisory lock,
  existing public-registration event advisory lock, then registration row lock.
  Authorization re-reads the access after acquiring the registration lock and
  checks its hash, scope, issuance, absolute expiry and revocation.
- An equivalent retry returns the existing registration and original expiry
  before NEW-sale validation. Conflicting payload/method fails. Bound keys never
  create a fresh attempt in another scope or after expiry/revocation.
- Matching phone/email/local checkout destination only causes an assistance
  error, without returning the existing identity or granting access.
- Creation receives a required internal database-only factory using the SAME
  transaction. The later activation cut must adapt the existing sale domain to
  this interface: it must validate the NEW sale and create a new registration
  and its official financial graph, without contact deduplication, provider/mail
  calls or nested transactions. The current legacy creator is not compatible.
  This cut adds the transaction boundary, not that route/domain adapter.
- Local checkout email and the access insert commit with the factory's writes.
  The service itself never changes financial status, amounts, snapshots,
  references or methods. Authorized internal operations must separately check
  payment/app/credential eligibility; checkout access alone does not grant those.
- At most two retries follow a rolled-back serialization/deadlock failure or
  the specific stale-snapshot credential-hash unique conflict. Timeouts,
  unrelated constraints and validation errors do not retry. No external call is
  made here, and no charge attempt is reset or created.

The generated Prisma Client still represents the previous schema. New-table
operations use typed, parameterized SQL against the prepared structure; no
client generation, schema/migration edit, database connection or migration was
performed. Recovery/audit operations and charge creation guards remain separate
cuts. Future recovery/revocation must acquire the same registration row lock.

Validation: 14 isolated service tests plus 9 existing contract tests passed.
The transaction double checks protocol, rollback, concurrent callers and bounded
retries; it does NOT prove PostgreSQL constraints/locks/isolation or financial
sale-domain behavior. TypeScript passed for events, events-api and api-br.
An authorized isolated database is still required for database concurrency proof.

## Approved boundaries

- Opaque checkout credential, absolute 24-hour validity, no polling renewal.
- No authorization or credential issuance from name, phone, email or legacy token.
- Matching contacts require assistance; they must not bind a new attempt to an
  existing registration. The service must not silently create a duplicate on conflict.
- Recovery/reissue only by authenticated SUPER_ADMIN after human verification,
  with persistent audit and delivery through the verified channel.
- Affected PUBLIC registrations with paymentStatus PENDING or PAID are eligible
  for recovery. This does not make CANCELLED, waitlisted or otherwise ineligible
  registrations eligible for payment, credential, app or check-in.
- Preserve registration identity, links, payment state, provider references,
  amounts, discount and fee snapshots. Never replace a charge or payment method
  implicitly. No automatic backfill or conversion of legacy checkout tokens.

## Prepared contracts (not registered endpoints)

`checkout-access.schema.ts` is intentionally not re-exported by the package entry
point and is not wired into current routes.

| Consumer | Header/body | Required future behavior |
| --- | --- | --- |
| Both existing public register routes | `X-Event-Checkout-Key: ec2_<32 bytes as base64url>`; strict v2 registration body | Generate/persist the private key before first request. Create and bind access atomically; matching key retries reuse the same registration. |
| Existing checkout/status | Same private header; empty strict body | Resolve church/event from route and registration from the stored access; reject all old tokens. |
| Dedicated checkout resume | Same private header; optional validated CPF only | Resolve current payment and method from backend. No participant data, payment IDs or method replacement from this body. |
| Admin recovery | Resolved event/registration params; operation UUID, RECOVER/REISSUE and human attestation | Require current SUPER_ADMIN and backend tenant. RECOVER may supply missing email; REISSUE never changes email. Require email when effective destination is absent. |
| Admin revocation | Operation UUID and reason | Revoke private access only, append audit. Do not change financial or credential state. |

The header key is canonical, unpadded base64url with a version prefix; its format
does not prove entropy. Generate with a cryptographic random generator in the
later client/service cut. Store only its SHA-256 hash, compare safely, redact the
header in both API loggers, and never put it in a URL query or analytics.

Creation responses identify the registration and absolute expiry; they must not
mint the legacy checkoutToken. Status/resume responses use an explicit allowlist,
with credential/app fields only after backend eligibility. API keys and admin
lists never expose access hashes, raw keys, verification references or attempts.

Recovery clients must retain a fresh private key before submitting the verified
operation, allowing safe retry after a lost response without storing plaintext
keys on the server. Reissue revokes previous unrevoked grants and inserts the new
grant in one transaction. A raw key is not human proof; actor, scope and time are
resolved from trusted backend context. Delivery follows the verified human channel;
this cut adds no mail, SMS, upload or automatic verification mechanism.

## Persistence

- `Registration.checkoutEmail`: nullable destination specific to this registration.
  Legacy remains NULL; no mutation of shared Person/Visitor. Future creation sets
  the local destination; recovery fills it only when the effective destination is
  absent. Existing local/contact email must not be overwritten. Repeating the same
  recovery returns its result, while conflicting email/payload fails.
- `EventCheckoutAccess`: unique credentialHash, composite registration FK, source,
  nullable keyed request fingerprint and initial semantic payment method, createdAt,
  expiresAt and revokedAt. Public attempts require fingerprint/method; recovery
  grants cannot redefine either. At most one unrevoked grant per registration.
  Expired grants remain recorded, and reissue explicitly revokes them first.
- `EventCheckoutRecoveryAudit`: completed action and operation UUID unique within
  church, keyed request fingerprint, trusted account/role, scope and access FK,
  human attestation or revocation reason. Append in the same transaction as the
  effect. Never store documents, CPF, raw tokens or provider responses. Audit
  records and expired/revoked accesses are not automatically deleted.
- `EventCheckoutChargeAttempt`: unique payment/Transaction binding via composite
  FK, initial semantic method, STARTED/SUCCEEDED/UNCERTAIN and optional provider ID.
  This is an operation guard, not another payment ledger. No historical attempts
  are fabricated. An absent legacy reference is not proof that creation is safe.

The migration adds nullable email, three tables, enums, unique indexes, composite
FKs and CHECK constraints. It contains no historical DML or destructive operation.
Prisma does not represent the partial index and CHECK constraints; preserve their
handwritten SQL when generating any subsequent migration.

## Required transaction protocols for later cuts

1. Resolve event/tenant; acquire the registration/attempt lock with consistent lock
   order. Lookup the private key before revalidating NEW sale availability.
2. Credential hash is unique globally: a key bound to another scope is rejected,
   never reused for a second event or registration. Same key/same canonical keyed
   fingerprint returns the existing attempt; incompatible payload is a conflict.
   Normalize consistently across both public routes; do not store raw CPF or answers
   in the fingerprint record. Invalid/expired/revoked keys never start a new attempt.
3. Bind new registration/order/payment/Transaction and access in one transaction.
   Contact coincidence only routes to assistance without revealing private data.
4. Recovery locks registration and access, validates related ownership, rechecks
   destination/payment state and writes email/access/audit atomically. PENDING or
   PAID recovery never writes status, amounts, financial links or provider references.
5. Charge creation commits STARTED before contacting the provider. Serialization
   and uniqueness claim one attempt. Crash/timeout leaves it blocked for
   reconciliation, never reset to STARTED or automatically retried. SUCCEEDED
   requires a known reference. A reference disagreement fails closed.
6. Preserve existing email eligibility, row lock, provider idempotency key and
   confirmationEmailSentAt. Filling email does not grant paid access or reset the
   sent marker. Webhook/recovery races require rereading state under compatible locks.

Unique constraints enforce identity/binding, not the entire transaction protocol.
The isolated structural tests do NOT prove database locking, provider idempotency,
human verification, or runtime authorization of any route.

## Activation gate (not executed in this cut)

Block the affected public entry points in BOTH api-br and events-api; drain old
requests; apply the reviewed additive migration only with authorization; install
the coordinated v2 services and clients; verify rejection of legacy tokens and
negative authorization paths before reopening. Keep payment webhooks operating.
No dual acceptance/fallback for old tokens. Keep checkInToken and general JWT intact.
A rollback keeps public checkout closed; it must not restore unsafe access.

Human evidence policy still needs an explicit operational definition before a
recovery route is activated; arbitrary labels or a checkbox are not proof by themselves.
Future database concurrency tests require an authorized isolated environment.
