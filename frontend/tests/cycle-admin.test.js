import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleFormValues, cycleFormPayload, validateCycleForm, cycleWriteFeedback } from '../src/utils/cycle-form.js';
import { createCycleService } from '../src/services/cycles.js';
import { createHttpClient } from '../src/services/http-client.js';
import { ApiError } from '../src/services/api-errors.js';

const cycle = { id: 8, nome: 'Ciclo descartável', livroId: 26, dataInicio: '2026-11-01', dataFim: '2026-11-30', situacao: 'PLANEJADO', orientacoes: null, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z', livro: { id: 26, titulo: 'Livro de teste', autor: 'Autoria', totalPaginas: 126 } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('formulário valida limites Unicode, datas civis reais e período inclusivo', () => {
  const values = cycleFormValues(cycle);
  assert.deepEqual(validateCycleForm(values), {});
  assert.deepEqual(validateCycleForm({ ...values, nome: ` ${'🐝'.repeat(120)} `, orientacoes: '🐝'.repeat(2000), dataFim: values.dataInicio }), {});
  for (const [field, value] of [['nome', ' '], ['nome', '🐝'.repeat(121)], ['livroId', ''], ['livroId', '0'], ['livroId', '2147483648'], ['dataInicio', '2026-02-29'], ['dataFim', '2026-10-31'], ['dataInicio', '2026-11-01T00:00:00Z'], ['orientacoes', '🐝'.repeat(2001)]]) assert.ok(validateCycleForm({ ...values, [field]: value })[field], field);
});

test('payload converte livro, preserva datas e quebras de linha, e PATCH envia apenas alterações sem situação', () => {
  const values = { ...cycleFormValues(cycle), nome: ' Novo nome ', orientacoes: 'Linha 1\n<strong>Texto literal</strong>', situacao: 'CONCLUIDO', id: 99 };
  assert.deepEqual(cycleFormPayload(values), { nome: 'Novo nome', livroId: 26, dataInicio: '2026-11-01', dataFim: '2026-11-30', orientacoes: values.orientacoes });
  assert.deepEqual(cycleFormPayload(cycleFormValues(cycle), cycle), {});
  assert.deepEqual(cycleFormPayload(values, cycle), { nome: 'Novo nome', orientacoes: values.orientacoes });
  assert.deepEqual(cycleFormPayload({ ...cycleFormValues({ ...cycle, orientacoes: 'antiga' }), orientacoes: '' }, { ...cycle, orientacoes: 'antiga' }), { orientacoes: null });
});

test('serviços usam POST/PATCH/DELETE com CSRF e somente transições seguintes explícitas', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (path.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return json({ data: { ...cycle, ...JSON.parse(init.body) } }, init.method === 'POST' ? 201 : 200);
  } });
  const service = createCycleService(client);
  await service.createCycle({ ...cycleFormPayload(cycleFormValues(cycle)), situacao: 'CONCLUIDO', id: 99 });
  await service.updateCycle('8', { nome: 'Editado', situacao: 'CONCLUIDO' });
  await service.transitionCycle('8', 'PLANEJADO');
  await service.transitionCycle('8', 'EM_ANDAMENTO');
  await assert.rejects(service.transitionCycle('8', 'CONCLUIDO'), (error) => error.kind === 'client');
  await service.deleteCycle('8');
  const mutations = calls.filter((call) => call.init.method !== 'GET');
  assert.deepEqual(mutations.map((call) => call.init.method), ['POST', 'PATCH', 'PATCH', 'PATCH', 'DELETE']);
  assert.deepEqual(mutations[1].body, { nome: 'Editado' });
  assert.deepEqual(mutations[2].body, { situacao: 'EM_ANDAMENTO' });
  assert.deepEqual(mutations[3].body, { situacao: 'CONCLUIDO' });
  assert.equal(Object.hasOwn(mutations[0].body, 'situacao'), false);
  for (const call of mutations) { assert.equal(call.init.credentials, 'include'); assert.equal(call.init.headers.get('X-CSRF-Token'), 'a'.repeat(64)); }
  assert.equal(mutations.at(-1).init.headers.has('Content-Type'), false);
});

test('409 explica dependências conhecidas sem inventar qual condição causou conflito genérico', () => {
  const blocked = new ApiError({ kind: 'http', status: 409, code: 'RESOURCE_IN_USE', message: 'Em uso.' });
  assert.match(cycleWriteFeedback(blocked, 'delete').message, /participações ou encontros/);
  assert.match(cycleWriteFeedback(blocked, 'complete').message, /encontros agendados/);
  assert.match(cycleWriteFeedback(blocked, 'update').message, /troca de livro/i);
  const conflict = new ApiError({ kind: 'http', status: 409, code: 'CONFLICT', message: 'Conflito.' });
  assert.equal(cycleWriteFeedback(conflict, 'start').conflict, true);
  assert.match(cycleWriteFeedback(conflict, 'start').message, /dados podem ter mudado/);
  const validation = new ApiError({ kind: 'http', status: 422, code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: [{ field: 'dataFim', message: 'Data inválida.' }] });
  assert.deepEqual(cycleWriteFeedback(validation, 'update').fields, { dataFim: 'Data inválida.' });
});

test('falhas e respostas inesperadas de mutações não repetem envios e exigem conferência', async () => {
  for (const response of ['network', 'malformed', '503']) {
    let writes = 0;
    const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
      if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
      writes++;
      if (response === 'network') throw new TypeError('Network');
      if (response === '503') return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Indisponível.' } }, 503);
      return json({ data: { id: 8 } });
    } });
    await assert.rejects(createCycleService(client).transitionCycle('8', 'PLANEJADO'), (error) => cycleWriteFeedback(error, 'start').uncertain === true);
    assert.equal(writes, 1);
  }
});
