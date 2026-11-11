import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../src/services/profile.js';
import { createAuthController } from '../src/app/auth-controller.js';
import { createHttpClient } from '../src/services/http-client.js';
import { validatePasswordChange, validateProfileName, profileFeedback } from '../src/utils/profile-validation.js';

const user = { id: 1, nome: 'Leitora', email: 'leitor@fixture.test', perfil: 'LEITOR', situacao: 'ATIVO' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('perfil envia somente nome e troca de senha envia somente os dois campos aceitos, com sinal', async () => {
  const calls = [], signal = new AbortController().signal;
  const service = createProfileService({ request: async (path, options) => {
    calls.push({ path, options });
    return path === 'me/senha' ? { data: { reauthenticate: true } } : { data: { ...user, senhaHash: 'privado', sessionVersion: 7 } };
  } });
  assert.deepEqual(await service.getMine({ signal }), user);
  assert.deepEqual(await service.updateName({ nome: 'Outra leitora', perfil: 'ADMIN_CLUBE', email: 'outro@fixture.test', id: 999 }, { signal }), user);
  const values = { senhaAtual: '  senha atual de teste  ', novaSenha: '  nova senha de teste 🐝  ', confirmacao: 'não enviar', usuarioId: 99 };
  assert.deepEqual(await service.changePassword(values, { signal }), { reauthenticate: true });
  assert.deepEqual(calls.map((c) => c.path), ['auth/me', 'me', 'me/senha']);
  assert.deepEqual(Object.keys(calls[1].options.body), ['nome']);
  assert.deepEqual(Object.keys(calls[2].options.body), ['senhaAtual', 'novaSenha']);
  assert.ok(calls[2].options.body.senhaAtual === values.senhaAtual && calls[2].options.body.novaSenha === values.novaSenha, 'Os valores exatos devem ser preservados.');
  assert.ok(calls.every((c) => c.options.signal === signal && c.options.requiresAuth === true && !c.options.query));
});

test('resposta de senha inesperada é resultado incerto; não assume troca nem reautentica por payload inválido', async () => {
  for (const payload of [null, { data: {} }, { data: { reauthenticate: false } }]) {
    const service = createProfileService({ request: async () => payload });
    await assert.rejects(service.changePassword({}), (e) => e.kind === 'unexpected_response' && e.policy.outcomeUnknown);
  }
});

test('valida nome por caracteres Unicode após trim, sem limitar unidades UTF-16', () => {
  assert.deepEqual(validateProfileName('  Nome da leitora  '), {});
  assert.deepEqual(validateProfileName('🐝'.repeat(100)), {});
  for (const value of [' ', ' A ', 'a'.repeat(101)]) assert.ok(validateProfileName(value).nome);
});

test('senha atual aceita política antiga; nova senha exige 10 caracteres Unicode e até 72 bytes, sem normalização', () => {
  const novaSenha = 'é'.repeat(36);
  assert.deepEqual(validatePasswordChange({ senhaAtual: ' a ', novaSenha, confirmacao: novaSenha }), {});
  const spaced = '  senha nova  ';
  assert.deepEqual(validatePasswordChange({ senhaAtual: ' ', novaSenha: spaced, confirmacao: spaced }), {});
  assert.ok(validatePasswordChange({ senhaAtual: '🐝'.repeat(19), novaSenha, confirmacao: novaSenha }).senhaAtual);
  assert.ok(validatePasswordChange({ senhaAtual: 'a', novaSenha: 'é'.repeat(37), confirmacao: 'é'.repeat(37) }).novaSenha);
  assert.ok(validatePasswordChange({ senhaAtual: 'a', novaSenha: '🐝'.repeat(9), confirmacao: '🐝'.repeat(9) }).novaSenha);
  assert.ok(validatePasswordChange({ senhaAtual: 'a', novaSenha: spaced, confirmacao: spaced.trim() }).confirmacao);
  assert.ok(validatePasswordChange({ senhaAtual: 'a', novaSenha: 'é'.repeat(10), confirmacao: 'e\u0301'.repeat(10) }).confirmacao);
});

test('feedback não ecoa campos sensíveis e distingue CSRF, conflito e resultado incerto', () => {
  const feedback = profileFeedback({ status: 422, fieldErrors: { senhaAtual: ['valor sensível indevido'], novaSenha: ['outro valor indevido'] } }, { password: true });
  assert.ok(feedback.fields.senhaAtual && feedback.fields.novaSenha);
  assert.ok(!JSON.stringify(feedback).includes('indevido'));
  assert.match(profileFeedback({ status: 403 }, { password: true }).message, /segurança/);
  assert.equal(profileFeedback({ status: 409 }).conflict, true);
  const uncertain = profileFeedback({ policy: { outcomeUnknown: true } }, { password: true });
  assert.equal(uncertain.uncertain, true); assert.match(uncertain.message, /pode ter sido alterada/);
});

function authFixture(handle) {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method, signal: init.signal });
    const response = await handle?.(path, init);
    if (response !== undefined) return response;
    if (path.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    return json({ data: user });
  } });
  return { client, calls, auth: createAuthController(client) };
}

