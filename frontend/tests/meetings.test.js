import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { isMeetingInstant, meetingPresentation, formatMeetingInstant, meetingCivilToInstant, meetingInstantToCivil } from '../src/utils/meeting-instants.js';
import { MEETING_DEFAULTS, readMeetingQuery, meetingQuery, changeMeetingFilters } from '../src/utils/meeting-query.js';
import { createMeetingService } from '../src/services/meetings.js';
import { createHttpClient } from '../src/services/http-client.js';

const cycle = { id: 1, nome: 'Ciclo de teste', livroId: 2, dataInicio: '2026-11-01', dataFim: '2026-11-30', situacao: 'EM_ANDAMENTO', orientacoes: null, criadoEm: '2026-01-01T12:00:00Z', atualizadoEm: '2026-01-02T12:00:00Z', livro: { id: 2, titulo: 'Livro relacionado real', autor: 'Autoria de teste', totalPaginas: 200 } };
const meeting = { id: 1, cicloId: 1, titulo: 'Encontro de teste', inicioEm: '2026-11-07T02:59:00Z', local: 'Sala de teste', descricao: 'Linha 1\n<b>Texto literal</b>', situacao: 'AGENDADO', criadoEm: '2026-01-01T12:00:00Z', atualizadoEm: '2026-01-02T12:00:00Z', quantidadeInscritos: 0, ciclo: { id: 1, nome: cycle.nome, situacao: cycle.situacao } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('instantes exigem offset explícito, calendário real e precisão aceita pelo backend', () => {
  for (const value of ['2026-11-07T03:01:00Z', '2026-11-07T00:01:00.123-03:00', '2024-02-29T23:59:59+02:00']) assert.equal(isMeetingInstant(value), true, value);
  for (const value of ['2026-11-07', '2026-11-07T00:01', '2026-11-07T00:01:00', '2026-02-29T00:00:00Z', '2026-11-07T24:00:00Z', '2026-11-07T00:00:00.1234Z', '2026-11-07T00:00:00+24:00']) assert.equal(isMeetingInstant(value), false, value);
});

test('horários perto da meia-noite são apresentados no dia correto em São Paulo', () => {
  assert.equal(formatMeetingInstant('2026-11-07T02:59:00Z'), '6 de novembro de 2026 às 23:59');
  assert.equal(formatMeetingInstant('2026-11-07T03:01:00Z'), '7 de novembro de 2026 às 00:01');
  assert.equal(meetingPresentation('2026-11-07T03:00:00Z').time, '00:00');
  assert.equal(formatMeetingInstant('2026-11-07T00:01:00-03:00'), '7 de novembro de 2026 às 00:01');
});

test('conversão civil explícita preserva milissegundos e usa regras históricas do fuso, sem offset fixo', () => {
  const iso = meetingCivilToInstant({ date: '2026-11-07', time: '00:01:02.123' });
  assert.equal(iso, '2026-11-07T03:01:02.123Z');
  assert.deepEqual(meetingInstantToCivil(iso), { date: '2026-11-07', time: '00:01:02.123', offsetMinutes: -180 });
  assert.equal(meetingCivilToInstant(meetingInstantToCivil(iso)), iso);
  assert.equal(meetingCivilToInstant({ date: '2018-01-07', time: '00:01' }), '2018-01-07T02:01:00.000Z');
  for (const input of [{ date: '2026-02-29', time: '12:00' }, { date: '2026-11-07', time: '24:00' }, { date: '2026-11-07', time: '12:00Z' }]) assert.throws(() => meetingCivilToInstant(input), RangeError);
});

test('conversão rejeita horário inexistente e exige escolha explícita em horário ambíguo', () => {
  assert.throws(() => meetingCivilToInstant({ date: '2018-11-04', time: '00:30' }), /não existe/);
  const input = { date: '2019-02-16', time: '23:30' };
  assert.throws(() => meetingCivilToInstant(input), /ambíguo/);
  assert.equal(meetingCivilToInstant(input, { disambiguation: 'earlier' }), '2019-02-17T01:30:00.000Z');
  assert.equal(meetingCivilToInstant(input, { disambiguation: 'later' }), '2019-02-17T02:30:00.000Z');
  const iso = '2019-02-17T01:30:00.000Z';
  assert.equal(meetingCivilToInstant(meetingInstantToCivil(iso)), iso);
});

test('apresentação e conversão permanecem iguais com computador em Tóquio e Honolulu', () => {
  const moduleUrl = new URL('../src/utils/meeting-instants.js', import.meta.url).href;
  const script = `import {formatMeetingInstant,meetingCivilToInstant} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,text:formatMeetingInstant('2026-11-07T02:59:00Z'),iso:meetingCivilToInstant({date:'2026-11-07',time:'00:01'})}));`;
  for (const zone of ['Asia/Tokyo', 'Pacific/Honolulu']) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
    assert.equal(result.zone, zone);
    assert.equal(result.text, '6 de novembro de 2026 às 23:59');
    assert.equal(result.iso, '2026-11-07T03:01:00.000Z');
  }
});

