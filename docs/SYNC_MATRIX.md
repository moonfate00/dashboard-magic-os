# Public / Private Sync Matrix

Dashboard Magic OS is developed as three explicit layers. Synchronization moves reviewed code and schemas between layers; it never copies user records or runtime state.

## Layers

| Layer | Purpose | May contain | Must not contain |
| --- | --- | --- | --- |
| Public core | Installable bilingual foundation and generally useful applications | Source, tests, empty templates, migration rules | Personal records, secrets, private logs, paid credentials |
| Private extensions | Maintainer experiments and private or paid integrations | Feature adapters, experimental UI, entitlement implementation | Bundled personal vault content |
| Vault data | Each user's working OS | Records, people, health notes, assets, local settings | Source-release artifacts |

## Status vocabulary

- `shared`: public core is authoritative and private OS should consume it.
- `private-ahead`: proven in the private OS and awaiting a reviewed public extraction.
- `public-ahead`: refactored publicly and awaiting controlled backport into the private OS.
- `private-only`: intentionally not published.
- `data-only`: belongs exclusively to a user's vault.

## Current matrix

| Capability | Status | Public location | Private location / role | Next synchronization action |
| --- | --- | --- | --- | --- |
| Locale and interface-language core | public-ahead | `src/i18n/` | Monolithic runtime strings | Private OS consumes locale service after application parity |
| Storage profiles and onboarding | public-ahead | `src/storage/` | Dashboard constants and compatibility behavior | Backport profile accessors without moving existing files |
| Shared utilities | public-ahead | `src/core/shared.js` | Marked core block in private `main.js` | Replace private block with imported shared module after install packaging exists |
| Media preview core | public-ahead | `src/services/media-preview.js` | Marked media block plus rich media UI | Backport pure selector; keep rich UI private until migrated |
| Record query core | public-ahead | `src/services/record-query.js` | Marked record query block | Make public module authoritative after parity fixtures pass |
| Record relation core | public-ahead | `src/services/record-relations.js` | Same marked record-query block | Make public module authoritative after parity fixtures pass |
| AI Provider protocol | public-ahead | `src/services/ai-provider.js` | Provider protocol plus private runtime | Backport protocol only; never credentials or usage data |
| Organizer read model and view | public-ahead | `src/apps/organizer/` | Rich read/write shelf implementation | Exercise read path, then add reviewed write operations |
| Organizer advanced editing | private-ahead | Deferred | Drag, batch, query editor, masonry | Extract as reversible slices after public read path validation |
| Learning Threads read model and view | public-ahead | `src/apps/learning/` | Rich learning, review, and generation implementation | Exercise read path, then backport the shared model |
| Learning review and AI generation | private-ahead | Deferred | Timed reading, review scheduling, quizzes, knowledge maps, generation pipeline | Extract write and AI behaviors as reversible slices |
| People and Health | private-ahead | Planned | Social profiles and health relations | Extract metadata-only read slice with strict privacy tests |
| AI Steward entitlement implementation | private-only | Public interface only | Paid unlock, signed entitlement, provider configuration | Define adapter contract; implementation stays private or separately distributed |
| Personalization import/export | private-ahead | Planned | Existing private settings workflow | Publish sanitized schema and profile serializer only |
| Personal records and health content | data-only | Never | User vault | No synchronization |
| API keys, entitlements, usage ledgers | private-only / data-only | Never | Local runtime or private adapter | No synchronization into Git or release bundles |

## Synchronization gates

Every private-to-public extraction requires:

1. A minimal data contract with synthetic fixtures.
2. Removal of personal paths, content, secrets, logs, and runtime caches.
3. Chinese regression and English interface review.
4. `npm run check` in the public repository.
5. A dedicated acceptance document and commit.

Every public-to-private backport requires:

1. A clean private-runtime backup and a reversible change.
2. Compatibility with the legacy Dashboard storage profile.
3. Private regression tests before replacing the old implementation.
4. No automatic vault migration or record rewriting.
5. One module at a time; the installed production OS remains usable throughout.

The long-term target is one public core consumed by the private development edition, not two independent forks.
