import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createCatalogService } from '../src/services/catalog.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { CATALOG_DEFAULTS, availableCatalogPage } from '../src/utils/catalog-query.js';
import { bookFormPayload, bookWriteFeedback } from '../src/utils/book-form.js';

const input = () => ({ titulo: 'ZZZ Livro descartável da fixture', autor: 'Autoria de teste', generoId: '62', totalPaginas: '123', anoPublicacao: '2020', descricao: 'Descrição inicial.', capaUrl: 'https://example.test/capa.png' });

async function withAdmin(task) {
  const connection = createCatalogConnection();
  const fixture = await createPassportFixture({ catalogConnection: connection });
  const server = fixture.app.listen(0, '127.0.0.1');
  let auth;
  try {
    await once(server, 'listening');
    let cookie = '';
    let corrupt = false;
    const calls = [];
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (corrupt && ['POST', 'PATCH', 'DELETE'].includes(init.method) && new URL(url).pathname.startsWith('/api/livros')) headers.set('X-CSRF-Token', 'inválido');
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ path: new URL(url).pathname, method: init.method, status: response.status });
      return response;
    } });
    auth = createAuthController(client);
    await assert.rejects(auth.verifySession());
    await task({ connection, fixture, auth, client, service: createCatalogService(client), calls, corruptCsrf: (value) => { corrupt = value; } });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('CRUD real de livro descartável persiste em novas consultas e ajusta a página após 204', { skip: !existsSync(backendPackage) }, async () => {
  await withAdmin(async ({ fixture, auth, service, client, calls }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const genres = await service.listGenres();
    assert.ok(genres.some((genre) => genre.id === 62));
    const created = await service.createBook(bookFormPayload(input()));
    assert.equal(created.id, 27);
    assert.equal(calls.findLast((call) => call.method === 'POST' && call.path === '/api/livros').status, 201);
    const reloaded = await createCatalogService(client).getBook(String(created.id));
    assert.equal(reloaded.titulo, created.titulo);
    assert.equal(reloaded.capaUrl, input().capaUrl);
    const body = bookFormPayload({ ...input(), titulo: 'ZZZ Livro descartável revisado', generoId: '61', totalPaginas: '200', anoPublicacao: '', descricao: '', capaUrl: '' });
    await service.updateBook(created.id, body);
    const edited = await createCatalogService(client).getBook(String(created.id));
    assert.equal(edited.totalPaginas, 200);
    assert.equal(edited.genero.id, 61);
    assert.equal(edited.anoPublicacao, null);
    assert.equal(edited.descricao, null);
    assert.equal(edited.capaUrl, null);
    const filters = { ...CATALOG_DEFAULTS, page: 3, pageSize: 13 };
    const last = await service.listBooks(filters);
    assert.deepEqual(last.data.map((book) => book.id), [created.id]);
    await service.deleteBook(created.id);
    assert.equal(calls.findLast((call) => call.method === 'DELETE').status, 204);
    const after = await service.listBooks(filters);
    assert.equal(after.meta.total, 26);
    assert.equal(availableCatalogPage(after.meta), 2);
    assert.equal((await service.listBooks({ ...filters, page: availableCatalogPage(after.meta) })).data.length, 13);
    await assert.rejects(createCatalogService(client).getBook(String(created.id)), (error) => error.status === 404);
  });
});

test('servidor recusa escrita de leitor; ciclos impedem exclusão e mudança de páginas, mas permitem total inalterado', { skip: !existsSync(backendPackage) }, async () => {
  await withAdmin(async ({ fixture, auth, service, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const payload = bookFormPayload(input());
    await assert.rejects(service.createBook(payload), (error) => error.status === 403);
    await assert.rejects(service.updateBook(1, payload), (error) => error.status === 403);
    await assert.rejects(service.deleteBook(1), (error) => error.status === 403);
    assert.equal(connection.books.length, 26);
    await auth.logout();
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const original = await service.getBook('1');
    await assert.rejects(service.deleteBook(1), (error) => error.status === 409 && error.code === 'RESOURCE_IN_USE');
    assert.equal((await service.getBook('1')).titulo, original.titulo);
    await assert.rejects(service.updateBook(1, { ...payload, titulo: 'Não deve persistir', totalPaginas: original.totalPaginas + 1 }), (error) => error.status === 409);
    assert.equal((await service.getBook('1')).titulo, original.titulo);
    await service.updateBook(1, { ...payload, totalPaginas: original.totalPaginas });
    const updated = await service.getBook('1');
    assert.equal(updated.titulo, payload.titulo);
    assert.equal(updated.totalPaginas, original.totalPaginas);
  });
});

test('validadores e CSRF reais recusam escrita inválida sem reenvio; falha de servidor permanece indeterminada', { skip: !existsSync(backendPackage) }, async () => {
  await withAdmin(async ({ fixture, auth, service, connection, calls, corruptCsrf }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const payload = bookFormPayload(input());
    for (const change of [{ totalPaginas: 0 }, { totalPaginas: '123' }, { anoPublicacao: 0 }, { anoPublicacao: new Date().getFullYear() + 1 }, { titulo: 'x'.repeat(161) }, { autor: '' }, { descricao: 'x'.repeat(2001) }, { capaUrl: 'http://example.test/capa' }]) {
      await assert.rejects(service.createBook({ ...payload, ...change }), (error) => error.status === 422);
    }
    assert.equal(connection.books.length, 26);
    corruptCsrf(true);
    await assert.rejects(service.createBook(payload), (error) => error.status === 403 && error.policy.category === 'forbidden_undetermined');
    assert.equal(calls.filter((call) => call.path === '/api/livros' && call.method === 'POST').length, 9);
    corruptCsrf(false);
    const created = await service.createBook(payload);
    connection.setMode('unavailable');
    const before = calls.length;
    await assert.rejects(service.updateBook(created.id, payload), (error) => error.status === 503 && bookWriteFeedback(error, 'update').uncertain);
    assert.equal(calls.length, before + 1);
    connection.setMode('normal');
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(service.deleteBook(created.id), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().status, 'unauthenticated');
    assert.equal(auth.getSnapshot().user, null);
  });
});
