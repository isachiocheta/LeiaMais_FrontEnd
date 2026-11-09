import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationService } from '../src/services/registrations.js';
import { registrationBlock, registrationFeedback } from '../src/utils/registration-rules.js';
import { agendaQuery, readAgendaQuery } from '../src/utils/agenda-query.js';
import { meetingChanges } from '../src/services/meeting-changes.js';

const row = (id) => ({ id, encontroId: id, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z', encontro: { id, titulo: `Encontro ${id}`, local: 'Biblioteca', inicioEm: '2026-11-09T15:00:00Z', situacao: 'AGENDADO' }, ciclo: { id: 2, nome: 'Ciclo', situacao: 'EM_ANDAMENTO', dataInicio: '2026-11-01', dataFim: '2026-11-30' }, livro: { id: 2, titulo: 'Livro', autor: 'Autoria' } });
const page = { page: 1, pageSize: 12, futuros: false };

test('consulta própria percorre todas as páginas, sem deduzir ausência na primeira, e permite cancelamento por AbortSignal', async () => {
  const calls = [];
  const service = createRegistrationService({ async request(path, options) {
    calls.push({ path, ...options });
    const p = Number(options.query.get('page'));
    return { data: Array.from({ length: p === 1 ? 50 : 1 }, (_, i) => row((p - 1) * 50 + i + 1)), meta: { page: p, pageSize: 50, total: 51 } };
  } });
  assert.equal((await service.getMine(51)).id, 51);
  assert.deepEqual(calls.map((c) => c.query.get('page')), ['1', '2']);
  assert.ok(calls.every((c) => c.path === 'me/inscricoes' && c.query.get('futuros') === 'false' && !c.query.has('encontroId') && c.requiresAuth));
  assert.equal(await service.getMine(99), null);
  const controller = new AbortController(); controller.abort();
  const before = calls.length;
  await assert.rejects(service.getMine(51, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, before);
});

test('escritas não enviam corpo nem identidade e DELETE aceita exclusivamente resposta vazia', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const service = createRegistrationService({ async request(path, options) { calls.push({ path, ...options }); return options.method === 'POST' ? { data: { ...row(9), usuarioId: 999, presenca: true } } : null; } });
  assert.equal((await service.register(9, { signal })).encontroId, 9);
  assert.equal(await service.cancel(9, { signal }), undefined);
  assert.deepEqual(calls.map((c) => [c.path, c.method, Object.hasOwn(c, 'body'), c.signal === signal]), [['encontros/9/inscricoes', 'POST', false, true], ['encontros/9/minha-inscricao', 'DELETE', false, true]]);
  const bad = createRegistrationService({ request: async () => ({ data: row(8) }) });
  await assert.rejects(bad.register(9), (e) => e.policy.outcomeUnknown);
  await assert.rejects(bad.cancel(9), (e) => e.policy.outcomeUnknown);
});

test('agenda valida paginação e DTO; consulta administrativa mantém somente campos autorizados', async () => {
  const service = createRegistrationService({ request: async () => ({ data: [row(1)], meta: page }) });
  await assert.rejects(service.agenda(page), (e) => e.kind === 'unexpected_response');
  const api = createRegistrationService({ request: async () => ({ data: [{ id: 1, encontroId: 9, criadoEm: row(1).criadoEm, usuario: { id: 7, nome: 'Leitora', email: 'omitido', senhaHash: 'omitido' } }], meta: { page: 1, pageSize: 12, total: 1 } }) });
  const result = await api.registrants(9, page);
  assert.deepEqual(result.data[0].usuario, { id: 7, nome: 'Leitora' });
  await assert.rejects(api.registrants(9, { page: 1, pageSize: 51 }));
});

test('regras visuais consideram sessão participante, situação persistida, instante exato e dia em São Paulo', () => {
  const r = row(1), meeting = { ...r.encontro, cicloId: 2 }, participation = { cicloId: 2 };
  const now = Date.parse('2026-11-08T15:00:00Z');
  assert.equal(registrationBlock(meeting, r.ciclo, participation, now), '');
  assert.match(registrationBlock(meeting, r.ciclo, null, now), /mesmo ciclo/);
  assert.match(registrationBlock(meeting, r.ciclo, { cicloId: 3 }, now), /mesmo ciclo/);
  assert.match(registrationBlock(meeting, r.ciclo, participation, Date.parse(meeting.inicioEm)), /horário/);
  for (const situacao of ['PLANEJADO', 'CONCLUIDO']) assert.match(registrationBlock(meeting, { ...r.ciclo, situacao }, participation, now), /Em andamento/);
  for (const situacao of ['CANCELADO', 'REALIZADO']) assert.match(registrationBlock({ ...meeting, situacao }, r.ciclo, participation, now), /Agendados/);
  assert.match(registrationBlock(meeting, { ...r.ciclo, dataFim: '2026-11-07' }, participation, now), /período/);
  const midnight = { ...meeting, inicioEm: '2026-11-09T02:59:00Z' };
  const singleDay = { ...r.ciclo, dataInicio: '2026-11-08', dataFim: '2026-11-08' };
  assert.equal(registrationBlock(midnight, singleDay, participation, now), '');
  assert.match(registrationBlock({ ...midnight, inicioEm: '2026-11-09T03:00:00Z' }, singleDay, participation, now), /data do encontro/);
});

test('filtros da agenda aceitam somente contrato e preservam histórico e paginação', () => {
  const filters = { page: 2, pageSize: 6, futuros: true };
  assert.deepEqual(readAgendaQuery(agendaQuery(filters)).filters, filters);
  assert.equal(readAgendaQuery(new URLSearchParams()).filters.futuros, false);
  for (const query of ['futuros=1', 'futuros=true&futuros=false', 'situacao=AGENDADO', 'usuarioId=1', 'pageSize=51', 'page=0']) assert.equal(readAgendaQuery(new URLSearchParams(query)).valid, false);
});

test('invalidação central não mantém cópias de dados privados e avisa todos os consumidores', () => {
  const seen = [];
  const first = meetingChanges.subscribe(() => seen.push('detalhes'));
  const second = meetingChanges.subscribe(() => seen.push('agenda'));
  const before = meetingChanges.snapshot(); meetingChanges.invalidate();
  assert.deepEqual(seen, ['detalhes', 'agenda']); assert.equal(meetingChanges.snapshot(), before + 1);
  first(); second(); meetingChanges.invalidate(); assert.equal(seen.length, 2);
  assert.match(registrationFeedback({ status: 403 }), /validação de segurança/);
  assert.match(registrationFeedback({ status: 409, code: 'DUPLICATE_RESOURCE' }), /já tem/);
});
