import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createHttpClient } from '../src/services/http-client.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createPassportFixture, backendPackage } from './fixtures/passport-app.js';

test('Passport real: credenciais, cookie, rotação de CSRF, restauração, expiração absoluta e logout 204', { skip: !existsSync(backendPackage) }, async () => {
  const fixture = await createPassportFixture();
  const server = fixture.app.listen(0, '127.0.0.1');
  let controller;
  try {
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    let cookie = '';
    const responses = [];
    const client = createHttpClient({ baseUrl, fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      const response = await fetch(url, { ...init, headers });
      const received = response.headers.getSetCookie();
      if (received.length) cookie = received.find((item) => item.startsWith('leia.fixture.sid='))?.split(';')[0] ?? cookie;
      responses.push({ path: new URL(url).pathname, status: response.status, token: headers.get('X-CSRF-Token'), cookie });
      return response;
    } });
    controller = createAuthController(client);
    await assert.rejects(controller.verifySession(), (error) => error.status === 401);
    await assert.rejects(controller.login({ email: 'leitor@fixture.test', senha: 'errada' }), (error) => error.status === 401);
    assert.equal(controller.getSnapshot().status, 'unauthenticated');
    const anonymousToken = await client.getCsrfToken();
    const anonymousCookie = cookie;
    await controller.login({ email: 'leitor@fixture.test', senha: fixture.password });
    assert.equal(controller.getSnapshot().status, 'authenticated');
    assert.equal(controller.getSnapshot().user.perfil, 'LEITOR');
    assert.notEqual(cookie, anonymousCookie);
    assert.notEqual(await client.getCsrfToken(), anonymousToken);
    const expiry = [...fixture.sessions.values()][0].sess.expiraEm;
    controller.dispose();
    controller = createAuthController(client);
    await controller.verifySession();
    assert.equal(controller.getSnapshot().status, 'authenticated');
    assert.equal([...fixture.sessions.values()][0].sess.expiraEm, expiry);
    await controller.logout();
    assert.equal(responses.findLast((item) => item.path.endsWith('/logout')).status, 204);
    assert.equal(controller.getSnapshot().status, 'unauthenticated');
    assert.equal(fixture.sessions.size, 0);
    await controller.login({ email: 'admin@fixture.test', senha: fixture.password });
    assert.equal(controller.getSnapshot().user.perfil, 'ADMIN_CLUBE');
    fixture.advance(31 * 60 * 1000);
    await assert.rejects(client.request('auth/me'), (error) => error.status === 401);
    assert.equal(controller.getSnapshot().status, 'unauthenticated');
    assert.equal(controller.getSnapshot().reason, 'expired');
  } finally {
    controller?.dispose();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fixture.close();
  }
});
