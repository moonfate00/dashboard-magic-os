# P4 AI Simulation Pipeline Acceptance

This slice proves the AI Steward execution lifecycle without enabling UI actions, reading real credentials, or making network requests.

## Closed-loop lifecycle

The deterministic simulation traverses:

1. Verified entitlement and stable feature check.
2. Provider readiness check.
3. Trial reservation.
4. Queued and running task states.
5. Abortable simulated Provider response.
6. Response-received and validating states.
7. Caller-provided structural validation.
8. Usage persistence and trial settlement.
9. Completed and archived task states.

Only an internally issued deterministic simulation can enter this pipeline. An arbitrary function or transport object is rejected, so this acceptance slice cannot be repurposed for network access.

## Failure guarantees

- Locked, unentitled, unknown, or unready requests fail before quota reservation.
- Every trial ticket freezes the lower of signed and local balance, so corrupted local state cannot enlarge paid access.
- Callers cannot mark paid execution as non-billable; billing policy is not accepted from UI input.
- Concurrent requests for the same Provider and feature are rejected.
- Cancellation, timeout, Provider failure, and validation failure do not charge trial quota.
- Usage persistence failure rolls the quota state back and performs a failure settlement where possible.
- Job persistence failure is surfaced as pending recovery and never represented as a successful state change.
- If usage was already charged before completion-state persistence fails, the result is `completed-persistence-pending`, not a retryable failure; this prevents accidental double charging.
- Persistent jobs and ledgers contain only allowlisted metadata; prompts, payloads, generated data, validation details, and credentials are excluded.

## Release boundary

The AI Steward view remains non-interactive. This pipeline is exercised only by tests and has no real Provider transport or public command. Connecting real execution requires a separate reviewed slice with SecretStorage scope, verified entitlement, abortable HTTPS transport, write confirmation, and rollback UI.
