import { writeFile } from 'node:fs/promises';
import { artifactPath, artifacts, command, fail, goose, planPath, prepare, request, run, sha256 } from './agent-runtime.ts';

await run('Coder', async () => {
  const { repository, issue } = await prepare();
  console.log('Downloading plan');
  const call = await artifacts();
  const listed = await call();
  const plans = listed.artifacts.filter(artifact => artifact.name === 'plan' && artifact.state === 'uploaded');
  if (plans.length !== 1) {
    fail('Expected one uploaded plan');
  }
  const path = artifactPath(plans[0].id);
  const metadata = await call(path);
  if (metadata.state !== 'uploaded' || metadata.sizeBytes > 1_000_000) {
    fail('Plan is not ready');
  }
  const sas = await call(`${path}/sas`);
  const response = await request(sas.url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== metadata.sizeBytes || sha256(bytes) !== metadata.sha256) {
    fail('Plan integrity check failed');
  }
  await writeFile(planPath, bytes, { mode: 0o600 });
  console.log('Plan downloaded and verified');
  const title = await command('gh', [
    'issue',
    'view',
    issue,
    '--repo',
    repository,
    '--json',
    'title',
    '--jq',
    '.title',
  ]);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/g, '') || 'implementation';
  const branch = `agent/${issue}-${slug}`;
  await command('git', [
    'switch',
    '-c',
    branch,
  ]);
  await goose('coder');
  console.log('Checking implementation commits and PR');
  if (await command('git', ['branch', '--show-current']) !== branch) {
    fail('Coder changed the task branch');
  }
  if (await command('git', ['status', '--porcelain'])) {
    fail('Coder left uncommitted changes');
  }
  const commits = (await command('git', ['rev-list', 'origin/main..HEAD'])).split('\n').filter(Boolean);
  if (!commits.length) {
    fail('No implementation commits');
  }
  for (const commit of commits) {
    await command('git', ['verify-commit', commit]);
  }
  const pr = JSON.parse(await command('gh', [
    'pr',
    'view',
    branch,
    '--repo',
    repository,
    '--json',
    'url,headRefOid,baseRefName,state',
  ]));
  if (pr.state !== 'OPEN' || pr.baseRefName !== 'main' || pr.headRefOid !== await command('git', ['rev-parse', 'HEAD'])) {
    fail('Expected an open PR to main at the implemented commit');
  }
  // Log only the validated GitHub URL, never arbitrary model/tool output.
  if (typeof pr.url !== 'string' || !pr.url.startsWith(`https://github.com/${repository}/pull/`)) {
    fail('Unexpected PR URL');
  }
  console.log(`PR ready: ${pr.url}`);
});
