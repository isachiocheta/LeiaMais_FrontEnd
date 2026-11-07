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
import { createAuthController } from '../src/app/auth-controller.js';
import { CYCLE_DEFAULTS } from '../src/utils/cycle-query.js';

async function withCycles(task) {
  const catalogConnection = createCatalogConnection();
  const connection = createCycleConnection({ catalogConnection, writable: true });
  const fixture = await createPassportFixture({ cycleConnection: connection, catalogConnection });
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
    await task({ connection, fixture, client, auth, service: createCycleService(client), catalog: createCatalogService(client), calls, corruptCsrf: (value) => { corrupt = value; } });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

const input = (nome = 'Ciclo descartável da fixture') => ({ nome, livroId: 26, dataInicio: '2000-01-01', dataFim: '2099-12-31', orientacoes: 'Leia com atenção.\nSegunda linha.' });

test('CRUD de ciclo descartável usa rotas reais, mantém persistência em novas consultas e acessa livros além da primeira página', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, service, catalog, calls }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    assert.equal((await catalog.listBooks({ ...CATALOG_DEFAULTS, pageSize: 6 })).data.some((book) => book.id === 26), false);
    assert.equal((await catalog.listBooks({ ...CATALOG_DEFAULTS, pageSize: 6, page: 3 })).data.some((book) => book.id === 26), true);
    assert.equal((await catalog.listBooks({ ...CATALOG_DEFAULTS, q: '26' })).data[0].id, 26);
    const created = await service.createCycle(input());
    assert.equal(created.situacao, 'PLANEJADO');
    assert.equal(created.livro.id, 26);
    assert.equal((await service.getCycle(created.id)).orientacoes, input().orientacoes);
    await service.updateCycle(created.id, { nome: 'Ciclo descartável revisado', livroId: 25, orientacoes: null });
    const saved = await service.getCycle(created.id);
    assert.equal(saved.nome, 'Ciclo descartável revisado');
    assert.equal(saved.livroId, 25);
    assert.equal(saved.dataInicio, input().dataInicio);
    assert.equal(saved.orientacoes, null);
    assert.equal((await service.listCycles({ ...CYCLE_DEFAULTS, q: 'descartável revisado' })).meta.total, 1);
    await service.deleteCycle(created.id);
    assert.equal(calls.at(-1).status, 204);
    await assert.rejects(service.getCycle(created.id), (error) => error.status === 404);
    assert.equal((await service.listCycles({ ...CYCLE_DEFAULTS, q: 'descartável revisado' })).meta.total, 0);
  });
});

test('transições reais impedem saltos, reabertura, múltiplos em andamento, início fora do período e conclusão com AGENDADO', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, service, client, connection }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const first = await service.createCycle(input('Descartável A'));
    const second = await service.createCycle(input('Descartável B'));
    await assert.rejects(service.transitionCycle(first.id, 'PLANEJADO'), (error) => error.status === 409 && error.code === 'CONFLICT');
    assert.equal((await service.getCycle(first.id)).situacao, 'PLANEJADO');
    await assert.rejects(service.transitionCycle('2', 'EM_ANDAMENTO'), (error) => error.status === 409 && error.code === 'RESOURCE_IN_USE');
    connection.meetings.splice(0);
    assert.equal((await service.transitionCycle('2', 'EM_ANDAMENTO')).situacao, 'CONCLUIDO');
    for (const id of ['1', '6']) await assert.rejects(service.transitionCycle(id, 'PLANEJADO'), (error) => error.status === 409);
    await assert.rejects(client.request(`ciclos/${first.id}`, { method: 'PATCH', body: { situacao: 'CONCLUIDO' } }), (error) => error.status === 409);
    assert.equal((await service.transitionCycle(first.id, 'PLANEJADO')).situacao, 'EM_ANDAMENTO');
    await assert.rejects(service.transitionCycle(second.id, 'PLANEJADO'), (error) => error.status === 409);
    await assert.rejects(client.request(`ciclos/${first.id}`, { method: 'PATCH', body: { situacao: 'PLANEJADO' } }), (error) => error.status === 409);
    assert.equal((await service.transitionCycle(first.id, 'EM_ANDAMENTO')).situacao, 'CONCLUIDO');
    await assert.rejects(service.transitionCycle(first.id, 'PLANEJADO'), (error) => error.status === 409);
    assert.equal((await service.transitionCycle(second.id, 'PLANEJADO')).situacao, 'EM_ANDAMENTO');
    await service.transitionCycle(second.id, 'EM_ANDAMENTO');
    await service.deleteCycle(first.id);
    await service.deleteCycle(second.id);
  });
});

