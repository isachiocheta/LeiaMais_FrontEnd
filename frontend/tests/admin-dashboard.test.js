import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminDashboardService, parseAdminDashboard } from '../src/services/admin-dashboard.js';
import { createDashboardResource } from '../src/utils/dashboard-resource.js';
import { formatDashboardPercent, formatDashboardInstant } from '../src/utils/dashboard-presentation.js';
import { requestError, ApiError } from '../src/services/api-errors.js';

const payload = () => ({ data: { generatedAt: '2026-11-09T15:00:00.000Z', leitores: { ativos: 18, pendentes: 4 }, totalLivros: 26, totalCiclos: 9, encontrosAgendadosFuturos: 2,
  cicloAtual: { id: 2, nome: 'Leitura de teste', situacao: 'EM_ANDAMENTO', dataInicio: '2026-11-01', dataFim: '2026-11-30', dentroDoPeriodo: true, livro: { id: 2, titulo: 'Livro de teste', autor: 'Autoria', totalPaginas: 300 }, indicadores: { participantes: 3, leiturasConcluidas: 1, taxaConclusao: 33.33, progressoMedio: 50 } },
  livrosMaisUtilizados: { data: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, titulo: `Obra ${i}`, autor: 'Autoria', generoId: 1, totalPaginas: 300, totalCiclos: i ? 1 : 3 })), meta: { page: 1, pageSize: 5, total: 7 }, minimoCiclos: 1 },
  leitoresSemParticipacao: { data: Array.from({ length: 12 }, (_, i) => ({ id: i + 10, nome: `Pessoa ${i}` })), meta: { page: 1, pageSize: 12, total: 15 } } } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('dashboard usa uma única chamada protegida, sem consultas a páginas; mantém totais completos e campos autorizados', async () => {
  const calls = [], signal = new AbortController().signal;
  const value = payload(); value.data.leitoresSemParticipacao.data[0].email = 'omitido';
  const service = createAdminDashboardService({ request: async (path, options) => { calls.push({ path, ...options }); return value; } });
  const result = await service.getAdmin({ signal });
  assert.deepEqual(calls, [{ path: 'dashboard/admin', signal, requiresAuth: true }]);
  assert.equal(result.totalLivros, 26); assert.equal(result.livrosMaisUtilizados.meta.total, 7); assert.equal(result.livrosMaisUtilizados.data.length, 5);
  assert.equal(result.leitoresSemParticipacao.meta.total, 15); assert.equal(result.leitoresSemParticipacao.data.length, 12);
  assert.deepEqual(Object.keys(result.leitoresSemParticipacao.data[0]), ['id', 'nome']);
  assert.deepEqual(result.cicloAtual.indicadores, { participantes: 3, leiturasConcluidas: 1, taxaConclusao: 33.33, progressoMedio: 50 });
});

test('null representa ausência de ciclo; zeros legítimos e média arredondada 100 não viram conclusões inventadas', () => {
  const value = payload();
  value.data.cicloAtual = null; value.data.leitoresSemParticipacao = { data: [], meta: { page: 1, pageSize: 12, total: 0 } };
  assert.equal(parseAdminDashboard(value).cicloAtual, null);
  const zero = payload(); zero.data.cicloAtual.indicadores = { participantes: 0, leiturasConcluidas: 0, taxaConclusao: 0, progressoMedio: 0 };
  assert.equal(parseAdminDashboard(zero).cicloAtual.indicadores.participantes, 0);
  const rounded = payload(); rounded.data.cicloAtual.dentroDoPeriodo = false;
  rounded.data.cicloAtual.indicadores = { participantes: 1, leiturasConcluidas: 0, taxaConclusao: 0, progressoMedio: 100 };
  const parsed = parseAdminDashboard(rounded);
  assert.equal(parsed.cicloAtual.indicadores.leiturasConcluidas, 0); assert.equal(parsed.cicloAtual.indicadores.progressoMedio, 100);
  assert.equal(parsed.cicloAtual.situacao, 'EM_ANDAMENTO'); assert.equal(parsed.cicloAtual.dentroDoPeriodo, false);
  assert.equal(formatDashboardPercent(33.33), '33,33%'); assert.equal(formatDashboardPercent(100), '100%');
  assert.match(formatDashboardInstant('2026-11-09T02:59:59Z'), /8 de novembro de 2026.*23:59:59/);
});

