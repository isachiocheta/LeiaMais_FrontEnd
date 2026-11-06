import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_DEFAULTS, readCatalogQuery, catalogQuery, changeCatalogFilters } from '../src/utils/catalog-query.js';
import { createCatalogService } from '../src/services/catalog.js';
import { createHttpClient } from '../src/services/http-client.js';
import { safeCoverUrl } from '../src/utils/book-cover.js';
import { startRequest } from '../src/utils/request-task.js';

const book = { id: 1, titulo: 'Livro da fixture', autor: 'Autoria da fixture', generoId: 1, genero: { id: 1, nome: 'Gênero da fixture' }, totalPaginas: 200, anoPublicacao: null, descricao: null, capaUrl: null, criadoEm: '2026-01-01T12:00:00Z', atualizadoEm: '2026-01-02T12:00:00Z' };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

test('filtros do catálogo preservam busca, gênero, ordenação, direção e paginação na URL', () => {
  const filters = { q: 'Marina %_ & livros', generoId: '61', sort: 'anoPublicacao', direction: 'desc', page: 3, pageSize: 6 };
  const params = catalogQuery(filters);
  assert.deepEqual(readCatalogQuery(params), { filters, errors: {}, valid: true });
  assert.deepEqual(readCatalogQuery(new URLSearchParams()).filters, CATALOG_DEFAULTS);
  for (const changes of [{ q: 'outra busca' }, { generoId: '2' }, { sort: 'titulo' }, { direction: 'asc' }, { pageSize: 24 }]) {
    assert.equal(changeCatalogFilters(filters, changes).page, 1);
    assert.deepEqual(changeCatalogFilters(filters, changes), { ...filters, ...changes, page: 1 });
  }
});

test('query inválida é identificada sem truncar silenciosamente ou aceitar parâmetros extras', () => {
  for (const value of ['sort=autor', 'sort=id', 'direction=ASC', 'generoId=0', 'generoId=2147483648', 'page=0', 'page=1e2', 'page=01', 'pageSize=51', 'page=9007199254740991&pageSize=50', 'q=a&q=b', 'extra=1', `q=${'🐝'.repeat(161)}`]) {
    assert.equal(readCatalogQuery(new URLSearchParams(value)).valid, false, value);
  }
  const result = readCatalogQuery(new URLSearchParams({ q: ` ${'🐝'.repeat(160)} ` }));
  assert.equal(result.valid, true);
  assert.equal(Array.from(result.filters.q).length, 160);
});

test('listagem envia todos os filtros à API e usa o total do servidor com cookies', async () => {
  let request;
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    request = { url: new URL(url), init };
    return json({ data: [{ ...book, privado: 'fora do contrato' }], meta: { page: 2, pageSize: 6, total: 19 } });
  } });
  const filters = { ...CATALOG_DEFAULTS, q: 'Autoria %_', generoId: '1', sort: 'anoPublicacao', direction: 'desc', page: 2, pageSize: 6 };
  const result = await createCatalogService(client).listBooks(filters);
  assert.equal(request.url.pathname, '/api/livros');
  assert.deepEqual(Object.fromEntries(request.url.searchParams), { q: 'Autoria %_', generoId: '1', sort: 'anoPublicacao', direction: 'desc', page: '2', pageSize: '6' });
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.init.headers.has('Content-Type'), false);
  assert.equal(result.meta.total, 19);
  assert.equal(Object.hasOwn(result.data[0], 'privado'), false);
});

test('lista completa de gêneros percorre a paginação de 50 itens', async () => {
  const calls = [];
  const genres = Array.from({ length: 62 }, (_, index) => ({ id: index + 1, nome: `Gênero ${index + 1}` }));
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
    const params = new URL(url).searchParams;
    const page = Number(params.get('page'));
    calls.push(new URL(url).pathname + '?' + params);
    return json({ data: genres.slice((page - 1) * 50, page * 50), meta: { page, pageSize: 50, total: 62 } });
  } });
  const result = await createCatalogService(client).listGenres();
  assert.equal(result.length, 62);
  assert.equal(result.at(-1).id, 62);
  assert.deepEqual(calls, ['/api/generos?page=1&pageSize=50', '/api/generos?page=2&pageSize=50']);
});

test('detalhes usam o endpoint real; 404 e referências inválidas não criam livro de exemplo', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
    calls.push(new URL(url).pathname);
    return url.endsWith('/1') ? json({ data: book }) : json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }, 404);
  } });
  const service = createCatalogService(client);
  assert.deepEqual(await service.getBook('1'), book);
  await assert.rejects(service.getBook('2'), (error) => error.status === 404);
  for (const id of ['../auth/me', '0', '2147483648', 'abc']) await assert.rejects(service.getBook(id), (error) => error.kind === 'client');
  assert.deepEqual(calls, ['/api/livros/1', '/api/livros/2']);
});

test('resposta malformada não vira catálogo vazio nem contagem inventada', async () => {
  for (const payload of [
    { data: [{ ...book, genero: null }], meta: { page: 1, pageSize: 12, total: 1 } },
    { data: [{ ...book, totalPaginas: 0 }], meta: { page: 1, pageSize: 12, total: 1 } },
    { data: [book], meta: { page: 2, pageSize: 12, total: 1 } },
    { data: [book], meta: { page: 1, pageSize: 12, total: 0 } },
  ]) {
    const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async () => json(payload) });
    await assert.rejects(createCatalogService(client).listBooks(CATALOG_DEFAULTS), (error) => error.kind === 'unexpected_response');
  }
});

test('capas aceitam somente HTTPS sem credenciais; ausência usa fallback', () => {
  assert.equal(safeCoverUrl('https://example.test/capa.png'), 'https://example.test/capa.png');
  for (const value of [null, '', 'http://example.test/capa', 'data:image/png;base64,x', 'javascript:alert(1)', 'https://usuario:senha@example.test/capa', 'https://example.test/ capa']) assert.equal(safeCoverUrl(value), '');
});

test('cancelamento impede que uma resposta atrasada substitua uma busca mais recente, mesmo ignorando AbortSignal', async () => {
  let oldResolve;
  let oldSignal;
  const received = [];
  const oldStarted = new Promise((resolve) => {
    oldResolve = resolve;
  });
  const old = startRequest(({ signal }) => { oldSignal = signal; return oldStarted; }, { onSuccess: (value) => received.push(value), onError: () => assert.fail('Cancelamento não deve mostrar erro.') });
  await Promise.resolve();
  old.cancel();
  const recent = startRequest(async () => 'busca recente', { onSuccess: (value) => received.push(value), onError: assert.fail });
  await recent.finished;
  oldResolve('busca antiga');
  await old.finished;
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(received, ['busca recente']);
});
