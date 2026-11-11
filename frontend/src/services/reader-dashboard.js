import { requestError } from './api-errors.js';
import { readRegistration } from './registrations.js';
import { isCivilDate } from '../utils/civil-dates.js';
import { isMeetingInstant } from '../utils/meeting-instants.js';

const id = (v) => Number.isInteger(v) && v > 0 && v <= 2147483647;
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const unexpected = () => requestError('unexpected_response', { status: 200 });

function readCurrentCycle(v) {
  if (v === null) return null;
  const b = v?.livro;
  if (!v || !id(v.id) || !text(v.nome) || v.situacao !== 'EM_ANDAMENTO' || !isCivilDate(v.dataInicio) || !isCivilDate(v.dataFim) || v.dataInicio > v.dataFim || typeof v.dentroDoPeriodo !== 'boolean'
    || !b || !id(b.id) || !text(b.titulo) || !text(b.autor) || !id(b.totalPaginas)) throw unexpected();
  return { id: v.id, nome: v.nome, situacao: v.situacao, dataInicio: v.dataInicio, dataFim: v.dataFim, dentroDoPeriodo: v.dentroDoPeriodo,
    livro: { id: b.id, titulo: b.titulo, autor: b.autor, totalPaginas: b.totalPaginas } };
}

function readMyParticipation(v, cycle) {
  if (v === null) return null;
  if (!v || !cycle || !id(v.id) || v.cicloId !== cycle.id || v.totalPaginas !== cycle.livro.totalPaginas || !Number.isInteger(v.paginaAtual) || v.paginaAtual < 0 || v.paginaAtual > v.totalPaginas
    || typeof v.percentual !== 'number' || !Number.isFinite(v.percentual) || v.percentual < 0 || v.percentual > 100
    || v.concluida !== (v.paginaAtual === v.totalPaginas) || !(v.concluidaEm === null || isMeetingInstant(v.concluidaEm)) || typeof v.podeAtualizarProgresso !== 'boolean') throw unexpected();
  return { id: v.id, cicloId: v.cicloId, paginaAtual: v.paginaAtual, totalPaginas: v.totalPaginas, percentual: v.percentual, concluida: v.concluida, concluidaEm: v.concluidaEm, podeAtualizarProgresso: v.podeAtualizarProgresso };
}

export function parseReaderDashboard(payload) {
  const v = payload?.data;
  if (!v || !isMeetingInstant(v.generatedAt) || !count(v.totalParticipacoes) || !count(v.leiturasConcluidas) || v.leiturasConcluidas > v.totalParticipacoes
    || !count(v.totalInscricoesFuturas) || !Array.isArray(v.agendaFutura) || v.agendaFutura.length !== Math.min(5, v.totalInscricoesFuturas)) throw unexpected();
  const cicloAtual = readCurrentCycle(v.cicloAtual);
  const minhaParticipacao = readMyParticipation(v.minhaParticipacao, cicloAtual);
  const agendaFutura = v.agendaFutura.map(readRegistration);
  if (new Set(agendaFutura.map((r) => r.id)).size !== agendaFutura.length || new Set(agendaFutura.map((r) => r.encontroId)).size !== agendaFutura.length
    || agendaFutura.some((r) => r.encontro.situacao !== 'AGENDADO' || Date.parse(r.encontro.inicioEm) <= Date.parse(v.generatedAt))) throw unexpected();
  return { generatedAt: v.generatedAt, totalParticipacoes: v.totalParticipacoes, leiturasConcluidas: v.leiturasConcluidas, cicloAtual, minhaParticipacao, agendaFutura, totalInscricoesFuturas: v.totalInscricoesFuturas };
}

export function createReaderDashboardService(client) {
  return Object.freeze({ async getMine({ signal } = {}) { return parseReaderDashboard(await client.request('dashboard/me', { signal, requiresAuth: true })); } });
}
