import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderDashboardService, parseReaderDashboard } from '../src/services/reader-dashboard.js';
import { readerProgressPresentation, readerReadingState } from '../src/utils/reader-dashboard-presentation.js';
import { createDashboardResource } from '../src/utils/dashboard-resource.js';
import { requestError } from '../src/services/api-errors.js';

const participation = (changes = {}) => ({ id: 10, cicloId: 2, paginaAtual: 0, totalPaginas: 20000, percentual: 0, concluida: false, concluidaEm: null, podeAtualizarProgresso: true, ...changes });
const registration = (id) => ({ id, encontroId: id, criadoEm: '2026-11-01T12:00:00Z', atualizadoEm: '2026-11-01T12:00:00Z', encontro: { id, titulo: `Encontro ${id}`, local: 'Biblioteca', inicioEm: `2030-02-${String(id).padStart(2, '0')}T15:00:00Z`, situacao: 'AGENDADO' }, ciclo: { id: 2, nome: 'Ciclo', situacao: 'EM_ANDAMENTO', dataInicio: '2026-01-01', dataFim: '2030-12-31' }, livro: { id: 2, titulo: 'Obra', autor: 'Autoria' } });
const payload = () => ({ data: { generatedAt: '2026-11-11T15:00:00Z', totalParticipacoes: 19, leiturasConcluidas: 11,
  cicloAtual: { id: 2, nome: 'Ciclo de teste', situacao: 'EM_ANDAMENTO', dataInicio: '2026-01-01', dataFim: '2030-12-31', dentroDoPeriodo: true, livro: { id: 2, titulo: 'Obra', autor: 'Autoria', totalPaginas: 20000 } }, minhaParticipacao: null,
  agendaFutura: [1, 2, 3, 4, 5].map(registration), totalInscricoesFuturas: 7 } });

test('painel pessoal usa somente dashboard/me, cookies do cliente e AbortSignal, sem enviar identidade ou filtros', async () => {
  const calls = [], signal = new AbortController().signal, value = payload();
  value.data.usuarioId = 99; value.data.agendaFutura[0].usuarioId = 99;
  const service = createReaderDashboardService({ request: async (path, options) => { calls.push({ path, ...options }); return value; } });
  const result = await service.getMine({ signal, usuarioId: 99 });
  assert.deepEqual(calls, [{ path: 'dashboard/me', signal, requiresAuth: true }]);
  assert.equal(result.totalParticipacoes, 19); assert.equal(result.leiturasConcluidas, 11);
  assert.equal(result.agendaFutura.length, 5); assert.equal(result.totalInscricoesFuturas, 7);
  assert.equal(Object.hasOwn(result, 'usuarioId'), false); assert.equal(Object.hasOwn(result.agendaFutura[0], 'usuarioId'), false);
});

test('ausência de ciclo, ausência de participação e página zero são estados distintos, preservando o histórico', () => {
  const none = payload(); none.data.cicloAtual = null;
  const parsed = parseReaderDashboard(none);
  assert.equal(parsed.cicloAtual, null); assert.equal(parsed.totalParticipacoes, 19); assert.equal(parsed.leiturasConcluidas, 11); assert.equal(parsed.totalInscricoesFuturas, 7);
  assert.equal(readerReadingState(parsed.minhaParticipacao), 'not_joined');
  const joined = payload(); joined.data.minhaParticipacao = participation();
  assert.equal(readerReadingState(parseReaderDashboard(joined).minhaParticipacao), 'page_zero');
  joined.data.cicloAtual.dentroDoPeriodo = false; joined.data.minhaParticipacao.podeAtualizarProgresso = false;
  const expired = parseReaderDashboard(joined);
  assert.equal(expired.cicloAtual.situacao, 'EM_ANDAMENTO'); assert.equal(expired.minhaParticipacao.paginaAtual, 0); assert.equal(expired.cicloAtual.dentroDoPeriodo, false);
});

