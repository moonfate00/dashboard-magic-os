# P4 Organizer Acceptance

Organizer is the first complete public application slice built on the P3 services.

## Included

- The main plugin command opens a registered Obsidian `ItemView`.
- Records are scanned only beneath the active storage profile's asset root.
- Both portable `MagicOS/` storage and the legacy Dashboard compatibility profile use the same application model.
- `asset-collection` records are resolved through stable `entity_id` and `asset_members` relations.
- Root collections, nested collections, missing references, and type counts are derived from one relation index.
- Manual, query, and hybrid collection modes are supported.
- Image previews use injected Obsidian media capabilities.
- Collection and member views have Chinese and English interface text and responsive layouts.
- Opening a member delegates to Obsidian's file view.

## Safety boundary

This first slice is read-only. It does not create, rename, reorder, delete, or rewrite collection records. Tests use synthetic records only; no personal vault data or screenshots were copied into the repository.

## Deferred

- Creating collections and adding or removing members
- Drag ordering and moving nested collections
- Multi-select and batch operations
- Masonry focus mode and advanced media controls
- Editing dynamic-query rules

Those behaviors will be added as separate, reversible slices after the read-only path has been exercised in a public-compatible vault.

## Verification

Acceptance requires `npm run check`: unit tests, locale parity and interface-literal audits, privacy audit, production build, and release audit.
