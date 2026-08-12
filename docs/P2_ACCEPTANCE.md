# P2 Acceptance — Portable Storage Profile

P2 separates translated interface labels from stable on-disk identifiers.

## Profiles

### Portable

New installations use a language-neutral `MagicOS/` tree. Cabin names may be translated in the interface, but their persisted paths remain stable:

- `MagicOS/Records/Command`
- `MagicOS/Records/Assets`
- `MagicOS/Records/Social`
- `MagicOS/Records/Navigation`
- `MagicOS/Records/Memory`
- `MagicOS/System`
- `MagicOS/Templates`
- `MagicOS/Views`

### Legacy Dashboard

Existing Chinese vaults can retain their established `Dashboard/` paths. Compatibility mode does not migrate or rename existing content.

## Safety contract

- Plugin load performs read-only detection.
- The first-run modal is deferred until Obsidian layout readiness.
- Folder creation requires explicit user confirmation.
- Initialization creates missing folders only.
- Existing folders are recorded as preserved.
- Re-running initialization creates nothing and changes nothing.
- Absolute paths and path traversal are rejected before any storage operation.
- No sample person, health, family, journal, or task records are created.

## Persisted settings

- `storagePreference`: `auto | portable | legacy-dashboard`
- `storageProfileId`: selected concrete profile
- `storageSetupCompleted`: whether the user confirmed setup
- `storageSchemaVersion`: current storage contract version

These settings are independent from `interfaceLanguage`. Switching between Chinese and English never changes disk paths.

## Automated evidence

- Empty-vault detection recommends portable storage without mutation.
- Existing Dashboard detection recommends compatibility without mutation.
- Manual selection overrides the recommendation without mutation.
- Portable initialization is complete and idempotent.
- Plugin integration proves storage writes occur only after explicit setup confirmation.
- The release scanner still rejects direct private-vault paths outside the isolated compatibility mapping.

P3 can now migrate pure services against `plugin.storageProfile().paths` rather than global `Dashboard/...` constants.
