# AI Native SDLC - Workflows

## Templates

### `agent-smoke-test`

[`templates/agent-smoke-test.yaml`](templates/agent-smoke-test.yaml) runs the `agent-base` image as ServiceAccount `planner`. Its secrets are mounted from Key Vault through the `planner-secrets` SecretProviderClass. It executes the image's `smoke-test` recipe with goose against the real model, to check that the image, Argo, workload identity, Key Vault and the AI gateway work together.

Apply the template:

```sh
argo lint templates/agent-smoke-test.yaml
kubectl apply -n agents -f templates/agent-smoke-test.yaml
```

Start a run:

```sh
argo submit --from workflowtemplate/agent-smoke-test -n agents \
  -p acr=<registry>.azurecr.io \
  -p model=openai/gpt-5.2-codex \
  --watch --log
```

| Parameter | Default | Description |
| --- | --- | --- |
| `acr` | none, required | Registry host, e.g. `myregistry.azurecr.io` |
| `model` | `openai/gpt-5.2-codex` | Vercel AI Gateway model ID passed as `GOOSE_MODEL` |

The run succeeds when the step log shows the model's report of the smoke test output. Secrets are never passed as parameters: the image entrypoint reads them from `/mnt/agent-secrets`.

### `foreman`

[`templates/foreman.yaml`](templates/foreman.yaml) creates a platform-services run and two Secrets, `hmac-<workflow name>-planner` and `hmac-<workflow name>-coder`. Each contains `token`, `run-id` and `step-id` and is owned by the Workflow with `blockOwnerDeletion: false`. The script logs only the run ID, also exposed as output parameter `run-id`. Tokens never enter Argo outputs or parameters.

