import { requestError } from './api-errors.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { isCivilDate } from '../utils/civil-dates.js';
import { isMeetingInstant } from '../utils/meeting-instants.js';
import { CYCLE_STATUSES } from '../utils/cycle-query.js';
import { MEETING_STATUSES } from '../utils/meeting-query.js';
import { participationQuery, readParticipationQuery } from '../utils/participation-query.js';

const positive = (v) => Number.isInteger(v) && v > 0 && v <= 2147483647;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const unexpected = () => requestError('unexpected_response', { status: 200 });

function readRegistration(v) {
  const e = v?.encontro, c = v?.ciclo, b = v?.livro;
  if (!v || !positive(v.id) || !positive(v.encontroId) || !isMeetingInstant(v.criadoEm) || !isMeetingInstant(v.atualizadoEm)
    || !e || e.id !== v.encontroId || !text(e.titulo) || !text(e.local) || !isMeetingInstant(e.inicioEm) || !MEETING_STATUSES.includes(e.situacao)
    || !c || !positive(c.id) || !text(c.nome) || !CYCLE_STATUSES.includes(c.situacao) || !isCivilDate(c.dataInicio) || !isCivilDate(c.dataFim) || c.dataInicio > c.dataFim
    || !b || !positive(b.id) || !text(b.titulo) || !text(b.autor)) throw unexpected();
  return { id: v.id, encontroId: v.encontroId, criadoEm: v.criadoEm, atualizadoEm: v.atualizadoEm,
    encontro: { id: e.id, titulo: e.titulo, local: e.local, inicioEm: e.inicioEm, situacao: e.situacao },
    ciclo: { id: c.id, nome: c.nome, situacao: c.situacao, dataInicio: c.dataInicio, dataFim: c.dataFim }, livro: { id: b.id, titulo: b.titulo, autor: b.autor } };
}

function pagination(filters) {
  const query = participationQuery(filters);
  if (!readParticipationQuery(query).valid) throw requestError('client');
  return query;
}
function readPage(payload, filters, parse) {
  const m = payload?.meta;
  if (!Array.isArray(payload?.data) || !m || m.page !== filters.page || m.pageSize !== filters.pageSize || !Number.isSafeInteger(m.total) || m.total < 0 || payload.data.length > m.pageSize || payload.data.length > m.total) throw unexpected();
  return { data: payload.data.map(parse), meta: { page: m.page, pageSize: m.pageSize, total: m.total } };
}

export function createRegistrationService(client) {
  async function agenda(filters, { signal } = {}) {
    const query = pagination(filters);
    if (typeof filters.futuros !== 'boolean') throw requestError('client');
    query.set('futuros', String(filters.futuros));
    return readPage(await client.request('me/inscricoes', { query, signal, requiresAuth: true }), filters, readRegistration);
  }
  return Object.freeze({
    agenda,
    async getMine(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      // O contrato só oferece a agenda paginada, sem filtro por encontro nem GET individual.
      for (let page = 1; ; page += 1) {
        signal?.throwIfAborted();
        const result = await agenda({ page, pageSize: 50, futuros: false }, { signal });
        const mine = result.data.find((row) => row.encontroId === Number(id));
        if (mine) return mine;
        if (page * result.meta.pageSize >= result.meta.total) return null;
        if (!result.data.length) throw unexpected();
      }
    },
    async register(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `encontros/${id}/inscricoes`;
      const payload = await client.request(path, { method: 'POST', signal, requiresAuth: true });
      try { const result = readRegistration(payload?.data); if (result.encontroId !== Number(id)) throw unexpected(); return result; }
      catch { throw requestError('unexpected_response', { method: 'POST', path, status: 201, requestSent: true }); }
    },
    async cancel(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `encontros/${id}/minha-inscricao`;
      const payload = await client.request(path, { method: 'DELETE', signal, requiresAuth: true });
      if (payload !== null) throw requestError('unexpected_response', { method: 'DELETE', path, status: 200, requestSent: true });
    },
    async registrants(id, filters, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      return readPage(await client.request(`encontros/${id}/inscritos`, { query: pagination(filters), signal, requiresAuth: true }), filters, (v) => {
        if (!v || !positive(v.id) || v.encontroId !== Number(id) || !isMeetingInstant(v.criadoEm) || !v.usuario || !positive(v.usuario.id) || !text(v.usuario.nome)) throw unexpected();
        return { id: v.id, encontroId: v.encontroId, criadoEm: v.criadoEm, usuario: { id: v.usuario.id, nome: v.usuario.nome } };
      });
    },
  });
}
