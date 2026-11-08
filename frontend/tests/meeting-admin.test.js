import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingFormValues, meetingFormPayload, validateMeetingForm, mergeMeetingDraft, meetingWriteFeedback } from '../src/utils/meeting-form.js';
import { createMeetingService } from '../src/services/meetings.js';
import { createHttpClient } from '../src/services/http-client.js';
import { ApiError } from '../src/services/api-errors.js';

const now = Date.parse('2026-11-08T12:00:00Z');
const cycle = { id: 2, situacao: 'EM_ANDAMENTO', dataInicio: '2026-11-01', dataFim: '2026-11-30' };
const meeting = { id: 19, cicloId: 2, titulo: 'Encontro descartável', inicioEm: '2026-11-08T12:01:00.000Z', local: 'Sala de teste', descricao: null, situacao: 'AGENDADO', criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z', quantidadeInscritos: 0, ciclo: { id: 2, nome: 'Ciclo de teste', situacao: 'EM_ANDAMENTO' } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('formulário converte datetime-local de São Paulo explicitamente e respeita limites de campos e período', () => {
  const values = meetingFormValues(meeting);
  assert.equal(values.inicioLocal, '2026-11-08T09:01:00.000');
  assert.deepEqual(validateMeetingForm(values, cycle, null, now), {});
  assert.equal(meetingFormPayload(values).inicioEm, meeting.inicioEm);
  for (const [field, value] of [['titulo', ' '], ['titulo', '🐝'.repeat(121)], ['local', ''], ['local', '🐝'.repeat(181)], ['descricao', '🐝'.repeat(2001)], ['cicloId', '0'], ['inicioLocal', '2026-11-08T08:59'], ['inicioLocal', '2026-12-01T09:00'], ['inicioLocal', '2026-11-08T09:01Z']]) assert.ok(validateMeetingForm({ ...values, [field]: value }, cycle, null, now)[field], field);
  assert.ok(validateMeetingForm(values, { ...cycle, situacao: 'CONCLUIDO' }, null, now).cicloId);
  assert.deepEqual(validateMeetingForm({ ...values, titulo: '🐝'.repeat(120), local: '🐝'.repeat(180), descricao: '🐝'.repeat(2000) }, cycle, null, now), {});
});

test('PATCH descritivo omite ciclo e início inalterados, mesmo após o horário; estados finais aceitam correções de texto', () => {
  const past = { ...meeting, inicioEm: '2026-11-07T12:00:00Z' };
  for (const situacao of ['AGENDADO', 'REALIZADO', 'CANCELADO']) {
    const original = { ...past, situacao };
    const values = { ...meetingFormValues(original), titulo: ' Correção ', descricao: 'Texto\nseguro.' };
    assert.deepEqual(validateMeetingForm(values, { ...cycle, situacao: 'CONCLUIDO' }, original, now), {});
    assert.deepEqual(meetingFormPayload(values, original), { titulo: 'Correção', descricao: 'Texto\nseguro.' });
  }
  const final = { ...past, situacao: 'REALIZADO' };
  const changed = { ...meetingFormValues(final), inicioLocal: '2026-11-09T10:00', cicloId: '3' };
  const errors = validateMeetingForm(changed, { ...cycle, id: 3 }, final, now);
  assert.ok(errors.inicioLocal && errors.cicloId);
  assert.deepEqual(meetingFormPayload(meetingFormValues(meeting), meeting), {});
});

test('recarregamento mescla dados atuais sem perder campos alterados e respeita finalização concorrente', () => {
  const values = { ...meetingFormValues(meeting), titulo: 'Meu rascunho', inicioLocal: '2026-11-09T10:00' };
  const fresh = { ...meeting, local: 'Local corrigido por outro administrador' };
  const merged = mergeMeetingDraft(values, meeting, fresh);
  assert.equal(merged.titulo, 'Meu rascunho');
  assert.equal(merged.local, fresh.local);
  assert.equal(merged.inicioLocal, values.inicioLocal);
  const final = mergeMeetingDraft(values, meeting, { ...fresh, situacao: 'CANCELADO' });
  assert.equal(final.titulo, 'Meu rascunho');
  assert.equal(final.inicioLocal, meetingFormValues(fresh).inicioLocal);
});

test('serviços separam situação de formulário, usam CSRF, não reenviam o horário ao realizar e aceitam DELETE 204', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: new URL(url), init, body });
    if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return json({ data: { ...meeting, ...body } }, init.method === 'POST' ? 201 : 200);
  } });
  const service = createMeetingService(client);
  await service.createMeeting({ ...meetingFormPayload(meetingFormValues(meeting)), situacao: 'CANCELADO', id: 99 });
  await service.updateMeeting(19, { titulo: 'Corrigido', situacao: 'REALIZADO' });
  await service.setMeetingStatus(19, 'REALIZADO');
  await service.setMeetingStatus(19, 'CANCELADO');
  await assert.rejects(service.setMeetingStatus(19, 'AGENDADO'), (error) => error.kind === 'client');
  await service.deleteMeeting(19);
  const writes = calls.filter((call) => call.init.method !== 'GET');
  assert.deepEqual(writes.map((call) => call.init.method), ['POST', 'PATCH', 'PATCH', 'PATCH', 'DELETE']);
  assert.equal(Object.hasOwn(writes[0].body, 'situacao'), false);
  assert.deepEqual(writes[1].body, { titulo: 'Corrigido' });
  assert.deepEqual(writes[2].body, { situacao: 'REALIZADO' });
  assert.deepEqual(writes[3].body, { situacao: 'CANCELADO' });
  assert.ok(writes.every((call) => call.init.credentials === 'include' && call.init.headers.get('X-CSRF-Token') === 'a'.repeat(64)));
  assert.equal(writes[4].init.headers.has('Content-Type'), false);
});

test('recusa de vínculo, conflito e validação são consumíveis sem inventar a causa de um 409 genérico', () => {
  const conflict = new ApiError({ kind: 'http', status: 409, code: 'CONFLICT', message: 'Conflito.' });
  assert.equal(meetingWriteFeedback(conflict, 'realize').refreshRequired, true);
  assert.match(meetingWriteFeedback(conflict, 'realize').message, /horário deve ter chegado/);
  const linked = new ApiError({ kind: 'http', status: 409, code: 'RESOURCE_IN_USE', message: 'Em uso.' });
  assert.match(meetingWriteFeedback(linked, 'update').message, /há inscrições/);
  const invalid = new ApiError({ kind: 'http', status: 422, code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: [{ field: 'inicioEm', message: 'Valor inválido.' }] });
  assert.match(meetingWriteFeedback(invalid, 'update').fields.inicioLocal, /Valor inválido/);
});

test('falha após envio e resposta inesperada não repetem mutações nem confirmam sucesso', async () => {
  for (const mode of ['network', 'malformed', 'server']) {
    let writes = 0;
    const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => {
      if (url.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
      writes++;
      if (mode === 'network') throw new TypeError('Network');
      if (mode === 'server') return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Indisponível.' } }, 503);
      return json({ data: { id: 19 } });
    } });
    await assert.rejects(createMeetingService(client).setMeetingStatus(19, 'REALIZADO'), (error) => error.policy.outcomeUnknown && meetingWriteFeedback(error, 'realize').refreshRequired);
    assert.equal(writes, 1);
  }
});
