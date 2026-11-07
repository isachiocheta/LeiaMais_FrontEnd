import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';
import { createCycleConnection } from './fixtures/cycle-data.js';
import { createHttpClient } from '../src/services/http-client.js';
import { createCycleService } from '../src/services/cycles.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { CYCLE_DEFAULTS } from '../src/utils/cycle-query.js';

async function withCycles(task) {
  const connection = createCycleConnection();
  const fixture = await createPassportFixture({ cycleConnection: connection });
  const server = fixture.app.listen(0, '127.0.0.1');
  let auth;
  try {
    await once(server, 'listening');
    let cookie = '';
    const calls = [];
    const client = createHttpClient({ baseUrl: `http://127.0.0.1:${server.address().port}/api`, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie().find((item) => item.startsWith('leia.fixture.sid='));
      if (received) cookie = received.split(';')[0];
      calls.push({ url: new URL(url), status: response.status });
      return response;
    } });
    auth = createAuthController(client);
    await assert.rejects(auth.verifySession(), (error) => error.status === 401);
    await task({ connection, fixture, client, auth, service: createCycleService(client), calls });
  } finally {
    auth?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
}

test('rotas reais de ciclos exigem sessão e permitem consultas a ambos os perfis', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ auth, fixture, service, connection }) => {
    await assert.rejects(service.listCycles(CYCLE_DEFAULTS), (error) => error.status === 401);
    await assert.rejects(service.getCycle('1'), (error) => error.status === 401);
    assert.equal(connection.calls.length, 0);
    for (const email of ['leitor@fixture.test', 'admin@fixture.test']) {
      await auth.login({ email, senha: fixture.password });
      assert.equal((await service.listCycles(CYCLE_DEFAULTS)).meta.total, 7);
      assert.equal((await service.getCycle('1')).situacao, 'PLANEJADO');
      await auth.logout();
    }
  });
});

test('busca, situação, ordenação e paginação são aplicadas pelo serviço real do backend', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ auth, fixture, service, client, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    const first = await service.listCycles({ ...CYCLE_DEFAULTS, pageSize: 2 });
    const second = await service.listCycles({ ...CYCLE_DEFAULTS, pageSize: 2, page: 2 });
    assert.equal(first.meta.total, 7);
    assert.equal(second.meta.total, 7);
    assert.equal(first.data.length, 2);
    assert.equal(first.data.some((cycle) => second.data.some((other) => other.id === cycle.id)), false);
    const filters = { ...CYCLE_DEFAULTS, q: ' planejado ', situacao: 'PLANEJADO', sort: 'nome', direction: 'desc', pageSize: 1 };
    const filtered = await service.listCycles(filters);
    assert.equal(filtered.meta.total, 2);
    assert.equal(filtered.data[0].id, 5);
    assert.equal((await service.listCycles({ ...filters, page: 2 })).data[0].id, 6);
    assert.ok(connection.calls.some((call) => call.bind.termo === '%planejado%' && call.bind.situacao === 'PLANEJADO' && call.sql.includes('ORDER BY c."nome" DESC')));
    for (const query of [{ sort: 'dataFim' }, { situacao: 'ATIVO' }, { livroId: '1' }, { pageSize: '51' }]) await assert.rejects(client.request('ciclos', { query }), (error) => error.status === 422);
  });
});

test('detalhes preservam planejados, em andamento, concluídos e expirados; 404, vazio e indisponibilidade são distintos', { skip: !existsSync(backendPackage) }, async () => {
  await withCycles(async ({ auth, fixture, service, connection }) => {
    await auth.login({ email: 'leitor@fixture.test', senha: fixture.password });
    assert.equal((await service.getCycle('1')).situacao, 'PLANEJADO');
    assert.equal((await service.getCycle('2')).situacao, 'EM_ANDAMENTO');
    assert.equal((await service.getCycle('3')).situacao, 'CONCLUIDO');
    const expired = await service.getCycle('4');
    assert.equal(expired.situacao, 'EM_ANDAMENTO');
    assert.equal(expired.dataFim, '2020-03-31');
    assert.ok(expired.orientacoes.includes('\nSegunda linha: <strong>texto literal</strong>.'));
    assert.equal((await service.getCycle('7')).orientacoes, null);
    await assert.rejects(service.getCycle('2147483647'), (error) => error.status === 404);
    assert.equal((await service.listCycles({ ...CYCLE_DEFAULTS, q: '%_ inexistente' })).meta.total, 0);
    connection.setMode('empty');
    assert.deepEqual((await service.listCycles(CYCLE_DEFAULTS)).data, []);
    connection.setMode('unavailable');
    await assert.rejects(service.listCycles(CYCLE_DEFAULTS), (error) => error.status === 503);
    assert.equal(auth.getSnapshot().status, 'authenticated');
    connection.setMode('normal');
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(service.getCycle('1'), (error) => error.status === 401);
    assert.equal(auth.getSnapshot().status, 'unauthenticated');
  });
});

