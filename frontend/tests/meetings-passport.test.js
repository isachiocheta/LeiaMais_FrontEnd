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
  const catalogConnection = createCatalogConnection();
  const connection = createCycleConnection({ catalogConnection, writable: true });
  const meetingConnection = createMeetingConnection(connection);
  const fixture = await createPassportFixture({ cycleConnection: connection, catalogConnection, meetingConnection });
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
    await task({ connection, meetingConnection, fixture, client, auth, meetings: createMeetingService(client), service: createCycleService(client), catalog: createCatalogService(client), calls, corruptCsrf: (value) => { corrupt = value; } });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('consulta real de encontros exige sessão e está disponível para leitor e administrador', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, meetingConnection }) => {
    await assert.rejects(meetings.listMeetings(MEETING_DEFAULTS), (error) => error.status === 401);
    await assert.rejects(meetings.getMeeting('1'), (error) => error.status === 401);
    assert.equal(meetingConnection.calls.length, 0);
    for (const email of ['leitor@fixture.test', 'admin@fixture.test']) {
      await auth.login({ email, senha: fixture.password });
      assert.equal((await meetings.listMeetings(MEETING_DEFAULTS)).meta.total, 18);
      const result = await meetings.getMeeting('1');
      assert.equal(result.livro.id, 2);
      assert.equal(result.livro.titulo, 'Jardins da leitura 02');
      assert.equal(result.ciclo.id, 2);
      await auth.logout();
    }
  });
});

test('busca, ciclo, situação e ordenação combinam no backend com paginação real e instantes preservados', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, meetingConnection, client }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const first = await meetings.listMeetings({ ...MEETING_DEFAULTS, pageSize: 6 });
    const second = await meetings.listMeetings({ ...MEETING_DEFAULTS, pageSize: 6, page: 2 });
    assert.equal(first.meta.total, 18);
    assert.equal(second.data.length, 6);
    assert.equal(first.data.some((item) => second.data.some((other) => item.id === other.id)), false);
    const filters = { ...MEETING_DEFAULTS, q: ' roda ', cicloId: '2', situacao: 'AGENDADO', sort: 'titulo', direction: 'desc', pageSize: 2 };
    const combined = await meetings.listMeetings(filters);
    assert.equal(combined.meta.total, 5);
    assert.deepEqual(combined.data.map((meeting) => meeting.id), [9, 6]);
    assert.deepEqual((await meetings.listMeetings({ ...filters, page: 2 })).data.map((meeting) => meeting.id), [3, 2]);
    assert.ok(meetingConnection.calls.some((call) => call.bind.termo === '%roda%' && call.bind.ciclo === 2 && call.bind.situacao === 'AGENDADO' && call.sql.includes('ORDER BY e."titulo" DESC')));
    const beforeMidnight = await meetings.getMeeting('1');
    const afterMidnight = await meetings.getMeeting('2');
    assert.equal(formatMeetingInstant(beforeMidnight.inicioEm), '6 de novembro de 2026 às 23:59');
    assert.equal(formatMeetingInstant(afterMidnight.inicioEm), '7 de novembro de 2026 às 00:01');
    assert.equal(beforeMidnight.situacao, 'AGENDADO');
    const cancelled = await meetings.getMeeting('4');
    assert.equal(cancelled.situacao, 'CANCELADO');
    assert.ok(cancelled.descricao.includes('\n<b>Texto literal, sem HTML.</b>'));
    assert.equal((await meetings.getMeeting('5')).situacao, 'REALIZADO');
    for (const query of [{ sort: 'local' }, { sort: 'id' }, { cicloId: '0' }, { situacao: 'CONCLUIDO' }, { dataInicio: '2026-11-07' }, { pageSize: '51' }]) await assert.rejects(client.request('encontros', { query }), (error) => error.status === 422);
  });
});

test('vazio, nenhum resultado, encontro inexistente, relação indisponível e falha de conexão não são confundidos', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, meetings, meetingConnection, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    assert.equal((await meetings.listMeetings({ ...MEETING_DEFAULTS, q: '%_ sem resultado' })).meta.total, 0);
    await assert.rejects(meetings.getMeeting('2147483647'), (error) => error.status === 404);
    meetingConnection.setMode('empty');
    assert.deepEqual((await meetings.listMeetings(MEETING_DEFAULTS)).data, []);
    meetingConnection.setMode('unavailable');
    await assert.rejects(meetings.listMeetings(MEETING_DEFAULTS), (error) => error.status === 503);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    meetingConnection.setMode('normal'); connection.setMode('unavailable');
    await assert.rejects(meetings.getMeeting('1'), (error) => error.status === 503);
    connection.setMode('normal');
    assert.equal((await meetings.getMeeting('1')).livro.id, 2);
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(meetings.getMeeting('1'), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().user, null);
  });
});

