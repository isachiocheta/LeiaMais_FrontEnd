import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { safeReturnTo, loginDestination } from '../src/utils/return-to.js';
import { validateLogin } from '../src/utils/login-validation.js';

const user = { id: 1, nome: 'Leitora da fixture', email: 'leitor@fixture.test', perfil: 'LEITOR', situacao: 'ATIVO' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthorized = () => json({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } }, 401);

function fixture(options = {}) {
  let loggedIn = options.loggedIn ?? false;
  let tokenVersion = 0;
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, ...init });
    const override = options.handle?.({ path, init, loggedIn });
    if (override !== undefined) return override;
    if (path === '/api/auth/csrf') return json({ data: { csrfToken: String(tokenVersion).repeat(64) } });
    if (path === '/api/auth/me') return loggedIn ? json({ data: { ...user, senhaHash: 'não deve chegar ao estado' } }) : unauthorized();
    if (path === '/api/auth/login') {
      if (options.badCredentials) return unauthorized();
      loggedIn = true;
      tokenVersion += 1;
      return json({ data: user });
    }
    if (path === '/api/auth/logout') { loggedIn = false; return new Response(null, { status: 204 }); }
    return json({ data: {} });
  } });
  const controller = createAuthController(client);
  return { client, controller, calls, endSession: () => { loggedIn = false; } };
}

test('verificação inicial é explícita e 401 confirma ausência de sessão', async () => {
  const { controller } = fixture();
  assert.equal(controller.getSnapshot().status, 'checking');
  assert.equal(controller.getSnapshot().user, null);
  await assert.rejects(controller.verifySession(), (error) => error.status === 401);
  assert.equal(controller.getSnapshot().status, 'unauthenticated');
  assert.equal(controller.getSnapshot().reason, null);
  controller.dispose();
});

test('verificações concorrentes compartilham restauração e não criam polling', async () => {
  const { controller, calls } = fixture({ loggedIn: true });
  const first = controller.verifySession();
  const second = controller.verifySession();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(controller.getSnapshot().status, 'authenticated');
  assert.deepEqual(controller.getSnapshot().user, user);
  assert.equal(calls.filter((call) => call.path.endsWith('/me')).length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith('/csrf')).length, 1);
  assert.equal(Object.hasOwn(controller.getSnapshot().user, 'senhaHash'), false);
  controller.dispose();
});

test('login mantém espaços da senha, confirma /me e renova CSRF após troca de sessão', async () => {
  const { controller, calls } = fixture();
  await assert.rejects(controller.verifySession());
  const password = '  senha com espaços 🐝  ';
  const first = controller.login({ email: user.email, senha: password });
  const second = controller.login({ email: user.email, senha: password });
  assert.equal(first, second);
  await first;
  assert.equal(controller.getSnapshot().status, 'authenticated');
  assert.deepEqual(calls.slice(1).map((call) => call.path), ['/api/auth/csrf', '/api/auth/login', '/api/auth/me', '/api/auth/csrf']);
  const login = calls.find((call) => call.path.endsWith('/login'));
  assert.equal(JSON.parse(login.body).senha, password);
  assert.equal(login.headers.get('X-CSRF-Token'), '0'.repeat(64));
  assert.equal(calls.filter((call) => call.path.endsWith('/login')).length, 1);
  controller.dispose();
});

test('credenciais inválidas não autenticam e não repetem o login', async () => {
  const { controller, calls } = fixture({ badCredentials: true });
  await assert.rejects(controller.verifySession());
  await assert.rejects(controller.login({ email: user.email, senha: 'errada' }), (error) => error.status === 401);
  assert.equal(controller.getSnapshot().status, 'unauthenticated');
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(calls.filter((call) => call.path.endsWith('/login')).length, 1);
  controller.dispose();
});

test('uma nova instância restaura a sessão pelo servidor sem persistir usuário', async () => {
  const { controller, client } = fixture({ loggedIn: true });
  await controller.verifySession();
  controller.dispose();
  const restored = createAuthController(client);
  assert.equal(restored.getSnapshot().user, null);
  await restored.verifySession();
  assert.deepEqual(restored.getSnapshot().user, user);
  restored.dispose();
});

test('rede ou 503 durante verificação não são logout', async () => {
  for (const kind of ['network', 'server']) {
    let unavailable = false;
    const { controller } = fixture({ loggedIn: true, handle: ({ path }) => {
      if (unavailable && path.endsWith('/me')) {
        if (kind === 'network') throw new TypeError('offline');
        return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço temporariamente indisponível.' } }, 503);
      }
    } });
    await controller.verifySession();
    unavailable = true;
    await assert.rejects(controller.verifySession());
    assert.equal(controller.getSnapshot().status, 'temporary_error');
    assert.equal(controller.getSnapshot().user, null);
    unavailable = false;
    await controller.verifySession();
    assert.equal(controller.getSnapshot().status, 'authenticated');
    controller.dispose();
  }
});

