# P6 Five-Cabin Foundation Acceptance

## Accepted slice

This slice introduces a shared foundation without replacing any current cabin view or writing any Vault record.

- Five immutable cabin manifests define object types, view capabilities, transaction-bound actions, health rules, storage roles, and Agent capabilities.
- One registry resolves canonical types and reviewed legacy aliases across Command, Assets, Social, Navigation, and Memory.
- One runtime builds the shared query index, relation index, record envelopes, explicit cabin counts, and health findings.
- Records without `entity_id` receive deterministic in-memory virtual identities; source files remain unchanged.
- Sensitive Social and Memory types default to protected policy and surface missing explicit privacy as health findings.
- The Agent catalog exposes only reviewed, serializable, transaction-bound actions.
- The plugin service entry point exposes the runtime, and the shared context bar is adopted by the existing Organizer, Learning Threads, and People & Health views.
- Command Cabin provides the first visible read-only cabin surface with search, status filters, task cards, project summaries, and a command-palette entry.
- The private candidate vendors the exact public files with per-file provenance and installs the runtime through a non-enumerable capability seam.

## Automated evidence

Public repository:

- 225 Node tests pass.
- i18n audit passes.
- privacy audit passes.
- public bundle builds.
- release and package audits pass.

Private candidate:

- architecture check passes.
- foundation tests pass.
- full private verification harness passes.
- independent development candidate builds, passes its privacy audit, and loads with the legacy surface intact.

## Deliberately deferred

- Assets, Social, Navigation, and Memory do not yet have dedicated replacement views; their current views consume the shared shell incrementally.
- Existing Agent V2 object-type definitions are not removed until the Agent adapter slice consumes the shared catalog.
- No installed runtime file is replaced by this acceptance step.
- No record metadata is upgraded automatically.

## Next gate

Extend the same read-only shell pattern to the remaining cabin surfaces, starting with asset roles and background/scene relations, then Social privacy-aware inspection, Navigation hierarchy/graph, and Memory review/workflow views. Each slice keeps source files untouched and routes all future writes through preview, confirmation, journal, and rollback.
