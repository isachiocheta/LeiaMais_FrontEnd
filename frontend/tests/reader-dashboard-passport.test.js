import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPassportFixture } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createCycleConnection } from './fixtures/cycle-data.js';
import { createMeetingConnection } from './fixtures/meeting-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createReaderDashboardService } from '../src/services/reader-dashboard.js';
import { createParticipationService } from '../src/services/participations.js';
import { createRegistrationService } from '../src/services/registrations.js';
import { createMeetingService } from '../src/services/meetings.js';
import { createDashboardResource } from '../src/utils/dashboard-resource.js';

async function withReaderDashboard(task) {
  let clock = Date.parse('2026-11-11T15:00:00Z');
  const catalog = createCatalogConnection();
  const cycles = createCycleConnection({ catalogConnection: catalog, writable: true });
  const meetings = createMeetingConnection(cycles);
  const fixture = await createPassportFixture({ catalogConnection: catalog, cycleConnection: cycles, meetingConnection: meetings, readingFixture: true, seedReadings: true, dashboardFixture: true, dashboardNow: () => clock, meetingNow: () => clock });
  const server = fixture.app.listen(0, '127.0.0.1'), controllers = [];
  try {
    await once(server, 'listening');
    const agent = () => {
      let cookie = ''; const calls = [];
      const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
        const headers = new Headers(init.headers); if (cookie) headers.set('Cookie', cookie);
        const response = await fetch(url, { ...init, headers });
        const received = response.headers.getSetCookie().find((v) => v.startsWith('leia.fixture.sid=')); if (received) cookie = received.split(';')[0];
        calls.push({ path: new URL(url).pathname, query: new URL(url).search, method: init.method, status: response.status, cacheControl: response.headers.get('cache-control') });
        return response;
      } });
      const auth = createAuthController(client); controllers.push(auth);
      return { client, auth, dashboard: createReaderDashboardService(client), readings: createParticipationService(client), registrations: createRegistrationService(client), meetings: createMeetingService(client), calls };
    };
    await task({ agent, fixture, catalog, cycles, meetings, setClock: (value) => { clock = Date.parse(value); } });
  } finally { controllers.forEach((c) => c.dispose()); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fixture.close(); }
}

test('painel real distingue sem participação, página zero, progresso, conclusão e redução, sem contar somente a página do histórico', async () => {
  await withReaderDashboard(async ({ agent, fixture }) => {
    const reader = agent(); await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const before = await reader.dashboard.getMine();
    assert.equal(before.totalParticipacoes, 13); assert.equal(before.leiturasConcluidas, 7); assert.equal(before.minhaParticipacao, null);
    assert.equal(before.cicloAtual.id, 2); assert.equal(before.totalInscricoesFuturas, 0);
    await reader.readings.join(2);
    const zero = await reader.dashboard.getMine(); assert.equal(zero.totalParticipacoes, 14); assert.equal(zero.minhaParticipacao.paginaAtual, 0); assert.equal(zero.minhaParticipacao.percentual, 0);
    await reader.readings.updatePage(2, 10000);
    const progress = await reader.dashboard.getMine(); assert.equal(progress.minhaParticipacao.percentual, 50); assert.equal(progress.minhaParticipacao.concluida, false);
    await reader.readings.updatePage(2, 19999);
    const rounded = await reader.dashboard.getMine(); assert.equal(rounded.minhaParticipacao.percentual, 100); assert.equal(rounded.minhaParticipacao.concluida, false); assert.equal(rounded.leiturasConcluidas, 7);
    await reader.readings.updatePage(2, 20000);
    const done = await reader.dashboard.getMine(); assert.equal(done.minhaParticipacao.concluida, true); assert.ok(done.minhaParticipacao.concluidaEm); assert.equal(done.leiturasConcluidas, 8);
    assert.equal(done.minhaParticipacao.concluidaEm, (await reader.readings.getMine(2)).concluidaEm);
    await reader.readings.updatePage(2, 10);
    const reduced = await reader.dashboard.getMine(); assert.equal(reduced.leiturasConcluidas, 7); assert.equal(reduced.minhaParticipacao.concluidaEm, null); assert.equal(reduced.minhaParticipacao.paginaAtual, 10);
    assert.equal(reader.calls.at(-1).cacheControl, 'no-store');
    assert.ok(reader.calls.filter((c) => c.path === '/api/dashboard/me').every((c) => c.method === 'GET' && c.query === ''));
  });
});

test('sem ciclo atual preserva indicadores históricos; ciclo vencido continua EM_ANDAMENTO e bloqueia indicação de escrita', async () => {
  await withReaderDashboard(async ({ agent, fixture, cycles }) => {
    const reader = agent(); await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password }); await reader.readings.join(2);
    const cycle = cycles.cycles.find((c) => c.id === 2); cycle.situacao = 'CONCLUIDO';
    const none = await reader.dashboard.getMine(); assert.equal(none.cicloAtual, null); assert.equal(none.minhaParticipacao, null); assert.equal(none.totalParticipacoes, 14); assert.equal(none.leiturasConcluidas, 7);
    cycle.situacao = 'EM_ANDAMENTO'; cycle.dataInicio = '2020-01-01'; cycle.dataFim = '2020-01-31';
    const expired = await reader.dashboard.getMine(); assert.equal(expired.cicloAtual.situacao, 'EM_ANDAMENTO'); assert.equal(expired.cicloAtual.dentroDoPeriodo, false); assert.equal(expired.minhaParticipacao.podeAtualizarProgresso, false); assert.equal(expired.totalParticipacoes, 14);
    await assert.rejects(reader.readings.updatePage(2, 1), (e) => e.status === 409);
  });
});