test('dependências reais bloqueiam exclusão, troca de livro e período que deixa encontros fora, sem remover vínculos', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, service, connection }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const cycle = await service.createCycle(input());
    connection.participations.add(cycle.id);
    await assert.rejects(service.deleteCycle(cycle.id), (error) => error.status === 409 && error.code === 'RESOURCE_IN_USE');
    await assert.rejects(service.updateCycle(cycle.id, { livroId: 25 }), (error) => error.status === 409);
    assert.ok(connection.participations.has(cycle.id));
    assert.equal((await service.getCycle(cycle.id)).livroId, 26);
    await service.updateCycle(cycle.id, { orientacoes: 'Edição permitida com vínculos.' });
    connection.meetings.push({ id: 2, cicloId: cycle.id, situacao: 'REALIZADO', inicioEm: `${civilToday()}T15:00:00Z` });
    await assert.rejects(service.updateCycle(cycle.id, { dataInicio: '2000-01-01', dataFim: '2001-01-01' }), (error) => error.status === 409 && error.code === 'CONFLICT');
    assert.equal((await service.getCycle(cycle.id)).dataFim, input().dataFim);
    assert.equal(connection.meetings.filter((meeting) => meeting.cicloId === cycle.id).length, 1);
    await service.updateCycle(cycle.id, { dataInicio: civilToday(), dataFim: civilToday() });
    assert.equal((await service.getCycle(cycle.id)).dataInicio, civilToday());
  });
});

test('mudança de outro administrador entre leitura e transição retorna 409 sem repetição e GET recupera estado atual', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, service, connection, calls }) => {
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const before = await service.getCycle('5');
    connection.cycles.find((cycle) => cycle.id === 5).situacao = 'CONCLUIDO';
    const count = calls.length;
    await assert.rejects(service.transitionCycle(before.id, before.situacao), (error) => error.status === 409);
    assert.equal(calls.length, count + 1);
    assert.equal((await service.getCycle(before.id)).situacao, 'CONCLUIDO');
  });
});

test('servidor recusa leitor, dados inválidos e CSRF; falha temporária não reenvia nem encerra sessão', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, service, client, connection, calls, corruptCsrf }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await assert.rejects(service.createCycle(input()), (error) => error.status === 403);
    await assert.rejects(service.updateCycle('1', { nome: 'Proibido' }), (error) => error.status === 403);
    await assert.rejects(service.deleteCycle('1'), (error) => error.status === 403);
    await auth.logout();
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    for (const changes of [{ nome: 'x'.repeat(121) }, { livroId: '26x' }, { livroId: 9999 }, { dataInicio: '2026-02-29' }, { dataInicio: '2099-12-31', dataFim: '2000-01-01' }, { orientacoes: '🐝'.repeat(2001) }]) await assert.rejects(service.createCycle({ ...input(), ...changes }), (error) => error.status === 422);
    await assert.rejects(client.request('ciclos', { method: 'POST', body: { ...input(), situacao: 'EM_ANDAMENTO' } }), (error) => error.status === 422);
    corruptCsrf(true);
    await assert.rejects(service.createCycle(input()), (error) => error.status === 403 && error.policy.category === 'forbidden_undetermined');
    corruptCsrf(false);
    const own = await service.createCycle(input());
    connection.setMode('unavailable');
    const before = calls.length;
    await assert.rejects(service.updateCycle(own.id, { nome: 'Falha' }), (error) => error.status === 503 && error.policy.outcomeUnknown);
    assert.equal(calls.length, before + 1);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    connection.setMode('normal');
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(service.deleteCycle(own.id), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().user, null);
  });
});

