# Release Checklist / 发布检查表

## Product decisions

- [ ] Confirm public product name and repository slug.
- [ ] Select a license and add `LICENSE`.
- [ ] Confirm author name and public URL.
- [ ] Define open-core and paid AI Steward boundary.

## Privacy and security

- [ ] `npm run audit:privacy` passes.
- [ ] Public upgrade registries contain structural metadata only.
- [ ] Plugin local state remains limited to the documented allowlist.
- [ ] No `data.json`, personal vault records, histories, snapshots, or backups.
- [ ] No absolute local user paths.
- [ ] No API keys, tokens, secrets, or signed entitlement payloads.
- [ ] AI entitlement mode is not `development`.
- [ ] Production entitlement defaults locked and accepts only a verified adapter snapshot.
- [x] Trial reservation/settlement, cancellation, timeout, retry, and in-process rollback tests pass.
- [ ] Private crash-recovery journal and unresolved rollback recovery UI are verified before real AI writes unlock.
- [ ] AI jobs and usage metadata contain no prompts, outputs, credentials, signed claims, or user records.
- [ ] Provider transport is HTTPS/origin-allowlisted, abortable, and response-bounded.
- [ ] Every bundled image has documented redistribution rights.

## Internationalization

- [ ] `zh-CN` and `en` contain identical translation keys.
- [ ] No untranslated user-facing text in migrated applications.
- [ ] Locale auto-detection and manual override both work.
- [ ] English layouts tolerate longer labels.
- [ ] Dates, numbers, and plural wording are reviewed.

## Compatibility

- [ ] Fresh empty vault initializes successfully.
- [ ] Existing Chinese vault upgrades without data migration surprises.
- [ ] Desktop loading passes.
- [ ] Mobile loading passes or the manifest declares desktop-only.
- [ ] Install, upgrade, backup, and uninstall docs are complete.

## Release

- [ ] Versions match in `package.json`, `manifest.json`, and release tag.
- [ ] `npm run check` passes.
- [ ] `npm run build` creates only reviewed artifacts.
- [ ] English and Chinese README files are current.
- [ ] Changelog and screenshots are current.
