import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPassportFixture } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createCycleConnection } from './fixtures/cycle-data.js';
import { createMeetingConnection } from './fixtures/meeting-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createRegistrationService } from '../src/services/registrations.js';
import { createParticipationService } from '../src/services/participations.js';
import { createMeetingService } from '../src/services/meetings.js';

async function withRegistrations(task) {
  let clock = Date.parse('2026-11-08T12:00:00Z');
  const catalog = createCatalogConnection();
  const cycles = createCycleConnection({ catalogConnection: catalog, writable: true });
  const connection = createMeetingConnection(cycles);
  const fixture = await createPassportFixture({ catalogConnection: catalog, cycleConnection: cycles, meetingConnection: connection, meetingNow: () => clock, readingFixture: true, seedReadings: true });
  const server = fixture.app.listen(0, '127.0.0.1'); let auth;
  try {
    await once(server, 'listening');
    let cookie = '', corrupt = false;
    const calls = [];
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (corrupt && !['GET', 'HEAD'].includes(init.method)) headers.set('X-CSRF-Token', '0'.repeat(64));
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ path: new URL(url).pathname, method: init.method, body: init.body, status: response.status });
      return response;
    } });
    auth = createAuthController(client);
    await task({ cycles, connection, fixture, auth, client, calls, setClock: (v) => { clock = Date.parse(v); }, corruptCsrf: (v) => { corrupt = v; }, service: createRegistrationService(client), readings: createParticipationService(client), meetings: createMeetingService(client) });
  } finally { auth?.dispose(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fixture.close(); }
}
const filters = { page: 1, pageSize: 12, futuros: false };

test('inscrição real usa sessão e CSRF, persiste em novas consultas, duplicidade retorna 409 e cancelamento próprio retorna 204', async () => {
  await withRegistrations(async ({ auth, fixture, service, readings, meetings, calls }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    assert.equal(await service.getMine(9), null);
    await readings.join(2);
    const before = (await meetings.getMeeting(9)).quantidadeInscritos;
    const saved = await service.register(9);
    assert.equal(saved.encontroId, 9); assert.equal(saved.ciclo.id, 2);
    assert.equal((await service.getMine(9)).id, saved.id);
    assert.equal((await service.agenda(filters)).meta.total, 1);
    assert.equal((await meetings.getMeeting(9)).quantidadeInscritos, before + 1);
    const count = calls.length;
    await assert.rejects(service.register(9), (e) => e.status === 409 && e.code === 'DUPLICATE_RESOURCE');
    assert.equal(calls.length, count + 1);
    await service.cancel(9); assert.equal(calls.at(-1).status, 204);
    assert.equal(await service.getMine(9), null);
    assert.equal((await service.agenda(filters)).meta.total, 0);
    assert.equal((await meetings.getMeeting(9)).quantidadeInscritos, before);
    await assert.rejects(service.cancel(9), (e) => e.status === 404);
    assert.ok(calls.filter((c) => /\/(inscricoes|minha-inscricao)$/.test(c.path) && c.method !== 'GET').every((c) => c.body === undefined));
  });
});

test('sem participação, ciclo inválido, encontro cancelado/realizado e início exato bloqueiam inscrição e cancelamento', async () => {
  await withRegistrations(async ({ auth, fixture, service, readings, cycles, connection, setClock }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await assert.rejects(service.register(9), (e) => e.status === 403);
    await readings.join(2); await service.register(9);
    const cycle = () => cycles.cycles.find((c) => c.id === 2);
    for (const situacao of ['PLANEJADO', 'CONCLUIDO']) {
      cycle().situacao = situacao;
      await assert.rejects(service.register(12), (e) => e.status === 409);
      await assert.rejects(service.cancel(9), (e) => e.status === 409);
    }
    cycle().situacao = 'EM_ANDAMENTO'; cycle().dataFim = '2026-11-07';
    await assert.rejects(service.register(12), (e) => e.status === 409);
    cycle().dataFim = '2099-12-31';
    const meeting = () => connection.meetings.find((m) => m.id === 9);
    for (const situacao of ['CANCELADO', 'REALIZADO']) {
      meeting().situacao = situacao;
      await assert.rejects(service.cancel(9), (e) => e.status === 409);
      assert.equal((await service.getMine(9)).encontro.situacao, situacao);
    }
    meeting().situacao = 'AGENDADO'; setClock(meeting().inicioEm);
    await assert.rejects(service.cancel(9), (e) => e.status === 409);
    await assert.rejects(service.register(9), (e) => e.status === 409 && e.code === 'CONFLICT');
    assert.equal((await service.agenda(filters)).meta.total, 1);
    assert.equal((await service.agenda({ ...filters, futuros: true })).meta.total, 0);
  });
});

test('agenda pagina no servidor, mantém cancelados futuros e histórico; inscritos administrativos têm apenas identidade mínima', async () => {
  await withRegistrations(async ({ auth, fixture, service, connection, meetings }) => {
    for (let i = 1; i <= 18; i++) connection.registrations.push({ id: 2000 + i, encontroId: i, usuarioId: 1, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z' });
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const first = await service.agenda({ ...filters, pageSize: 6 });
    const second = await service.agenda({ ...filters, page: 2, pageSize: 6 });
    assert.equal(first.meta.total, 18); assert.equal(first.data.length, 6);
    assert.ok(second.data.every((r) => !first.data.some((a) => a.id === r.id)));
    const future = await service.agenda({ ...filters, pageSize: 50, futuros: true });
    assert.ok(future.data.some((r) => r.encontro.situacao === 'CANCELADO'));
    assert.ok(future.data.every((r) => Date.parse(r.encontro.inicioEm) > Date.parse('2026-11-08T12:00:00Z')));
    await assert.rejects(service.registrants(9, filters), (e) => e.status === 403);
    await auth.logout(); await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const result = await service.registrants(9, { page: 1, pageSize: 1 });
    assert.equal(result.meta.total, (await meetings.getMeeting(9)).quantidadeInscritos);
    assert.equal(result.data.length, 1);
    assert.deepEqual(Object.keys(result.data[0].usuario).sort(), ['id', 'nome']);
    assert.notEqual((await service.registrants(9, { page: 2, pageSize: 1 })).data[0].id, result.data[0].id);
    await assert.rejects(service.register(12), (e) => e.status === 403);
    await assert.rejects(service.cancel(9), (e) => e.status === 403);
    await assert.rejects(service.registrants(9999, filters), (e) => e.status === 404);
  });
});

test('segurança, indisponibilidade e sessão expirada não causam reenvio nem falsa ausência de inscrição', async () => {
  await withRegistrations(async ({ auth, fixture, service, readings, client, connection, corruptCsrf, calls }) => {
    await assert.rejects(service.agenda(filters), (e) => e.status === 401);
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password }); await readings.join(2);
    await assert.rejects(client.request('encontros/9/inscricoes', { method: 'POST', body: { usuarioId: 2 } }), (e) => e.status === 422);
    corruptCsrf(true);
    await assert.rejects(service.register(9), (e) => e.status === 403 && e.policy.category === 'forbidden_undetermined');
    corruptCsrf(false); await service.register(9);
    connection.setMode('unavailable'); const before = calls.length;
    await assert.rejects(service.cancel(9), (e) => e.status === 503 && e.policy.outcomeUnknown);
    assert.equal(calls.length, before + 1);
    await assert.rejects(service.getMine(9), (e) => e.status === 503);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    connection.setMode('normal'); assert.ok(await service.getMine(9));
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(service.cancel(9), (e) => e.status === 401);
    assert.equal(auth.getSnapshot().user, null);
  });
});
