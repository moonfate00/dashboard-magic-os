## Summary

Describe the user-visible and architectural outcome.

## Privacy and data boundary

- [ ] Uses synthetic fixtures only.
- [ ] Adds no vault content, `data.json`, personal paths, records, people, health data, credentials, entitlements, usage state, snapshots, or backups.
- [ ] Persistent-field changes are allowlisted and documented.
- [ ] Personalization and release exports remain privacy-projected.

## Compatibility

- [ ] English and Simplified Chinese locale packs remain in parity.
- [ ] Existing `Dashboard/` vault compatibility is preserved.
- [ ] Desktop behavior was verified; mobile impact is stated.

## Verification

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `npm run package:verify`