test('campos obrigatórios nulos, ausentes ou inesperados não são preenchidos com zeros', () => {
  const variants = [
    (v) => { v.data.totalLivros = null; }, (v) => { delete v.data.cicloAtual; },
    (v) => { v.data.cicloAtual.situacao = 'PLANEJADO'; }, (v) => { v.data.cicloAtual.indicadores.taxaConclusao = 101; },
    (v) => { v.data.cicloAtual.indicadores.progressoMedio = null; }, (v) => { v.data.leitores.ativos = '18'; },
    (v) => { v.data.livrosMaisUtilizados.data.pop(); }, (v) => { v.data.generatedAt = 'sem data'; },
  ];
  variants.forEach((alter) => { const value = payload(); alter(value); assert.throws(() => parseAdminDashboard(value), (e) => e.kind === 'unexpected_response'); });
});

test('atualização manual compartilha chamadas concorrentes e só troca os dados após nova resposta', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const resource = createDashboardResource({ getAdmin: () => (++calls === 1 ? first.promise : second.promise) });
  const pending = resource.refresh(); assert.equal(resource.refresh(), pending);
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(resource.getSnapshot().status, 'loading');
  const initial = parseAdminDashboard(payload()); first.resolve(initial); await pending;
  const refresh = resource.refresh(); assert.equal(resource.getSnapshot().status, 'refreshing'); assert.equal(resource.getSnapshot().data, initial);
  const fresh = { ...initial, generatedAt: '2026-11-09T15:01:00Z', totalLivros: 27 }; second.resolve(fresh); await refresh;
  assert.equal(resource.getSnapshot().status, 'success'); assert.equal(resource.getSnapshot().data.totalLivros, 27); assert.equal(calls, 2);
  resource.clear(); assert.equal(resource.getSnapshot().data, null);
});

test('falha de rede, servidor ou formato mantém os dados e o horário antigos até uma atualização bem-sucedida', async () => {
  const initial = parseAdminDashboard(payload()); let failure = null;
  const resource = createDashboardResource({ getAdmin: async () => { if (failure) throw failure; return initial; } });
  await resource.refresh();
  for (const error of [requestError('network'), requestError('unexpected_response'), new ApiError({ kind: 'http', status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Indisponível' })]) {
    failure = error; await resource.refresh(); const state = resource.getSnapshot();
    assert.equal(state.status, 'stale'); assert.equal(state.data, initial); assert.equal(state.error, error); assert.equal(state.data.generatedAt, initial.generatedAt);
  }
  failure = null; await resource.refresh(); assert.equal(resource.getSnapshot().status, 'success'); assert.equal(resource.getSnapshot().error, null);
});

test('401 e 403 removem dados administrativos anteriores; falha inicial não cria indicadores', async () => {
  for (const status of [401, 403]) {
    let fail = false;
    const resource = createDashboardResource({ getAdmin: async () => { if (fail) throw new ApiError({ kind: 'http', status, code: 'DENIED', message: 'Recusado' }); return parseAdminDashboard(payload()); } });
    await resource.refresh(); fail = true; await resource.refresh();
    assert.equal(resource.getSnapshot().status, 'error'); assert.equal(resource.getSnapshot().data, null);
  }
  const failed = createDashboardResource({ getAdmin: async () => { throw requestError('network'); } });
  await failed.refresh(); assert.equal(failed.getSnapshot().data, null); assert.equal(failed.getSnapshot().status, 'error');
});

test('saída da página cancela a chamada e uma resposta antiga não substitui uma consulta mais recente', async () => {
  const old = deferred(), fresh = deferred(); const signals = [];
  const resource = createDashboardResource({ getAdmin: ({ signal }) => { signals.push(signal); return signals.length === 1 ? old.promise : fresh.promise; } });
  const first = resource.refresh(); await Promise.resolve(); resource.clear();
  assert.equal(signals[0].aborted, true); assert.equal(resource.getSnapshot().data, null);
  const next = resource.refresh(); await Promise.resolve();
  fresh.resolve({ generatedAt: 'novo', totalLivros: 27 }); await next;
  old.resolve({ generatedAt: 'antigo', totalLivros: 1 }); await first;
  assert.equal(resource.getSnapshot().data.totalLivros, 27); resource.clear();
});
