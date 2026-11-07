import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFormValues, validateBookForm, bookFormPayload, bookWriteFeedback } from '../src/utils/book-form.js';
import { availableCatalogPage } from '../src/utils/catalog-query.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createCatalogService } from '../src/services/catalog.js';
import { ApiError } from '../src/services/api-errors.js';

const values = () => ({ titulo: ' Livro descartável ', autor: ' Autoria de teste ', generoId: '61', totalPaginas: '123', anoPublicacao: '', descricao: '', capaUrl: '' });
const book = { id: 27, titulo: 'Livro descartável', autor: 'Autoria de teste', generoId: 61, totalPaginas: 123, anoPublicacao: null, descricao: null, capaUrl: null, genero: { id: 61, nome: 'Gênero de teste' }, criadoEm: '2026-01-01T12:00:00Z', atualizadoEm: '2026-01-01T12:00:00Z' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('formulário respeita limites de título, autor, descrição, ano e capa HTTPS', () => {
  assert.deepEqual(validateBookForm(values(), 2026), {});
  for (const [field, value] of [['titulo', ' '], ['titulo', '🐝'.repeat(161)], ['autor', 'a'.repeat(121)], ['descricao', '🐝'.repeat(2001)], ['anoPublicacao', '0'], ['anoPublicacao', '2027'], ['anoPublicacao', '1.5'], ['capaUrl', 'http://example.test/capa'], ['capaUrl', 'https:example.test'], ['capaUrl', 'https://user:secret@example.test/capa'], ['capaUrl', 'https://example.test/ capa']]) {
    assert.ok(validateBookForm({ ...values(), [field]: value }, 2026)[field], field);
  }
  for (const change of [{ titulo: '🐝'.repeat(160) }, { descricao: '🐝'.repeat(2000) }, { anoPublicacao: '1' }, { anoPublicacao: '2026' }, { capaUrl: 'https://example.test/capa.png' }]) assert.deepEqual(validateBookForm({ ...values(), ...change }, 2026), {});
});

test('números vazios não se confundem com zero e payload converte explicitamente', () => {
  for (const totalPaginas of ['', '0', '-1', '1.5', '1e3', '2147483648']) assert.ok(validateBookForm({ ...values(), totalPaginas }).totalPaginas);
  assert.notEqual(validateBookForm({ ...values(), totalPaginas: '' }).totalPaginas, validateBookForm({ ...values(), totalPaginas: '0' }).totalPaginas);
  const body = bookFormPayload(values());
  assert.deepEqual(body, { titulo: 'Livro descartável', autor: 'Autoria de teste', generoId: 61, totalPaginas: 123, anoPublicacao: null, descricao: null, capaUrl: null });
  assert.equal(bookFormPayload({ ...values(), anoPublicacao: '2020' }).anoPublicacao, 2020);
  assert.equal(bookFormPayload({ ...values(), descricao: '  descrição  ' }).descricao, '  descrição  ');
  assert.equal(bookFormValues(book).totalPaginas, '123');
  assert.equal(bookFormValues(book).anoPublicacao, '');
});

test('criar, editar e excluir usam métodos reais, CSRF, cookies e somente campos permitidos', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    return init.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ data: book }, init.method === 'POST' ? 201 : 200);
  } });
  const catalog = createCatalogService(client);
  const body = { ...bookFormPayload(values()), id: 88, perfil: 'ADMIN_CLUBE', criadoEm: 'não permitido' };
  await catalog.createBook(body);
  await catalog.updateBook(27, body);
  await catalog.deleteBook(27);
  assert.deepEqual(calls.map((call) => call.init.method), ['GET', 'POST', 'PATCH', 'DELETE']);
  for (const { init } of calls.slice(1)) {
    assert.equal(init.credentials, 'include');
    assert.equal(init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
    if (init.method !== 'DELETE') {
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload, bookFormPayload(values()));
      assert.equal(payload.totalPaginas, 123);
    } else assert.equal(init.headers.has('Content-Type'), false);
  }
});

test('PATCH parcial preserva campos ausentes e mantém null explícito para limpar opcionais', async () => {
  let body;
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'b'.repeat(64) } });
    body = JSON.parse(init.body);
    return json({ data: book });
  } });
  await createCatalogService(client).updateBook(27, { descricao: null });
  assert.deepEqual(body, { descricao: null });
});

test('409 de vínculo explica a restrição; outro conflito não inventa ciclos', () => {
  const error = new ApiError({ kind: 'http', status: 409, code: 'RESOURCE_IN_USE', message: 'O recurso possui vínculos.' });
  assert.match(bookWriteFeedback(error, 'delete').message, /não pode ser excluído/);
  assert.match(bookWriteFeedback(error, 'update').fields.totalPaginas, /total atual/);
  const other = new ApiError({ kind: 'http', status: 409, code: 'CONFLICT', message: 'Conflito.' });
  assert.equal(bookWriteFeedback(other, 'update').fields.totalPaginas, undefined);
});

test('falhas de escrita não repetem mutações e respostas inesperadas deixam o resultado indeterminado', async () => {
  for (const method of ['createBook', 'updateBook', 'deleteBook']) {
    let writes = 0;
    const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
      if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
      writes += 1;
      return json({ data: {} });
    } });
    const service = createCatalogService(client);
    await assert.rejects(method === 'createBook' ? service[method](bookFormPayload(values())) : method === 'updateBook' ? service[method](27, bookFormPayload(values())) : service[method](27), (error) => {
      assert.equal(bookWriteFeedback(error, method === 'deleteBook' ? 'delete' : 'update').uncertain, true);
      return true;
    });
    assert.equal(writes, 1);
  }
});

test('ajuste de página usa total real após exclusão da última linha', () => {
  assert.equal(availableCatalogPage({ page: 3, pageSize: 13, total: 26 }), 2);
  assert.equal(availableCatalogPage({ page: 4, pageSize: 12, total: 5 }), 1);
  assert.equal(availableCatalogPage({ page: 2, pageSize: 12, total: 0 }), 1);
  assert.equal(availableCatalogPage({ page: 2, pageSize: 12, total: 25 }), 2);
});
