import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createCatalogService } from '../src/services/catalog.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { CATALOG_DEFAULTS } from '../src/utils/catalog-query.js';

async function withCatalog(task) {
  const connection = createCatalogConnection();
  const fixture = await createPassportFixture({ catalogConnection: connection });
  const server = fixture.app.listen(0, '127.0.0.1');
  let auth;
  try {
    await once(server, 'listening');
    let cookie = '';
    const calls = [];
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ url: new URL(url), status: response.status });
      return response;
    } });
    auth = createAuthController(client);
    await assert.rejects(auth.verifySession(), (error) => error.status === 401);
    await task({ connection, fixture, client, auth, service: createCatalogService(client), calls });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('rotas reais de livros e gêneros exigem sessão; leitor e administrador podem consultar', { skip: !existsSync(backendPackage) }, async () => {
  await withCatalog(async ({ auth, fixture, service, connection }) => {
    for (const load of [() => service.listBooks(CATALOG_DEFAULTS), () => service.listGenres(), () => service.getBook('1')]) {
      await assert.rejects(load(), (error) => error.status === 401);
    }
    assert.equal(connection.calls.length, 0);
    for (const email of ['leitor@fixture.test', 'admin@fixture.test']) {
      await auth.login({ email, senha: fixture.password });
      assert.equal((await service.listBooks(CATALOG_DEFAULTS)).meta.total, 26);
      assert.equal((await service.listGenres()).length, 62);
      assert.equal((await service.getBook('1')).id, 1);
      await auth.logout();
    }
  });
});

test('rotas e serviços reais combinam busca, gênero, ordenação e paginação com totais; detalhes inexistentes retornam 404', { skip: !existsSync(backendPackage) }, async () => {
  await withCatalog(async ({ auth, fixture, service, client, connection, calls }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const first = await service.listBooks({ ...CATALOG_DEFAULTS, pageSize: 6 });
    const second = await service.listBooks({ ...CATALOG_DEFAULTS, pageSize: 6, page: 2 });
    assert.equal(first.meta.total, 26);
    assert.equal(second.meta.total, 26);
    assert.equal(first.data.length, 6);
    assert.equal(second.data.length, 6);
    assert.equal(first.data.some((book) => second.data.some((other) => other.id === book.id)), false);
    const combined = { ...CATALOG_DEFAULTS, q: '  MARINA  ', generoId: '1', sort: 'anoPublicacao', direction: 'desc', pageSize: 2 };
    const filtered = await service.listBooks(combined);
    assert.equal(filtered.meta.total, 5);
    assert.equal(filtered.data.length, 2);
    assert.deepEqual(filtered.data.map((book) => book.id), [19, 13]);
    assert.ok(filtered.data.every((book) => book.generoId === 1 && book.autor.includes('Marina')));
    const last = await service.listBooks({ ...combined, page: 3 });
    assert.deepEqual(last.data.map((book) => book.id), [25]);
    const byTitle = await service.listBooks({ ...CATALOG_DEFAULTS, generoId: '61', direction: 'desc', pageSize: 50 });
    assert.equal(byTitle.meta.total, 8);
    assert.equal(byTitle.data[0].id, 12);
    assert.equal((await service.listGenres()).some((genre) => genre.id === 61), true);
    const book = await service.getBook('3');
    assert.equal(book.descricao, null);
    assert.equal(book.capaUrl, null);
    assert.equal(book.genero.id, 61);
    assert.ok(book.criadoEm && book.atualizadoEm);
    await assert.rejects(service.getBook('2147483647'), (error) => error.status === 404);
    await assert.rejects(client.request('livros', { query: { sort: 'autor' } }), (error) => error.status === 422);
    assert.ok(connection.calls.some((call) => call.bind.termo === '%MARINA%' && call.bind.genero === 1 && call.sql.includes('NULLS LAST')));
    assert.ok(calls.some((call) => call.url.searchParams.get('page') === '2' && call.url.pathname === '/api/livros'));
  });
});

test('catálogo vazio, nenhum resultado, indisponibilidade e expiração preservam as respostas reais', { skip: !existsSync(backendPackage) }, async () => {
  await withCatalog(async ({ auth, fixture, service, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const noMatch = await service.listBooks({ ...CATALOG_DEFAULTS, q: '%_ inexistente' });
    assert.equal(noMatch.meta.total, 0);
    assert.deepEqual(noMatch.data, []);
    connection.setMode('empty');
    const empty = await service.listBooks(CATALOG_DEFAULTS);
    assert.equal(empty.meta.total, 0);
    connection.setMode('unavailable');
    await assert.rejects(service.listBooks(CATALOG_DEFAULTS), (error) => error.status === 503);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    connection.setMode('normal');
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(service.getBook('1'), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().status, 'unauthenticated');
    assert.equal(auth.getSnapshot().user, null);
  });
});
