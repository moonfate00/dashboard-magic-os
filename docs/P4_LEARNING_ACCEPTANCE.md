# P4 Learning Shelves Acceptance

Learning Shelves is the second complete public application slice. It combines a mind-tree hierarchy with organizer-style shelves while reusing the shared record source and relationship services rather than maintaining an application-specific database.

## Included

- A dedicated Obsidian command and registered `ItemView`.
- Metadata-only scanning beneath the active storage profile's Command, Assets, Social, Navigation, and Memory record roots.
- Compatible P1 classification for course, project, goal, context-thread, story-thread, and existing thread records; no migration is required.
- Customizable P2 learning branches identified by `learning-branch` / `learning_level: P2` and connected to P1 through `parent_thread`.
- P1 owns only hierarchy and displays P2 as its learning members; source records, knowledge cards, and learning sessions belong to P2.
- When a P1 has exactly one P2, that branch is expanded through P1 automatically; multiple P2 branches remain explicit choices.
- Knowledge-card resolution through `related_thread`, `related_threads`, `thread`, and stable entity IDs.
- Source-record resolution through `related_threads`, `project`, `context_thread`, and Obsidian resolved WikiLinks.
- Overview totals for P1 shelves, P2 branches, knowledge cards, due reviews, and mastered cards.
- Thread status, source counts, new/due/mastered card counts, and average progress.
- Existing progress contract based on reads and successful reviews.
- Chinese and English overview, P1/P2 detail, branch navigation, card metadata, empty states, and responsive layouts.
- Opening thread, knowledge-card, and source records through Obsidian.

## Privacy and safety boundary

- The application reads frontmatter and metadata-cache relations only; it does not read or bundle note bodies.
- Tests use synthetic threads, cards, and source records.
- The application is read-only and never changes review dates, progress, cards, or source records.
- No AI provider credentials, generated outputs, or learning-run logs enter the public repository or plugin settings.

## Deferred

- P1/P2 creation and learning-configuration editing (available in the private profile, deferred in the public read-only slice)
- Knowledge-card creation and editing
- Timed reading and review writeback
- Quiz sessions and adaptive scheduling
- AI knowledge maps, card generation, and review-before-write pipeline

Each deferred behavior will be introduced as a separate reversible slice after the read-only path is exercised against both storage profiles.

## Verification

Acceptance requires a warning-free `npm run check`: unit tests, locale parity and interface-literal audits, privacy audit, production build, and release audit.
