import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = join(root, 'node_modules/vite/bin/vite.js');

test('bundle contém apenas a configuração pública permitida', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leia-public-env-'));
  try {
    const result = spawnSync(process.execPath, [vite, 'build', '--outDir', join(directory, 'dist')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        VITE_API_BASE_URL: 'https://api.fixture.invalid/api',
        VITE_UNRELATED_PRIVATE_VALUE: 'FIXTURE_PRIVATE_ENV_MUST_NOT_BE_BUNDLED',
        SESSION_SECRET: 'FIXTURE_SESSION_SECRET_MUST_NOT_BE_BUNDLED',
      },
    });
    assert.equal(result.status, 0, 'Build com configuração pública deve passar.');
    const assets = join(directory, 'dist/assets');
    let javascript = '';
    for (const file of await readdir(assets)) {
      if (file.endsWith('.js')) javascript += await readFile(join(assets, file), 'utf8');
    }
    assert.ok(javascript.includes('https://api.fixture.invalid/api'));
    assert.ok(!javascript.includes('FIXTURE_PRIVATE_ENV_MUST_NOT_BE_BUNDLED'));
    assert.ok(!javascript.includes('FIXTURE_SESSION_SECRET_MUST_NOT_BE_BUNDLED'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('build recusa URL de API com credenciais antes de gerar bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leia-invalid-env-'));
  try {
    const result = spawnSync(process.execPath, [vite, 'build', '--outDir', join(directory, 'dist')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, VITE_API_BASE_URL: 'https://fixture:FIXTURE_PASSWORD@example.invalid/api' },
    });
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes('FIXTURE_PASSWORD'));
    await assert.rejects(readdir(join(directory, 'dist')), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
