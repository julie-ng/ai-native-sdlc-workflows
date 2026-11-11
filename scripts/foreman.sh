#!/bin/sh
set -eu

: "${WORKFLOW_NAME:?required}"
: "${WORKFLOW_UID:?required}"
: "${WORKFLOW_NAMESPACE:?required}"

umask 077
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
trap 'exit 1' HUP INT TERM
fail() { echo "$1" >&2; exit 1; }

# Keep the admin token out of process arguments and all Argo data channels.
admin_token=$(cat /mnt/foreman-admin/platform-services-admin-token)
[ -n "$admin_token" ] || fail 'Admin token is empty'
printf 'Authorization: Bearer %s\n' "$admin_token" > "$work_dir/header"
unset admin_token
status=$(curl --silent --connect-timeout 10 --max-time 30 \
  --request POST --header "@$work_dir/header" \
  --output "$work_dir/run.json" --write-out '%{http_code}' \
  http://platform-services.platform.svc.cluster.local/api/runs) \
  || fail 'Run creation request failed'
[ "$status" = 201 ] || fail "Run creation returned HTTP $status"

# Validate both steps before creating either Secret; never echo a bad response.
jq -e '
  def nonempty: type == "string" and length > 0;
  (.runId | nonempty) and
  (.steps.planner.stepId | nonempty) and (.steps.planner.token | nonempty) and
  (.steps.coder.stepId | nonempty) and (.steps.coder.token | nonempty)
' "$work_dir/run.json" >/dev/null 2>&1 || fail 'Invalid run creation response'

for role in planner coder; do
  jq --arg role "$role" --arg name "$WORKFLOW_NAME" \
    --arg uid "$WORKFLOW_UID" --arg namespace "$WORKFLOW_NAMESPACE" '
    {
      apiVersion: "v1", kind: "Secret", type: "Opaque",
      metadata: {
        name: ("hmac-" + $name + "-" + $role), namespace: $namespace,
        ownerReferences: [{apiVersion: "argoproj.io/v1alpha1", kind: "Workflow",
          name: $name, uid: $uid, blockOwnerDeletion: false}]
      },
      stringData: {token: .steps[$role].token, "run-id": .runId,
        "step-id": .steps[$role].stepId}
    }
  ' "$work_dir/run.json" > "$work_dir/secret.json"
  # create (not apply) needs only secrets:create. Error bodies can contain data.
  kubectl --namespace "$WORKFLOW_NAMESPACE" --request-timeout=30s \
    create -f "$work_dir/secret.json" >/dev/null 2>&1 \
    || fail "Failed to create $role credential Secret"
done

jq -r '.runId' "$work_dir/run.json" > /tmp/foreman-run-id
cat /tmp/foreman-run-id
