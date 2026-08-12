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
- Only a transport issued by `createAIProviderSandboxTransport` is accepted. That transport enforces HTTPS, fixed Provider origins, redirect rejection, abort signals, and bounded response bodies.

## Execution lifecycle

The sandbox enforces verified entitlement, stable paid feature ID, Provider readiness, serialized trial reservation, privacy-safe job transitions, secret-scoped dispatch, protocol parsing, caller validation, usage settlement, completion, and archive.

Locked or unready access fails before SecretStorage and network dispatch. Cancellation aborts the fetch signal and releases the trial reservation. HTTP and validation failures are archived with allowlisted error codes, without prompts, results, response details, or credentials in jobs and usage metadata.

## Private OS back-connection rule

The current private OS keeps its production records and settings in its existing plugin directory. No `data.json`, prompt, job note, record, key, or personal path is copied into this repository. Back-connection must replace individual legacy Provider call sites with an injected private runtime and this sandbox contract; it must not copy the monolithic runtime into the public source tree.

The visible AI Steward stays locked until signed entitlement verification, private persistence adapters, crash-recovery journaling, and confirmation UI have all passed their separate gates.

Acceptance requires the complete `npm run check` gate.
