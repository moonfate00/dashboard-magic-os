# Internationalization Migration

## Architecture

Maintain one codebase with stable translation keys and two locale packs:

- `src/i18n/locales/zh-CN.js`
- `src/i18n/locales/en.js`

Interface labels use `i18n.t("stable.key")`. Internal YAML fields, entity IDs, relation types, folder identifiers, and persistence schemas are not translated.

## Migration batches

1. Settings, commands, buttons, notices, and confirmation dialogs.
2. Five cabin names and shared navigation.
3. Organizer application.
4. Learning Threads application.
5. People & Health application.
6. AI Steward interface and output-language control.
7. Templates, onboarding, empty states, and help content.

Each batch must preserve Chinese behavior, add equivalent English text, and leave no user-facing literal inside the migrated slice.

## Locale behavior

- Follow Obsidian by default.
- Permit a manual interface-language override.
- Normalize regional variants such as `en-US` and `zh-Hans`.
- Fall back to English, then Simplified Chinese, then the key itself.
- Missing interpolation values remain visible as `{name}` so defects are detectable.

