# P4 People & Health Acceptance

People & Health is the third public application slice and the first with an application-level privacy projection.

## Included

- A dedicated Obsidian command and registered `ItemView`.
- Metadata-only scanning beneath the active storage profile's Social record root.
- Person classification through stable person records and entity IDs.
- Health classification through `health-record`, `health_type`, and explicit health tags.
- Person-to-health resolution through `person`, `patient`, `related_person`, `health_person`, and `subject`.
- Directory counts for people, health records, linked records, and records needing a person reference.
- Person cards with name, relationship category, health-record count, and latest record date.
- A private timeline showing record type, date, and title only.
- Chinese and English privacy notices, empty states, health-type labels, and responsive layouts.
- Explicit navigation to original person and health notes.

## Application privacy projection

The UI never receives complete frontmatter objects. The public model projects only:

- Person: stable ID, file handle, vault path, display name, relationship category, counts, latest date.
- Health record: stable ID, file handle, vault path, title, normalized date, normalized record type.

Regression tests inject synthetic diagnosis, results, summaries, medication names, dosages, measurements, phone numbers, email addresses, addresses, and note content. The serialized application model must contain none of them.

Unassigned health records appear as a count and repair warning only. Their titles and metadata are not listed in the directory.

## Safety boundary

- No Markdown body is read.
- No health content is copied into plugin settings, caches, tests, screenshots, or release artifacts.
- The application is read-only and never changes person or health records.
- Details remain hidden until the user explicitly opens the original private note in Obsidian.

## Deferred

- Person-card creation and editing
- Health-record creation and editing
- Attachments, clinical fields, measurements, and medication workflows
- Health summaries or AI assistance

Any future health feature must preserve the projection boundary and receive its own privacy regression tests.

## Verification

Acceptance requires a warning-free `npm run check`: unit tests, interface localization audits, privacy-boundary audit, production build, and release audit.
