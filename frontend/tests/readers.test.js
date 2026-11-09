import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderService } from '../src/services/readers.js';
import { READER_DEFAULTS, readerQuery, readReaderQuery } from '../src/utils/reader-query.js';
import { readerActions, READER_ACTIONS, readerAdminFeedback } from '../src/utils/reader-actions.js';
import { ApiError, requestError } from '../src/services/api-errors.js';

const reader = { id: 4, nome: 'Leitora de teste', email: 'leitora@fixture.test', perfil: 'LEITOR', situacao: 'PENDENTE' };

test('filtros de leitores preservam situação, paginação e ordenação e rejeitam busca não suportada', () => {
  const filters = { page: 3, pageSize: 6, situacao: 'PENDENTE', sort: 'email', direction: 'desc' };
  assert.deepEqual(readReaderQuery(readerQuery(filters)).filters, filters);
  assert.deepEqual(readReaderQuery(new URLSearchParams()).filters, READER_DEFAULTS);
  for (const query of ['q=Maria', 'email=a', 'perfil=ADMIN_CLUBE', 'situacao=ativo', 'situacao=', 'sort=senha', 'direction=ASC', 'page=0', 'page=1&page=2', 'pageSize=51', 'situacao=ATIVO&situacao=INATIVO', 'page=9007199254740991&pageSize=50']) assert.equal(readReaderQuery(new URLSearchParams(query)).valid, false, query);
  for (const sort of ['id', 'nome', 'email', 'situacao', 'criadoEm']) assert.equal(readReaderQuery(new URLSearchParams({ sort })).valid, true);
});

test('listagem envia somente parâmetros reais, permite AbortSignal e descarta campos privados', async () => {
  const calls = [], signal = new AbortController().signal;
  const filters = { ...READER_DEFAULTS, situacao: 'PENDENTE', sort: 'nome' };
  const service = createReaderService({ async request(path, options) { calls.push({ path, ...options }); return { data: [{ ...reader, senhaHash: 'omitido', sessionVersion: 9 }], meta: { page: 1, pageSize: 12, total: 1 } }; } });
  const result = await service.list(filters, { signal });
  assert.deepEqual(result.data, [reader]);
  assert.equal(calls[0].path, 'usuarios'); assert.equal(calls[0].requiresAuth, true); assert.equal(calls[0].signal, signal);
  assert.deepEqual([...calls[0].query.keys()], ['page', 'pageSize', 'sort', 'direction', 'situacao']);
  assert.equal(calls[0].query.get('situacao'), 'PENDENTE');
});

test('resposta inesperada não exibe administradores, vazio fictício nem total inventado', async () => {
  for (const payload of [null, { data: [], meta: { page: 1, pageSize: 12, total: '1' } }, { data: [{ ...reader, perfil: 'ADMIN_CLUBE' }], meta: { page: 1, pageSize: 12, total: 1 } }, { data: [{ ...reader, situacao: 'ATIVO' }], meta: { page: 1, pageSize: 12, total: 1 } }]) {
    await assert.rejects(createReaderService({ request: async () => payload }).list({ ...READER_DEFAULTS, situacao: 'PENDENTE' }), (e) => e.kind === 'unexpected_response');
  }
});

test('ações respeitam todas as transições reais e nunca oferecem alteração em administrador', () => {
  assert.deepEqual(readerActions(reader), ['approve', 'deactivate']);
  assert.deepEqual(readerActions({ ...reader, situacao: 'ATIVO' }), ['deactivate']);
  assert.deepEqual(readerActions({ ...reader, situacao: 'INATIVO' }), ['reactivate']);
  assert.deepEqual(readerActions({ ...reader, perfil: 'ADMIN_CLUBE' }), []);
  assert.deepEqual(Object.values(READER_ACTIONS).map((v) => v.target), ['ATIVO', 'INATIVO', 'ATIVO']);
});

test('PATCH envia exclusivamente situação e exige confirmação válida da API, sem repetir falhas', async () => {
  const calls = [];
  const service = createReaderService({ async request(path, options) { calls.push({ path, ...options }); return { data: { ...reader, situacao: options.body.situacao } }; } });
  assert.equal((await service.changeStatus(4, 'ATIVO')).situacao, 'ATIVO');
  assert.equal(calls[0].path, 'usuarios/4/situacao'); assert.equal(calls[0].method, 'PATCH'); assert.equal(calls[0].requiresAuth, true);
  assert.deepEqual(calls[0].body, { situacao: 'ATIVO' });
  await assert.rejects(service.changeStatus(4, 'PENDENTE'), (e) => e.kind === 'client'); assert.equal(calls.length, 1);
  const malformed = createReaderService({ request: async () => ({ data: reader }) });
  await assert.rejects(malformed.changeStatus(4, 'ATIVO'), (e) => e.policy.outcomeUnknown);
  let attempts = 0;
  const failed = createReaderService({ request: async () => { attempts++; throw requestError('network', { method: 'PATCH', requestSent: true }); } });
  await assert.rejects(failed.changeStatus(4, 'INATIVO'), (e) => e.policy.outcomeUnknown); assert.equal(attempts, 1);
});

test('401, 403, 409 e 422 recebem orientações distintas; 403 de escrita não deduz perfil', () => {
  const error = (status) => new ApiError({ kind: 'http', status, code: 'FIXTURE', message: 'Erro de teste', fields: [{ field: 'situacao', message: 'Valor inválido.' }] });
  assert.match(readerAdminFeedback(error(401), true).message, /Entre novamente/);
  assert.match(readerAdminFeedback(error(403), true).message, /validação de segurança/);
  assert.match(readerAdminFeedback(error(403)).message, /exclusiva da administração/);
  assert.match(readerAdminFeedback(error(409), true).message, /situação atual/);
  assert.match(readerAdminFeedback(error(422), true).message, /situação enviada/);
  assert.deepEqual(readerAdminFeedback(error(422), true).fields, error(422).fields);
  assert.match(readerAdminFeedback(requestError('network', { method: 'PATCH', requestSent: true }), true).message, /conferir a situação real/);
});
