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
import { createParticipationService } from '../src/services/participations.js';
import { readingProgress } from '../src/utils/reading-progress.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { CYCLE_DEFAULTS } from '../src/utils/cycle-query.js';

async function withCycles(task) {
  const catalogConnection = createCatalogConnection();
  const connection = createCycleConnection({ catalogConnection, writable: true });
  const fixture = await createPassportFixture({ cycleConnection: connection, catalogConnection, readingFixture: true, seedReadings: true });
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
    await task({ connection, fixture, client, auth, service: createCycleService(client), readings: createParticipationService(client), catalog: createCatalogService(client), calls, corruptCsrf: (value) => { corrupt = value; } });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('participação começa em zero; progresso intermediário, quase final, final e redução usam serviço real e conclusão persistida', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, readings }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    assert.equal(await readings.getMine('2'), null);
    const joined = await readings.join('2');
    assert.equal(joined.paginaAtual, 0);
    assert.equal(joined.concluidaEm, null);
    assert.equal(joined.livro.totalPaginas, 20000);
    assert.equal((await readings.updatePage('2', 0)).paginaAtual, 0);
    const middle = await readings.updatePage('2', 10000);
    assert.equal(middle.percentual, 50);
    assert.equal(middle.concluida, false);
    const almost = await readings.updatePage('2', 19999);
    assert.equal(almost.percentual, 100);
    assert.equal(almost.concluida, false);
    assert.equal(almost.concluidaEm, null);
    assert.equal(readingProgress(almost.paginaAtual, almost.livro.totalPaginas).label, '99,99%');
    const final = await readings.updatePage('2', 20000);
    assert.equal(final.concluida, true);
    assert.ok(final.concluidaEm);
    assert.equal((await readings.getMine('2')).concluidaEm, final.concluidaEm);
    assert.equal((await readings.updatePage('2', 20000)).concluidaEm, final.concluidaEm);
    const reduced = await readings.updatePage('2', 123);
    assert.equal(reduced.paginaAtual, 123);
    assert.equal(reduced.concluida, false);
    assert.equal(reduced.concluidaEm, null);
    assert.equal((await readings.getMine('2')).paginaAtual, 123);
  });
});

test('duplicidade, campos extras e valores inválidos são recusados sem repetir mutações; leitor não consulta participantes', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, readings, client, calls }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await readings.join('2');
    const before = calls.length;
    await assert.rejects(readings.join('2'), (error) => error.status === 409 && error.code === 'DUPLICATE_RESOURCE');
    assert.equal(calls.length, before + 1);
    for (const body of [{ usuarioId: 99 }, { paginaAtual: 1 }, { concluidaEm: '2026-01-01T12:00:00Z' }]) await assert.rejects(client.request('ciclos/2/participacoes', { method: 'POST', body }), (error) => error.status === 422);
    for (const page of [-1, 1.5, '1', null, 20001, 2147483648]) await assert.rejects(client.request('ciclos/2/meu-progresso', { method: 'PATCH', body: { paginaAtual: page } }), (error) => error.status === 422);
    await assert.rejects(client.request('ciclos/2/meu-progresso', { method: 'PATCH', body: { paginaAtual: 1, usuarioId: 99 } }), (error) => error.status === 422);
    assert.equal((await readings.getMine('2')).paginaAtual, 0);
    await assert.rejects(readings.participants('2', 20000, { page: 1, pageSize: 12 }), (error) => error.status === 403);
    await assert.rejects(client.request('me/participacoes', { query: { usuarioId: '100' } }), (error) => error.status === 422);
    await auth.logout();
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    await assert.rejects(readings.join('2'), (error) => error.status === 403);
    await assert.rejects(readings.updatePage('2', 1), (error) => error.status === 403);
  });
});

test('ciclo planejado, encerrado ou fora do período recusa escrita; histórico e participação permanecem consultáveis', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, readings, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    for (const id of ['1', '3', '5', '6']) await assert.rejects(readings.join(id), (error) => error.status === 409);
    await readings.join('2');
    await readings.updatePage('2', 42);
    const cycle = connection.cycles.find((item) => item.id === 2);
    cycle.situacao = 'CONCLUIDO';
    await assert.rejects(readings.updatePage('2', 43), (error) => error.status === 409);
    assert.equal((await readings.getMine('2')).paginaAtual, 42);
    const history = await readings.history({ page: 1, pageSize: 50 });
    assert.ok(history.data.some((item) => item.cicloId === 2 && item.ciclo.situacao === 'CONCLUIDO' && item.paginaAtual === 42));
    cycle.situacao = 'EM_ANDAMENTO'; cycle.dataInicio = '2000-01-01'; cycle.dataFim = '2000-01-31';
    await assert.rejects(readings.updatePage('2', 0), (error) => error.status === 409);
    assert.equal((await readings.getMine('2')).paginaAtual, 42);
    cycle.dataInicio = '2099-01-01'; cycle.dataFim = '2099-01-31';
    await assert.rejects(readings.updatePage('2', 0), (error) => error.status === 409);
    assert.equal((await readings.history({ page: 1, pageSize: 50 })).meta.total, 14);
  });
});

test('histórico e participantes paginam no backend e incluem registros históricos e leitor desativado sem campos privados', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, readings, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    await readings.join('2');
    const pages = await Promise.all([1, 2, 3].map((page) => readings.history({ page, pageSize: 6 })));
    assert.ok(pages.every((page) => page.meta.total === 14));
    const history = pages.flatMap((page) => page.data);
    assert.equal(new Set(history.map((item) => item.id)).size, 14);
    assert.ok(history.some((item) => item.ciclo.situacao === 'CONCLUIDO' && item.concluida));
    assert.ok(connection.calls.some((call) => call.bind.usuario === 1 && call.bind.deslocamento === 6 && call.bind.limite === 6));
    await auth.logout();
    await auth.login({ email: 'admin@fixture.test', senha: fixture.password });
    const participants = (await Promise.all([1, 2, 3].map((page) => readings.participants('2', 20000, { page, pageSize: 6 })))).flatMap((page) => page.data);
    assert.equal(new Set(participants.map((item) => item.id)).size, 16);
    assert.ok(participants.some((item) => item.usuario.id === 114));
    assert.ok(participants.every((item) => Object.keys(item.usuario).sort().join(',') === 'id,nome'));
    assert.equal((await readings.history({ page: 1, pageSize: 12 })).meta.total, 0);
    await assert.rejects(readings.participants('2147483647', 20000, { page: 1, pageSize: 12 }), (error) => error.status === 404);
  });
});

test('CSRF, indisponibilidade e expiração preservam a política central, sem tratar falha de rede como ausência de participação', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ fixture, auth, readings, connection, corruptCsrf, calls }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    corruptCsrf(true);
    await assert.rejects(readings.join('2'), (error) => error.status === 403 && error.policy.category === 'forbidden_undetermined');
    assert.equal(await readings.getMine('2'), null);
    corruptCsrf(false);
    await readings.join('2');
    connection.setMode('unavailable');
    await assert.rejects(readings.getMine('2'), (error) => error.status === 503);
    const before = calls.length;
    await assert.rejects(readings.updatePage('2', 10), (error) => error.status === 503 && error.policy.outcomeUnknown);
    assert.equal(calls.length, before + 1);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    connection.setMode('normal');
    assert.equal((await readings.getMine('2')).paginaAtual, 0);
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(readings.getMine('2'), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().user, null);
  });
});

