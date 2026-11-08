import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';
import { createCycleConnection } from './fixtures/cycle-data.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createCatalogService } from '../src/services/catalog.js';
import { CATALOG_DEFAULTS } from '../src/utils/catalog-query.js';
import { civilToday } from '../src/utils/civil-dates.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createCycleService } from '../src/services/cycles.js';
import { createMeetingConnection } from './fixtures/meeting-data.js';
import { createMeetingService } from '../src/services/meetings.js';
import { MEETING_DEFAULTS } from '../src/utils/meeting-query.js';
import { formatMeetingInstant } from '../src/utils/meeting-instants.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { CYCLE_DEFAULTS } from '../src/utils/cycle-query.js';

async function withCycles(task) {
  let meetingClock = Date.parse('2026-11-08T12:00:00Z');
  const catalogConnection = createCatalogConnection();
  const connection = createCycleConnection({ catalogConnection, writable: true });
  const meetingConnection = createMeetingConnection(connection);
  const fixture = await createPassportFixture({ cycleConnection: connection, catalogConnection, meetingConnection, meetingNow: () => meetingClock });
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
      if (corrupt && !['GET', 'HEAD'].includes(init.method)) headers.set('X-CSRF-Token', '0'.repeat(64));
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ url: new URL(url), method: init.method, status: response.status });
      return response;
    } });
    auth = createAuthController(client);
    await assert.rejects(auth.verifySession(), (error) => error.status === 401);
    await task({ setMeetingClock: (value) => { meetingClock = Date.parse(value); }, connection, meetingConnection, fixture, client, auth, meetings: createMeetingService(client), service: createCycleService(client), catalog: createCatalogService(client), calls, corruptCsrf: (value) => { corrupt = value; } });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

const input = (titulo = 'Encontro descartável da fixture') => ({ cicloId: 2, titulo, inicioEm: '2026-11-08T12:01:00.000Z', local: 'Sala descartável de teste', descricao: 'Primeira linha.\nSegunda linha.' });

test('CRUD real de encontro descartável persiste após consultas, permite reagendar e remove inscrições por cascata ao excluir', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, service, meetingConnection, calls }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const created = await meetings.createMeeting(input());
    assert.equal(created.situacao, 'AGENDADO');
    assert.equal((await meetings.getMeeting(created.id)).inicioEm, input().inicioEm);
    await meetings.updateMeeting(created.id, { titulo: 'Encontro descartável revisado', cicloId: 1, inicioEm: '2099-01-10T03:30:00.123Z', local: 'Novo local', descricao: null });
    const saved = await meetings.getMeeting(created.id);
    assert.equal(saved.cicloId, 1); assert.equal(saved.local, 'Novo local'); assert.equal(saved.descricao, null);
    assert.equal(formatMeetingInstant(saved.inicioEm), '10 de janeiro de 2099 às 00:30');
    meetingConnection.registrations.push({ id: 999, encontroId: created.id, usuarioId: 1 });
    assert.equal((await meetings.getMeeting(created.id)).quantidadeInscritos, 1);
    await meetings.deleteMeeting(created.id);
    assert.equal(calls.at(-1).status, 204);
    assert.equal(meetingConnection.registrations.some((row) => row.encontroId === created.id), false);
    await assert.rejects(meetings.getMeeting(created.id), (error) => error.status === 404);
    assert.equal((await meetings.listMeetings({ ...MEETING_DEFAULTS, q: 'descartável revisado' })).meta.total, 0);
    assert.equal((await service.getCycle('1')).id, 1);
  });
});

test('realização só é aceita a partir do instante exato e correções descritivas posteriores não exigem novo horário futuro', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, client, setMeetingClock }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const own = await meetings.createMeeting(input());
    await assert.rejects(meetings.setMeetingStatus(own.id, 'REALIZADO'), (error) => error.status === 409);
    setMeetingClock('2026-11-08T12:01:00.000Z');
    assert.equal((await meetings.setMeetingStatus(own.id, 'REALIZADO')).situacao, 'REALIZADO');
    setMeetingClock('2026-11-08T13:00:00.000Z');
    await meetings.updateMeeting(own.id, { titulo: 'Correção após realização', local: 'Local corrigido', descricao: 'Correção permitida.' });
    const saved = await meetings.getMeeting(own.id);
    assert.equal(saved.titulo, 'Correção após realização'); assert.equal(saved.inicioEm, own.inicioEm);
    await assert.rejects(meetings.updateMeeting(own.id, { inicioEm: '2026-11-09T12:00:00Z' }), (error) => error.status === 409);
    await assert.rejects(client.request(`encontros/${own.id}`, { method: 'PATCH', body: { situacao: 'AGENDADO' } }), (error) => error.status === 409);
    await assert.rejects(meetings.setMeetingStatus(own.id, 'CANCELADO'), (error) => error.status === 409);
    await meetings.deleteMeeting(own.id);
  });
});

