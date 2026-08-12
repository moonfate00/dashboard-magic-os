# P5 Personalization Import and Export Acceptance

This slice adds bilingual personalization import and export to the plugin settings page.

## Portable preference boundary

Version 1 exports exactly two preferences:

- `interfaceLanguage`
- `storagePreference`

The active `storageProfileId`, setup completion, and storage schema version are bound to the current vault and are not portable preferences. Vault contents, file paths, records, people, health data, prompts, outputs, Provider keys, signed entitlements, jobs, usage ledgers, caches, and snapshots are never exported.

The exported JSON contains a fixed format ID, version, timestamp, and preference object. Unknown top-level or preference fields are rejected on import. Private-data keys and absolute user paths are rejected anywhere in the package. Invalid or missing preferences fail instead of silently falling back. Package and file sizes are bounded before application.

Version 0 has one explicit migration map from `language` and `storage` to the version 1 fields. Future versions fail closed until a migration is registered.

## Import flow

1. The user chooses one local JSON file.
2. The package is parsed, migrated, allowlisted, and normalized in memory.
3. A bilingual modal previews each before and after value.
4. Only the exact opaque, single-use confirmation object can apply the import.
5. Saving happens before in-memory settings and translated command state change. A persistence failure preserves the current settings and locale.
6. The current vault binding and setup state remain unchanged. Import does not initialize, scan, create, move, rename, or modify vault records.

File-picker cancellation is a no-op. The settings surface reports export, import, and failure state through localized notices.

Acceptance requires the complete `npm run check` gate.
