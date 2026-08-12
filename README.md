# Dashboard Magic OS

Dashboard Magic OS is a bilingual Obsidian workspace OS for collecting, organizing, applying, archiving, and presenting knowledge and life records.

> Status: public-repository foundation. The production runtime has not been migrated into this repository yet. Do not install this repository as a finished plugin.

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

`npm run audit:release` blocks personal vault data, runtime settings, local absolute paths, obvious secrets, and development-only entitlement mode from entering a public build.

## Repository boundary

This repository contains plugin source, tests, documentation, and distributable assets only. It must never contain a personal Obsidian vault, `data.json`, health records, person cards, API credentials, usage ledgers, snapshots, or backups.

See [Repository Boundary](docs/REPOSITORY_BOUNDARY.md), [i18n Migration](docs/I18N_MIGRATION.md), [Runtime Migration Plan](docs/MIGRATION_PLAN.md), and [Release Checklist](docs/RELEASE_CHECKLIST.md).

## License

No open-source license has been selected yet. Until a license file is added, all rights are reserved. Licensing must be decided before the first public release.
