import { requestError } from './api-errors.js';
import { isCivilDate } from '../utils/civil-dates.js';
import { isMeetingInstant } from '../utils/meeting-instants.js';

const count = (v) => Number.isSafeInteger(v) && v >= 0;
const id = (v) => Number.isInteger(v) && v > 0 && v <= 2147483647;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const percent = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const unexpected = () => requestError('unexpected_response', { status: 200 });

function readList(v, limit, parse) {
  const m = v?.meta;
  if (!Array.isArray(v?.data) || !m || m.page !== 1 || m.pageSize !== limit || !count(m.total) || v.data.length !== Math.min(m.total, limit)) throw unexpected();
  const data = v.data.map(parse);
  if (new Set(data.map((row) => row.id)).size !== data.length) throw unexpected();
  return { data, meta: { page: 1, pageSize: limit, total: m.total } };
}

function readCycle(v) {
  if (v === null) return null;
  const b = v?.livro, i = v?.indicadores;
  if (!v || !id(v.id) || !text(v.nome) || v.situacao !== 'EM_ANDAMENTO' || !isCivilDate(v.dataInicio) || !isCivilDate(v.dataFim) || v.dataInicio > v.dataFim || typeof v.dentroDoPeriodo !== 'boolean'
    || !b || !id(b.id) || !text(b.titulo) || !text(b.autor) || !id(b.totalPaginas)
    || !i || !count(i.participantes) || !count(i.leiturasConcluidas) || i.leiturasConcluidas > i.participantes || !percent(i.taxaConclusao) || !percent(i.progressoMedio)
    || (i.participantes === 0 && (i.leiturasConcluidas !== 0 || i.taxaConclusao !== 0 || i.progressoMedio !== 0))) throw unexpected();
  return { id: v.id, nome: v.nome, situacao: v.situacao, dataInicio: v.dataInicio, dataFim: v.dataFim, dentroDoPeriodo: v.dentroDoPeriodo,
    livro: { id: b.id, titulo: b.titulo, autor: b.autor, totalPaginas: b.totalPaginas },
    indicadores: { participantes: i.participantes, leiturasConcluidas: i.leiturasConcluidas, taxaConclusao: i.taxaConclusao, progressoMedio: i.progressoMedio } };
}

export function parseAdminDashboard(payload) {
  const v = payload?.data;
  if (!v || !isMeetingInstant(v.generatedAt) || !count(v.leitores?.ativos) || !count(v.leitores?.pendentes) || !count(v.totalLivros) || !count(v.totalCiclos) || !count(v.encontrosAgendadosFuturos) || v.livrosMaisUtilizados?.minimoCiclos !== 1) throw unexpected();
  const cicloAtual = readCycle(v.cicloAtual);
  const books = readList(v.livrosMaisUtilizados, 5, (b) => {
    if (!b || !id(b.id) || !text(b.titulo) || !text(b.autor) || !id(b.generoId) || !id(b.totalPaginas) || !count(b.totalCiclos) || b.totalCiclos < 1) throw unexpected();
    return { id: b.id, titulo: b.titulo, autor: b.autor, generoId: b.generoId, totalPaginas: b.totalPaginas, totalCiclos: b.totalCiclos };
  });
  const readers = readList(v.leitoresSemParticipacao, 12, (r) => {
    if (!r || !id(r.id) || !text(r.nome)) throw unexpected();
    return { id: r.id, nome: r.nome };
  });
  if (!cicloAtual && readers.meta.total !== 0) throw unexpected();
  return { generatedAt: v.generatedAt, leitores: { ativos: v.leitores.ativos, pendentes: v.leitores.pendentes }, totalLivros: v.totalLivros, totalCiclos: v.totalCiclos,
    encontrosAgendadosFuturos: v.encontrosAgendadosFuturos, cicloAtual, livrosMaisUtilizados: { ...books, minimoCiclos: 1 }, leitoresSemParticipacao: readers };
}

export function createAdminDashboardService(client) {
  return Object.freeze({ async getAdmin({ signal } = {}) {
    return parseAdminDashboard(await client.request('dashboard/admin', { signal, requiresAuth: true }));
  } });
}
