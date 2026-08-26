# P0 Public / Private Core Fusion

## Outcome

The public repository is the single source of truth for four pure, privacy-safe foundations:

- shared value and YAML helpers;
- media-source normalization and preview selection;
- record indexing, identity resolution, and P1/P2 hierarchy queries;
- record-relation indexing, traversal, and person-health lookup.

The private development edition no longer carries executable copies of these algorithms. Its legacy facade keeps the existing function names only by aliasing reviewed public exports, so the rich private interface can continue to run while application modules are migrated incrementally.

## Build boundary

The private sync allowlist copies only reviewed source modules and records their SHA-256 hashes in `source/public/PROVENANCE.json`. The candidate build rejects missing or modified vendored sources before bundling. No Vault records, plugin settings, histories, snapshots, credentials, or entitlement payloads cross this boundary.

## Localization boundary

Pure relation services contain no fixed Chinese interface strings. The private host supplies `wikilinkLabel`, `wikilinkReverseLabel`, and `wikilinkSourceLabel` when building its relation index. Public applications supply their own locale strings through the same options.

## Regression gates

Fusion is accepted only when:

1. public tests exercise the canonical modules;
2. private compatibility tests import those same vendored modules;
3. the architecture check rejects any `function magicOS...` reimplementation inside the fused facade markers;
4. the candidate provenance audit verifies every vendored hash;
5. public, private, issuer, production-drill, and user-data guards all pass.

## Next slices

The next fusion targets are the Learning Threads application model, the Organizer application model, and the People / Health privacy projection. They will migrate one application at a time without moving or rewriting existing user records.
