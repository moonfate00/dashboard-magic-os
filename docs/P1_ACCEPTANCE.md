# P1 Acceptance — Shared Shell and Settings

P1 establishes the interface-language contract used by every future application slice.

## Runtime behavior

- The persisted preference is one of `auto`, `zh-CN`, or `en`.
- `auto` follows Obsidian through `getLanguage()`.
- A manual preference changes interface text only; it never rewrites YAML fields, entity IDs, paths, tags, or existing records.
- Switching language refreshes the translation service, the registered command label, the settings tab, and emits `dashboard-magic-os:locale-changed` for future views.
- Unsupported or malformed stored preferences recover to `auto`.

## Migration contract

- User-facing source literals belong in locale packs.
- Application code calls `plugin.t(key, params)` or receives an i18n capability.
- Locale files must have identical keys.
- Missing keys remain visible rather than failing silently.
- Shared UI primitives accept translation keys, not translated strings.

## Automated checks

- Locale parity and regional normalization
- Auto and manual locale resolution
- Translation interpolation and missing-key behavior
- Settings normalization and rendering
- Plugin loading and runtime language switching
- Direct user-facing literal detection
- Release privacy and secret scanning
- Fresh bundled `dist/main.js` generation on every `npm run check`

P2 may now introduce a portable storage profile without coupling folder identifiers to translated interface labels.