test('logout aceita 204, limpa usuário e confirma ausência de sessão', async () => {
  const { controller, calls } = fixture({ loggedIn: true });
  await controller.verifySession();
  await controller.logout();
  assert.equal(controller.getSnapshot().status, 'unauthenticated');
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(controller.getSnapshot().reason, 'signed_out');
  const logout = calls.find((call) => call.path.endsWith('/logout'));
  assert.equal(logout.method, 'POST');
  assert.equal(logout.headers.has('Content-Type'), false);
  await assert.rejects(controller.verifySession(), (error) => error.status === 401);
  controller.dispose();
});

test('falha de rede no logout não confirma saída nem repete POST', async () => {
  const { controller, calls } = fixture({ loggedIn: true, handle: ({ path }) => {
    if (path.endsWith('/logout')) throw new TypeError('offline');
  } });
  await controller.verifySession();
  await assert.rejects(controller.logout());
  assert.equal(controller.getSnapshot().status, 'temporary_error');
  assert.equal(controller.getSnapshot().needsVerification, true);
  assert.equal(calls.filter((call) => call.path.endsWith('/logout')).length, 1);
  await controller.verifySession();
  assert.equal(controller.getSnapshot().status, 'authenticated');
  controller.dispose();
});

test('login aceito com falha na confirmação não libera conteúdo privado e permite verificar sem novo POST', async () => {
  let confirmationFails = true;
  const { controller, calls } = fixture({ handle: ({ path, loggedIn }) => {
    if (path.endsWith('/me') && loggedIn && confirmationFails) throw new TypeError('offline');
  } });
  await assert.rejects(controller.verifySession());
  await assert.rejects(controller.login({ email: user.email, senha: 'senha' }));
  assert.equal(controller.getSnapshot().status, 'temporary_error');
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(controller.getSnapshot().needsVerification, true);
  confirmationFails = false;
  await controller.verifySession();
  assert.equal(controller.getSnapshot().status, 'authenticated');
  assert.equal(calls.filter((call) => call.path.endsWith('/login')).length, 1);
  controller.dispose();
});

test('401 em operação protegida limpa identidade e cancela respostas privadas pendentes', async () => {
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const { controller, client, endSession } = fixture({ loggedIn: true, handle: ({ path, init }) => {
    if (path.endsWith('/livros')) {
      started();
      return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    }
  } });
  await controller.verifySession();
  const pending = client.request('livros');
  const rejection = assert.rejects(pending, (error) => error.kind === 'cancelled');
  await waiting;
  endSession();
  await assert.rejects(client.request('auth/me'), (error) => error.status === 401);
  await rejection;
  assert.equal(controller.getSnapshot().status, 'unauthenticated');
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(controller.getSnapshot().reason, 'expired');
  controller.dispose();
});

test('403 não força logout nem assume falta de perfil por CSRF', async () => {
  const { controller, client } = fixture({ loggedIn: true, handle: ({ path }) => {
    if (path.endsWith('/livros')) return json({ error: { code: 'FORBIDDEN', message: 'Acesso não permitido.' } }, 403);
  } });
  await controller.verifySession();
  await assert.rejects(client.request('livros', { method: 'POST', body: {} }), (error) => error.policy.category === 'forbidden_undetermined');
  assert.equal(controller.getSnapshot().status, 'authenticated');
  controller.dispose();
});

test('identidade inesperada não ganha permissões no frontend', async () => {
  const { controller } = fixture({ handle: ({ path }) => path.endsWith('/me') ? json({ data: { ...user, perfil: 'SUPER_ADMIN' } }) : undefined });
  await assert.rejects(controller.verifySession(), (error) => error.kind === 'unexpected_response');
  assert.equal(controller.getSnapshot().status, 'temporary_error');
  assert.equal(controller.getSnapshot().user, null);
  controller.dispose();
});

test('retorno interno mantém query e fragmento sem permitir destinos externos ou ciclos de login', () => {
  assert.equal(safeReturnTo('/minha-area?q=leitura#perfil'), '/minha-area?q=leitura#perfil');
  assert.equal(safeReturnTo('/minha-area?q=100%25&origem=https%3A%2F%2Fexample.test#trecho%25'), '/minha-area?q=100%25&origem=https%3A%2F%2Fexample.test#trecho%25');
  assert.equal(loginDestination({ pathname: '/minha-area', search: '?q=leitura', hash: '#perfil' }), '/login?retorno=%2Fminha-area%3Fq%3Dleitura%23perfil');
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%252f%252fevil.test', '/x/..//evil.test', '/%2e%2e//evil.test', '/login', '/LOGIN/', '/%6cogin', '/login%2f', '/acesso-negado', '/\n/evil.test', 'javascript:alert(1)']) {
    assert.equal(safeReturnTo(path), '/minha-area', path);
  }
});

test('validação de login não remove espaços nem exige política de cadastro para senha existente', () => {
  const credentials = { email: user.email, senha: '  a  ' };
  assert.deepEqual(validateLogin(credentials), {});
  assert.equal(credentials.senha, '  a  ');
  assert.equal(validateLogin({ email: '', senha: '' }).senha, 'Informe sua senha.');
  assert.ok(validateLogin({ email: 'inválido', senha: 'a' }).email);
  assert.ok(validateLogin({ email: user.email, senha: '🐝'.repeat(19) }).senha);
});
