# Install, Upgrade, and Uninstall

## Alpha installation

The `0.1.0-alpha.0` line is intended for controlled GitHub or BRAT desktop testing, not the Obsidian Community Plugins directory.

For a manual installation, download `main.js`, `manifest.json`, and `styles.css` from the same GitHub Release and place them in:

```text
<vault>/.obsidian/plugins/dashboard-magic-os/
```

Reload Obsidian, enable **Dashboard Magic OS** under Community plugins, then review the storage onboarding screen before creating any directories.

Never install repository source or a release archive that also contains `data.json`, vault folders, settings exports, histories, snapshots, or backups.

## Upgrade

1. Back up the vault using the user's normal backup system.
2. Read the changelog and privacy notes for the target version.
3. Verify that the release tag exactly matches `manifest.json` version.
4. Replace all three release assets together. Do not mix files from different versions.
5. Reload Obsidian and run the storage inspection before accepting any future schema change.

Public upgrades contain structural metadata only. They do not bundle or migrate personal records. Existing `Dashboard/` vaults remain on the compatibility profile unless the user explicitly chooses another supported process.

## Uninstall

1. Disable Dashboard Magic OS in Obsidian.
2. Remove `.obsidian/plugins/dashboard-magic-os/` if local plugin settings should also be removed.
3. Keep or separately archive the user's `MagicOS/` or `Dashboard/` records.

Uninstalling the plugin must not delete, move, or rename vault records. Provider credentials, when a future private runtime is enabled, must be removed separately from Obsidian SecretStorage.
