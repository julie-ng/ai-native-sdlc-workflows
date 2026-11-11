import { readFile, writeFile } from 'node:fs/promises';

type Step = {
  stepId: string;
  token: string;
};
type Run = {
  runId: string;
  steps: {
    planner: Step;
    coder: Step;
  };
};
const roles = ['planner', 'coder'] as const;
const serviceAccountPath = '/var/run/secrets/kubernetes.io/serviceaccount';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validRun(value: unknown): value is Run {
  if (!record(value) || !nonempty(value.runId) || !record(value.steps)) {
    return false;
  }
  const steps = value.steps;
  return roles.every(role => {
    const step = steps[role];
    return record(step) && nonempty(step.stepId) && nonempty(step.token);
  });
}

async function post(url: string, options: RequestInit, failureMessage: string): Promise<Response> {
  try {
    return await fetch(url, {
      ...options,
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Network errors can carry request details; never log the original error.
    fail(failureMessage);
  }
}

async function main() {
  const {
    WORKFLOW_NAME,
    WORKFLOW_UID,
    WORKFLOW_NAMESPACE,
  } = process.env;
  for (const [name, value] of Object.entries({
    WORKFLOW_NAME,
    WORKFLOW_UID,
    WORKFLOW_NAMESPACE,
  })) {
    if (!nonempty(value)) {
      fail(`${name} is required`);
    }
  }

  const adminToken = (await readFile('/mnt/foreman-admin/platform-services-admin-token', 'utf8')).trim();
  const apiToken = (await readFile(`${serviceAccountPath}/token`, 'utf8')).trim();
  if (!adminToken) {
    fail('Admin token is empty');
  }
  if (!apiToken) {
    fail('Kubernetes API token is empty');
  }

  const response = await post(
    'http://platform-services.platform.svc.cluster.local/api/runs',
    { headers: { Authorization: `Bearer ${adminToken}` } },
    'Run creation request failed',
  );
  if (response.status !== 201) {
    fail(`Run creation returned HTTP ${response.status}`);
  }

  let run: unknown;
  try {
    run = await response.json();
  } catch {
    fail('Invalid run creation response');
  }
  // Check both steps before creating either Secret. Never print the response.
  if (!validRun(run)) {
    fail('Invalid run creation response');
  }

  for (const role of roles) {
    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      type: 'Opaque',
      metadata: {
        name: `hmac-${WORKFLOW_NAME}-${role}`,
        namespace: WORKFLOW_NAMESPACE,
        ownerReferences: [
          {
            apiVersion: 'argoproj.io/v1alpha1',
            kind: 'Workflow',
            name: WORKFLOW_NAME,
            uid: WORKFLOW_UID,
            blockOwnerDeletion: false,
          },
        ],
      },
      stringData: {
        token: run.steps[role].token,
        'run-id': run.runId,
        'step-id': run.steps[role].stepId,
      },
    };
    // POST needs only secrets:create; error bodies may echo credentials.
    const created = await post(
      `https://kubernetes.default.svc/api/v1/namespaces/${encodeURIComponent(WORKFLOW_NAMESPACE!)}/secrets`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(secret),
      },
      `Failed to create ${role} Secret`,
    );
    if (created.status !== 201) {
      fail(`Failed to create ${role} Secret: HTTP ${created.status}`);
    }
  }

  await writeFile('/tmp/foreman-run-id', run.runId, { mode: 0o600 });
  console.log(run.runId);
}

// File and unexpected errors must also exit non-zero without exposing causes.
main().catch(() => fail('Foreman failed'));