test('filtros da agenda preservam parâmetros suportados e reiniciam a primeira página', () => {
  const filters = { q: 'Leitura %_ & 🐝', cicloId: '9', situacao: 'CANCELADO', sort: 'titulo', direction: 'desc', page: 2, pageSize: 6 };
  assert.deepEqual(readMeetingQuery(meetingQuery(filters)), { filters, errors: {}, valid: true });
  assert.deepEqual(readMeetingQuery(new URLSearchParams()).filters, MEETING_DEFAULTS);
  for (const changes of [{ q: 'nova' }, { cicloId: '2' }, { situacao: '' }, { sort: 'inicioEm' }, { direction: 'asc' }, { pageSize: 12 }]) assert.equal(changeMeetingFilters(filters, changes).page, 1);
  for (const query of ['sort=local', 'sort=id', 'dataInicio=2026-11-07', 'direction=ASC', 'situacao=CONCLUIDO', 'cicloId=0', 'cicloId=2147483648', 'q=a&q=b', 'page=0', 'page=01', 'pageSize=51', 'page=9007199254740991&pageSize=50', `q=${'🐝'.repeat(121)}`]) assert.equal(readMeetingQuery(new URLSearchParams(query)).valid, false, query);
});

test('agenda envia filtros com cookies e consulta livro real uma vez por ciclo da página', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (url.includes('/ciclos/')) return json({ data: cycle });
    return json({ data: [{ ...meeting, privado: true }, { ...meeting, id: 2, situacao: 'CANCELADO' }], meta: { page: 2, pageSize: 6, total: 20 } });
  } });
  const filters = { ...MEETING_DEFAULTS, q: '%_ &', cicloId: '1', situacao: 'AGENDADO', sort: 'titulo', direction: 'desc', page: 2, pageSize: 6 };
  const result = await createMeetingService(client).listMeetings(filters);
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { q: '%_ &', cicloId: '1', situacao: 'AGENDADO', sort: 'titulo', direction: 'desc', page: '2', pageSize: '6' });
  assert.deepEqual(calls.map((call) => call.url.pathname), ['/api/encontros', '/api/ciclos/1']);
  assert.ok(calls.every((call) => call.init.credentials === 'include' && !call.init.headers.has('Content-Type')));
  assert.equal(result.data[0].livro.titulo, cycle.livro.titulo);
  assert.equal(result.data[0].situacao, 'AGENDADO');
  assert.equal(result.data[1].situacao, 'CANCELADO');
  assert.equal(Object.hasOwn(result.data[0], 'privado'), false);
});

test('detalhes, vazio, resposta inesperada, 404 e cancelamento não criam dados de exemplo', async () => {
  let payload = { data: meeting }; let status = 200;
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
    calls.push(url);
    return url.includes('/ciclos/') ? json({ data: cycle }) : json(payload, status);
  } });
  const service = createMeetingService(client);
  assert.equal((await service.getMeeting('1')).livro.id, 2);
  for (const changes of [{ inicioEm: '2026-11-07T00:01' }, { situacao: 'CONCLUIDO' }, { ciclo: { ...meeting.ciclo, id: 2 } }]) {
    payload = { data: { ...meeting, ...changes } };
    await assert.rejects(service.getMeeting('1'), (error) => error.kind === 'unexpected_response');
  }
  payload = { data: [], meta: { page: 1, pageSize: 12, total: 0 } };
  assert.deepEqual((await service.listMeetings(MEETING_DEFAULTS)).data, []);
  status = 404; payload = { error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } };
  await assert.rejects(service.getMeeting('2147483647'), (error) => error.status === 404);
  for (const id of ['0', '../auth/me', 'abc']) await assert.rejects(service.getMeeting(id), (error) => error.kind === 'client');
  const controller = new AbortController(); controller.abort(); const before = calls.length;
  await assert.rejects(service.listMeetings(MEETING_DEFAULTS, { signal: controller.signal }), (error) => error.kind === 'cancelled');
  assert.equal(calls.length, before);
});
