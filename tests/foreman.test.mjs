import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../scripts/foreman.sh', import.meta.url), 'utf8');
for (const scenario of ['success', 'http-error', 'malformed', 'missing-coder', 'create-error']) {
  test(scenario, () => {
    const dir = mkdtempSync(join(tmpdir(), 'foreman-test-'));
    try {
      mkdirSync(join(dir, 'bin'));
      mkdirSync(join(dir, 'private'));
      writeFileSync(join(dir, 'admin'), 'test-admin-secret');
      const response = { runId: 'run-123', steps: {
        planner: { stepId: 'planner-123', token: 'test-planner-secret' },
        coder: { stepId: 'coder-123', token: 'test-coder-secret' },
      } };
      if (scenario === 'missing-coder') delete response.steps.coder;
      writeFileSync(join(dir, 'response'), scenario === 'malformed' ? '{broken test-secret' : JSON.stringify(response));
      writeFileSync(join(dir, 'bin/curl'), `#!/bin/sh
set -eu
[ "$*" != "" ]
while [ "$#" -gt 0 ]; do
  case "$1" in
    --header) shift; header=$1 ;;
    --output) shift; output=$1 ;;
  esac
  shift
done
[ "$(cat "\${header#@}")" = 'Authorization: Bearer test-admin-secret' ] || exit 1
cp "$TEST_DIR/response" "$output"
if [ "$SCENARIO" = http-error ]; then printf 401; else printf 201; fi
`, { mode: 0o755 });
      writeFileSync(join(dir, 'bin/kubectl'), `#!/bin/sh
set -eu
[ "$1" = --namespace ] && [ "$2" = agents ]
[ "$3" = --request-timeout=30s ] && [ "$4" = create ] && [ "$5" = -f ]
if [ "$SCENARIO" = create-error ]; then echo test-coder-secret >&2; exit 1; fi
if [ -f "$TEST_DIR/planner.json" ]; then role=coder; else role=planner; fi
cp "$6" "$TEST_DIR/$role.json"
`, { mode: 0o755 });
      // Substitute only mount/output paths; execute the production script logic.
      writeFileSync(join(dir, 'foreman.sh'), source
        .replace('/mnt/foreman-admin/platform-services-admin-token', join(dir, 'admin'))
        .replaceAll('/tmp/foreman-run-id', join(dir, 'run-id')));
      const result = spawnSync('sh', [join(dir, 'foreman.sh')], {
        encoding: 'utf8', env: { ...process.env,
          PATH: `${dir}/bin:${process.env.PATH}`, TEST_DIR: dir, TMPDIR: join(dir, 'private'),
          SCENARIO: scenario, WORKFLOW_NAME: 'foreman-test-abc',
          WORKFLOW_UID: 'workflow-uid', WORKFLOW_NAMESPACE: 'agents',
        },
      });
      assert.equal(result.status, scenario === 'success' ? 0 : 1, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /test-(admin|planner|coder)-secret/);
      assert.deepEqual(readdirSync(join(dir, 'private')), [], 'temporary credentials removed');
      if (scenario !== 'success') {
        assert.equal(result.stdout, '');
        assert.equal(readdirSync(dir).filter(x => /^(planner|coder)\.json$/.test(x)).length, 0);
        return;
      }
      assert.equal(result.stdout, 'run-123\n');
      for (const role of ['planner', 'coder']) {
        const secret = JSON.parse(readFileSync(join(dir, `${role}.json`)));
        assert.equal(secret.metadata.name, `hmac-foreman-test-abc-${role}`);
        assert.equal(secret.metadata.namespace, 'agents');
        assert.deepEqual(secret.metadata.ownerReferences, [{ apiVersion: 'argoproj.io/v1alpha1',
          kind: 'Workflow', name: 'foreman-test-abc', uid: 'workflow-uid', blockOwnerDeletion: false }]);
        assert.deepEqual(secret.stringData, { token: `test-${role}-secret`,
          'run-id': 'run-123', 'step-id': `${role}-123` });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('pod patch removes mirrored credentials and preserves executor identity', () => {
  const yaml = readFileSync(new URL('../templates/foreman-test.yaml', import.meta.url), 'utf8');
  const patch = yaml.match(/      podSpecPatch: \|\n([\s\S]*?)      metadata:/)[1]
    .split('\n').map(line => line.slice(8)).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'foreman-patch-'));
  try {
    const mounts = [
      { name: 'foreman-admin', mountPath: '/mainctrfs/mnt/foreman-admin' },
      { name: 'kubernetes-api', mountPath: '/mainctrfs/var/run/secrets/kubernetes.io/serviceaccount' },
      { name: 'exec-token', mountPath: '/var/run/secrets/kubernetes.io/serviceaccount' },
    ];
    const mainMount = { name: 'kubernetes-api', mountPath: '/var/run/secrets/kubernetes.io/serviceaccount' };
    writeFileSync(join(dir, 'pod.json'), JSON.stringify({ apiVersion: 'v1', kind: 'Pod',
      metadata: { name: 'test' }, spec: { containers: [
        { name: 'main', image: 'test', volumeMounts: [mainMount] },
        { name: 'wait', image: 'test', volumeMounts: mounts },
      ] } }));
    const result = spawnSync('kubectl', ['patch', '--local', '--type=strategic',
      '-f', join(dir, 'pod.json'), '--patch', 'spec:\n' + patch.split('\n').map(line => '  ' + line).join('\n'), '-o', 'json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const containers = JSON.parse(result.stdout).spec.containers;
    assert.deepEqual(containers.find(c => c.name === 'main').volumeMounts, [mainMount]);
    assert.deepEqual(containers.find(c => c.name === 'wait').volumeMounts, [mounts[2]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
