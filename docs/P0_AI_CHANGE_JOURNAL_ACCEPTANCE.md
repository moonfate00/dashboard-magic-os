# P0 AI Change Journal Acceptance

This slice adds the durable transaction boundary required before AI Steward may perform real multi-file writes. It does not unlock the public AI controls or persist any runtime data in plugin settings.

## Transaction contract

- The journal is written durably before the first record mutation.
- Each operation is marked `applying` before its storage call and `applied` only after that call succeeds.
- Journal creation is create-only, updates require atomic replacement, and opaque IDs cannot select a storage path.
- Recovery compares every target with both the prepared original and the confirmed AI result.
- A target that still matches its original is treated as untouched; a target that matches the AI result can be rolled back; every third state requires manual review.
- Automatic recovery repeats those comparisons immediately before reverse-order rollback and never overwrites an unknown current value.
- A fully committed journal is archived without undoing the user's confirmed changes.
- Recovery reports contain operation IDs, kinds, managed paths, and observed states only. Original and generated record contents remain inside the private vault journal.
- Corrupted versions, identifiers, paths, operation states, duplicate targets, timestamps, and size limits fail closed before storage mutation.
- Recovery confirmation tokens are opaque, in-memory, single-use, and invalidated when the observed state changes.
- Obsidian persistence serializes create, replace, scan-repair, and removal operations and uses current, `.next`, and `.prev` slots so an interrupted replacement restores the last complete journal.
- Startup scanning creates no folder and changes no user record. It only repairs incomplete internal journal slots and projects safe recovery actions.
- Recovery remains available while paid execution is locked. The UI requires a second opaque confirmation before clearing, archiving, or rolling back a journal.

## Data boundary

The public repository contains the journal protocol, fixed-profile Obsidian persistence adapter, and privacy-projected recovery UI. Persistence binds to the active vault's fixed `System/AI-Recovery` root and provides create-only journal creation plus serialized atomic replacement. Recovery snapshots are vault content: they must never enter `data.json`, personalization exports, logs, public upgrade metadata, Git, entitlement storage, or usage/job projections.

The installed private OS now contains a dormant fixed-root bridge and matching tested Obsidian three-slot persistence adapter. The current monolithic entry remains unchanged; it must consume the bundled public journal core and recovery UI before its real AI write paths can unlock.

## Acceptance evidence

Automated tests cover pre-write durability, marker/write ordering, journal failure before mutation, crash after an unmarked successful write, safe rollback, committed-transaction archival, third-party conflict preservation, opaque UI confirmation, locked-entitlement recovery, startup notice and projection, confirmation and stale-token behavior, corrupted path rejection, fixed private roots, bounded payload parsing, interrupted three-slot replacement, colliding create-only calls, and unsafe filename rejection.

Acceptance requires the complete public and private `npm run check` gates.
