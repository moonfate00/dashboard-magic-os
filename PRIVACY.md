# Privacy

Dashboard Magic OS is local-first. The public alpha does not include telemetry, analytics, advertising, user accounts, or a remote synchronization service.

## Data stored locally

The plugin stores an allowlisted settings object in Obsidian's plugin data storage. It contains interface language and storage-layout state only. Knowledge records, person cards, health records, and other workspace content remain ordinary files in the user's vault.

## Personalization transfer

Personalization export contains only interface language and preferred storage layout. It excludes active vault paths and bindings, setup state, vault content, people, health data, prompts, model output, AI credentials, entitlements, jobs, and usage ledgers. Import validates an allowlist, previews differences, and requires explicit confirmation.

## AI Steward

The AI Steward entrance is visible but all AI actions are disabled in the public alpha. No Provider request is made by the visible interface. Provider credentials are not included in repository files or ordinary plugin settings.

Future paid AI execution will require a separate verified entitlement adapter and explicit Provider configuration. Its safety contract restricts credentials to Obsidian SecretStorage, fixes Provider origins, disables OpenAI response storage, bounds requests and responses, supports cancellation, and excludes prompts and generated content from persistent job and usage metadata. These future connections must be disclosed again before release.

## Network access

The installable public alpha does not initiate AI network requests. GitHub Actions uses GitHub services only to test, attest, and publish release artifacts.

## Uninstalling

Disabling or uninstalling the plugin does not delete user vault records. Obsidian may retain the plugin's local settings file until the plugin directory is removed manually.

Security issues involving unintended data exposure should be reported using the private process in [SECURITY.md](SECURITY.md).
