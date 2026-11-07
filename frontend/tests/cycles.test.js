import test from 'node:test';
import assert from 'node:assert/strict';
import { civilToday, isCivilDate, formatCivilDate, cyclePeriod } from '../src/utils/civil-dates.js';
import { CYCLE_DEFAULTS, readCycleQuery, cycleQuery, changeCycleFilters } from '../src/utils/cycle-query.js';
import { createCycleService } from '../src/services/cycles.js';
import { createHttpClient } from '../src/services/http-client.js';

const cycle = { id: 1, nome: 'Leitura de teste', livroId: 2, dataInicio: '2024-02-01', dataFim: '2024-02-29', situacao: 'EM_ANDAMENTO', orientacoes: 'Linha 1\n<b>Literal</b>', criadoEm: '2024-01-01T12:00:00Z', atualizadoEm: '2024-01-02T12:00:00Z', livro: { id: 2, titulo: 'Livro de teste', autor: 'Autoria de teste', totalPaginas: 123 } };
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

test('datas civis validam calendário e são exibidas sem deslocamento de fuso', () => {
  for (const value of ['2024-02-29', '2000-02-29', '0001-01-01']) assert.equal(isCivilDate(value), true);
  for (const value of ['1900-02-29', '2023-02-29', '2024-04-31', '2024-00-01', '2024-01-00', '0000-01-01', '2024-1-01', '2024-01-01T00:00:00Z', null]) assert.equal(isCivilDate(value), false, String(value));
  assert.equal(formatCivilDate('2024-02-29'), '29 de fevereiro de 2024');
  assert.equal(formatCivilDate('2024-01-01'), '1 de janeiro de 2024');
  assert.equal(formatCivilDate('2024-02-30'), 'Data inválida');
});

test('dia de referência considera São Paulo na virada UTC e períodos incluem início e fim', () => {
  assert.equal(civilToday(Date.parse('2026-11-07T02:59:59Z')), '2026-11-06');
  assert.equal(civilToday(Date.parse('2026-11-07T03:00:00Z')), '2026-11-07');
  assert.equal(cyclePeriod('2024-02-01', '2024-02-29', '2024-01-31').code, 'future');
  for (const today of ['2024-02-01', '2024-02-29']) assert.equal(cyclePeriod('2024-02-01', '2024-02-29', today).code, 'within');
  assert.equal(cyclePeriod('2024-02-01', '2024-02-29', '2024-03-01').code, 'past');
  assert.equal(cyclePeriod('2024-03-01', '2024-02-01', '2024-02-05'), null);
});

test('filtros de ciclos persistem na URL, respeitam contrato e reiniciam a paginação', () => {
  const filters = { q: 'Leitura %_ & 🐝', situacao: 'PLANEJADO', sort: 'nome', direction: 'desc', page: 3, pageSize: 2 };
  assert.deepEqual(readCycleQuery(cycleQuery(filters)), { filters, valid: true, errors: {} });
  assert.deepEqual(readCycleQuery(new URLSearchParams()).filters, CYCLE_DEFAULTS);
  for (const changes of [{ q: 'nova' }, { situacao: 'CONCLUIDO' }, { sort: 'dataInicio' }, { direction: 'asc' }, { pageSize: 6 }]) assert.equal(changeCycleFilters(filters, changes).page, 1);
  for (const query of ['q=a&q=b', 'sort=id', 'sort=dataFim', 'situacao=ATIVO', 'livroId=1', 'direction=ASC', 'page=0', 'page=01', 'pageSize=51', 'page=9007199254740991&pageSize=50', `q=${'🐝'.repeat(121)}`]) assert.equal(readCycleQuery(new URLSearchParams(query)).valid, false, query);
});

test('serviço envia filtros com cookies e preserva situação persistida, datas e orientações literais', async () => {
  let request;
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    request = { url: new URL(url), init };
    return json({ data: [{ ...cycle, privado: true }], meta: { page: 2, pageSize: 2, total: 4 } });
  } });
  const filters = { ...CYCLE_DEFAULTS, q: '%_ &', situacao: 'EM_ANDAMENTO', sort: 'nome', direction: 'desc', page: 2, pageSize: 2 };
  const result = await createCycleService(client).listCycles(filters);
  assert.equal(request.url.pathname, '/api/ciclos');
  assert.deepEqual(Object.fromEntries(request.url.searchParams), { q: '%_ &', situacao: 'EM_ANDAMENTO', sort: 'nome', direction: 'desc', page: '2', pageSize: '2' });
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.init.headers.has('Content-Type'), false);
  assert.deepEqual(result.data[0], cycle);
  assert.equal(cyclePeriod(cycle.dataInicio, cycle.dataFim, '2026-01-01').code, 'past');
  assert.equal(result.data[0].situacao, 'EM_ANDAMENTO');
});

test('detalhes validam id, resposta e calendário; falhas não viram dados vazios', async () => {
  let payload = { data: cycle };
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async () => json(payload) });
  const service = createCycleService(client);
  assert.deepEqual(await service.getCycle('1'), cycle);
  for (const id of ['0', 'abc', '../auth/me', '2147483648']) await assert.rejects(service.getCycle(id), (error) => error.kind === 'client');
  for (const changes of [{ id: 2 }, { dataInicio: '2024-02-30' }, { dataFim: '2023-12-31' }, { situacao: 'ATUAL' }, { livro: { ...cycle.livro, id: 3 } }]) {
    payload = { data: { ...cycle, ...changes } };
    await assert.rejects(service.getCycle('1'), (error) => error.kind === 'unexpected_response');
  }
  payload = { data: [], meta: { page: 2, pageSize: 12, total: 0 } };
  await assert.rejects(service.listCycles(CYCLE_DEFAULTS), (error) => error.kind === 'unexpected_response');
});

test('cancelamento de consulta de ciclos chega ao cliente HTTP', async () => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (_, { signal }) => {
    started();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  } });
  const controller = new AbortController();
  const request = createCycleService(client).listCycles(CYCLE_DEFAULTS, { signal: controller.signal });
  await ready;
  controller.abort();
  await assert.rejects(request, (error) => error.kind === 'cancelled');
});
