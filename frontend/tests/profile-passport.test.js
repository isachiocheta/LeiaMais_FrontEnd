import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPassportFixture } from './fixtures/passport-app.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createProfileService } from '../src/services/profile.js';

async function withProfile(task) {
  const fixture = await createPassportFixture({ profileFixture: true, cookieName: 'leia.sid' });
  const server = fixture.app.listen(0, '127.0.0.1'), controllers = [];
  try {
    await once(server, 'listening');
    const agent = () => {
      let cookie = '', losePasswordResponse = false, badCsrf = false;
      const calls = [];
      const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
        const path = new URL(url).pathname;
        const headers = new Headers(init.headers);
        if (cookie) headers.set('Cookie', cookie);
        if (badCsrf && init.method === 'PATCH') headers.set('X-CSRF-Token', '0'.repeat(64));
        const response = await fetch(url, { ...init, headers });
        const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.sid='));
        if (received) cookie = received.split(';')[0];
        calls.push({ path, method: init.method, status: response.status, fields: init.body ? Object.keys(JSON.parse(init.body)) : [], cookieCleared: received?.startsWith('leia.sid=;') === true });
        if (losePasswordResponse && path === '/api/me/senha') { await response.arrayBuffer(); throw new TypeError('Resposta perdida na fixture.'); }
        return response;
      } });
      const auth = createAuthController(client); controllers.push(auth);
      return { client, auth, profile: createProfileService(client), calls, loseResponse() { losePasswordResponse = true; }, setBadCsrf(value) { badCsrf = value; } };
    };
    await task({ fixture, agent });
  } finally {
    controllers.forEach((controller) => controller.dispose());
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fixture.close();
  }
}

test('perfil real de leitor e administrador consulta só dados públicos, edita nome e persiste após restaurar sessão', async () => {
  await withProfile(async ({ fixture, agent }) => {
    for (const email of ['leitor@fixture.test', 'admin@fixture.test']) {
      const account = agent(); await account.auth.login({ email, senha: fixture.password });
      const before = await account.auth.readOwnProfile();
      assert.deepEqual(Object.keys(before), ['id', 'nome', 'email', 'perfil', 'situacao']);
      const saved = await account.auth.updateOwnName({ nome: '  Nome atualizado da fixture 🐝  ', email: 'indevido@fixture.test', perfil: 'ADMIN_CLUBE', id: 999 });
      assert.equal(saved.nome, 'Nome atualizado da fixture 🐝');
      assert.equal(saved.email, email); assert.equal(saved.perfil, before.perfil);
      assert.equal(account.auth.getSnapshot().user.nome, saved.nome);
      await account.auth.verifySession(); assert.equal(account.auth.getSnapshot().user.nome, saved.nome);
      const restored = agent(); await restored.auth.login({ email, senha: fixture.password });
      assert.equal((await restored.auth.readOwnProfile()).nome, saved.nome);
      assert.deepEqual(account.calls.find((c) => c.path === '/api/me').fields, ['nome']);
    }
  });
});

test('validadores reais recusam nome fora do limite, campos administrativos e senhas inválidas sem revogar sessão', async () => {
  await withProfile(async ({ fixture, agent }) => {
    const account = agent(); await account.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const reject = (promise, field) => assert.rejects(promise, (error) => error.status === 422 && Boolean(error.fieldErrors[field]));
    await reject(account.client.request('me', { method: 'PATCH', body: { email: 'outro@fixture.test' } }), 'body');
    await reject(account.auth.updateOwnName({ nome: 'a' }), 'nome');
    await reject(account.auth.updateOwnName({ nome: '🐝'.repeat(101) }), 'nome');
    await reject(account.auth.changeOwnPassword({ senhaAtual: 'incorreta', novaSenha: 'Nova senha da fixture' }), 'senhaAtual');
    await reject(account.auth.changeOwnPassword({ senhaAtual: fixture.password, novaSenha: 'é'.repeat(37) }), 'novaSenha');
    await reject(account.auth.changeOwnPassword({ senhaAtual: fixture.password, novaSenha: '🐝'.repeat(9) }), 'novaSenha');
    await reject(account.client.request('me/senha', { method: 'PATCH', body: { senhaAtual: fixture.password, novaSenha: 'Nova senha da fixture', confirmacao: 'não permitida' } }), 'body');
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
    assert.equal((await account.auth.readOwnProfile()).id, 1);
    assert.equal(fixture.users[0].sessionVersion, 0);
    assert.ok(await fixture.verifyPassword('leitor@fixture.test', fixture.password));
  });
});

