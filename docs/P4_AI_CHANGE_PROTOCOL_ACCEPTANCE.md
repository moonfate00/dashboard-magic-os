# P4 AI Change Confirmation and Rollback Acceptance

This slice defines the first write boundary for AI Steward without enabling its locked interface or connecting a real provider.

## Safety contract

- Provider output is only a proposed versioned change plan. Preview performs no writes.
- A plan may create or update Markdown records only under the active profile's Command, Assets, Social, Navigation, or Memory record roots.
- Delete, rename, folder creation, template, view, system, hidden, binary, traversal, duplicate-target, oversized, and cross-profile operations are rejected.
- Preparation verifies operation intent, requires existing parent folders, and keeps the original file contents only in an in-memory confirmation snapshot.
- Application requires `confirmed: true` and the exact opaque confirmation object issued by the protocol.
- Confirmations expire, can be cancelled, and are reserved synchronously before I/O so concurrent or repeated application cannot replay them.
- Every target is compared with its prepared snapshot immediately before writing. A later user edit causes a conflict instead of an overwrite.
- Partial failures roll back confirmed writes in reverse order. Rollback changes only a file whose current content still equals the content written by this plan.
- A storage call that may have changed data before rejecting is inspected. Unknown state is reported as `rollback-failed` and is never overwritten automatically.
- Results and transition projections contain operation metadata only; record contents, previous contents, prompts, and provider details are not projected or persisted.

The Obsidian storage adapter now exposes read, create, modify, and trash-aware removal capabilities for this protocol. The protocol remains disconnected from the visible AI Steward controls.

## Remaining gate

In-process failures are covered here. A real provider integration remains locked until the private runtime supplies a durable, private recovery journal for process termination during an active multi-file write and a recovery interface for unresolved rollback conflicts.

## Acceptance evidence

Automated tests cover path and operation allowlists, size limits, preview purity, explicit confirmation, forged and expired confirmation rejection, cancellation, concurrent replay, optimistic concurrency, partial rollback, post-write rejection, unknown write state, rollback failure, transition projection failure, and privacy-safe result projection.

Acceptance requires the complete `npm run check` gate.
