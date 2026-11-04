import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createRegistrationService } from '../src/services/registration.js';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';

async function withFixture(task) {
  const fixture = await createPassportFixture();
  const server = fixture.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    let cookie = '';
    let corruptCsrf = false;
    const calls = [];
    const client = createHttpClient({ baseUrl, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (corruptCsrf && new URL(url).pathname.endsWith('/cadastro')) headers.set('X-CSRF-Token', 'inválido');
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ path: new URL(url).pathname, status: response.status });
      return response;
    } });
    await task({ fixture, client, calls, service: createRegistrationService(client), corruptCsrf: (value) => { corruptCsrf = value; } });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('cadastro real cria LEITOR/PENDENTE sem autenticar; duplicidade retorna 409 e contas pendentes/inativas usam o mesmo erro de login', { skip: !existsSync(backendPackage) }, async () => {
  await withFixture(async ({ fixture, client, service, calls }) => {
    const controller = createAuthController(client);
    try {
      await assert.rejects(controller.verifySession(), (error) => error.status === 401);
      const data = { nome: '  Nova Pessoa  ', email: '  NOVA@FIXTURE.TEST  ', senha: fixture.password };
      await service.register(data);
      assert.equal(controller.getSnapshot().status, 'unauthenticated');
      const stored = fixture.users.find((user) => user.email === 'nova@fixture.test');
      assert.equal(stored.nome, 'Nova Pessoa');
      assert.equal(stored.perfil, 'LEITOR');
      assert.equal(stored.situacao, 'PENDENTE');
      assert.equal(await fixture.verifyPassword(stored.email, fixture.password), true);
      assert.equal(await fixture.verifyPassword(stored.email, fixture.password.trim()), false);
      assert.equal(calls.findLast((call) => call.path.endsWith('/cadastro')).status, 201);
      await assert.rejects(client.request('auth/me'), (error) => error.status === 401);
      await assert.rejects(service.register(data), (error) => error.status === 409 && error.code === 'DUPLICATE_RESOURCE');
      assert.equal(fixture.users.filter((user) => user.email === 'nova@fixture.test').length, 1);
      const refusals = [];
      for (const email of ['nova@fixture.test', 'inativo@fixture.test', 'leitor@fixture.test']) {
        try {
          await controller.login({ email, senha: email === 'leitor@fixture.test' ? 'incorreta' : fixture.password });
          assert.fail('O login precisa recusar a conta.');
        } catch (error) {
          assert.equal(error.status, 401);
          refusals.push({ code: error.code, message: error.message, fields: error.fields });
        }
        assert.equal(controller.getSnapshot().status, 'unauthenticated');
      }
      assert.deepEqual(refusals[0], refusals[1]);
      assert.deepEqual(refusals[0], refusals[2]);
    } finally { controller.dispose(); }
  });
});

test('validadores reais rejeitam limites e campos administrativos sem criar conta ou expor valores', { skip: !existsSync(backendPackage) }, async () => {
  await withFixture(async ({ fixture, client }) => {
    const data = { nome: 'Pessoa', email: 'limites@fixture.test', senha: fixture.password };
    const count = fixture.users.length;
    const invalid = [
      { nome: 'a' }, { nome: 'a'.repeat(101) }, { email: 'email-inválido' },
      { senha: 'a'.repeat(9) }, { senha: 'a'.repeat(73) }, { senha: 'é'.repeat(37) },
      { senha: '🐝'.repeat(9) }, { senha: '🐝'.repeat(19) },
      { confirmacao: fixture.password }, { perfil: 'ADMIN_CLUBE' }, { situacao: 'ATIVO' }, { id: 99 },
    ];
    for (const override of invalid) {
      await assert.rejects(client.request('auth/cadastro', { method: 'POST', body: { ...data, ...override } }), (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.fields.some((field) => Object.hasOwn(field, 'value')), false);
        assert.equal(error.message.includes(fixture.password), false);
        return true;
      });
    }
    assert.equal(fixture.users.length, count);
    await client.request('auth/cadastro', { method: 'POST', body: { ...data, senha: '🐝'.repeat(18) } });
    assert.equal(fixture.users.length, count + 1);
    await assert.rejects(client.request('auth/me'), (error) => error.status === 401);
  });
});

test('CSRF real é renovado só após novo envio explícito; indisponibilidade não reenvia cadastro', { skip: !existsSync(backendPackage) }, async () => {
  await withFixture(async ({ fixture, service, client, calls, corruptCsrf }) => {
    const data = { nome: 'Pessoa', email: 'csrf@fixture.test', senha: fixture.password };
    const count = fixture.users.length;
    corruptCsrf(true);
    await assert.rejects(service.register(data), (error) => error.status === 403 && error.policy.category === 'csrf');
    assert.equal(fixture.users.length, count);
    assert.equal(calls.filter((call) => call.path.endsWith('/cadastro')).length, 1);
    corruptCsrf(false);
    await service.register(data);
    assert.equal(calls.filter((call) => call.path.endsWith('/csrf')).length, 2);
    assert.equal(fixture.users.length, count + 1);
    fixture.setRegistrationUnavailable(true);
    const previous = calls.filter((call) => call.path.endsWith('/cadastro')).length;
    await assert.rejects(service.register({ ...data, email: 'offline@fixture.test' }), (error) => error.status === 503 && error.policy.outcomeUnknown);
    assert.equal(calls.filter((call) => call.path.endsWith('/cadastro')).length, previous + 1);
    await assert.rejects(client.request('auth/me'), (error) => error.status === 401);
  });
});
