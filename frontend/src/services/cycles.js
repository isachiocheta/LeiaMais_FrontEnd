import { requestError } from './api-errors.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { CYCLE_STATUSES, cycleQuery } from '../utils/cycle-query.js';
import { isCivilDate } from '../utils/civil-dates.js';

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const unexpected = () => requestError('unexpected_response', { status: 200 });
const formFields = ['nome', 'livroId', 'dataInicio', 'dataFim', 'orientacoes'];
const writeBody = (data) => Object.fromEntries(formFields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]]));

function writtenCycle(payload, method, path, id) {
  try {
    const cycle = readCycle(payload?.data);
    if (id !== undefined && cycle.id !== Number(id)) throw unexpected();
    return cycle;
  } catch { throw requestError('unexpected_response', { method, path, status: method === 'POST' ? 201 : 200, requestSent: true }); }
}

function readCycle(value) {
  if (!value || !positive(value.id) || !text(value.nome) || !positive(value.livroId)
    || !isCivilDate(value.dataInicio) || !isCivilDate(value.dataFim) || value.dataInicio > value.dataFim
    || !CYCLE_STATUSES.includes(value.situacao) || !(value.orientacoes === null || typeof value.orientacoes === 'string')
    || !timestamp(value.criadoEm) || !timestamp(value.atualizadoEm)
    || !value.livro || value.livro.id !== value.livroId || !text(value.livro.titulo)
    || !text(value.livro.autor) || !positive(value.livro.totalPaginas)) throw unexpected();
  const { id, nome, livroId, dataInicio, dataFim, orientacoes, situacao, criadoEm, atualizadoEm } = value;
  const { titulo, autor, totalPaginas } = value.livro;
  return { id, nome, livroId, dataInicio, dataFim, orientacoes, situacao, criadoEm, atualizadoEm, livro: { id: livroId, titulo, autor, totalPaginas } };
}

export function createCycleService(client) {
  return Object.freeze({
    async listCycles(filters, { signal } = {}) {
      const payload = await client.request('ciclos', { query: cycleQuery(filters), signal, requiresAuth: true });
      const meta = payload?.meta;
      if (!Array.isArray(payload?.data) || !meta || meta.page !== filters.page || meta.pageSize !== filters.pageSize
        || !Number.isSafeInteger(meta.total) || meta.total < 0 || payload.data.length > meta.pageSize || payload.data.length > meta.total) throw unexpected();
      return { data: payload.data.map(readCycle), meta: { page: meta.page, pageSize: meta.pageSize, total: meta.total } };
    },
    async getCycle(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const cycle = readCycle((await client.request(`ciclos/${id}`, { signal, requiresAuth: true }))?.data);
      if (cycle.id !== Number(id)) throw unexpected();
      return cycle;
    },
    async createCycle(data, { signal } = {}) {
      return writtenCycle(await client.request('ciclos', { method: 'POST', body: writeBody(data), signal, requiresAuth: true }), 'POST', 'ciclos');
    },
    async updateCycle(id, data, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `ciclos/${id}`;
      return writtenCycle(await client.request(path, { method: 'PATCH', body: writeBody(data), signal, requiresAuth: true }), 'PATCH', path, id);
    },
    async transitionCycle(id, currentStatus, { signal } = {}) {
      if (!isCatalogId(id) || !['PLANEJADO', 'EM_ANDAMENTO'].includes(currentStatus)) throw requestError('client');
      const path = `ciclos/${id}`;
      const situacao = currentStatus === 'PLANEJADO' ? 'EM_ANDAMENTO' : 'CONCLUIDO';
      return writtenCycle(await client.request(path, { method: 'PATCH', body: { situacao }, signal, requiresAuth: true }), 'PATCH', path, id);
    },
    async deleteCycle(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `ciclos/${id}`;
      const payload = await client.request(path, { method: 'DELETE', signal, requiresAuth: true });
      if (payload !== null) throw requestError('unexpected_response', { method: 'DELETE', path, status: 200, requestSent: true });
    },
  });
}
