# P3 Core Services Acceptance

P3 moves reusable foundations out of the private monolith without copying private runtime data.

## Service boundaries

- `src/core/shared.js`: list, YAML, and stable date helpers.
- `src/services/media-preview.js`: pure media descriptor and preview selection.
- `src/services/record-query.js`: record normalization, classification, and indexes.
- `src/services/record-relations.js`: reference resolution and directional relation indexes.
- `src/services/ai-provider.js`: credential-free OpenAI and DeepSeek protocol handling.
- `src/services/ai-entitlement.js`: fail-closed, stable-ID entitlement snapshot and access evaluation.
- `src/services/ai-usage.js`: serialized, retryable trial reservation and metadata-only usage settlement.
- `src/services/ai-transport.js`: abortable, allowlisted, response-bounded provider transport.
- `src/services/ai-job-state.js`: validated AI job lifecycle and privacy-safe persistence projection.
- `src/services/index.js`: immutable application-facing service entry point.

## Data boundaries

- `src/config/settings-schema.js` accepts only minimal local preferences and schema metadata.
- `src/upgrades/registry.js` contains structural public upgrade metadata only.
- `src/privacy/data-boundary.js` rejects records, health/person data, secrets, caches, logs, and user-specific paths in upgrade metadata.
- `scripts/audit-privacy.js` rejects runtime state files, databases, and unreviewed binary assets.
- `.githooks/pre-commit` runs the complete project check.

## Verification

P3 is accepted when `npm run check` passes all unit tests, locale parity and literal audits, privacy boundary audit, production build, and release audit.

The AI-specific findings and remaining paid-adapter gates are recorded in [AI Steward Safety Audit](AI_STEWARD_AUDIT.md).
