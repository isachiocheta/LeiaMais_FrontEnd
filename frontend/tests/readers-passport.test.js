import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPassportFixture } from './fixtures/passport-app.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createReaderService } from '../src/services/readers.js';
import { READER_DEFAULTS } from '../src/utils/reader-query.js';

async function withReaders(task, seed = false) {
  const fixture = await createPassportFixture({ userAdminFixture: true, seedReaders: seed });
  const server = fixture.app.listen(0, '127.0.0.1'); const controllers = [];
  try {
    await once(server, 'listening');
    const agent = (initialCookie = '') => {
      let cookie = initialCookie, corrupt = false;
      const calls = [];
      const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
        const headers = new Headers(init.headers);
        if (cookie) headers.set('Cookie', cookie);
        if (corrupt && !['GET', 'HEAD'].includes(init.method)) headers.set('X-CSRF-Token', '0'.repeat(64));
        const response = await fetch(url, { ...init, headers });
        const received = response.headers.getSetCookie().find((v) => v.startsWith('leia.fixture.sid='));
        if (received) cookie = received.split(';')[0];
        calls.push({ path: new URL(url).pathname, method: init.method, status: response.status, query: new URL(url).searchParams, ...(new URL(url).pathname.startsWith('/api/usuarios') ? { body: init.body } : {}) });
        return response;
      } });
      const auth = createAuthController(client); controllers.push(auth);
      return { client, auth, readers: createReaderService(client), calls, cookie: () => cookie, corruptCsrf: (v) => { corrupt = v; } };
    };
    await task({ fixture, agent });
  } finally { controllers.forEach((c) => c.dispose()); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fixture.close(); }
}

test('cadastro pendente é aprovado; inativação invalida sessão real e reativação exige login novo mesmo para cookie antigo ainda não usado', async () => {
  await withReaders(async ({ fixture, agent }) => {
    const admin = agent(), newcomer = agent();
    const created = await newcomer.client.request('auth/cadastro', { method: 'POST', body: { nome: 'Leitora descartável da etapa 14', email: 'etapa14@fixture.test', senha: fixture.password } });
    const id = created.data.id;
    await assert.rejects(newcomer.auth.login({ email: 'etapa14@fixture.test', senha: fixture.password }), (e) => e.status === 401);
    await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    assert.equal((await admin.readers.list({ ...READER_DEFAULTS, situacao: 'PENDENTE' })).meta.total, 1);
    await admin.readers.changeStatus(id, 'ATIVO');
    assert.equal((await admin.readers.list({ ...READER_DEFAULTS, situacao: 'PENDENTE' })).meta.total, 0);
    assert.equal(fixture.users.find((u) => u.id === id).sessionVersion, 1);
    await admin.readers.changeStatus(id, 'ATIVO'); assert.equal(fixture.users.find((u) => u.id === id).sessionVersion, 1);
    await newcomer.auth.login({ email: 'etapa14@fixture.test', senha: fixture.password });
    const old = agent(newcomer.cookie());
    assert.equal((await newcomer.client.request('auth/me', { requiresAuth: true })).data.id, id);
    await admin.readers.changeStatus(id, 'INATIVO');
    await assert.rejects(newcomer.client.request('auth/me', { requiresAuth: true }), (e) => e.status === 401);
    assert.equal(newcomer.auth.getSnapshot().user, null);
    await admin.readers.changeStatus(id, 'ATIVO');
    assert.equal(fixture.users.find((u) => u.id === id).sessionVersion, 3);
    await assert.rejects(old.client.request('auth/me', { requiresAuth: true }), (e) => e.status === 401);
    await newcomer.auth.login({ email: 'etapa14@fixture.test', senha: fixture.password });
    assert.equal((await newcomer.client.request('auth/me', { requiresAuth: true })).data.id, id);
    const fresh = createReaderService(admin.client);
    assert.equal((await fresh.list({ ...READER_DEFAULTS, situacao: 'ATIVO' })).data.find((u) => u.id === id).situacao, 'ATIVO');
    assert.ok(admin.calls.filter((c) => c.method === 'PATCH').every((c) => Object.keys(JSON.parse(c.body)).join() === 'situacao'));
  });
});

