# P7 Unified Object Workbench Acceptance

## Outcome

Dashboard Magic OS now has one object-understanding boundary shared by Command, Assets, Social, Navigation, and Memory. The boundary is deliberately smaller than a complete StoryLine-style authoring surface: it establishes the object model, safety checks, and extension points that future matrix, timeline, map, and Agent workflows must consume.

## Delivered contracts

- `buildObjectInspectorModel` projects any indexed note into the same seven inspector groups: identity, classification, scope, lifecycle, provenance, relations, and custom fields.
- `discoverUnprofiledObjects` turns unresolved structured relations into reviewable profile candidates without silently creating notes.
- `assessObjectTransition` classifies requested changes as allowed, confirmation-required, or blocked.
- `createObjectOperationPlan` produces a reversible, transaction-required plan instead of mutating a note directly.
- `createWorkspaceCheckpoint` captures the stable state needed to compare or roll back a workspace operation.
- Every `CabinRuntime` snapshot exposes the same `workbench` surface.

## Installed-runtime integration

The shared Codex inspector consumes the public workbench model. It shows grouped fields, relation counts, structural warnings, and pending profile candidates. Person and organization candidates open a prefilled Social profile flow; other candidates open the relevant cabin intake flow.

Scope/privacy changes and mounted-source lifecycle changes pass through the common transition assessment before the existing write path. Confirmed writes still use the established preview, journal, and rollback protocol.

## Safety decisions

- Stable object identity cannot be changed in place.
- Unknown cabin targets are blocked.
- Cross-cabin and cross-type transitions require confirmation.
- Private-to-public exposure and any explicit scope change require confirmation.
- Sensitive health objects cannot become public.
- Mounted sources require confirmation before direct lifecycle writes.
- Asset conversion is blocked when it would discard the source asset; role projections must preserve it.

## Verification

- Public workbench unit tests cover grouping, unprofiled candidates, identity protection, privacy protection, mounted-source confirmation, and source-preserving asset projection.
- Public release checks pass with 236 tests.
- Private foundation, architecture, load, candidate parity, production isolation, and installed-plugin checks pass.
- The installed runtime is byte-identical to the audited private candidate.

## Next migration slice

The next slice will build shared projections for relationship matrices and multi-lane timelines on this boundary. It must not add one-off cabin implementations or bypass the object workbench transition rules.
