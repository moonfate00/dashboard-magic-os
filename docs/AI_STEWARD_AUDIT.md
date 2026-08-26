# AI Steward Safety Audit

This audit defines the boundary that must be stable before the paid AI Steward interface is migrated into the public plugin. It covers provider protocol handling, entitlement verification, trial accounting, transport cancellation, task recovery, and persisted metadata.

## Audit result

The private production implementation passed its existing architecture, provider, entitlement, core-service, and plugin-load regression suite after one real defect was corrected: card-library planning opened a deferred usage reservation but did not settle it on success or abort it on failure. The call site now settles both paths, and the architecture check prevents that regression.

The public core supplies the credential-free contracts, Provider lifecycle, entitlement model, durable write journal, recovery rules, and package-safe UI needed by the private adapter. The installed private development candidate now bundles those boundaries and overrides every current billable Provider business entry with a dedicated sandbox method. Production activation remains disabled until real signing configuration and desktop/mobile device testing are complete.

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
| Classification exposes Vault paths or lets the model invent storage routes | Reviewed local paths become opaque tokens before dispatch; outputs must use the fixed route catalog and locally selected body profiles. |
| Learning output invents source files, coverage nodes, or graph references | Card sources map through a local token table, coverage keys are allowlisted, graph edges stay inside the response, and omitted coverage receives a marked local fallback node. |
| Existing-file planning exposes record paths or lets output patch protected state | Reviewed records become opaque source tokens; output must map to an exact token and reviewed type, while protected fields, credentials, local references, and duplicate field patches fail validation. |
| Card-library planning expands the user's subject or creates unsafe content | The subject and topic allowlist are fixed locally, tools are disabled, local references and active content are rejected, and excerpts or reviews require their matching public provenance. |
| Closing an existing-file or card-library planner leaves a billable request running | Both private entry points forward a live abort signal into the sandbox; cancellation releases unsettled trial reservations, and legacy settlement is skipped for sandbox-managed usage. |
| Card-library apply partially writes over an existing structure | The legacy confirmation path now preflights every generated path and rejects duplicate or occupied targets before its first write. |
| A user-authored Skill controls Provider prompt, schema, tools, or billing | Skill execution now uses a fixed read-only contract; callers provide only the Skill name, definition, task, timeout, and cancellation signal. |
| A Skill definition leaks credentials or local Vault paths | The definition and task are checked independently for credential signals, local references are redacted before transport, and validated output cannot reintroduce local paths or WikiLinks. |
| Skill failure persists raw model output in job metadata | The raw preview fallback was removed; failure state keeps only bounded, redacted status information. |
| Process termination leaves a multi-file AI change ambiguous | A durable journal is created before mutation, marks every operation around its write, and classifies restart state as untouched, applied, or conflict before any recovery action. |
| Recovery overwrites a user or sync edit made after the crash | Only exact AI-written content is eligible for automatic rollback. Every third content state requires manual review. |
| Journal replacement crashes between old and new state | Serialized three-slot persistence restores the last complete commit from `.prev` and discards an uncommitted `.next` slot. |
| Locked entitlement prevents users from recovering existing work | Recovery inspection and confirmed recovery remain available independently of paid execution access. |

## Required private adapter contract

The paid entitlement implementation remains outside the public core. Its adapter must:

1. Provide the verification function to `createVerifiedEntitlementAdapter`; it must verify signature, issuer, audience, subject, expiry, features, and trial balance before returning claims.
2. Never treat persisted `verified`, `verification`, or `source` fields as proof. The public core stamps verification state only after the verifier succeeds.
3. Store provider credentials in Obsidian SecretStorage or an equivalent secret store, never plugin settings, logs, exports, or job records.
4. Use the abortable fetch transport or another adapter that proves equivalent cancellation behavior.
5. Keep prompts, source records, generated output, and signed entitlement payloads out of persistent usage and job metadata.
6. Settle every usage ticket exactly once on success or failure; retry persistence before allowing the same reserved quota to be reused.
7. Read only the fixed OpenAI and DeepSeek SecretStorage slots. The public adapter never enumerates secrets and never accepts arbitrary secret IDs.

## Private P0 implementation status

The bundled private runtime contains `ai-entitlement-adapter.js` with these enforced properties:

- Compact JWS with pinned `ES256` and a product-specific protected-header type.
- One fixed SecretStorage entitlement slot; no settings, file, network, or Provider-key access.
- Issuer, audience, subject, issued-at, not-before, expiry, feature, trial-balance, and entitlement-ID validation.
- `kid`-based public-key rotation plus an explicit revocation list; unknown and revoked keys fail closed.
- A safe projection that omits subject, entitlement ID, raw claims, signature, and envelope.
- Contract tests for valid claims, tampering, issuer/audience mismatch, invalid time bounds, unknown features, key rotation/revocation, and fixed-slot access.
- SecretStorage failures collapse to the fixed verification error; raw platform exceptions do not leave the adapter. Explicit entitlement removal bypasses offline grace so the in-memory runtime locks immediately.

The signed adapter, provisioning commands, fixed-origin Provider sandbox, atomic recovery persistence, and recovery UI are bundled into the installed single-file candidate. `MAGIC_OS_AI_ENTITLEMENT_MODE` remains `development`, so production verification is present but deliberately inactive until issuer metadata, public keys, and real-device gates are ready.

## Remaining release gates

- Provision production issuer/audience values and the first offline signing key; embed only reviewed public JWKs.
- Build a production candidate with the real public verification configuration and test expiry/revocation offline on desktop and mobile.
- Test live-provider cancellation in Obsidian desktop and mobile; do not fall back to a request API that ignores abort signals.
- Add remaining UI tests for Provider double-submit prevention, retry, cancellation, offline state, and expired entitlement; crash recovery and unresolved rollback UI tests now pass.
- Keep development simulators out of production source and distribution artifacts.
- Run `npm run check` after every AI Steward slice and before packaging.

The isolated production drill now passes with an ephemeral in-memory key and public-only temporary configuration. It verifies build/audit/load plus missing, tampered, active, offline-grace, expired, revoked, and removed entitlement states, then removes the drill candidate and confirms the installed development runtime and plugin settings were unchanged. This does not replace real-device testing or authorize use of the drill issuer in a release.

The AI Steward UI should be migrated only through this boundary. Provider credentials, signed claims, private prompts, user records, and usage ledgers are not public-repository assets.