test('percentual vem da API; a apresentação distingue progresso, conclusão e arredondamento sem recalcular divisão de páginas', () => {
  const progress = participation({ paginaAtual: 100, percentual: 12.34 });
  assert.equal(readerReadingState(progress), 'in_progress'); assert.deepEqual(readerProgressPresentation(progress), { value: 12.34, label: '12,34%', roundedIncomplete: false });
  const rounded = participation({ paginaAtual: 19999, percentual: 100 });
  assert.equal(readerReadingState(rounded), 'in_progress'); assert.equal(readerProgressPresentation(rounded).value, 99.99); assert.equal(readerProgressPresentation(rounded).label, 'Menos de 100%');
  const tiny = participation({ paginaAtual: 1, percentual: 0 }); assert.equal(readerReadingState(tiny), 'in_progress'); assert.equal(readerProgressPresentation(tiny).value, 0);
  const completed = participation({ paginaAtual: 20000, percentual: 100, concluida: true, concluidaEm: '2026-11-11T15:01:00Z' });
  assert.equal(readerReadingState(completed), 'completed'); assert.equal(readerProgressPresentation(completed).label, '100%');
  const value = payload(); value.data.minhaParticipacao = completed; assert.equal(parseReaderDashboard(value).minhaParticipacao.concluidaEm, completed.concluidaEm);
});

test('respostas ausentes, inconsistentes ou sem agenda futura válida não viram dados vazios ou zeros', () => {
  const invalid = [
    (v) => { delete v.data.cicloAtual; }, (v) => { v.data.totalParticipacoes = '19'; },
    (v) => { v.data.leiturasConcluidas = 20; }, (v) => { v.data.cicloAtual = null; v.data.minhaParticipacao = participation(); },
    (v) => { v.data.minhaParticipacao = participation({ concluida: true }); }, (v) => { v.data.minhaParticipacao = participation({ cicloId: 99 }); },
    (v) => { v.data.agendaFutura.pop(); }, (v) => { v.data.agendaFutura[0].encontro.situacao = 'CANCELADO'; },
    (v) => { v.data.agendaFutura[0].encontro.inicioEm = v.data.generatedAt; }, (v) => { v.data.minhaParticipacao = participation({ percentual: null }); },
  ];
  invalid.forEach((alter) => { const v = payload(); alter(v); assert.throws(() => parseReaderDashboard(v), (e) => e.kind === 'unexpected_response'); });
});

test('recurso pessoal mantém dados anteriores em falha, permite atualização manual e não cria polling', async () => {
  let calls = 0, failure = false;
  const source = parseReaderDashboard(payload());
  const resource = createDashboardResource(async () => { calls++; if (failure) throw requestError('network'); return source; });
  await resource.refresh(); assert.equal(calls, 1);
  failure = true; await resource.refresh(); assert.equal(resource.getSnapshot().status, 'stale'); assert.equal(resource.getSnapshot().data, source);
  failure = false; await resource.refresh(); assert.equal(resource.getSnapshot().status, 'success'); assert.equal(calls, 3); resource.clear();
});

test('troca de conta descarta os dados e cancela resposta antiga; a nova conta tem um recurso independente', async () => {
  let finish; let oldSignal;
  const first = createDashboardResource(({ signal }) => { oldSignal = signal; return new Promise((resolve) => { finish = resolve; }); });
  const pending = first.refresh(); await Promise.resolve(); first.clear(); assert.equal(oldSignal.aborted, true); assert.equal(first.getSnapshot().data, null);
  const other = createDashboardResource(async () => ({ totalParticipacoes: 1, leiturasConcluidas: 0 }));
  await other.refresh(); finish(parseReaderDashboard(payload())); await pending;
  assert.equal(first.getSnapshot().data, null); assert.equal(other.getSnapshot().data.totalParticipacoes, 1); other.clear();
});