test('sucesso de nome atualiza identidade; senha atual inválida mantém sessão e não repete PATCH', async () => {
  const { auth, calls } = authFixture((path) => {
    if (path === '/api/me') return json({ data: { ...user, nome: 'Nome alterado' } });
    if (path.endsWith('/senha')) return json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: [{ field: 'senhaAtual', message: 'Valor inválido.' }] } }, 422);
  });
  await auth.verifySession();
  await auth.updateOwnName({ nome: 'Nome alterado' });
  assert.equal(auth.getSnapshot().user.nome, 'Nome alterado');
  await assert.rejects(auth.changeOwnPassword({ senhaAtual: 'incorreta', novaSenha: 'nova de teste' }), (e) => e.status === 422);
  assert.equal(auth.getSnapshot().status, 'authenticated');
  assert.equal(calls.filter((c) => c.path.endsWith('/senha')).length, 1);
  auth.dispose();
});

test('troca confirmada limpa identidade e CSRF, aborta dados privados e permite novo CSRF de login', async () => {
  let pendingSignal;
  const { auth, client, calls } = authFixture((path, init) => {
    if (path.endsWith('/senha')) return json({ data: { reauthenticate: true } });
    if (path.endsWith('/dashboard/me')) {
      pendingSignal = init.signal;
      return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    }
  });
  await auth.verifySession();
  const privateRequest = client.request('dashboard/me');
  const aborted = assert.rejects(privateRequest, (e) => e.kind === 'cancelled');
  await auth.changeOwnPassword({ senhaAtual: 'atual', novaSenha: 'nova de teste' });
  await aborted;
  assert.equal(auth.getSnapshot().status, 'unauthenticated');
  assert.equal(auth.getSnapshot().reason, 'password_changed');
  assert.equal(auth.getSnapshot().user, null);
  assert.equal(pendingSignal.aborted, true);
  await client.getCsrfToken();
  assert.equal(calls.filter((c) => c.path.endsWith('/csrf')).length, 2);
  assert.equal(calls.filter((c) => c.path.endsWith('/senha')).length, 1);
  assert.equal(calls.filter((c) => c.path.endsWith('/logout')).length, 0);
  auth.dispose();
});

test('falha de rede após envio não afirma que senha ficou igual, não repete mutação e não força logout', async () => {
  const { auth, calls } = authFixture((path) => { if (path.endsWith('/senha')) throw new TypeError('offline'); });
  await auth.verifySession();
  await assert.rejects(auth.changeOwnPassword({ senhaAtual: 'atual', novaSenha: 'nova de teste' }), (e) => e.kind === 'network' && e.policy.outcomeUnknown);
  assert.equal(auth.getSnapshot().status, 'authenticated');
  assert.equal(calls.filter((c) => c.path.endsWith('/senha')).length, 1);
  auth.reauthenticateAfterUncertainPassword();
  assert.equal(auth.getSnapshot().user, null);
  assert.equal(auth.getSnapshot().reason, 'password_change_uncertain');
  auth.dispose();
});

test('resposta antiga do perfil não restaura identidade após saída ou mudança de sessão', async () => {
  let release, started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const { auth } = authFixture((path) => {
    if (path === '/api/me') { started(); return new Promise((resolve) => { release = () => resolve(json({ data: { ...user, nome: 'Resposta antiga' } })); }); }
  });
  await auth.verifySession();
  const update = auth.updateOwnName({ nome: 'Resposta antiga' });
  const rejected = assert.rejects(update, (e) => e.kind === 'cancelled');
  await waiting; auth.reauthenticateAfterUncertainPassword(); release();
  await rejected;
  assert.equal(auth.getSnapshot().user, null);
  auth.dispose();
});
