import { readFile } from 'node:fs/promises';
import { artifactPath, artifacts, command, fail, goose, planPath, prepare, request, run, sha256 } from './agent-runtime.ts';

await run('Planner', async () => {
  await prepare();
  const base = await command('git', ['rev-parse', 'HEAD']);
  await goose('planner');
  if (await command('git', ['rev-parse', 'HEAD']) !== base || await command('git', ['status', '--porcelain'])) {
    fail('Planner changed the repository');
  }
  const bytes = await readFile(planPath);
  if (!bytes.toString('utf8').trim() || bytes.length > 1_000_000) {
    fail('Plan must be nonempty and at most 1,000,000 bytes');
  }
  console.log('Uploading plan');
  const call = await artifacts();
  const registered = await call('', 'POST', {
    name: 'plan',
    contentType: 'text/markdown',
  });
  const path = artifactPath(registered.id);
  try {
    await request(registered.upload.url, {
      method: 'PUT',
      headers: registered.upload.headers,
      body: bytes,
    });
  } catch {
    await call(path, 'PUT', { state: 'failed' });
    fail('Plan upload failed');
  }
  await call(path, 'PUT', {
    state: 'uploaded',
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
  });
  console.log('Plan uploaded and reported');
});
