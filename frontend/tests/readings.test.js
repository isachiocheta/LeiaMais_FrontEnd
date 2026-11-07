import test from 'node:test';
import assert from 'node:assert/strict';
import { readingProgress, validateReadingPage, canRecordReading, readingWriteFeedback } from '../src/utils/reading-progress.js';
import { readParticipationQuery, participationQuery } from '../src/utils/participation-query.js';
import { createParticipationService } from '../src/services/participations.js';
import { createHttpClient } from '../src/services/http-client.js';
import { ApiError } from '../src/services/api-errors.js';

const participation = { id: 1, cicloId: 2, paginaAtual: 0, percentual: 0, concluida: false, concluidaEm: null, criadoEm: '2026-11-07T12:00:00Z', atualizadoEm: '2026-11-07T12:00:00Z', ciclo: { id: 2, nome: 'Ciclo de teste', situacao: 'EM_ANDAMENTO', dataInicio: '2026-11-01', dataFim: '2026-11-30' }, livro: { id: 2, titulo: 'Livro de teste', totalPaginas: 20000 } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('progresso só chega a 100% na página exata, incluindo percentual arredondado e total máximo', () => {
  assert.deepEqual(readingProgress(0, 20000), { complete: false, value: 0, label: '0%' });
  assert.equal(readingProgress(10000, 20000).label, '50%');
  assert.equal(readingProgress(19999, 20000).label, '99,99%');
  assert.ok(readingProgress(19999, 20000).value < 100);
  assert.equal(readingProgress(2147483646, 2147483647).label, '99,99%');
  assert.equal(readingProgress(1, 2147483647).label, '<0,01%');
  assert.deepEqual(readingProgress(20000, 20000), { complete: true, value: 100, label: '100%' });
  for (const args of [[-1, 10], [11, 10], [1.5, 10], [1, 0]]) assert.throws(() => readingProgress(...args), RangeError);
});

test('página zero, intermediária, final e redução são válidas; vazio, fração e excesso não são enviados', () => {
  for (const page of ['0', '50', '100', '20', ' 0 ']) assert.equal(validateReadingPage(page, 100), '');
  for (const page of ['', ' ', '-1', '1.5', '1e2', '101', 'NaN']) assert.ok(validateReadingPage(page, 100));
  const cycle = participation.ciclo;
  assert.equal(canRecordReading(cycle, '2026-11-01'), true);
  assert.equal(canRecordReading(cycle, '2026-11-30'), true);
  assert.equal(canRecordReading(cycle, '2026-12-01'), false);
  assert.equal(canRecordReading({ ...cycle, situacao: 'CONCLUIDO' }, '2026-11-07'), false);
  assert.equal(canRecordReading({ ...cycle, situacao: 'PLANEJADO' }, '2026-11-07'), false);
});

test('histórico e participantes aceitam somente paginação suportada', () => {
  assert.deepEqual(readParticipationQuery(participationQuery({ page: 2, pageSize: 6 })).filters, { page: 2, pageSize: 6 });
  for (const query of ['page=0', 'pageSize=51', 'page=01', 'page=1&page=2', 'q=a', 'sort=nome', 'usuarioId=99', 'page=9007199254740991&pageSize=50']) assert.equal(readParticipationQuery(new URLSearchParams(query)).valid, false, query);
});

test('participação envia POST sem corpo nem usuarioId; atualização envia somente paginaAtual, com cookies e CSRF', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    return json({ data: participation }, init.method === 'POST' ? 201 : 200);
  } });
  const service = createParticipationService(client);
  await service.join('2');
  await service.updatePage('2', 0);
  assert.deepEqual(calls.map((call) => call.url.pathname), ['/api/auth/csrf', '/api/ciclos/2/participacoes', '/api/ciclos/2/meu-progresso']);
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.headers.has('Content-Type'), false);
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
  assert.equal(calls[1].init.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[2].init.body), { paginaAtual: 0 });
  for (const page of ['1', -1, 1.5, 2147483648]) await assert.rejects(service.updatePage('2', page), (error) => error.kind === 'client');
});

test('ausência própria 404 é distinguida de rede e indisponibilidade; percentual 100 incompleto continua aceito', async () => {
  let payload = { error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } };
  let status = 404;
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async () => json(payload, status) });
  const service = createParticipationService(client);
  assert.equal(await service.getMine('2'), null);
  status = 503; payload = { error: { code: 'SERVICE_UNAVAILABLE', message: 'Indisponível.' } };
  await assert.rejects(service.getMine('2'), (error) => error.status === 503);
  status = 200; payload = { data: { ...participation, paginaAtual: 19999, percentual: 100, privado: true } };
  const result = await service.getMine('2');
  assert.equal(result.concluida, false);
  assert.equal(result.percentual, 100);
  assert.equal(Object.hasOwn(result, 'privado'), false);
  payload = { data: { ...participation, concluida: true } };
  await assert.rejects(service.getMine('2'), (error) => error.kind === 'unexpected_response');
});

test('histórico e consulta administrativa enviam paginação real e descartam dados fora do contrato', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
    calls.push(new URL(url));
    const admin = url.includes('/participantes?');
    return json({ data: admin ? [{ ...participation, usuario: { id: 7, nome: 'Leitora de teste', email: 'não permitido' } }] : [participation], meta: { page: 2, pageSize: 6, total: 20 } });
  } });
  const service = createParticipationService(client);
  assert.equal((await service.history({ page: 2, pageSize: 6 })).meta.total, 20);
  const result = await service.participants('2', 20000, { page: 2, pageSize: 6 });
  assert.deepEqual(result.data[0].usuario, { id: 7, nome: 'Leitora de teste' });
  assert.equal(Object.hasOwn(result.data[0], 'livro'), false);
  assert.deepEqual(calls.map((url) => url.pathname + url.search), ['/api/me/participacoes?page=2&pageSize=6', '/api/ciclos/2/participantes?page=2&pageSize=6']);
});

test('recusa de duplicidade e ciclo fechado exige atualização; erros de campo são preservados', () => {
  const duplicate = new ApiError({ kind: 'http', status: 409, code: 'DUPLICATE_RESOURCE', message: 'Duplicado.' });
  assert.match(readingWriteFeedback(duplicate, 'join').message, /já possui uma participação/);
  assert.equal(readingWriteFeedback(duplicate, 'join').refreshRequired, true);
  const invalid = new ApiError({ kind: 'http', status: 422, code: 'VALIDATION_ERROR', message: 'Inválido.', fields: [{ field: 'paginaAtual', message: 'Valor inválido.' }] });
  assert.equal(readingWriteFeedback(invalid, 'update').field, 'Valor inválido.');
});

test('falha após mutação enviada não repete e sinaliza resultado desconhecido; leitura pode ser cancelada', async () => {
  let writes = 0;
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
    if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    writes++;
    throw new TypeError('Network');
  } });
  await assert.rejects(createParticipationService(client).updatePage('2', 0), (error) => error.policy.outcomeUnknown && readingWriteFeedback(error, 'update').refreshRequired);
  assert.equal(writes, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createParticipationService(client).history({ page: 1, pageSize: 12 }, { signal: controller.signal }), (error) => error.kind === 'cancelled');
});
