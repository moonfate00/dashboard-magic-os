# Five-Cabin Foundation

## Decision

Dashboard Magic OS now treats Command, Assets, Social, Navigation, and Memory as five domains on one shared kernel. The installed legacy runtime remains usable while each domain is replaced through compatibility adapters. New domain behavior must not be added only to the legacy monolith.

The public repository is the authoritative source for shared code. A private or experimental edition may inject capabilities, feature gates, and adapters, but it must consume the same contracts and must never fork the five-cabin kernel.

## Architecture

```text
Obsidian host and existing Vault folders
                  |
           Five-cabin kernel
  record identity | relations | mounts
  privacy policy  | health    | events
  transactions    | journal   | rollback
                  |
           Cabin runtime layer
  Command | Assets | Social | Navigation | Memory
                  |
            Shared cabin shell
                  |
              AI Steward
  observe -> plan -> preview -> confirm -> apply -> log
```

### Kernel contracts

- `CabinManifest` declares a cabin's object types, views, actions, storage roles, health rules, and Agent capabilities.
- `CabinRegistry` is the only authority for resolving a module or object type to a cabin.
- `RecordEnvelope` adds a stable cross-cabin identity projection without rewriting the source note. Notes without `entity_id` receive a deterministic in-memory virtual identity.
- `CabinRuntime` builds one record index, one relation index, cabin projections, explicit count semantics, and a privacy-safe health report.
- `EventBus` carries namespaced observational events. Listener failures never interrupt the originating operation.
- `IntakeRuntime` keeps human locks, assistant proposals, review selection, and verification state in one session; cabin-specific interpretation is delegated through one five-cabin adapter registry.
- All write actions declare `transactionRequired: true`. Execution remains owned by the existing preview, confirmation, journal, and rollback protocol.

### Count semantics

Every cabin reports the same five counters:

- `indexed`: all records assigned to the cabin, including mounted legacy notes;
- `formal`: records with a stable `entity_id`;
- `visible`: records accepted by the active view policy;
- `inbox`: records whose status is `inbox`;
- `attention`: records whose status is `inbox`, `attention`, or `blocked`, unless a view supplies a stricter policy.

Interfaces must label these counters explicitly instead of presenting one ambiguous total.

### Brownfield Vault rule

Folder mounts assign provenance and a default domain. They never move, rename, rewrite, or delete user files. Type aliases and virtual identities let old notes participate immediately. Metadata upgrades remain previewed, confirmed transactions.

### Asset role rule

Using an asset as a scene, background, StoryLine reference, or learning source creates a relation or role projection. It must not change the asset's primary identity, move its file, or remove it from Assets.

### Privacy rule

People default to private, health records default to sensitive, and durable memory records default to private. A missing explicit privacy field is a health finding, not permission to expose content. Health findings contain identity and field metadata only; they never include note bodies or medical details.

### AI Steward rule

The Agent receives a serializable catalog of reviewed cabin object types, actions, and capabilities. Agent V2 uses that catalog as a routing constraint during conversation decomposition and Shadow planning; it may propose cross-cabin object graphs, but it does not invent paths or write files directly. Every write is translated into a registered domain action and then into the shared change protocol.

## Migration slices

1. Freeze and baseline: inventory legacy routes and preserve current user-visible behavior.
2. Kernel: land contracts, registry, record envelopes, health audit, events, and compatibility entry points.
3. Shared shell: unify header, view switching, filtering, counters, selection, inspector, and error states.
4. Command: validate project/action planning and the transaction path.
5. Assets: validate media scale, batch operations, usage roles, and scene/background relations.
6. Social: migrate profiles, interactions, health attachment, and field-level privacy.
7. Navigation: unify P1/P2/P3 learning data, course progress, and the star-ring graph.
8. Memory: complete durable memory review, workflows, and management logs.
9. AI Steward: orchestrate reviewed actions across all five cabins.
10. Legacy retirement: remove a legacy slice after its replacement passes public and installed-runtime regression gates.

Memory policy and privacy enforcement start in the kernel slice; they are not deferred until the Memory UI migration.

## Non-negotiable gates

- No forced Vault migration.
- No write path outside preview, confirmation, journal, and rollback.
- No duplicated cabin ids, object types, paths, colors, or actions outside manifests.
- No personal records, secrets, local absolute paths, or private runtime state in the public repository.
- No private/public hand-maintained feature fork.
- No legacy slice removal before equivalent behavior is verified in the installed OS.
- Every migrated slice passes unit tests, privacy audit, bilingual UI audit, public build, and installed-runtime regression.

## Current foundation boundary

The shared shell is now visible in the existing Organizer, Learning Threads, and People & Health views. Command Cabin is the first complete read-only cabin view, with a searchable action queue, status filters, project summaries, and the common five-counter context bar. The shared intake runtime now supplies all five cabin adapters, including specialized Assets media and Navigation P1/P2/P3 interpretation. Private Agent V2 receives the same five-cabin catalog during decomposition and shows the selected routing surface in Shadow results. Existing star-ring and privacy-sensitive interactions remain intact; write actions still stop at the reviewed transaction protocol.
