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
| AI Steward safety core | public-ahead | `src/services/ai-entitlement.js`, `ai-usage.js`, `ai-transport.js`, `ai-job-state.js` | Paid runtime and existing private workflow | Backport stable IDs and lifecycle guards; keep verification and credentials private |
| AI Steward visible shell | public-ahead | `src/apps/ai-steward/` | Rich private AI hub and executable workflows | Keep public controls disabled until a reviewed private runtime adapter is connected |
| AI change confirmation and rollback | public-ahead | `src/services/ai-change-plan.js` | Existing private write workflows | Backport the allowlisted plan protocol; keep real writes locked until a private crash-recovery journal is connected |
| AI private-runtime seam | public-ahead | `src/services/ai-runtime-adapter.js` | Entitlement verifier, SecretStorage, task runtime | Backport contract only; inject private implementation without copying claims, secrets, or jobs |
| AI simulated execution lifecycle | public-ahead | `src/services/ai-execution-pipeline.js` | Existing private Provider workflows | Backport lifecycle guards only; real network and write actions remain disconnected |
| Organizer read model and view | public-ahead | `src/apps/organizer/` | Rich read/write shelf implementation | Exercise read path, then add reviewed write operations |
| Organizer advanced editing | private-ahead | Deferred | Drag, batch, query editor, masonry | Extract as reversible slices after public read path validation |
| Learning Threads read model and view | public-ahead | `src/apps/learning/` | Rich learning, review, and generation implementation | Exercise read path, then backport the shared model |
| Learning review and AI generation | private-ahead | Deferred | Timed reading, review scheduling, quizzes, knowledge maps, generation pipeline | Extract write and AI behaviors as reversible slices |
| People and Health read model and view | public-ahead | `src/apps/people-health/` | Rich social profiles and health relations | Exercise privacy-projected read path, then backport the projection boundary |
| People and Health editing | private-ahead | Deferred | Profile and health-record editors | Extract only after field-level privacy and write-safety design |
| AI Steward entitlement implementation | private-only | Contract in `docs/AI_STEWARD_AUDIT.md` | Paid unlock, signed entitlement, provider configuration | Implement and test signed adapter; implementation stays private or separately distributed |
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
