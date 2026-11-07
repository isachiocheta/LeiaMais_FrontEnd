import { requestError } from './api-errors.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { CYCLE_STATUSES } from '../utils/cycle-query.js';
import { isCivilDate } from '../utils/civil-dates.js';
import { participationQuery } from '../utils/participation-query.js';

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const unexpected = () => requestError('unexpected_response', { status: 200 });

function readProgress(value, total) {
  if (!value || !positive(value.id) || !positive(value.cicloId) || !positive(total)
    || !Number.isInteger(value.paginaAtual) || value.paginaAtual < 0 || value.paginaAtual > total
    || typeof value.percentual !== 'number' || !Number.isFinite(value.percentual) || value.percentual < 0 || value.percentual > 100
    || value.concluida !== (value.paginaAtual === total) || !(value.concluidaEm === null || timestamp(value.concluidaEm))
    || !timestamp(value.criadoEm) || !timestamp(value.atualizadoEm)) throw unexpected();
  const { id, cicloId, paginaAtual, percentual, concluida, concluidaEm, criadoEm, atualizadoEm } = value;
  return { id, cicloId, paginaAtual, percentual, concluida, concluidaEm, criadoEm, atualizadoEm };
}

function readParticipation(value) {
  const book = value?.livro;
  const cycle = value?.ciclo;
  if (!book || !positive(book.id) || !text(book.titulo) || !positive(book.totalPaginas)
    || !cycle || cycle.id !== value.cicloId || !text(cycle.nome) || !CYCLE_STATUSES.includes(cycle.situacao)
    || !isCivilDate(cycle.dataInicio) || !isCivilDate(cycle.dataFim) || cycle.dataInicio > cycle.dataFim) throw unexpected();
  return { ...readProgress(value, book.totalPaginas), livro: { id: book.id, titulo: book.titulo, totalPaginas: book.totalPaginas }, ciclo: { id: cycle.id, nome: cycle.nome, situacao: cycle.situacao, dataInicio: cycle.dataInicio, dataFim: cycle.dataFim } };
}

function readPage(payload, filters, parse) {
  const meta = payload?.meta;
  if (!Array.isArray(payload?.data) || !meta || meta.page !== filters.page || meta.pageSize !== filters.pageSize || !Number.isSafeInteger(meta.total) || meta.total < 0 || payload.data.length > filters.pageSize || payload.data.length > meta.total) throw unexpected();
  return { data: payload.data.map(parse), meta: { page: meta.page, pageSize: meta.pageSize, total: meta.total } };
}

function readWritten(payload, method, path, id) {
  try {
    const result = readParticipation(payload?.data);
    if (result.cicloId !== Number(id)) throw unexpected();
    return result;
  } catch { throw requestError('unexpected_response', { method, path, status: method === 'POST' ? 201 : 200, requestSent: true }); }
}

export function createParticipationService(client) {
  return Object.freeze({
    async getMine(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      let payload;
      try { payload = await client.request(`ciclos/${id}/minha-participacao`, { signal, requiresAuth: true }); }
      catch (error) { if (error.status === 404 && error.code === 'NOT_FOUND') return null; throw error; }
      const result = readParticipation(payload?.data);
      if (result.cicloId !== Number(id)) throw unexpected();
      return result;
    },
    async join(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `ciclos/${id}/participacoes`;
      return readWritten(await client.request(path, { method: 'POST', signal, requiresAuth: true }), 'POST', path, id);
    },
    async updatePage(id, paginaAtual, { signal } = {}) {
      if (!isCatalogId(id) || !Number.isInteger(paginaAtual) || paginaAtual < 0 || paginaAtual > 2147483647) throw requestError('client');
      const path = `ciclos/${id}/meu-progresso`;
      return readWritten(await client.request(path, { method: 'PATCH', body: { paginaAtual }, signal, requiresAuth: true }), 'PATCH', path, id);
    },
    async history(filters, { signal } = {}) {
      return readPage(await client.request('me/participacoes', { query: participationQuery(filters), signal, requiresAuth: true }), filters, readParticipation);
    },
    async participants(id, totalPages, filters, { signal } = {}) {
      if (!isCatalogId(id) || !positive(totalPages)) throw requestError('client');
      const payload = await client.request(`ciclos/${id}/participantes`, { query: participationQuery(filters), signal, requiresAuth: true });
      return readPage(payload, filters, (value) => {
        const user = value?.usuario;
        if (value?.cicloId !== Number(id) || !user || !positive(user.id) || !text(user.nome)) throw unexpected();
        return { ...readProgress(value, totalPages), usuario: { id: user.id, nome: user.nome } };
      });
    },
  });
}