test('listagem real contém somente leitores, pagina e ordena no servidor; mudança atualiza o total do filtro e esvazia última página', async () => {
  await withReaders(async ({ fixture, agent }) => {
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const filters = { ...READER_DEFAULTS, pageSize: 1, situacao: 'PENDENTE', sort: 'email', direction: 'desc' };
    const first = await admin.readers.list(filters), second = await admin.readers.list({ ...filters, page: 2 });
    assert.ok(first.meta.total > 2); assert.notEqual(first.data[0].id, second.data[0].id);
    assert.ok(first.data[0].email.localeCompare(second.data[0].email) > 0);
    assert.ok(first.data.every((u) => u.perfil === 'LEITOR' && u.situacao === 'PENDENTE'));
    assert.deepEqual(Object.keys(first.data[0]).sort(), ['email', 'id', 'nome', 'perfil', 'situacao']);
    const last = await admin.readers.list({ ...filters, page: first.meta.total });
    await admin.readers.changeStatus(last.data[0].id, 'INATIVO');
    const emptyPage = await admin.readers.list({ ...filters, page: first.meta.total });
    assert.equal(emptyPage.data.length, 0); assert.equal(emptyPage.meta.total, first.meta.total - 1);
    assert.ok((await admin.readers.list({ ...filters, page: emptyPage.meta.total })).data.length);
    for (const sort of ['id', 'nome', 'email', 'situacao', 'criadoEm']) assert.ok((await admin.readers.list({ ...READER_DEFAULTS, sort })).meta.total > 12);
    const dbCalls = fixture.userAdministration.calls;
    assert.ok(dbCalls.some((c) => c.offset === 1 && c.limit === 1 && c.order[0][0] === 'email' && c.order[0][1] === 'DESC'));
  }, true);
});

test('somente admin ativo administra leitores; a própria conta e outros administradores não são alterados', async () => {
  await withReaders(async ({ fixture, agent }) => {
    const admin = agent(), reader = agent(), anonymous = agent();
    await assert.rejects(anonymous.readers.list(READER_DEFAULTS), (e) => e.status === 401);
    await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await assert.rejects(reader.readers.list(READER_DEFAULTS), (e) => e.status === 403);
    await assert.rejects(reader.readers.changeStatus(3, 'ATIVO'), (e) => e.status === 403);
    await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    await assert.rejects(admin.readers.changeStatus(2, 'INATIVO'), (e) => e.status === 404);
    assert.equal(fixture.users.find((u) => u.id === 2).situacao, 'ATIVO');
    assert.equal(fixture.users.find((u) => u.id === 2).sessionVersion, 0);
    await assert.rejects(admin.readers.changeStatus(9999, 'ATIVO'), (e) => e.status === 404);
    fixture.users.find((u) => u.id === 2).situacao = 'INATIVO';
    await assert.rejects(admin.readers.list(READER_DEFAULTS), (e) => e.status === 401);
    assert.equal(admin.auth.getSnapshot().user, null);
  });
});

test('CSRF, validação, conflitos e indisponibilidade usam erros reais, sem reenvio automático', async () => {
  await withReaders(async ({ fixture, agent }) => {
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    admin.corruptCsrf(true);
    await assert.rejects(admin.readers.changeStatus(1, 'INATIVO'), (e) => e.status === 403 && e.policy.category === 'forbidden_undetermined');
    admin.corruptCsrf(false);
    for (const body of [{ situacao: 'PENDENTE', perfil: 'ADMIN_CLUBE' }, {}, { situacao: 'DESATIVADO' }, { situacao: 'INATIVO', senha: 'campo não permitido' }]) await assert.rejects(admin.client.request('usuarios/1/situacao', { method: 'PATCH', body }), (e) => e.status === 422);
    await assert.rejects(admin.client.request('usuarios/1/situacao', { method: 'PATCH', body: { situacao: 'PENDENTE' } }), (e) => e.status === 409);
    for (const query of [{ q: 'Leitora' }, { pageSize: 51 }, { perfil: 'LEITOR' }]) await assert.rejects(admin.client.request('usuarios', { query }), (e) => e.status === 422);
    fixture.users.find((u) => u.id === 1).sessionVersion = 2147483647;
    await assert.rejects(admin.readers.changeStatus(1, 'INATIVO'), (e) => e.status === 409);
    assert.equal(fixture.users.find((u) => u.id === 1).situacao, 'ATIVO');
    fixture.userAdministration.setMode('unavailable'); const before = admin.calls.length;
    await assert.rejects(admin.readers.changeStatus(3, 'ATIVO'), (e) => e.status === 503 && e.policy.outcomeUnknown);
    assert.equal(admin.calls.length, before + 1); assert.equal(admin.auth.getSnapshot().status, 'authenticated');
    fixture.userAdministration.setMode('normal');
    assert.equal((await admin.readers.list(READER_DEFAULTS)).data.find((u) => u.id === 3).situacao, 'INATIVO');
  });
});
