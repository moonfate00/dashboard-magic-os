# P4 Learning Threads Acceptance

Learning Threads is the second complete public application slice. It reuses the shared record source and relationship services rather than maintaining an application-specific database.

## Included

- A dedicated Obsidian command and registered `ItemView`.
- Metadata-only scanning beneath the active storage profile's Command, Assets, Social, Navigation, and Memory record roots.
- Thread classification for course, project, goal, context-thread, story-thread, and compatible thread records.
- Knowledge-card resolution through `related_thread`, `related_threads`, `thread`, and stable entity IDs.
- Source-record resolution through `related_threads`, `project`, `context_thread`, and Obsidian resolved WikiLinks.
- Overview totals for threads, knowledge cards, due reviews, and mastered cards.
- Thread status, source counts, new/due/mastered card counts, and average progress.
- Existing progress contract based on reads and successful reviews.
- Chinese and English overview, thread detail, card metadata, empty states, and responsive layouts.
- Opening thread, knowledge-card, and source records through Obsidian.

## Privacy and safety boundary

- The application reads frontmatter and metadata-cache relations only; it does not read or bundle note bodies.
- Tests use synthetic threads, cards, and source records.
- The application is read-only and never changes review dates, progress, cards, or source records.
- No AI provider credentials, generated outputs, or learning-run logs enter the public repository or plugin settings.

## Deferred

- Thread creation and learning-configuration editing
- Knowledge-card creation and editing
- Timed reading and review writeback
- Quiz sessions and adaptive scheduling
- AI knowledge maps, card generation, and review-before-write pipeline

Each deferred behavior will be introduced as a separate reversible slice after the read-only path is exercised against both storage profiles.

## Verification

Acceptance requires a warning-free `npm run check`: unit tests, locale parity and interface-literal audits, privacy audit, production build, and release audit.
