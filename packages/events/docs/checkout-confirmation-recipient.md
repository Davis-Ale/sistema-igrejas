# Registration confirmation recipient

This cut consumes the already prepared Registration.checkoutEmail. It does not activate checkout v2, connect routes, alter contracts/schema/migrations, or change financial eligibility.

The existing delivery consumer was moved into registration-confirmation-delivery.service.ts. All four event.service.ts callers retain their signatures and use this consumer. The email adapter and its stable event-registration/registrationId key are unchanged.

The same scoped Registration FOR UPDATE lock is acquired before rereading the registration, eligibility and destination. SQL projects only id and to_jsonb(r)->>'checkoutEmail'; an absent additive column produces a missing JSON key instead of an undefined-column query. This supports the old generated client without generate/migration or exception fallback. Actual SQL/locking must still be proved in an authorized isolated PostgreSQL environment.

A valid nonblank local email owns the destination even when Person/Visitor email differs or is absent. Null/blank/absent local email retains the existing scoped participant contact fallback. A nonblank invalid local email blocks delivery rather than redirecting a credential to that contact. The existing v2 email validator is reused without contract changes. Related contact/event ownership is checked. No contacts or other registrations are mutated, and a destination is never an authorization credential.

Existing eligibility remains CONFIRMED + PAID + no waitlist, with no existing confirmationEmailSentAt. PENDING, CANCELLED, CHECKED_IN and NOT_REQUIRED do not gain delivery eligibility. Success writes only confirmationEmailSentAt in the existing transaction; failed delivery/commit leaves retry available with the same provider key. No durable worker/outbox, new retry policy, marker reset, financial transition or exactly-once guarantee is added. Provider acceptance followed by a failed commit still depends on the existing external idempotency behavior/window.

Validation: 95 isolated tests (80 prior + 15 new), TypeScript events, both APIs and source/tests, and git diff --check. Tests cover shared contacts, separate registrations/credentials, local precedence, fallback, invalid local values, scope/relationships, ineligibility, existing marker, concurrent delivery, provider rejection/exception, failed marker commit, reread under lock, and the actual QR/Resend adapter with all fetch requests mocked and a dummy key. No PrismaClient, database, network or real delivery is exercised.

The complementary existing Jest adapter test could not initialize because realpath of its temporary directory returned EPERM, including when configured inside the workspace. The Node/tsx adapter test passed; no Jest result is claimed. Remaining gates are PostgreSQL and real external proof plus the unchanged coordinated activation/guard binding/historical CARD/human evidence and channel policies.
