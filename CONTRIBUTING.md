# Contributing

Thank you for helping improve Dashboard Magic OS.

## Before opening a change

- Use synthetic fixtures only. Never contribute vault content, `data.json`, people or health records, local paths, credentials, entitlements, usage state, snapshots, or backups.
- Keep stable field names, feature IDs, and storage paths language-neutral.
- Put every user-facing string in both locale packs.
- Preserve the locked AI Steward boundary unless the change includes the required private-adapter, entitlement, cancellation, persistence, confirmation, and rollback evidence.

## Local verification

```bash
npm ci
npm run check
npm run package:verify
```

Pull requests should describe privacy impact, compatibility impact, tests performed, and whether any persistent schema changes are introduced.
