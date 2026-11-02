import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../src/services/http-client.js';
import { ApiError } from '../src/services/api-errors.js';
import { normalizeApiBaseUrl } from '../src/services/api-url.js';
import { createConnectionService } from '../src/services/connection.js';

const TOKEN = 'a'.repeat(64);
const BASE = 'http://localhost:3000/api';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const detail = (data) => json({ data });
const failure = (status, code, message = 'Recusa da API.', fields) => json({ error: { code, message, fields } }, status);

function setup(handler, options = {}) {
  const calls = [];
  const client = createHttpClient({
    baseUrl: BASE,
    ...options,
    fetchImpl: async (url, init) => {
      const call = { url: new URL(url), ...init };
      calls.push(call);
      if (call.url.pathname === '/api/auth/csrf') return detail({ csrfToken: TOKEN });
      return handler(call);
    },
  });
  return { client, calls };
}

function abortable(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('JSON de detalhe, cookies, URLSearchParams e ausência de Content-Type no GET', async () => {
  const { client, calls } = setup(() => detail({ id: 7 }));
  assert.deepEqual(await client.request('/livros', { query: { q: 'ação & leitura', page: 2, ativo: false, generoId: [1, 2], ausente: null } }), { data: { id: 7 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].credentials, 'include');
  assert.equal(calls[0].url.pathname, '/api/livros');
  assert.equal(calls[0].url.searchParams.get('q'), 'ação & leitura');
  assert.deepEqual(calls[0].url.searchParams.getAll('generoId'), ['1', '2']);
  assert.equal(calls[0].url.searchParams.get('ativo'), 'false');
  assert.equal(calls[0].url.searchParams.has('ausente'), false);
  assert.equal(calls[0].headers.has('Content-Type'), false);
  assert.equal(calls[0].headers.has('X-CSRF-Token'), false);
});

test('preserva lista, paginação e parâmetros já construídos', async () => {
  const payload = { data: [], meta: { page: 1, pageSize: 10, total: 0 } };
  const { client, calls } = setup(() => json(payload));
  assert.deepEqual(await client.request('livros', { query: new URLSearchParams('q=a+b&page=1') }), payload);
  assert.equal(calls[0].url.searchParams.get('q'), 'a b');
});

test('204 não tenta interpretar JSON; DELETE não recebe Content-Type', async () => {
  const { client, calls } = setup(() => ({ ok: true, status: 204, json: () => assert.fail('JSON não deve ser lido') }));
  assert.equal(await client.request('livros/1', { method: 'DELETE' }), null);
  assert.equal(calls[1].headers.has('Content-Type'), false);
  assert.equal(calls[1].headers.get('X-CSRF-Token'), TOKEN);
});

test('envia corpo JSON e token CSRF com cookies', async () => {
  const { client, calls } = setup(() => detail({ id: 2 }));
  await client.request('livros', { method: 'POST', body: { titulo: 'Livro' } });
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.credentials, 'include');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.has('Content-Type'), false);
  assert.equal(calls[1].headers.get('Content-Type'), 'application/json');
  assert.equal(calls[1].headers.get('X-CSRF-Token'), TOKEN);
  assert.deepEqual(JSON.parse(calls[1].body), { titulo: 'Livro' });
});

test('FormData mantém boundary sob controle do navegador', async () => {
  const body = new FormData();
  body.set('arquivo', 'teste');
  const { client, calls } = setup(() => detail({ ok: true }));
  await client.request('livros', { method: 'POST', body, headers: { 'Content-Type': 'multipart/form-data' } });
  assert.equal(calls[1].body, body);
  assert.equal(calls[1].headers.has('Content-Type'), false);
});

test('422 preserva code, message, fields e agrupa erros para formulários', async () => {
  const fields = [{ field: 'nome', message: 'Valor inválido.' }, { field: 'nome', message: 'Informe outro valor.' }, { field: 'email', message: 'Valor inválido.' }];
  const { client } = setup(() => failure(422, 'VALIDATION_ERROR', 'Dados inválidos.', fields));
  await assert.rejects(client.request('auth/cadastro', { method: 'POST', body: {} }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, 'http');
    assert.equal(error.status, 422);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.message, 'Dados inválidos.');
    assert.deepEqual(error.fields, fields);
    assert.deepEqual(error.fieldErrors.nome, ['Valor inválido.', 'Informe outro valor.']);
    assert.equal(error.policy.category, 'validation');
    return true;
  });
});

test('ignora propriedades de erro fora do contrato e protege mapas de campos', async () => {
  const { client } = setup(() => json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', fields: [{ field: '__proto__', message: 'Valor inválido.' }], kind: 'network', status: 200, method: 'GET', requestSent: false } }, 422));
  await assert.rejects(client.request('livros', { method: 'POST', body: {} }), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.kind, 'http');
    assert.equal(Object.getPrototypeOf(error.fieldErrors), null);
    assert.deepEqual(error.fieldErrors.__proto__, ['Valor inválido.']);
    return true;
  });
});

