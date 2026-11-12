import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = process.env.LEIA_BACKEND_DIR || fileURLToPath(new URL('../../../../leia+_backend/backend/', import.meta.url));
const require = createRequire(join(backend, 'package.json'));
const { criarBancoTemporario } = require('./database/banco-temporario');
const { validarBancoTeste } = require('./configuracao/banco');
const requested = process.argv.slice(2);
const selectedFiles = requested.filter((arg) => arg.endsWith('.spec.js'));
const args = requested.filter((arg) => !selectedFiles.includes(arg));
const controlEnv = { ...process.env, NODE_ENV: 'test' };
let stopped = false;
const children = new Set();

function command(file, commandArgs, env, quiet = false) {
  const child = spawn(file, commandArgs, { cwd: root, env, stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit' });
  children.add(child);
  return { child, finished: new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Não foi possível iniciar uma ferramenta de teste.')));
    child.once('exit', (code) => { children.delete(child); resolve(code); });
  }) };
}

async function ready(url, child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('Servidor de teste encerrou antes de ficar disponível.');
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor de teste não ficou disponível.');
}

async function execute(spec) {
  let database, server, preview, output;
  try {
    // Recusa configuração ausente ou banco normal; o helper cria e remove somente um nome aleatório próprio.
    const env = controlEnv;
    validarBancoTeste(env);
    const portCheck = createServer();
    portCheck.listen(5173, 'localhost'); await once(portCheck, 'listening');
    await new Promise((resolve) => portCheck.close(resolve));
    database = await criarBancoTemporario('demonstracao', env);
    Object.assign(process.env, database.variaveis, {
      SESSION_SECRET: randomBytes(48).toString('hex'), SESSION_COOKIE_SECURE: 'false', ALLOWED_ORIGIN: 'http://localhost:5173',
    });
    const { Client } = require('pg');
    const installer = new Client({ connectionString: database.variaveis.TEST_DATABASE_URL });
    await installer.connect();
    try {
      for (const name of ['001_schema.sql', '002_reference_data.sql', '003_migration_metadata.sql']) {
        await installer.query(await readFile(join(backend, 'database/sql', name), 'utf8'));
      }
    } finally { await installer.end(); }
    const adminPassword = `  ${randomBytes(18).toString('hex')} 🐝  `;
    const { bootstrapAdministrativo } = require('./database/bootstrap-administrativo');
    await bootstrapAdministrativo({ ADMIN_NOME: 'Administração de teste', ADMIN_EMAIL: 'admin@e2e.leia.example', ADMIN_SENHA: adminPassword }, database.conexao);
    const app = require('./app');
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const apiUrl = `http://localhost:${server.address().port}/api`;
    await ready(`${apiUrl}/ready`);
    output = await mkdtemp(join(tmpdir(), 'leia-browser-tests-'));
    const browserEnv = {
      ...process.env, VITE_API_BASE_URL: apiUrl, LEIA_E2E_API_URL: apiUrl,
      LEIA_E2E_DATABASE_URL: database.variaveis.TEST_DATABASE_URL, LEIA_E2E_DATABASE_NAME: database.nome,
      LEIA_E2E_ADMIN_PASSWORD: adminPassword, LEIA_BACKEND_DIR: backend, LEIA_E2E_OUTPUT: join(output, 'results'),
    };
    const build = command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(output, 'site')], { ...browserEnv, NODE_ENV: 'production' }, true);
    if (await build.finished !== 0) throw new Error('Build para teste de navegador falhou.');
    for (const file of await readdir(join(output, 'site/assets'))) {
      if (!file.endsWith('.js')) continue;
      const source = await readFile(join(output, 'site/assets', file), 'utf8');
      if ([adminPassword, process.env.SESSION_SECRET, database.variaveis.TEST_DATABASE_URL].some((value) => source.includes(value))) throw new Error('Configuração privada detectada no build de teste.');
    }
    preview = command(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', join(output, 'site')], { ...browserEnv, NODE_ENV: 'production' }, true);
    await ready('http://localhost:5173', preview.child);
    console.info('Backend real e PostgreSQL exclusivo disponíveis; iniciando Playwright.');
    const result = command(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', spec, '--pass-with-no-tests', ...args], browserEnv);
    return await result.finished === 0;
  } catch (error) {
    // Erros de drivers podem conter URLs e credenciais; não os imprimimos.
    console.error('Testes reais não concluídos. Confira Node, backend, Chromium, porta 5173 e URLs distintas de teste. Nenhum banco normal é usado.');
    return false;
  } finally {
    for (const child of children) child.kill('SIGTERM');
    if (preview) await preview.finished;
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await require('./autenticacao/servico').encerrarAutenticacao();
    await require('./database/conexao').encerrarConexao();
    if (database) await database.encerrar();
    if (output) await rm(output, { recursive: true, force: true });
  }

}
const stop = () => { stopped = true; for (const child of children) child.kill('SIGTERM'); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const files = (await readdir(join(root, 'tests/e2e'))).filter((file) => file.endsWith('.spec.js') && (!selectedFiles.length || selectedFiles.some((selected) => selected === file || selected.endsWith(`/${file}`)))).sort();
let failed = files.length === 0;
if (failed) console.error('Nenhum arquivo de teste foi selecionado.');
for (const file of files) {
  if (stopped) { failed = true; break; }
  if (!await execute(file)) failed = true;
}
process.exitCode = failed ? 1 : 0;
