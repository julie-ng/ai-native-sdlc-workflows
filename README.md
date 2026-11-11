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
  -p model=openai/gpt-6.1-sol \
  --watch --log
```

| Parameter | Default | Description |
| --- | --- | --- |
| `acr` | none, required | Registry host, e.g. `myregistry.azurecr.io` |
| `model` | `openai/gpt-6.1-sol` | Vercel AI Gateway model ID passed as `GOOSE_MODEL` |

The run succeeds when the step log shows the model's report of the smoke test output. Secrets are never passed as parameters: the image entrypoint reads them from `/mnt/agent-secrets`.
