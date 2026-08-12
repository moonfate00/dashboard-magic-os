# AI Steward Safety Audit

This audit defines the boundary that must be stable before the paid AI Steward interface is migrated into the public plugin. It covers provider protocol handling, entitlement verification, trial accounting, transport cancellation, task recovery, and persisted metadata.

## Audit result

The private production implementation passed its existing architecture, provider, entitlement, core-service, and plugin-load regression suite after one real defect was corrected: card-library planning opened a deferred usage reservation but did not settle it on success or abort it on failure. The call site now settles both paths, and the architecture check prevents that regression.

The public core is intentionally not a complete paid AI runtime yet. It now supplies tested, credential-free safety primitives for the later adapter and interface migration.

## Resolved risks

| Risk | Resolution |
| --- | --- |
| UI text used as a paid-feature identifier | All access decisions use a closed set of stable feature IDs. Unknown IDs fail closed, including under wildcard claims. |
| Local or self-claimed entitlement unlocks production | Production snapshots can be issued only after the injected verifier returns claims. Copying `verified` fields cannot unlock access. Missing mode defaults to production lock. |
| Locally edited trial count overrides signed entitlement | Production trial balance comes only from the verified claim. |
| Malformed expiry creates accidental perpetual access | Non-empty invalid timestamps lock the entitlement. |
| Concurrent requests oversubscribe trial quota | Trial reservations are checked atomically before provider dispatch. |
| Concurrent settlement loses a ledger entry | Persistence is serialized; failed saves roll back and leave the ticket retryable. |
| Forged or mutated usage tickets alter accounting | Tickets are frozen and must be issued by the current manager instance. |
| Usage ledger leaks prompts, keys, or arbitrary runtime fields | The ledger stores allowlisted provider/feature IDs and numeric request metadata only. |
| UI timeout leaves a provider request running | The transport requires `AbortController`, propagates user cancellation, and aborts on timeout. |
| Arbitrary provider URL exfiltrates credentials | Fetch transport requires HTTPS and an explicit origin allowlist. |
| Oversized provider responses exhaust memory | Transport applies a configurable response-size limit. |
| Provider output or token values poison local state | Multipart output is normalized; non-finite or negative usage becomes zero. |
| Recovery skips validation or application stages | An explicit job state machine rejects invalid transitions and includes retry/rollback paths. |
| Persisted jobs retain prompts or generated content | The persistence projection contains IDs, state, timestamps, attempts, and error codes only. |
| Mock testing accidentally reaches the network | The execution pipeline accepts only deterministic simulations issued by its own module; caller-shaped transports are rejected. |
| Validation or persistence failure charges trial quota | Trial quota is charged only after validated output and successful usage persistence; failure paths release or retain a clearly retryable ticket. |
| UI input overrides Provider endpoint, model, key, billing, or tools | The disconnected Provider sandbox binds fixed endpoints and injected models, uses only SecretStorage scope, forces billable execution, and accepts only parameter-free OpenAI web search. |
| Provider dispatch bypasses entitlement, cancellation, accounting, or job projection | The sandbox assembles those boundaries into one tested lifecycle and accepts only its own origin-restricted transport. |

## Required private adapter contract

The paid entitlement implementation remains outside the public core. Its adapter must:

1. Provide the verification function to `createVerifiedEntitlementAdapter`; it must verify signature, issuer, audience, subject, expiry, features, and trial balance before returning claims.
2. Never treat persisted `verified`, `verification`, or `source` fields as proof. The public core stamps verification state only after the verifier succeeds.
3. Store provider credentials in Obsidian SecretStorage or an equivalent secret store, never plugin settings, logs, exports, or job records.
4. Use the abortable fetch transport or another adapter that proves equivalent cancellation behavior.
5. Keep prompts, source records, generated output, and signed entitlement payloads out of persistent usage and job metadata.
6. Settle every usage ticket exactly once on success or failure; retry persistence before allowing the same reserved quota to be reused.
7. Read only the fixed OpenAI and DeepSeek SecretStorage slots. The public adapter never enumerates secrets and never accepts arbitrary secret IDs.

## Remaining release gates

- Implement the private signature-verification adapter and test issuer/audience/key-rotation behavior.
- Test live-provider cancellation in Obsidian desktop and mobile; do not fall back to a request API that ignores abort signals.
- Add UI tests for double-submit prevention, retry, cancellation, rollback, offline state, and expired entitlement.
- Keep development simulators out of production source and distribution artifacts.
- Run `npm run check` after every AI Steward slice and before packaging.

The AI Steward UI should be migrated only through this boundary. Provider credentials, signed claims, private prompts, user records, and usage ledgers are not public-repository assets.
