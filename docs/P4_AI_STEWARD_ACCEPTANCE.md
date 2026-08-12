# P4 AI Steward Shell Acceptance

This P4 slice adds the visible, bilingual AI Steward entrance without migrating provider credentials or executable paid workflows into the public plugin.

## Product behavior

- The AI Steward command and application view are always visible.
- The locked view explains entitlement, provider, trial, task, and privacy state.
- Every AI capability control is a native disabled button with no click handler.
- A verified entitlement may be projected into the read model, but the public shell still requires an explicit private runtime connection before interaction can be enabled.
- Chinese uses `AI 管家`; English uses `AI Steward`.

## Privacy boundary

- The default public runtime supplies no entitlement, provider credentials, prompts, outputs, or job payloads.
- Provider state is limited to allowlisted IDs and health labels.
- Job state starts from the privacy-safe persistence projection and removes task IDs, request IDs, and timestamps again before entering the view model.
- Signed entitlement envelopes and subjects do not appear in the application model.
- Caller-forged entitlement objects fail closed.

## Verification

Acceptance requires tests proving:

1. The command registers and opens the AI Steward view.
2. Locked capabilities remain visible but cannot be clicked.
3. English and Chinese locale packs remain in parity.
4. Forged entitlement data cannot enable the view.
5. Provider keys, prompts, output, subjects, and signed envelopes do not survive the read-model projection.
6. `npm run check` passes the complete test, i18n, privacy, build, and release gates.

This slice does not authorize model requests. The next AI slice must connect a private verifier and SecretStorage-backed provider adapter through the audited safety services before enabling any action.