test('troca real preserva espaços, exige novo login, limpa cookie e CSRF e invalida todas as sessões anteriores', async () => {
  await withProfile(async ({ fixture, agent }) => {
    const first = agent(), second = agent();
    for (const account of [first, second]) await account.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const tokenBefore = await first.client.getCsrfToken();
    const novaSenha = '  Nova leitura da fixture 🐝  ';
    await first.auth.changeOwnPassword({ senhaAtual: fixture.password, novaSenha, confirmacao: 'não enviar' });
    assert.equal(first.auth.getSnapshot().status, 'unauthenticated'); assert.equal(first.auth.getSnapshot().reason, 'password_changed');
    assert.equal(first.auth.getSnapshot().user, null);
    assert.equal(fixture.users[0].sessionVersion, 1);
    const mutation = first.calls.find((c) => c.path === '/api/me/senha');
    assert.equal(mutation.status, 200); assert.equal(mutation.cookieCleared, true);
    assert.deepEqual(mutation.fields, ['senhaAtual', 'novaSenha']);
    assert.notEqual(await first.client.getCsrfToken(), tokenBefore);
    await assert.rejects(second.auth.readOwnProfile(), (e) => e.status === 401);
    assert.equal(second.auth.getSnapshot().user, null);
    await assert.rejects(first.auth.login({ email: 'leitor@fixture.test', senha: fixture.password }), (e) => e.status === 401);
    await assert.rejects(first.auth.login({ email: 'leitor@fixture.test', senha: novaSenha.trim() }), (e) => e.status === 401);
    await first.auth.login({ email: 'leitor@fixture.test', senha: novaSenha });
    assert.equal(first.auth.getSnapshot().status, 'authenticated');
    assert.ok(await fixture.verifyPassword('leitor@fixture.test', novaSenha));
    assert.equal(first.calls.filter((c) => c.path === '/api/me/senha').length, 1);
  });
});

test('conflitos reais de nome e senha não são reenviados nem sobrescrevem alteração concorrente', async () => {
  await withProfile(async ({ fixture, agent }) => {
    const account = agent(); await account.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    fixture.profileData.setMode('conflict');
    await assert.rejects(account.auth.updateOwnName({ nome: 'Nome em edição' }), (e) => e.status === 409);
    fixture.profileData.setMode('normal'); fixture.profileData.conflictNextPassword();
    await assert.rejects(account.auth.changeOwnPassword({ senhaAtual: fixture.password, novaSenha: 'Nova senha da fixture' }), (e) => e.status === 409);
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
    assert.equal(fixture.users[0].sessionVersion, 0);
    assert.ok(await fixture.verifyPassword('leitor@fixture.test', fixture.password));
    assert.equal(account.calls.filter((c) => c.path === '/api/me' && c.method === 'PATCH').length, 1);
    assert.equal(account.calls.filter((c) => c.path === '/api/me/senha').length, 1);
  });
});

test('resposta perdida após commit não gera segundo PATCH; nova senha pode ter sido aplicada e sessão antiga é recusada', async () => {
  await withProfile(async ({ fixture, agent }) => {
    const account = agent(); await account.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    account.loseResponse();
    const novaSenha = '  Outra senha da fixture 🐝  ';
    await assert.rejects(account.auth.changeOwnPassword({ senhaAtual: fixture.password, novaSenha }), (e) => e.kind === 'network' && e.policy.outcomeUnknown);
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
    assert.equal(account.calls.filter((c) => c.path === '/api/me/senha').length, 1);
    await assert.rejects(account.auth.readOwnProfile(), (e) => e.status === 401);
    await account.auth.login({ email: 'leitor@fixture.test', senha: novaSenha });
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
  });
});

test('CSRF inválido é 403 sem logout ou repetição; indisponibilidade e ausência de sessão continuam distintas', async () => {
  await withProfile(async ({ fixture, agent }) => {
    const account = agent();
    await assert.rejects(account.profile.getMine(), (e) => e.status === 401);
    await account.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    account.setBadCsrf(true);
    await assert.rejects(account.auth.updateOwnName({ nome: 'Nome recusado' }), (e) => e.status === 403);
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
    account.setBadCsrf(false);
    await account.auth.updateOwnName({ nome: 'Nome aceito' });
    fixture.profileData.setMode('unavailable');
    await assert.rejects(account.auth.readOwnProfile(), (e) => e.status === 503);
    assert.equal(account.auth.getSnapshot().status, 'authenticated');
    fixture.profileData.setMode('normal');
    assert.equal((await account.auth.readOwnProfile()).nome, 'Nome aceito');
  });
});
