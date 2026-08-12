# Data Boundary / 数据边界

Dashboard Magic OS separates data by lifecycle, not by a last-minute cleanup before release.

## 1. Vault content / 用户仓库内容

Records, people cards, health notes, assets, journals, snapshots, object history, AI results, and exports belong to the user's vault. They never enter the plugin source repository or a release package.

## 2. Local plugin state / 插件本地状态

The plugin `data.json` is runtime-only and Git-ignored. Its schema is an explicit allowlist:

- Interface-language preference
- Storage-profile selection
- Setup completion flag
- Storage schema version

Record bodies, health data, API keys, entitlements, usage ledgers, and caches are not accepted by the public settings normalizer.

## 3. Public upgrade data / 可发布升级数据

Versioned upgrades may contain only code, schema numbers, migration identifiers, empty templates, and structural operations. Upgrade metadata is validated as serializable public data and rejects private-record fields, secrets, runtime logs, caches, snapshots, and user-specific absolute paths.

## Enforcement / 强制措施

- `.gitignore` blocks common vault, runtime, backup, export, and secret paths.
- `npm run audit:release` searches for private paths and obvious secrets.
- `npm run audit:privacy` validates settings and upgrade registries and rejects unreviewed binary assets.
- The repository pre-commit hook runs `npm run check`.
- Code is migrated service by service; the private plugin directory is never copied wholesale.

This boundary protects both the maintainer's working vault and every user's clean installation.
