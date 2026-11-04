import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration } from '../src/utils/registration-validation.js';
import { createRegistrationService, registrationFeedback } from '../src/services/registration.js';
import { createHttpClient } from '../src/services/http-client.js';
import { ApiError } from '../src/services/api-errors.js';

const valid = () => ({ nome: 'Pessoa da fixture', email: 'cadastro@fixture.test', senha: '  Leitura de teste 🐝  ', confirmacao: '  Leitura de teste 🐝  ' });
const account = { id: 4, nome: 'Pessoa da fixture', email: 'cadastro@fixture.test', perfil: 'LEITOR', situacao: 'PENDENTE' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(handle) {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, init });
    if (path.endsWith('/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } });
    return handle?.(init) ?? json({ data: account }, 201);
  } });
  return { client, calls, service: createRegistrationService(client) };
}

test('cadastro valida nome por caracteres Unicode e limites após trim', () => {
  for (const nome of [' a ', ' '.repeat(10), 'a'.repeat(101), '🐝'.repeat(101)]) assert.ok(validateRegistration({ ...valid(), nome }).nome);
  for (const nome of [' ab ', 'a'.repeat(100), '🐝'.repeat(100)]) assert.equal(validateRegistration({ ...valid(), nome }).nome, undefined);
});

test('cadastro limita e-mail a 254 caracteres e exige formato válido', () => {
  const emailAtLimit = `${'a'.repeat(64)}@${'a'.repeat(63)}.${'a'.repeat(63)}.${'a'.repeat(57)}.com`;
  for (const email of ['', 'inválido', 'a@', emailAtLimit + 'x']) assert.ok(validateRegistration({ ...valid(), email }).email);
  assert.equal(validateRegistration({ ...valid(), email: '  PESSOA@EXAMPLE.TEST  ' }).email, undefined);
  assert.equal(validateRegistration({ ...valid(), email: emailAtLimit }).email, undefined);
});

test('senha de cadastro conta caracteres e bytes UTF-8 de forma independente', () => {
  for (const senha of ['a'.repeat(9), 'a'.repeat(73), 'é'.repeat(37), '🐝'.repeat(9), '🐝'.repeat(19)]) {
    assert.ok(validateRegistration({ ...valid(), senha, confirmacao: senha }).senha);
  }
  for (const senha of ['a'.repeat(10), 'a'.repeat(72), 'é'.repeat(36), '🐝'.repeat(10), '🐝'.repeat(18), ' '.repeat(10)]) {
    assert.equal(validateRegistration({ ...valid(), senha, confirmacao: senha }).senha, undefined);
  }
});

test('confirmação compara a senha exata, sem trim ou normalização Unicode', () => {
  assert.deepEqual(validateRegistration(valid()), {});
  assert.ok(validateRegistration({ ...valid(), confirmacao: '' }).confirmacao);
  assert.ok(validateRegistration({ ...valid(), confirmacao: valid().senha.trim() }).confirmacao);
  assert.ok(validateRegistration({ ...valid(), senha: 'é'.repeat(10), confirmacao: 'e\u0301'.repeat(10) }).confirmacao);
});

test('cadastro envia somente nome, e-mail e senha intactos, com CSRF e cookies, sem login automático', async () => {
  const { service, calls, client } = setup();
  let unauthorized = false;
  client.subscribeUnauthorized(() => { unauthorized = true; });
  const data = { ...valid(), perfil: 'ADMIN_CLUBE', situacao: 'ATIVO', id: 99 };
  const signal = new AbortController().signal;
  assert.equal(await service.register(data, { signal }), undefined);
  assert.deepEqual(calls.map((call) => call.path), ['/api/auth/csrf', '/api/auth/cadastro']);
  const request = calls[1].init;
  const body = JSON.parse(request.body);
  assert.deepEqual(Object.keys(body).sort(), ['email', 'nome', 'senha']);
  assert.equal(body.senha === data.senha, true, 'A senha deve permanecer intacta.');
  assert.equal(request.credentials, 'include');
  assert.equal(request.headers.get('X-CSRF-Token'), 'a'.repeat(64));
  assert.equal(unauthorized, false);
});

test('e-mail duplicado recebe orientação e erro de campo sem tratar todo 409 como duplicidade', async () => {
  const { service } = setup(() => json({ error: { code: 'DUPLICATE_RESOURCE', message: 'Já existe um registro com esses dados.' } }, 409));
  await assert.rejects(service.register(valid()), (error) => {
    const feedback = registrationFeedback(error);
    assert.match(feedback.message, /Já existe um cadastro/);
    assert.match(feedback.fields.email, /já possui cadastro/);
    return true;
  });
  const conflict = new ApiError({ kind: 'http', status: 409, code: 'CONFLICT', message: 'Conflito.' });
  assert.equal(registrationFeedback(conflict).fields.email, undefined);
});

test('422 preserva erros de campo consumíveis pelo formulário', async () => {
  const { service } = setup(() => json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: [{ field: 'nome', message: 'Valor inválido.' }, { field: 'senha', message: 'Valor inválido.' }] } }, 422));
  await assert.rejects(service.register(valid()), (error) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(registrationFeedback(error).fields, { nome: 'Valor inválido.', senha: 'Valor inválido.' });
    return true;
  });
});

test('CSRF recusado não repete POST; novo envio explícito obtém CSRF novamente', async () => {
  let fail = true;
  const { service, calls } = setup(() => fail ? json({ error: { code: 'FORBIDDEN', message: 'Acesso não permitido.' } }, 403) : undefined);
  await assert.rejects(service.register(valid()), (error) => {
    assert.match(registrationFeedback(error).message, /segurança/);
    assert.equal(error.policy.category, 'csrf');
    return true;
  });
  assert.equal(calls.filter((call) => call.path.endsWith('/cadastro')).length, 1);
  fail = false;
  await service.register(valid());
  assert.equal(calls.filter((call) => call.path.endsWith('/csrf')).length, 2);
});

test('rede, 503 ou resposta inesperada não repetem cadastro nem anunciam sucesso', async () => {
  for (const kind of ['network', 'server', 'unexpected']) {
    const { service, calls } = setup(() => {
      if (kind === 'network') throw new TypeError('Falha interna da fixture.');
      if (kind === 'server') return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço temporariamente indisponível.' } }, 503);
      return json({ data: { ...account, situacao: 'ATIVO' } }, 201);
    });
    await assert.rejects(service.register(valid()), (error) => {
      assert.equal(error.policy.outcomeUnknown, true);
      assert.match(registrationFeedback(error).message, /pode ter sido concluída/);
      assert.equal(registrationFeedback(error).message.includes('interna da fixture'), false);
      return true;
    });
    assert.equal(calls.filter((call) => call.path.endsWith('/cadastro')).length, 1);
  }
});

test('falha antes do CSRF não envia cadastro e cancelamento não vira erro de validação', async () => {
  const calls = [];
  const client = createHttpClient({ baseUrl: 'http://fixture.invalid/api', fetchImpl: async (url) => { calls.push(url); throw new TypeError(); } });
  const service = createRegistrationService(client);
  await assert.rejects(service.register(valid()), (error) => error.kind === 'network' && !error.policy.outcomeUnknown);
  assert.equal(calls.length, 1);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(service.register(valid(), { signal: abort.signal }), (error) => error.kind === 'cancelled');
  assert.equal(calls.length, 1);
});