test('falha de rede não se confunde com erro HTTP nem expõe a causa interna', async () => {
  const { client, calls } = setup(() => { throw new TypeError('detalhe interno privado'); });
  await assert.rejects(client.request('health'), (error) => {
    assert.equal(error.kind, 'network');
    assert.equal(error.status, null);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.message.includes('privado'), false);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('cancelamento antes do envio não inicia nenhuma requisição', async () => {
  const { client, calls } = setup(() => detail({ ok: true }));
  const controller = new AbortController();
  controller.abort(new Error('motivo privado'));
  await assert.rejects(client.request('livros', { method: 'POST', body: {}, signal: controller.signal }), (error) => error.kind === 'cancelled' && !error.policy.outcomeUnknown && !error.message.includes('privado'));
  assert.equal(calls.length, 0);
});

test('cancelamento durante fetch é distinguido de rede', async () => {
  const controller = new AbortController();
  const { client, calls } = setup(({ signal }) => abortable(signal));
  const pending = client.request('health', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.kind === 'cancelled' && error.code === 'REQUEST_ABORTED');
  assert.equal(calls.length, 1);
});

test('cancelamento de uma mutação enviada sinaliza resultado desconhecido, sem repetir', async () => {
  const controller = new AbortController();
  const { client, calls } = setup(({ signal }) => { controller.abort(); return abortable(signal); });
  await assert.rejects(client.request('livros', { method: 'POST', body: {}, signal: controller.signal }), (error) => error.kind === 'cancelled' && error.policy.outcomeUnknown);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('timeout encerra a espera e não repete a mutação', async () => {
  const { client, calls } = setup(({ signal }) => abortable(signal), { timeoutMs: 15 });
  await assert.rejects(client.request('livros', { method: 'PATCH', body: {} }), (error) => error.kind === 'timeout' && error.policy.outcomeUnknown);
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
});

for (const [name, response] of [
  ['HTML', () => new Response('<html>SQL privado</html>', { headers: { 'Content-Type': 'text/html' } })],
  ['JSON inválido', () => new Response('{SQL privado', { headers: { 'Content-Type': 'application/json' } })],
  ['envelope inválido', () => json({ stack: 'SQL privado' })],
  ['erro inválido', () => json({ message: 'SQL privado' }, 500)],
]) {
  test(`resposta inesperada: ${name}, sem exposição de conteúdo`, async () => {
    const { client } = setup(response);
    await assert.rejects(client.request('health'), (error) => error.kind === 'unexpected_response' && error.code === 'UNEXPECTED_RESPONSE' && !JSON.stringify(error).includes('SQL privado'));
  });
}

test('cancelamento ao ler o corpo não é erro de JSON', async () => {
  const controller = new AbortController();
  const { client } = setup(({ signal }) => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => { controller.abort(); return abortable(signal); } }));
  await assert.rejects(client.request('health', { signal: controller.signal }), (error) => error.kind === 'cancelled');
});

for (const [status, code, category] of [
  [401, 'UNAUTHORIZED', 'authentication'], [403, 'FORBIDDEN', 'forbidden_undetermined'],
  [409, 'RESOURCE_IN_USE', 'conflict'], [422, 'INVALID_REFERENCE', 'validation'],
  [429, 'TOO_MANY_REQUESTS', 'rate_limit'], [500, 'INTERNAL_ERROR', 'server'], [503, 'SERVICE_UNAVAILABLE', 'server'],
]) {
  test(`política central para ${status} sem repetição automática`, async () => {
    const { client, calls } = setup(() => failure(status, code));
    await assert.rejects(client.request('livros/1', { method: 'DELETE' }), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.policy.category, category);
      assert.equal(error.policy.automaticRetry, false);
      return true;
    });
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
  });
}

test('403 de login/cadastro identifica CSRF pelo contrato, sem concluir falta de perfil', async () => {
  const { client } = setup(() => failure(403, 'FORBIDDEN', 'Acesso não permitido.'));
  for (const path of ['auth/login', 'auth/cadastro']) {
    await assert.rejects(client.request(path, { method: 'POST', body: {} }), (error) => error.policy.category === 'csrf');
  }
});

test('falha de rede em POST enviado informa resultado desconhecido sem reenvio', async () => {
  const { client, calls } = setup(() => { throw new TypeError('rede'); });
  await assert.rejects(client.request('livros', { method: 'POST', body: {} }), (error) => error.policy.outcomeUnknown && error.policy.automaticRetry === false);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('CSRF inicial é compartilhado entre consumidores e mutações concorrentes', async () => {
  let release;
  const calls = [];
  const client = createHttpClient({ baseUrl: BASE, fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith('/auth/csrf')) return new Promise((resolve) => { release = () => resolve(detail({ csrfToken: TOKEN })); });
    return detail({ ok: true });
  } });
  const token = client.getCsrfToken();
  const first = client.request('livros', { method: 'POST', body: {} });
  const second = client.request('ciclos', { method: 'POST', body: {} });
  assert.equal(calls.length, 1);
  release();
  await Promise.all([token, first, second]);
  assert.equal(calls.filter((call) => call.url.endsWith('/auth/csrf')).length, 1);
  assert.equal(await client.getCsrfToken(), TOKEN);
  assert.equal(calls.length, 3);
});

test('cancelar consumidor de CSRF não cancela a requisição compartilhada', async () => {
  let release;
  let count = 0;
  const client = createHttpClient({ baseUrl: BASE, fetchImpl: async () => { count += 1; return new Promise((resolve) => { release = () => resolve(detail({ csrfToken: TOKEN })); }); } });
  const controller = new AbortController();
  const first = client.getCsrfToken({ signal: controller.signal });
  const second = client.getCsrfToken();
  controller.abort();
  await assert.rejects(first, (error) => error.kind === 'cancelled');
  release();
  assert.equal(await second, TOKEN);
  assert.equal(count, 1);
});

test('falha ao obter CSRF não envia a mutação nem repete o GET', async () => {
  let count = 0;
  const client = createHttpClient({ baseUrl: BASE, fetchImpl: async () => { count += 1; throw new TypeError('rede'); } });
  await assert.rejects(client.request('livros', { method: 'POST', body: {} }), (error) => error.kind === 'network' && !error.policy.outcomeUnknown);
  assert.equal(count, 1);
});

test('token CSRF malformado não é usado em mutação', async () => {
  let count = 0;
  const client = createHttpClient({ baseUrl: BASE, fetchImpl: async () => { count += 1; return detail({ csrfToken: 'inválido' }); } });
  await assert.rejects(client.request('livros', { method: 'POST', body: {} }), (error) => error.kind === 'unexpected_response');
  assert.equal(count, 1);
});

test('invalidação durante obtenção não retorna token obsoleto nem cria voos paralelos', async () => {
  let release;
  let count = 0;
  const client = createHttpClient({ baseUrl: BASE, fetchImpl: async () => {
    count += 1;
    if (count === 1) return new Promise((resolve) => { release = () => resolve(detail({ csrfToken: TOKEN })); });
    return detail({ csrfToken: 'b'.repeat(64) });
  } });
  const first = client.getCsrfToken();
  client.clearCsrfToken();
  const second = client.getCsrfToken();
  assert.equal(count, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['b'.repeat(64), 'b'.repeat(64)]);
  assert.equal(count, 2);
});

test('login bem-sucedido invalida token em memória para a próxima operação explícita', async () => {
  const { client, calls } = setup(() => detail({ id: 1 }));
  await client.request('auth/login', { method: 'POST', body: { email: 'fixture@example.test', senha: 'fixture' } });
  assert.equal(calls.length, 2);
  await client.getCsrfToken();
  assert.equal(calls.filter((call) => call.url.pathname.endsWith('/csrf')).length, 2);
});

test('403 limpa cache de CSRF sem buscá-lo novamente ou repetir a mutação', async () => {
  const { client, calls } = setup(() => failure(403, 'FORBIDDEN'));
  await assert.rejects(client.request('livros', { method: 'PATCH', body: {} }));
  assert.equal(calls.length, 2);
  await client.getCsrfToken();
  assert.equal(calls.length, 3);
});

test('bloqueia caminhos externos, travessia e corpo de GET antes de acessar rede', async () => {
  const { client, calls } = setup(() => detail({ ok: true }));
  for (const path of ['https://outro.test/api', '//outro.test/api', '../auth', '/%2e%2e/auth', 'health?senha=privado']) {
    await assert.rejects(client.request(path), (error) => error.kind === 'client');
  }
  await assert.rejects(client.request('health', { body: {} }), (error) => error.kind === 'client');
  assert.equal(calls.length, 0);
});

test('base pública recusa URLs com credenciais, query, fragmento ou protocolo inválido', () => {
  for (const value of ['https://user:segredo@example.test/api', 'https://example.test/api?segredo=x', 'https://example.test/api#x', 'file:///tmp/api', '']) {
    assert.throws(() => normalizeApiBaseUrl(value), (error) => !error.message.includes('user:segredo'));
  }
  assert.equal(normalizeApiBaseUrl(`${BASE}/`), BASE);
});

test('health e readiness só confirmam conexão após duas respostas reais compatíveis', async () => {
  const { client, calls } = setup(({ url }) => detail({ aplicacao: 'Leia+', status: url.pathname.endsWith('health') ? 'ok' : 'pronto' }));
  assert.deepEqual(await createConnectionService(client)(), { health: 'ok', readiness: 'pronto' });
  assert.deepEqual(calls.map((call) => call.url.pathname), ['/api/health', '/api/ready']);
});

test('readiness 503 não produz sucesso e não dispara polling', async () => {
  const { client, calls } = setup(({ url }) => url.pathname.endsWith('health') ? detail({ aplicacao: 'Leia+', status: 'ok' }) : failure(503, 'SERVICE_UNAVAILABLE'));
  await assert.rejects(createConnectionService(client)(), (error) => error.status === 503);
  assert.equal(calls.length, 2);
});

test('health inválido não produz indicador de disponibilidade', async () => {
  const { client, calls } = setup(() => detail({ status: 'ok' }));
  await assert.rejects(createConnectionService(client)(), (error) => error.kind === 'unexpected_response');
  assert.equal(calls.length, 1);
});
