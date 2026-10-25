# Workflow templates ↔ workflow service database — contract notes

> [!IMPORTANT]
> **Brainstorm, not a spec.** What templates must emit, stamp and pass so the workflow service database can be filled. The schema itself lives in platform-services: `docs/workflow-service-schema.md` — read it first. Design authority stays with [04 · Workflow](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/04-workflow.md), [ADR-004](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/004-orchestration-argo-workflows.md), [ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md) and [ADR-009](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/009-stop-conditions.md).

## Agreed

Architect, 2026-10-25. Full list in the schema doc.

- Our own run UUID, independent of Argo — even while the POC submits from the Argo CLI.
- Step ≠ step attempt. A step is one node of the unrolled loop; an attempt is one pod.
- Agents report step status to the workflow service.
- Caps are different kinds, not one cap with several names.

## Identifiers templates must carry

| ID | Origin | How it reaches the pod |
|---|---|---|
| Run UUID | workflow service | parameter + pod label |
| Step key (e.g. `P1`, `C1`, `C2`) | template | derived from role + iteration |
| Attempt no. | Argo | `{{retries}}` |
| Workflow UID | Argo | `{{workflow.uid}}` |
| Pod name | Argo | `{{pod.name}}` |

- IDs and references only — never tokens ([token broker](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/reference/token-broker.md) decision log).
- A UUID is 36 characters, within the 63-character label value limit ([labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#syntax-and-character-set)).
- `{{retries}}` is "the retry number of the container/script if `retryStrategy` is specified" ([variables](https://argo-workflows.readthedocs.io/en/latest/variables/)). **Unverified:** whether it can be substituted into pod labels / `podMetadata`, or only into the container spec.
- **Where the run UUID comes from in the POC** — proposal from the 2026-10-23 artifact service discussion: a registration call from the workflow to the workflow service returns the run UUID **before any model-driven pod starts**. Temporary, unauthenticated; replaced once the workflow service submits runs itself. Argo [HTTP templates](https://argo-workflows.readthedocs.io/en/latest/http-template/) are one way. Not evaluated.

## Caps as template parameters

| Cap | In the 04 example | Proposal |
|---|---|---|
| Iteration cap | hardcoded `attempt < 2` in a `when` | workflow parameter, reported to the database at registration |
| Infrastructure retry limit | `retryStrategy: { limit: 2 }` | per template; reported per step |
| Time cap | `activeDeadlineSeconds: 3600` | per template; reported per attempt |

- **Naming.** The 04 example calls its iteration counter `attempt`. In the schema, "attempt" means an Argo retry. Proposal: rename the template parameter to `iteration`.
- What the iteration cap counts — review rounds, or every coder pass including failed checks — is deferred.

## Retry policy

- Default `retryPolicy` is `OnFailure`: "Retry steps whose main container is marked as failed in Kubernetes" ([retries](https://argo-workflows.readthedocs.io/en/latest/retries/)).
- So with the 04 example as written, any non-zero goose exit is retried, including domain failures. The comment `# infrastructure retries, not review rounds` holds only with a narrower policy.
- Narrower options: `OnError` ("Argo controller errors, or whose init or wait containers fail"), `OnTransientError`, or an `expression` on `lastRetry.exitCode` / `lastRetry.status`.
- Every retry is a new pod and pays for model calls again.
- **Not documented on the retries page:** whether exceeding `activeDeadlineSeconds` is retried.

## Outcomes

- Every step emits an artifact and exits with one of a fixed set of outcomes ([04](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/04-workflow.md#stop-conditions)). The set is not finalized.
- The 04 example reads `/tmp/verdict` with values `changes` and default `none`. Whatever set is chosen, template `when` expressions and the database must use the same words.

## Status and crashes

- Agents report status; templates don't report on their behalf.
- A killed pod (OOM, SIGKILL) can't report. goose hooks run inside the goose process, so they can't catch that either ([goose hooks](https://goose-docs.ai/blog/2026/05/14/goose-hooks)).
- Later candidates for an outside observer: Argo [exit handlers](https://argo-workflows.readthedocs.io/en/latest/walk-through/exit-handlers/), [lifecycle hooks](https://argo-workflows.readthedocs.io/en/latest/lifecyclehook/). Not evaluated; not needed for the first POC stage.

## Open

- [ ] `{{retries}}` in pod labels — verify.
- [ ] Retry policy for agent templates: `OnFailure` vs. narrower.
- [ ] Is `activeDeadlineSeconds` expiry retried?
- [ ] Rename `attempt` → `iteration` in templates.
- [ ] Step key scheme (`P1`, `C2`, …) — who assigns it, template or workflow service.
- [ ] Run registration mechanism for CLI-submitted runs.
- [ ] Outcome set — shared with the schema doc.

## Decision log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-10-25 | Started contract notes alongside the platform-services schema brainstorm | Templates decide which IDs, caps and outcomes reach the database. |
