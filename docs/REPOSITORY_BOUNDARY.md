# Repository Boundary / 仓库边界

## Allowed

- Plugin source and build scripts
- Automated tests
- Locale packs
- Public documentation
- Deliberately selected, distributable assets
- Synthetic or fully anonymized fixtures

## Forbidden

- A personal Obsidian vault or any `Dashboard/Private` tree
- Plugin runtime `data.json`
- Person cards, health records, family records, private journals, or task history
- API keys, access tokens, signed entitlements, or provider usage ledgers
- Object history, snapshots, backups, caches, or deleted-file archives
- User-specific absolute filesystem paths
- Images without confirmed redistribution rights

## Migration rule

Code moves from the private runtime into this repository only by a reviewed application or service slice. Do not copy the whole plugin directory and clean it afterward.

Every migrated slice must pass:

1. Existing private-runtime regression tests.
2. Public-repository tests.
3. `npm run audit:release`.
4. Chinese and English interface review.

The lifecycle-level separation between user vault content, minimal local plugin state, and public upgrade metadata is defined in [Data Boundary](DATA_BOUNDARY.md).
