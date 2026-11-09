import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPassportFixture } from './fixtures/passport-app.js';
import { createCatalogConnection } from './fixtures/catalog-data.js';
import { createCycleConnection } from './fixtures/cycle-data.js';
import { createMeetingConnection } from './fixtures/meeting-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createAdminDashboardService } from '../src/services/admin-dashboard.js';
import { createParticipationService } from '../src/services/participations.js';
import { createCatalogService } from '../src/services/catalog.js';

async function withDashboard(task) {
  let now = Date.parse('2026-11-09T15:00:00Z');
  const catalog = createCatalogConnection();
  const cycles = createCycleConnection({ catalogConnection: catalog, writable: true });
  const meetings = createMeetingConnection(cycles);
  catalog.books.find((b) => b.id === 2).totalPaginas = 300;
  cycles.cycles.push(...[20, 21].map((id) => ({ ...cycles.cycles[0], id, livroId: 2 })));
  meetings.meetings.splice(0, meetings.meetings.length, ...[
    ['2026-11-09T15:00:00.001Z', 'AGENDADO'], ['2026-11-09T15:00:00.000Z', 'AGENDADO'],
    ['2026-11-11T12:00:00Z', 'CANCELADO'], ['2026-11-11T12:00:00Z', 'REALIZADO'],
    ['2026-11-08T12:00:00Z', 'AGENDADO'], ['2026-11-11T12:00:00Z', 'AGENDADO'],
  ].map(([inicioEm, situacao], i) => ({ id: i + 1, cicloId: 2, titulo: `Encontro de teste ${i}`, inicioEm, situacao, local: 'Biblioteca' })));
  const fixture = await createPassportFixture({ catalogConnection: catalog, cycleConnection: cycles, meetingConnection: meetings, readingFixture: true, dashboardFixture: true, dashboardNow: () => now });
  for (const [id, situacao] of [[100, 'ATIVO'], [101, 'INATIVO'], [102, 'PENDENTE'], [103, 'ATIVO']]) fixture.users.push({ ...fixture.users[0], id, nome: `Leitor do painel ${id}`, email: `painel${id}@fixture.test`, situacao });
  fixture.readingData.rows.push(...[[1, 0], [100, 150], [101, 300]].map(([usuarioId, paginaAtual], i) => ({ id: 1000 + i, usuarioId, cicloId: 2, paginaAtual, concluidaEm: paginaAtual === 300 ? '2026-11-08T12:00:00Z' : null, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-08T12:00:00Z' })));
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
      return { client, auth, service: createAdminDashboardService(client), calls };
    };
    await task({ fixture, catalog, cycles, meetings, agent, setClock: (value) => { now = Date.parse(value); } });
  } finally { controllers.forEach((c) => c.dispose()); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fixture.close(); }
}

test('indicadores usam serviço e consultas reais: totais globais, participante inativo, conclusão exata, média e encontro estritamente futuro', async () => {
  await withDashboard(async ({ fixture, agent, catalog }) => {
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const data = await admin.service.getAdmin();
    assert.equal(data.generatedAt, '2026-11-09T15:00:00.000Z');
    assert.deepEqual(data.leitores, { ativos: 3, pendentes: 1 });
    assert.equal(data.totalLivros, 26); assert.equal(data.totalCiclos, 9); assert.equal(data.encontrosAgendadosFuturos, 2);
    assert.deepEqual(data.cicloAtual.indicadores, { participantes: 3, leiturasConcluidas: 1, taxaConclusao: 33.33, progressoMedio: 50 });
    assert.equal(data.cicloAtual.dentroDoPeriodo, true); assert.equal(data.cicloAtual.livro.totalPaginas, 300);
    assert.equal(data.livrosMaisUtilizados.meta.total, 7); assert.equal(data.livrosMaisUtilizados.data.length, 5);
    assert.deepEqual(data.livrosMaisUtilizados.data.map((b) => b.id), [2, 1, 3, 4, 5]); assert.equal(data.livrosMaisUtilizados.data[0].totalCiclos, 3);
    assert.deepEqual(data.leitoresSemParticipacao.data, [{ id: 103, nome: 'Leitor do painel 103' }]);
    assert.equal(admin.calls.at(-1).cacheControl, 'no-store'); assert.equal(admin.calls.at(-1).query, '');
    assert.equal(fixture.dashboardData.transactions.at(-1).isolationLevel, 'REPEATABLE READ'); assert.equal(fixture.dashboardData.transactions.at(-1).readOnly, true);
    const reader = agent(); await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await createParticipationService(reader.client).updatePage(2, 300);
    const updated = await admin.service.getAdmin();
    assert.deepEqual(updated.cicloAtual.indicadores, { participantes: 3, leiturasConcluidas: 2, taxaConclusao: 66.67, progressoMedio: 83.33 });
    await createCatalogService(admin.client).createBook({ titulo: 'Obra descartável do dashboard', autor: 'Autoria de teste', generoId: 1, totalPaginas: 120, anoPublicacao: null, descricao: null, capaUrl: null });
    assert.equal(catalog.books.length, 27); assert.equal((await admin.service.getAdmin()).totalLivros, 27);
  });
});

test('ciclo vazio, ausência de ciclo, período vencido e média arredondada mantêm as definições reais do backend', async () => {
  await withDashboard(async ({ fixture, agent, cycles, catalog, meetings }) => {
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    fixture.readingData.rows.splice(0);
    assert.deepEqual((await admin.service.getAdmin()).cicloAtual.indicadores, { participantes: 0, leiturasConcluidas: 0, taxaConclusao: 0, progressoMedio: 0 });
    const current = cycles.cycles.find((c) => c.id === 2); current.situacao = 'CONCLUIDO';
    const none = await admin.service.getAdmin(); assert.equal(none.cicloAtual, null); assert.equal(none.leitoresSemParticipacao.meta.total, 0); assert.equal(none.totalCiclos, 9);
    current.situacao = 'EM_ANDAMENTO'; current.dataInicio = '2020-01-01'; current.dataFim = '2020-01-31';
    const expired = await admin.service.getAdmin(); assert.equal(expired.cicloAtual.dentroDoPeriodo, false); assert.equal(expired.cicloAtual.situacao, 'EM_ANDAMENTO');
    catalog.books.find((b) => b.id === 2).totalPaginas = 20000;
    fixture.readingData.rows.push({ id: 2000, usuarioId: 1, cicloId: 2, paginaAtual: 19999, concluidaEm: null });
    assert.deepEqual((await admin.service.getAdmin()).cicloAtual.indicadores, { participantes: 1, leiturasConcluidas: 0, taxaConclusao: 0, progressoMedio: 100 });
    catalog.books.splice(0); cycles.cycles.splice(0); meetings.meetings.splice(0); fixture.readingData.rows.splice(0);
    const empty = await admin.service.getAdmin(); assert.equal(empty.cicloAtual, null); assert.equal(empty.totalLivros, 0); assert.equal(empty.totalCiclos, 0); assert.equal(empty.encontrosAgendadosFuturos, 0); assert.equal(empty.livrosMaisUtilizados.meta.total, 0);
  });
});

test('listas limitadas mantêm totais completos e não incluem administradores, pendentes ou inativos entre leitores sem participação', async () => {
  await withDashboard(async ({ fixture, agent }) => {
    for (let i = 0; i < 14; i++) fixture.users.push({ ...fixture.users[0], id: 200 + i, nome: `Sem adesão ${i}`, email: `sem${i}@fixture.test` });
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const data = await admin.service.getAdmin();
    assert.equal(data.leitores.ativos, 17); assert.equal(data.leitoresSemParticipacao.meta.total, 15); assert.equal(data.leitoresSemParticipacao.data.length, 12);
    assert.equal(data.leitoresSemParticipacao.data[0].id, 103);
    assert.deepEqual(Object.keys(data.leitoresSemParticipacao.data[0]), ['id', 'nome']);
    assert.ok(!data.leitoresSemParticipacao.data.some((r) => [2, 3, 101, 102].includes(r.id)));
    const calls = fixture.dashboardData.calls;
    assert.ok(calls.some((c) => c.bind.limite === 12)); assert.ok(calls.some((c) => c.bind.limite === 5));
    assert.equal(new Set(calls.map((c) => c.transaction)).size, 1);
  });
});

test('dashboard exige administrador ativo, recusa parâmetros, falha sem resposta parcial e invalida dados de sessão expirada', async () => {
  await withDashboard(async ({ fixture, agent }) => {
    const anonymous = agent(); await assert.rejects(anonymous.service.getAdmin(), (e) => e.status === 401);
    const reader = agent(); await reader.auth.login({ email: 'leitor@fixture.test', senha: fixture.password }); await assert.rejects(reader.service.getAdmin(), (e) => e.status === 403);
    const admin = agent(); await admin.auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    await assert.rejects(admin.client.request('dashboard/admin', { query: { page: 1 } }), (e) => e.status === 422);
    const before = await admin.service.getAdmin(); fixture.dashboardData.setScenario('unavailable'); const calls = admin.calls.length;
    await assert.rejects(admin.service.getAdmin(), (e) => e.status === 503); assert.equal(admin.calls.length, calls + 1); assert.equal(before.totalLivros, 26); assert.equal(admin.auth.getSnapshot().status, 'authenticated');
    fixture.dashboardData.setScenario('normal'); fixture.advance(31 * 60 * 1000);
    await assert.rejects(admin.service.getAdmin(), (e) => e.status === 401); assert.equal(admin.auth.getSnapshot().user, null);
  });
});
