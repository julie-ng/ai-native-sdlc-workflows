import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const planPath = '/workspace/plan.md';
export const checkout = '/workspace/repository';
const api = 'http://platform-services.platform.svc.cluster.local/api/artifacts';

class SafeError extends Error {}

export function fail(message: string): never {
  throw new SafeError(message);
}

export async function command(program: string, args: string[], cwd = checkout, capture = true): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => {
      if (capture) {
        output += chunk;
      }
    });
    // Tool errors can echo credentials. Never forward stderr to Argo logs.
    child.stderr.resume();
    child.on('error', () => reject(new SafeError(`${program} could not start`)));
    child.on('close', code => {
      if (code !== 0) {
        reject(new SafeError(`${program} failed (exit ${code})`));
      } else {
        resolve(output.trim());
      }
    });
  });
}

export async function prepare() {
  const repository = process.env.TASK_REPOSITORY ?? '';
  const issue = process.env.TASK_ISSUE ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[1-9][0-9]*$/.test(issue)) {
    fail('Expected repository owner/name and positive issue number');
  }
  console.log('Cloning repository');
  await command('gh', [
    'repo',
    'clone',
    repository,
    checkout,
  ], '/workspace');
  await command('git', [
    'checkout',
    '-B',
    'main',
    'origin/main',
  ]);
  return {
    repository,
    issue,
  };
}

export async function goose(role: 'planner' | 'coder') {
  console.log(`Starting ${role}`);
  // Goose/tool output is deliberately not streamed: it can contain credentials.
  // Only a fixed status enters pod logs. Credentials/SAS never become arguments.
  await command('goose', [
    'run',
    '--recipe',
    `/recipes/${role}.yaml`,
  ], checkout, false);
  console.log(`${role} finished`);
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function request(url: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    fail('Artifact request failed');
  }
  if (!response.ok) {
    fail(`Artifact request returned HTTP ${response.status}`);
  }
  return response;
}

export async function artifacts() {
  const values = await Promise.all([
    'token',
    'run-id',
    'step-id',
  ].map(async key =>
    (await readFile(`/mnt/hmac/${key}`, 'utf8')).trim(),
  ));
  if (values.some(value => !value)) {
    fail('Missing step credentials');
  }
  const [
    token,
    runId,
    stepId,
  ] = values;
  // These headers stay in wrapper memory; never export them to the child.
  return async (path = '', method = 'GET', body?: object) => {
    const response = await request(`${api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Run-Id': runId,
        'X-Step-Id': stepId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await response.json();
  };
}

export function artifactPath(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    fail('Invalid artifact ID');
  }
  return `/${id}`;
}

export async function run(role: string, main: () => Promise<void>) {
  try {
    await main();
  } catch (error) {
    // Includes malformed response bodies and file/process failures. Do not echo
    // original exceptions, response bodies, model output or SAS URLs.
    const reason = error instanceof SafeError ? error.message : 'Unexpected file, process or response failure';
    console.error(`${role} failed: ${reason}`);
    process.exitCode = 1;
  }
}