Requires the deployed [trusted foreman infrastructure](https://github.com/julie-ng/ai-native-sdlc-infrastructure#trusted-foreman-step-19) and [run API](https://github.com/julie-ng/ai-native-sdlc-platform-services#trying-the-artifact-routes-locally). The foreman uses SA `foreman`, the CSI class `foreman-admin-token`, and a dedicated Kubernetes API token projection. Pod automount stays off; the executor uses `argo-executor`. The image is `node:24.22.1-bookworm-slim`, pinned to the same digest as platform-services and agent-images. Node 24 runs [`scripts/foreman.ts`](scripts/foreman.ts) with native type stripping, no build and no npm packages. Native `fetch` calls both APIs; `NODE_EXTRA_CA_CERTS` points to the projected Kubernetes CA. Its runtime has not been exercised here.

From the repository root, generate the ConfigMap from the script, lint, and apply both resources:

```sh
kubectl kustomize . > /tmp/foreman-manifests.yaml
argo lint --offline /tmp/foreman-manifests.yaml
kubectl apply -f /tmp/foreman-manifests.yaml
argo submit --from workflowtemplate/foreman -n agents --watch --log
```

The ConfigMap has a stable name because its reference is nested inside an Argo template. Reapply after script changes, between runs. No automatic retries: a failed Secret creation fails the step, and any already-created Secret remains Workflow-owned until cleanup. Submit a new Workflow rather than retrying a partially completed foreman.

For #7, reference `templateRef: {name: foreman, template: foreman}`. Its template-level identity, mounts and deadline travel with the reference; the caller must set its own Workflow deadline and TTL. Agent templates mount their own Secret, for example:

```yaml
volumes:
  - name: hmac
    secret:
      secretName: "hmac-{{workflow.name}}-planner"
```

**Substitution verified by source inspection, not a cluster run:** Argo 4.1.6's [`substitutePodParams`](https://github.com/argoproj/argo-workflows/blob/v4.1.6/workflow/controller/workflowpod.go#L1002) replaces global variables across the serialized Pod, including volume `secretName`. The end-to-end run must still confirm the resulting pod contains the concrete Workflow name.

**Executor mounts:** Argo 4.1.6's [`addOutputArtifactsVolumes`](https://github.com/argoproj/argo-workflows/blob/v4.1.6/workflow/controller/workflowpod.go#L1678) mirrors main mounts under `/mainctrfs`. The template's `podSpecPatch` removes the mirrored admin-token and foreman API-token mounts from `wait`. Azure's [skip-containers annotation](https://azure.github.io/azure-workload-identity/docs/topics/service-account-labels-and-annotations.html) also skips identity-token injection into `init` and `wait`. This targets the current executor layout; inspect the generated pod after Argo upgrades.

Human-run acceptance checks, before the five-minute TTL expires (set `WF` to the submitted Workflow name):

```sh
WF=<workflow-name>
# Only names, keys and ownership; never print Secret data.
kubectl get secret -n agents "hmac-$WF-planner" "hmac-$WF-coder" -o json |
  jq '.items[] | {name: .metadata.name, keys: (.data | keys), owners: .metadata.ownerReferences}'
kubectl get workflow -n agents "$WF" -o jsonpath='{.metadata.uid}{"\n"}'
# Check main alone has foreman-admin and kubernetes-api mounts;
# wait retains its separate executor token mount, with no mirrored credentials.
kubectl get pod -n agents -l "workflows.argoproj.io/workflow=$WF" -o json |
  jq '.items[].spec | {automountServiceAccountToken, containers: [(.initContainers[]?, .containers[]) | {name, volumeMounts}]}'
# After completion + TTL + garbage-collector processing: all three must disappear.
kubectl wait -n agents --for=delete "workflow/$WF" --timeout=420s
kubectl wait -n agents --for=delete "secret/hmac-$WF-planner" "secret/hmac-$WF-coder" --timeout=120s
```

Check owner UIDs match the Workflow UID and `blockOwnerDeletion` is false. Review workflow logs and outputs privately to confirm no credential values appear. Cluster API access, CSI identity, image execution, generated pod mounts and TTL garbage collection remain **unverified until the human acceptance run**.

### `initial-release`: issue to PR

[`templates/initial-release.yaml`](templates/initial-release.yaml) runs the reusable `foreman/foreman` step, then planner and coder pods. Requires the deployed foreman infrastructure/API above, the [planner/coder CSI classes](https://github.com/julie-ng/ai-native-sdlc-infrastructure#planner-and-coder-secret-mounts-18-26), and the published [agent-base runtime entrypoint](https://github.com/julie-ng/ai-native-sdlc-agent-images#runtime-secrets-and-git-setup). The target repository must have `main`, allow `julieio-goose` to push task branches/create PRs, and have its signing public key registered. The configured email, `me+goose@julie.io`, matches the verified email on that account's public GPG key (checked 2026-11-11).

Render, lint, and apply from this repository root. This bundle includes foreman, both recipes and the foreman script:

```sh
kubectl kustomize . > /tmp/initial-release-manifests.yaml
argo lint --offline /tmp/initial-release-manifests.yaml
kubectl apply -f /tmp/initial-release-manifests.yaml
argo submit --from workflowtemplate/initial-release -n agents \
  -p acr=<registry>.azurecr.io \
  -p repository=julie-ng/aks-architect-ai \
  -p issue=<real-issue-number> \
  -p model=openai/gpt-5.2-codex \
  --watch --log
```

| Parameter | Default | Description |
| --- | --- | --- |
| `repository` | required | GitHub `owner/name`; target branch is `main` |
| `issue` | required | Positive issue number in that repository |
| `acr` | required | Registry host, as in the smoke template; runs `agent-base:latest` |
| `model` | `openai/gpt-5.2-codex` | Vercel AI Gateway model ID |

Both agent containers run Goose directly through the image entrypoint, starting in `/workspace`, so Goose and tool output reach the step logs. The recipes contain the exact shell commands for cloning and artifact transfer; there are no planner/coder wrappers or post-checks.

[`recipes/planner.yaml`](recipes/planner.yaml) clones the repository, reads the issue and applicable instructions, and writes `/workspace/plan.md` outside the checkout without changes or commits. It registers `plan`, uploads it to the returned SAS URL using `curl`, and reports its size and SHA-256. It must confirm the API response has state `uploaded` before claiming success.

[`recipes/coder.yaml`](recipes/coder.yaml) downloads the plan first, before cloning, to use the short-lived token promptly. It selects exactly one uploaded plan from the artifact list, gets its download SAS, and checks downloaded size/SHA-256 against that metadata. It then clones the repository, creates `agent/<issue>-implementation` from `main`, implements, runs repository checks, signs commits, pushes, and creates a PR linking the issue. It confirms the PR with `gh pr view`; the human reviews the changes, checks and GitHub **Verified** status. These are recipe instructions, not programmatic guarantees. A failed run can leave a remote branch or PR; inspect it before submitting again.

Both pods use UID/GID 1000, independent `emptyDir` workspaces with `fsGroup: 1000`, and the image entrypoint for GitHub/AI credentials and coder signing. Planner mounts only `planner-secrets` and `hmac-<workflow>-planner`; coder mounts only `coder-secrets` and `hmac-<workflow>-coder`. Neither has the foreman admin token or an agent Kubernetes API token. The executor has its separate identity; the pod patch removes Argo 4.1.6's mirrored CSI/HMAC mounts, and Azure identity injection skips `init`/`wait`.

Planner and coder can read their own HMAC token, alongside the GitHub PAT (`GH_TOKEN`) and AI gateway key (`AI_GATEWAY_API_KEY`). **This is accepted for the initial release.** The HMAC token permits access only to the step's allowed plan artifact within one run and expires after 15 minutes. Role separation comes from separate pods and mounts; there is no model/credential isolation within a pod. Recipes read HMAC headers inline from `/mnt/hmac/*` in their `curl` commands and prohibit echoing/storing credential values, shell tracing, verbose curl output, and printing API responses or SAS URLs. This is prompt guidance, not an enforced guarantee against secret leakage. Goose output reaches the logs for debugging, so the human acceptance run must check those logs privately for secrets. Model sessions and task files are not exported as Argo artifacts.

Deadlines are 180 seconds for foreman, 300 for planner, 540 for coder, and 1020 for the workflow including startup. HMAC tokens still expire 15 minutes after run creation: scheduling delays consume that window, and deadlines do not renew tokens. There are no automatic retries, reviewer step or iteration loops. Workflows and owned HMAC Secrets are retained for one hour after completion for inspection, then garbage collected. Stable ConfigMap names require reapplying between runs, never during one.

Human acceptance on a real test issue (not performed by these offline checks):

1. Confirm the planner reports a successful upload, the coder reports a verified download, and Goose reports a PR URL; inspect that PR and its changes. Confirm every implementation commit shows **Verified** by `julieio-goose`, and the PR links the original issue. Do not merge automatically.
2. Inspect generated pod identities, concrete Secret names, CSI classes and all container mounts, without reading Secret values:

   ```sh
   WF=<workflow-name>
   kubectl get pod -n agents -l "workflows.argoproj.io/workflow=$WF" -o json |
     jq '.items[] | {name: .metadata.name, sa: .spec.serviceAccountName, automount: .spec.automountServiceAccountToken, volumes: [.spec.volumes[] | {name, secretName: .secret.secretName, csiClass: .csi.volumeAttributes.secretProviderClass}], containers: [(.spec.initContainers[]?, .spec.containers[]) | {name, volumeMounts}]}'
   ```

   Planner must mount neither coder HMAC nor coder CSI/GPG material. Agent `main` containers must have only their own HMAC/CSI credentials; `init`/`wait` must have neither mirrored mount nor injected Azure token. The executor keeps its own API token. Recheck after Argo upgrades.
3. Review logs and Workflow parameters/outputs privately for credential leakage. Do not print credential values to compare them. Follow the foreman ownership/cleanup checks above, allowing the initial-release template's one-hour TTL.

**Unverified until that run:** Goose recipe execution, cluster API/CSI/identity delivery, actual SAS transfers, generated pod patches, GitHub push/PR/Verified status, absence of secrets in real logs/outputs, and TTL cleanup. Offline lint validates structure, not these behaviors. Goose is unavailable in this development container, so no local Goose recipe validation or model calls are claimed.

## Offline checks

Requires Node.js 24/npm for linting, kubectl (with Kustomize), and Argo CLI 4.1.6. The human cluster checks above also use jq. ESLint dependencies are development tooling only; the foreman runtime still needs no npm packages.

```sh
npm ci
npm run lint
kubectl kustomize . > /tmp/foreman-manifests.yaml
argo lint --offline templates/
argo lint --offline /tmp/foreman-manifests.yaml
git diff --check
```

[CI](.github/workflows/ci.yml) runs `npm run lint` and Argo 4.1.6 offline lint on source templates and the rendered Kustomize bundle for pull requests to `main`, pushes to `main`, and manual runs.

Use `npm run lint:fix` to apply style fixes. [`eslint.config.mjs`](eslint.config.mjs) requires braces for every conditional/loop body, one property per line in multi-property objects and TypeScript types, and one element per line in arrays with three or more elements or multiline elements. Short lists stay compact.

ESLint checks code style; Argo lint and rendering check manifest structure only. The human developer’s cluster run verifies API calls, Secret creation, credential mounts and cleanup.

## Decision log

| Date | Decision and reasoning |
| --- | --- |
| 2026-11-11 | Deliver the foreman script through a Kustomize-generated ConfigMap for the initial release, keeping one script source. This is packaging, not an architecture decision. |
| 2026-11-11 | For the trusted foreman, use dependency-free TypeScript on the shared Node 24 image pin, per human review preference: native fetch and type stripping replace shell, jq, curl and kubectl plumbing. |
| 2026-11-11 | Remove Argo's mirrored credential mounts with a pod patch and skip Azure token injection into executor containers to keep foreman credentials in main. Checked against 4.1.6 source; generated pod verification remains human-run. |
| 2026-11-11 | Name the reusable WorkflowTemplate `foreman` for #7, and remove mock tests per human review: the developer’s cluster run is the behavioral verification. |
| 2026-11-11 | Add ESLint with Stylistic rules per human preference: require braces and expand object properties and longer arrays for review. `npm run lint` checks; `npm run lint:fix` applies fixes. Tooling is development-only. |
| 2026-11-11 | PR #10 human review: run Goose directly and put cloning, branching and curl artifact transfers in ConfigMap-delivered recipes. Remove planner/coder wrappers and their post-checks so output reaches logs and prompt changes need no matching code changes. The trusted foreman remains TypeScript. Packaging is an initial-release choice; baked skills remain open under parent ADR-010/013. |
| 2026-11-11 | Accept planner/coder access to their own HMAC token alongside the PAT and gateway key for the initial release: its authority is limited to allowed plan artifacts in one run for 15 minutes. Keep separate pods/role mounts and prompt rules against disclosure. Download first in the coder; the human reviews the PR and Verified commits. If transfer reliability proves inadequate, consider a small shell-callable CLI helper later. |
| 2026-11-11 | Human dry-run: mount each role recipe as a single file with subPath instead of the whole recipes ConfigMap directory, avoiding sibling recipes during Goose execution. |