test('agenda pessoal real mostra cinco dos sete encontros próprios e atualiza total após cancelamentos e alterações de situação', async () => {
  await withReaderDashboard(async ({ agent, fixture, setClock }) => {
    const reader = agent(), admin = agent();
    await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password }); await reader.readings.join(2);
    await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const meeting = await admin.meetings.createMeeting({ cicloId: 2, titulo: `Encontro descartável do painel ${i + 1}`, inicioEm: `2030-02-${String(i + 1).padStart(2, '0')}T15:00:00.000Z`, local: 'Biblioteca de teste', descricao: null });
      ids.push(meeting.id); await reader.registrations.register(meeting.id);
    }
    const data = await reader.dashboard.getMine(); assert.equal(data.totalInscricoesFuturas, 7); assert.equal(data.agendaFutura.length, 5); assert.deepEqual(data.agendaFutura.map((r) => r.encontroId), ids.slice(0, 5));
    assert.equal((await reader.registrations.agenda({ page: 1, pageSize: 12, futuros: true })).meta.total, 7);
    setClock('2030-02-01T15:00:00.000Z');
    const started = await reader.dashboard.getMine(); assert.equal(started.totalInscricoesFuturas, 6); assert.ok(!started.agendaFutura.some((r) => r.encontroId === ids[0]));
    setClock('2026-11-11T15:00:00Z'); await reader.registrations.cancel(ids[0]);
    assert.equal((await reader.dashboard.getMine()).totalInscricoesFuturas, 6);
    await admin.meetings.setMeetingStatus(ids[1], 'CANCELADO');
    const after = await reader.dashboard.getMine(); assert.equal(after.totalInscricoesFuturas, 5); assert.equal(after.agendaFutura.length, 5); assert.ok(!after.agendaFutura.some((r) => r.encontroId === ids[1]));
    assert.equal((await reader.registrations.agenda({ page: 1, pageSize: 12, futuros: true })).meta.total, 6);
    const transactions = fixture.dashboardData.calls.filter((c) => c.bind.usuario === 1);
    assert.ok(transactions.some((c) => c.bind.somenteAgendados === true && c.bind.somenteFuturos === true && c.bind.limite === 5));
  });
});

test('sessões de dois leitores recebem dados distintos; logout e novo login não reutilizam o painel anterior', async () => {
  await withReaderDashboard(async ({ agent, fixture }) => {
    const reader = agent(), other = agent();
    await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password }); await other.auth.login({ email: 'leitor100@fixture.test', senha: fixture.password });
    const a = await reader.dashboard.getMine(), b = await other.dashboard.getMine();
    assert.equal(a.totalParticipacoes, 13); assert.equal(a.minhaParticipacao, null); assert.equal(b.totalParticipacoes, 1); assert.equal(b.minhaParticipacao.concluida, true); assert.equal(b.leiturasConcluidas, 1);
    const resource = createDashboardResource(reader.dashboard.getMine); await resource.refresh(); assert.equal(resource.getSnapshot().data.totalParticipacoes, 13);
    resource.clear(); await reader.auth.logout();
    await assert.rejects(reader.dashboard.getMine(), (e) => e.status === 401);
    await reader.auth.login({ email: 'leitor100@fixture.test', senha: fixture.password });
    const next = createDashboardResource(reader.dashboard.getMine); await next.refresh();
    assert.equal(resource.getSnapshot().data, null); assert.equal(next.getSnapshot().data.totalParticipacoes, 1); assert.equal(next.getSnapshot().data.minhaParticipacao.concluida, true);
    next.clear();
  });
});

test('API pessoal recusa admin e seleção de identidade, mantém sessão em falha temporária e limpa dados privados em 401', async () => {
  await withReaderDashboard(async ({ agent, fixture }) => {
    const anonymous = agent(); await assert.rejects(anonymous.dashboard.getMine(), (e) => e.status === 401);
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password }); await assert.rejects(admin.dashboard.getMine(), (e) => e.status === 403);
    const reader = agent(); await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    for (const query of [{ usuarioId: 100 }, { page: 2 }, { futuros: true }]) await assert.rejects(reader.client.request('dashboard/me', { query }), (e) => e.status === 422);
    const resource = createDashboardResource(reader.dashboard.getMine); await resource.refresh(); const previous = resource.getSnapshot().data;
    fixture.dashboardData.setScenario('unavailable'); const before = reader.calls.length;
    await resource.refresh(); assert.equal(resource.getSnapshot().status, 'stale'); assert.equal(resource.getSnapshot().data, previous); assert.equal(reader.calls.length, before + 1); assert.equal(reader.auth.getSnapshot().status, 'authenticated');
    fixture.dashboardData.setScenario('normal'); fixture.advance(31 * 60 * 1000);
    await resource.refresh(); assert.equal(resource.getSnapshot().data, null); assert.equal(reader.auth.getSnapshot().user, null); resource.clear();
  });
});
