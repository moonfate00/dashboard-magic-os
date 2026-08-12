# Dashboard Magic OS

Dashboard Magic OS is a bilingual Obsidian workspace OS for collecting, organizing, applying, archiving, and presenting knowledge and life records.

> Status: core-service alpha foundation. The application interfaces have not been migrated yet. Do not install this repository as a finished plugin.

## Languages

- English (`en`)
- Simplified Chinese (`zh-CN`)

The project uses one codebase and two locale packs. Internal record fields and stable entity IDs remain language-neutral.

New vaults use a language-neutral `MagicOS/` storage layout. Existing Dashboard OS vaults can keep their current `Dashboard/` structure through a compatibility profile; setup never moves or renames existing files.

## Development

```bash
npm install
npm run check
npm run build
```

`npm run check` also enforces the privacy boundary: local settings are allowlisted, public upgrade registries may contain structural metadata only, unreviewed binary assets are rejected, and release artifacts are scanned for private paths and obvious secrets.

## Repository boundary

This repository contains plugin source, tests, documentation, and distributable assets only. It must never contain a personal Obsidian vault, `data.json`, health records, person cards, API credentials, usage ledgers, snapshots, or backups.

See [Data Boundary](docs/DATA_BOUNDARY.md), [Repository Boundary](docs/REPOSITORY_BOUNDARY.md), [i18n Migration](docs/I18N_MIGRATION.md), [Runtime Migration Plan](docs/MIGRATION_PLAN.md), and [Release Checklist](docs/RELEASE_CHECKLIST.md).

Core-service acceptance evidence is recorded in [P3 Core Services Acceptance](docs/P3_ACCEPTANCE.md).

The paid AI Steward migration is gated by the credential-free, fail-closed boundary in [AI Steward Safety Audit](docs/AI_STEWARD_AUDIT.md). Entitlement verification and provider secrets remain private adapters and are never release data.

The first P4 application slice, a read-only Organizer built on stable asset relations, is documented in [P4 Organizer Acceptance](docs/P4_ORGANIZER_ACCEPTANCE.md).

The private production OS and public core remain isolated during migration. Their ownership and controlled backport direction are tracked in the [Public / Private Sync Matrix](docs/SYNC_MATRIX.md).

The second P4 application slice, read-only Learning Threads, is documented in [P4 Learning Threads Acceptance](docs/P4_LEARNING_ACCEPTANCE.md).

The third P4 application slice, privacy-projected People & Health, is documented in [P4 People & Health Acceptance](docs/P4_PEOPLE_HEALTH_ACCEPTANCE.md).

## License

No open-source license has been selected yet. Until a license file is added, all rights are reserved. Licensing must be decided before the first public release.
