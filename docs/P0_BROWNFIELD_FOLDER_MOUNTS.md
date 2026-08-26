# P0 Brownfield Folder Mounts

## Outcome

Dashboard Magic OS now treats an existing Vault as the normal installation case. Users can register any eligible
Vault folder without moving, renaming, bulk-tagging, or rewriting its files. The physical folder remains authoritative;
Magic OS cabins consume it as a logical source.

## Public contract

Each mount stores only bounded local configuration:

- a stable mount ID;
- a safe Vault-relative path;
- one logical cabin or automatic classification;
- one folder role;
- an explicit AI access scope;
- an enabled flag.

Mount paths are local state. They are not exported in personalization packages, committed to release artifacts, or
sent to a Provider by this feature. Hidden technical folders and directories that overlap OS-managed storage are
rejected.

## Compatibility behavior

- Existing Markdown notes are indexed in place.
- Common brownfield paths such as `00-raw`, `10-wiki`, `40-outputs`, media libraries, people/health folders, task
  folders, memory folders, and StoryLine workspaces receive deterministic role suggestions.
- Unknown folder conventions remain valid and default to automatic cabin classification.
- Organizer, Learning Threads, and People & Health read their managed roots plus matching enabled mounts from the
  same registry.
- Records retain local `sourceMount` provenance so later routing and AI boundaries can honor the mount policy.
- When Obsidian renames a mounted folder or one of its parents, the stable mount ID is preserved and its path follows
  the rename. A rename into protected OS storage disables the mount instead of creating duplicate authority.

## Safety boundary

This slice is intentionally read-only. It does not provide a write-target switch and does not claim to organize
binary assets yet. `aiScope` is policy metadata for future retrieval gates; `manual` is the default and no current
public AI action consumes mounted content.

## Verification

- Folder-mount normalization, inference, deduplication, limits, cabin routing, provenance, rename following, plugin
  persistence, and non-mutation behavior have dedicated tests.
- The complete public check passes: 205 tests, localization audit, privacy audit, build, release audit, and package
  audit.
- Three unavailable iCloud duplicate artifacts were moved out of `dist/` to a recoverable directory beside the
  repository; they were not treated as valid release assets.

## Mounted-folder management slice

- The public core now exposes a metadata-only folder summary: total files, Markdown notes, media files, other files,
  top-level branches, and newest modification time.
- Summaries use the most-specific mount as owner, so nested mounts are not double-counted.
- Summary calculation consumes only the existing record index. It does not read note bodies or change source files.
- The private integrated OS presents these summaries only in the OS settings mount manager. Cabin headers and Mind
  Trees keep their original visual hierarchy while mounted roots continue to participate in the normal tree index.

## Next slice

1. Backport the registry into the private development candidate so both editions consume one public contract.
2. Add per-folder exclusions without reading note bodies by default.
3. Add reviewed write-target routing separately; read-only mounts must never become writable through migration.
4. Extend asset mounts from Markdown metadata to binary-file descriptors without duplicating files.
