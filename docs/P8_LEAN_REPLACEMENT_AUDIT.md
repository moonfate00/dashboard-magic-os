# P8 Lean Replacement Audit

Audit date: 2026-09-04

## Verdict

The next architecture work must replace duplicated responsibilities instead of adding another StoryLine-shaped subsystem. The five-cabin kernel and unified object workbench are the destination. The installed compatibility runtime remains a temporary host for mature visual surfaces, not a second domain model.

The main source of bloat is not the number of user features. It is the number of places that independently decide the same facts: cabin ownership, object type, view availability, relation meaning, health findings, write safety, and workflow state.

## Measured symptoms

The current installed compatibility runtime contains:

- 22 view engine identifiers;
- 66 classes, including 63 modal classes;
- one main view with 124 mutable state assignments and 888 methods;
- 144 direct `processFrontMatter` call sites;
- 24 direct confirmation call sites;
- several record, relation, identity, path-tree, and feature caches with separate invalidation rules.

These figures are not targets by themselves. A large learning graph or media surface can be justified. The architectural problem is that object classification, projection, editing, and recovery are repeatedly implemented beside those surfaces.

## Replacement decisions

| Priority | Replace | With | Preserve |
|---|---|---|---|
| P0 | Public cabin manifests plus a separate legacy cabin/type/view catalog | One semantic manifest registry, combined with a presentation-only overlay that may supply labels, colors, templates, folders, and presets but cannot redefine ids | Current five-cabin names, colors, icons, and user-approved visual identity |
| P0 | Path/tag/type checks spread across module lookup, Codex categorization, and feature-specific `is*Record` helpers | One immutable cabin snapshot using record envelopes and registry resolution; old methods become temporary delegating facades | Brownfield folder mounts and legacy aliases |
| P0 | Direct frontmatter mutations with local `window.confirm` rules | One object command executor consuming object operation plans, transition assessment, durable journal, verification, and rollback | Fast local manual actions; model access is not required for manual writes |
| P1 | A long view-dispatch conditional and a second view catalog | Manifest view declarations plus one small engine-to-renderer adapter map | Specialized renderers where they materially improve the experience |
| P1 | Separate social matrix, thread matrix, generic matrix, timeline grouping, and graph relation preparation | Shared relation-matrix, graph, and swimlane projection services built from the same relation index | Star-ring learning camera, media wall, and other distinctive rendering layers |
| P1 | Legacy cabin validator rules beside the public health audit | Public semantic health findings plus host-only checks for files, media availability, and Obsidian capabilities | Asset relink tools and privacy-safe diagnostic presentation |
| P2 | Separate outer shells for person, organization, event, item, thread, card, and general object editing | One object workbench shell with type adapters for fields and actions | Dedicated learning mode, graph, review, media picker, and other task-specific experiences |
| P2 | Sticky classify, cabin intake, command capture, memory capture, and several AI handoff entrances as independent workflows | One intake session state machine with compact and full-screen shells; every quick entry opens a configured session | One-click capture and cabin-specific interpretation adapters |
| P2 | AI gate, planning, run, patch, failure, and archive surfaces exposed as parallel top-level destinations | One AI Steward workspace with route-based panels; recovery remains independently reachable when AI is locked | Durable job records, explicit confirmation, failure recovery, and local full-text search |
| P3 | A single view object owning hall animation, cabin navigation, media playback, reminders, object history, search, and AI jobs | A few lifecycle-owned state bags and controllers: hall, cabin workspace, media, and operations | One Obsidian view and one bundled runtime entry |

## What must not be collapsed

Lean architecture does not mean one generic interface for everything.

- The learning star ring remains a specialized visual experience. It should consume shared graph data, not become a generic graph skin.
- The asset media wall retains media hydration, playback, and background controls.
- AI recovery stays reachable without a valid entitlement and must not be hidden inside an enabled Agent session.
- Workspace/navigation snapshots, object history, and durable write journals remain different records. They share a transaction id and presentation, but they do not become one ambiguous snapshot format.
- Brownfield mounts remain read-compatible and non-destructive. Manifest unification must not force folder migration.

## Migration order

### Slice 1: one catalog and one snapshot

1. Add a presentation overlay whose keys are validated against the public manifest registry.
2. Generate installed cabin and view descriptors from manifest plus overlay.
3. Rebuild one immutable runtime snapshot after record refresh.
4. Make module, type, relation, Codex, and health compatibility methods read that snapshot.
5. Delete the duplicated semantic portions of the legacy catalogs and remove redundant derived caches in the same slice.

This is the next implementation slice. It changes architecture before changing appearance.

Status: implemented on 2026-09-04.

- Public manifests now own the installed object aliases and view ids. The host keeps only a validated presentation overlay for labels, colors, folders, templates, and presets.
- One runtime snapshot now supplies record ownership, the record index, the relation index, counts, health, and the object workbench.
- Brownfield mounts may assign an untyped record to exactly one cabin without rewriting its note.
- The private compatibility facades for module records, Codex links, relations, and object inspection delegate to that snapshot.
- Four parallel caches (`recordQueryIndexCache`, `recordRelationIndexCache`, `codexRelationGraphCache`, and `codexLinkCache`) were removed. The private architecture check rejects their return.

### Slice 2: one mutation path

1. Add an Obsidian object command executor for both manual and Agent-originated plans.
2. Migrate scope/privacy changes, stage moves, relation editing, profile editing, and intake commits.
3. Remove their local confirmation and rollback implementations once parity tests pass.
4. Leave direct host writes only for narrowly defined bootstrap, import, and recovery adapters.

### Slice 3: shared projections

1. Extract relation matrix, graph neighborhood, and swimlane timeline projections.
2. Rewire existing social, navigation, memory, and Codex visuals to those projections.
3. Delete feature-local relation preparation after each renderer reaches parity.

### Slice 4: entrance and shell consolidation

1. Move compatible object editors into the workbench shell.
2. Move capture variants into the intake session shell.
3. Move AI workflow states into the AI Steward workspace.
4. Delete a legacy modal only after it has zero callers and an installed-runtime test covers its replacement.

### Slice 5: physical split

Split source files by the surviving service and application boundaries only after the preceding responsibilities are unified. Physical file splitting before semantic replacement would create a directory-shaped monolith.

## Anti-bloat gates

Every migration slice must satisfy all of the following:

- It names the old authority that the new code replaces.
- It does not introduce a second id, type, view, relation, scope, or action catalog.
- A compatibility facade may live for one migration slice; new callers cannot use it.
- Derived data is not persisted when it can be rebuilt from the canonical snapshot.
- A shared projection contains no DOM, Obsidian, or visual-theme code.
- A specialized visual cannot create its own relation or scope semantics.
- A write path cannot bypass transition assessment, confirmation, journal, verification, and rollback.
- The slice removes old responsibility before it is marked complete; added files alone are not completion.
- Public checks, private architecture checks, candidate load tests, production isolation, installed parity, and user-data integrity must all pass.

## Completion criteria

The replacement program is complete when:

- cabin/type/view ids have one semantic source of truth;
- one immutable snapshot supplies object ownership, relations, counts, and health;
- all formal-object changes use one command executor;
- matrix, graph, and timeline data come from shared projections;
- AI Steward and intake each have one primary workspace;
- legacy facades and zero-caller modals are removed rather than kept indefinitely;
- specialized visual experiences remain intact or improve.
