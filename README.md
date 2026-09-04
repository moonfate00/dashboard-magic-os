# Dashboard Magic OS

Dashboard Magic OS is a bilingual Obsidian workspace OS for collecting, organizing, applying, archiving, and presenting knowledge and life records.

> Status: desktop alpha for controlled GitHub and BRAT testing. Organizer, Learning Threads, People & Health, and personalization transfer are usable; AI Steward remains visible but locked.

## Languages

- English (`en`)
- Simplified Chinese (`zh-CN`)

[简体中文说明](README.zh-CN.md)

The project uses one codebase and two locale packs. Internal record fields and stable entity IDs remain language-neutral.

New vaults use a language-neutral `MagicOS/` storage layout. Existing Dashboard OS vaults can keep their current `Dashboard/` structure through a compatibility profile; setup never moves or renames existing files.

## Development

```bash
npm install
npm run check
npm run build
```

## Disclosures

- The public alpha has no telemetry, advertising, user account, or active AI network request.
- AI Steward is a planned paid feature. Its entrance remains visible, but every action is disabled until a separately delivered, verified entitlement and private runtime are connected.
- Future AI use will require the user's own supported Provider account and API credential in Obsidian SecretStorage. No Provider credential is bundled or exported.
- The public repository is MIT licensed. Private entitlement services, paid adapters, and operational infrastructure are separate works and are not included here.

See [Privacy](PRIVACY.md), [Security](SECURITY.md), and [Install, Upgrade, and Uninstall](docs/INSTALL_UPGRADE_UNINSTALL.md).

`npm run check` also enforces the privacy boundary: local settings are allowlisted, public upgrade registries may contain structural metadata only, unreviewed binary assets are rejected, and release artifacts are scanned for private paths and obvious secrets.

## Repository boundary

This repository contains plugin source, tests, documentation, and distributable assets only. It must never contain a personal Obsidian vault, `data.json`, health records, person cards, API credentials, usage ledgers, snapshots, or backups.

See [Data Boundary](docs/DATA_BOUNDARY.md), [Repository Boundary](docs/REPOSITORY_BOUNDARY.md), [i18n Migration](docs/I18N_MIGRATION.md), [Runtime Migration Plan](docs/MIGRATION_PLAN.md), [Release Checklist](docs/RELEASE_CHECKLIST.md), and [Release Process](docs/RELEASE_PROCESS.md).

Core-service acceptance evidence is recorded in [P3 Core Services Acceptance](docs/P3_ACCEPTANCE.md).

The paid AI Steward migration is gated by the credential-free, fail-closed boundary in [AI Steward Safety Audit](docs/AI_STEWARD_AUDIT.md). Entitlement verification and provider secrets remain private adapters and are never release data.

AI-authored record changes now have disconnected, test-only confirmation, durable crash journaling, atomic Obsidian persistence, and a recovery interface that remains available while AI is locked. See [P4 AI Change Confirmation and Rollback Acceptance](docs/P4_AI_CHANGE_PROTOCOL_ACCEPTANCE.md) and [P0 AI Change Journal Acceptance](docs/P0_AI_CHANGE_JOURNAL_ACCEPTANCE.md). Real-provider writes remain locked until this reviewed boundary is bundled into the installed private runtime.

The real Provider execution boundary is assembled in a still-disconnected sandbox with fixed endpoints, SecretStorage scope, bounded input/output, cancellation, accounting, and privacy-safe job projection. See [P4 AI Provider Sandbox Acceptance](docs/P4_AI_PROVIDER_SANDBOX_ACCEPTANCE.md).

The settings page can export and import a versioned, privacy-allowlisted personalization package without carrying vault bindings or runtime data. See [P5 Personalization Acceptance](docs/P5_PERSONALIZATION_ACCEPTANCE.md).

The first P4 application slice, a read-only Organizer built on stable asset relations, is documented in [P4 Organizer Acceptance](docs/P4_ORGANIZER_ACCEPTANCE.md).

The private production OS and public core remain isolated during migration. Their ownership and controlled backport direction are tracked in the [Public / Private Sync Matrix](docs/SYNC_MATRIX.md).

The second P4 application slice, read-only Learning Threads, is documented in [P4 Learning Threads Acceptance](docs/P4_LEARNING_ACCEPTANCE.md).

The third P4 application slice, privacy-projected People & Health, is documented in [P4 People & Health Acceptance](docs/P4_PEOPLE_HEALTH_ACCEPTANCE.md).

The fourth P4 application slice keeps the paid AI Steward entrance visible while all model actions remain disabled behind the audited private-runtime boundary. See [P4 AI Steward Shell Acceptance](docs/P4_AI_STEWARD_ACCEPTANCE.md).

The credential-free AI lifecycle is verified with a deterministic, non-networked simulation in [P4 AI Simulation Pipeline Acceptance](docs/P4_AI_SIMULATION_ACCEPTANCE.md).

The five cabins now share a unified object inspector, unprofiled-object queue, transition guard, reversible operation plan, and workspace checkpoint boundary. See [P7 Unified Object Workbench Acceptance](docs/P7_OBJECT_WORKBENCH_ACCEPTANCE.md).

## License

Public repository source is available under the [MIT License](LICENSE). Private paid-service components are not included in this repository.
