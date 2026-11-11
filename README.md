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
| 2026-11-11 | Use dependency-free TypeScript on the shared Node 24 image pin, per human review preference: native fetch and type stripping replace shell, jq, curl and kubectl plumbing. |
| 2026-11-11 | Remove Argo's mirrored credential mounts with a pod patch and skip Azure token injection into executor containers to keep foreman credentials in main. Checked against 4.1.6 source; generated pod verification remains human-run. |
| 2026-11-11 | Name the reusable WorkflowTemplate `foreman` for #7, and remove mock tests per human review: the developer’s cluster run is the behavioral verification. |
| 2026-11-11 | Add ESLint with Stylistic rules per human preference: require braces and expand object properties and longer arrays for review. `npm run lint` checks; `npm run lint:fix` applies fixes. Tooling is development-only. |