test('cancelamento mantém inscrições; estados finais bloqueiam reabertura e troca, mas permitem correções', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, meetingConnection, client }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const own = await meetings.createMeeting(input());
    meetingConnection.registrations.push({ id: 999, encontroId: own.id, usuarioId: 1 });
    await assert.rejects(meetings.updateMeeting(own.id, { cicloId: 1, inicioEm: '2099-01-10T12:00:00Z' }), (error) => error.status === 409 && error.code === 'RESOURCE_IN_USE');
    assert.equal((await meetings.getMeeting(own.id)).cicloId, 2);
    assert.equal((await meetings.setMeetingStatus(own.id, 'CANCELADO')).situacao, 'CANCELADO');
    assert.equal((await meetings.getMeeting(own.id)).quantidadeInscritos, 1);
    await meetings.updateMeeting(own.id, { descricao: 'Informação corrigida após cancelamento.' });
    await assert.rejects(client.request(`encontros/${own.id}`, { method: 'PATCH', body: { situacao: 'AGENDADO' } }), (error) => error.status === 409);
    await assert.rejects(meetings.updateMeeting(own.id, { cicloId: 1 }), (error) => error.status === 409);
    await meetings.deleteMeeting(own.id);
  });
});

test('criação e reagendamento recusam ciclo concluído, passado e período inválido; conflito concorrente não altera o registro', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, meetingConnection, calls }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    await assert.rejects(meetings.createMeeting({ ...input(), cicloId: 3 }), (error) => error.status === 409);
    for (const inicioEm of ['2026-11-08T12:00:00Z', '2026-11-07T12:00:00Z', '2100-01-01T12:00:00Z']) await assert.rejects(meetings.createMeeting({ ...input(), inicioEm }), (error) => error.status === 422);
    const own = await meetings.createMeeting(input());
    await assert.rejects(meetings.updateMeeting(own.id, { cicloId: 3 }), (error) => error.status === 409);
    await assert.rejects(meetings.updateMeeting(own.id, { inicioEm: '2026-11-07T12:00:00Z' }), (error) => error.status === 422);
    await meetings.setMeetingStatus(own.id, 'CANCELADO');
    const count = calls.length;
    await assert.rejects(meetings.updateMeeting(own.id, { titulo: 'Rascunho ainda aberto', inicioEm: '2026-11-09T12:00:00Z' }), (error) => error.status === 409);
    assert.equal(calls.length, count + 1);
    const fresh = await meetings.getMeeting(own.id);
    assert.equal(fresh.situacao, 'CANCELADO'); assert.equal(fresh.titulo, own.titulo);
    assert.ok(meetingConnection.meetings.some((meeting) => meeting.id === own.id));
  });
});

test('servidor recusa leitor, campos inválidos e CSRF; indisponibilidade não reenvia mutações nem encerra sessão', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, client, meetingConnection, corruptCsrf, calls }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await assert.rejects(meetings.createMeeting(input()), (error) => error.status === 403);
    await assert.rejects(meetings.updateMeeting('1', { titulo: 'Proibido' }), (error) => error.status === 403);
    await assert.rejects(meetings.setMeetingStatus('1', 'REALIZADO'), (error) => error.status === 403);
    await assert.rejects(meetings.deleteMeeting('1'), (error) => error.status === 403);
    await auth.logout(); await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    for (const change of [{ titulo: '🐝'.repeat(121) }, { local: 'x'.repeat(181) }, { descricao: 'x'.repeat(2001) }, { inicioEm: '2026-11-08T12:01' }, { cicloId: 9999 }]) await assert.rejects(meetings.createMeeting({ ...input(), ...change }), (error) => error.status === 422);
    await assert.rejects(client.request('encontros', { method: 'POST', body: { ...input(), situacao: 'REALIZADO' } }), (error) => error.status === 422);
    corruptCsrf(true);
    await assert.rejects(meetings.createMeeting(input()), (error) => error.status === 403 && error.policy.category === 'forbidden_undetermined');
    corruptCsrf(false);
    const own = await meetings.createMeeting(input());
    meetingConnection.setMode('unavailable'); const count = calls.length;
    await assert.rejects(meetings.updateMeeting(own.id, { titulo: 'Falha temporária' }), (error) => error.status === 503 && error.policy.outcomeUnknown);
    assert.equal(calls.length, count + 1); assert.equal(auth.getSnapshot().status, 'authenticated');
    meetingConnection.setMode('normal'); fixture.advance(31 * 60 * 1000);
    await assert.rejects(meetings.deleteMeeting(own.id), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().user, null);
  });
});

