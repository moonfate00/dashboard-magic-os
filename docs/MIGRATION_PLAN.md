# Public Runtime Migration Plan

The private runtime remains the production source until each slice is migrated and verified. The public repository does not replace the installed plugin yet.

Cross-edition ownership and backport direction are tracked in the [Public / Private Sync Matrix](SYNC_MATRIX.md).

## P0 — Foundation (complete)

- Independent repository outside the personal vault
- Git ignore and repository-boundary rules
- `zh-CN` and `en` locale packs with parity tests
- Bundled Obsidian output through esbuild
- Release privacy, secret, local-path, and development-mode audit
- Bilingual README and release checklist

## P1 — Shared shell and settings (complete)

- Migrate shared pure utilities and the settings shell
- Add `interfaceLanguage: auto | zh-CN | en`
- Follow the Obsidian locale when set to `auto`
- Migrate commands, buttons, notices, dialogs, and shared empty states
- Add an untranslated-interface-literal audit for migrated source folders

Acceptance evidence:

- `interfaceLanguage: auto | zh-CN | en` is normalized and persisted.
- Auto mode uses Obsidian's language API; manual preference overrides it.
- Locale changes update the translation service, command label, settings UI, and emit a workspace refresh event.
- Shared empty state and translated-button helpers are available for application slices.
- Locale key parity, settings behavior, plugin loading, and direct user-facing literal audits are automated.

## P2 — Portable storage profile (complete)

- Replace personal `Dashboard/...` constants with a configurable storage profile
- Add first-run onboarding and folder/template creation
- Preserve a legacy profile for existing Chinese vaults
- Add empty-vault initialization and upgrade fixtures

Acceptance evidence:

- New users receive a stable, language-neutral `MagicOS/` profile.
- Existing `Dashboard/` vaults are detected and offered a compatibility profile.
- Detection is read-only; no directory is created during plugin load.
- Initialization creates missing folders only and is idempotent.
- Existing files and folders are never overwritten, moved, renamed, or deleted.
- Storage schema, selected profile, and setup completion are persisted independently from interface language.

## P3 — Core services (complete)

- Migrate media preview core
- Migrate asset and record query service
- Migrate record relation query service
- Migrate AI Provider protocol core
- Keep paid entitlement adapters behind a public interface

Acceptance evidence:

- Shared helpers no longer belong to Plugin or View classes.
- Media preview uses injected host capabilities and has no Obsidian dependency.
- Record classification and indexing live in `record-query`; directional links live in `record-relations`.
- One relation index serves Organizer membership, Learning Thread cards, and People & Health records.
- AI provider code contains protocol builders, parsers, redaction, and failure classification only; credentials, entitlements, and usage ledgers are excluded.
- Plugin applications receive core capabilities through one immutable service entry point.
- Local settings and public upgrades are checked against the data boundary during every `npm run check` and pre-commit run.

## P4 — Applications

Migrate one complete application slice at a time:

1. Organizer — read-only application slice complete
2. Learning Threads — read-only application slice complete
3. People & Health — privacy-projected read-only application slice complete
4. AI Steward

Every slice requires Chinese regression, English review, public build, and release audit.

Organizer acceptance evidence is recorded in [P4 Organizer Acceptance](P4_ORGANIZER_ACCEPTANCE.md). Write operations remain deferred until the read-only path has been exercised against both storage profiles.

Learning Threads acceptance evidence is recorded in [P4 Learning Threads Acceptance](P4_LEARNING_ACCEPTANCE.md). Review writeback and AI generation remain separate follow-up slices.

People & Health acceptance evidence is recorded in [P4 People & Health Acceptance](P4_PEOPLE_HEALTH_ACCEPTANCE.md). The application uses a strict metadata projection and never receives health details or note bodies.

## P5 — Public alpha

- Confirm license, product name, author identity, and public support channels
- Confirm redistribution rights for all backgrounds and screenshots
- Add synthetic demo vault and onboarding guide
- Test desktop and mobile installation
- Create a GitHub repository only after the first installable alpha passes the release checklist
