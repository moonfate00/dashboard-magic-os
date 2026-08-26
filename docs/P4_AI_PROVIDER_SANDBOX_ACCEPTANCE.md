# P4 AI Provider Sandbox Acceptance

This slice assembles the public safety primitives into one real Provider execution boundary. It does not unlock the visible AI Steward interface and the acceptance suite uses injected fake network responses only.

## Trusted configuration

- OpenAI and DeepSeek endpoints are fixed inside the sandbox. A caller-supplied URL is ignored.
- Provider model identifiers are supplied when the private sandbox is created. A caller-supplied model is ignored.
- The private runtime must explicitly set its construction-time `executionEnabled` gate. Valid entitlement and configured secrets alone cannot enable dispatch.
- Credentials are read only through the private runtime's allowlisted SecretStorage scope and exist only while the request is dispatched.
- Billing is always enabled for Provider execution; callers cannot opt out of settlement or trial charging.
- OpenAI requests set `store: false`. Both Providers receive bounded output-token settings.
- Prompt and schema byte sizes are bounded before entitlement, secret, or network access.
- Schema and tool definitions must be plain, serializable data without accessors, cycles, class instances, or non-finite values.
- The only Provider tool currently accepted is the parameter-free OpenAI `web_search` tool. Remote MCP servers, custom URLs, function tools, extra fields, and multiple tools are rejected.
- Classification owns its reviewed route catalog, primary target, body profile, schema, feature, and tool decision inside the sandbox. Only OpenAI public-archive classification can receive the fixed `web_search` tool.
- Classification and learning inputs replace reviewed local source paths with opaque `source-N` tokens before transport. Learning-card citations map back through the local token table only after output validation.
- Learning cards accept only reviewed coverage keys and exact source tokens. Learning maps accept only internal graph references and the reviewed coverage set; omitted coverage is restored as explicitly marked deterministic local fallback nodes.
- Existing-file planning accepts only reviewed structured excerpts, replaces every Vault path with an opaque `source-N` token, and maps validated output back locally. Invented targets, unreviewed types, protected fields, credential signals, and local references are rejected.
- Card-library planning fixes the subject and reviewed topic set before dispatch. Output may not add topics, paths, WikiLinks, active content, or tools; excerpts and reviews are retained only with their corresponding public source fields.
- Model Skill execution accepts only a validated Skill name, definition, and task. Both authority sources reject credential signals and redact local references before transport; the fixed read-only interpreter receives no tools or network authority, and its report rejects active content, local references, private URLs, and unsafe structure.
- Only a transport issued by `createAIProviderSandboxTransport` is accepted. That transport enforces HTTPS, fixed Provider origins, redirect rejection, abort signals, and bounded response bodies.

## Execution lifecycle

The sandbox enforces verified entitlement, stable paid feature ID, Provider readiness, serialized trial reservation, privacy-safe job transitions, secret-scoped dispatch, protocol parsing, caller validation, usage settlement, completion, and archive.

Locked or unready access fails before SecretStorage and network dispatch. Cancellation aborts the fetch signal and releases the trial reservation. HTTP and validation failures are archived with allowlisted error codes, without prompts, results, response details, or credentials in jobs and usage metadata.

Connectivity, read-only knowledge, Agent planning, link routing, classification, learning-card planning, learning-map planning, existing-file patch planning, card-library planning, and model Skill execution each have a dedicated contract. None of those entries accepts caller-supplied system prompts, schemas, model identifiers, Provider URLs, feature IDs, billing flags, or arbitrary tools. Maintenance planners and Skill execution grant no Provider tools at all.

## Private OS back-connection rule

The current private OS keeps its production records and settings in its existing plugin directory. No `data.json`, prompt, job note, record, key, or personal path is copied into this repository. Back-connection must replace individual legacy Provider call sites with an injected private runtime and this sandbox contract; it must not copy the monolithic runtime into the public source tree.

The visible AI Steward stays locked until signed entitlement verification and private Provider activation pass their gates. Crash-recovery journaling, atomic persistence, and confirmed recovery UI now pass independently, but must still be bundled into the installed private runtime before real writes unlock.

Acceptance requires the complete `npm run check` gate.
