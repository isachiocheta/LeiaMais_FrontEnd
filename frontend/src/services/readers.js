import { requestError } from './api-errors.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { readerQuery, readReaderQuery, READER_STATUSES } from '../utils/reader-query.js';

const unexpected = () => requestError('unexpected_response', { status: 200 });
function readReader(v) {
  if (!v || !Number.isInteger(v.id) || v.id < 1 || v.id > 2147483647 || v.perfil !== 'LEITOR' || !READER_STATUSES.includes(v.situacao)
    || typeof v.nome !== 'string' || !v.nome.trim() || typeof v.email !== 'string' || !v.email.trim()) throw unexpected();
  return { id: v.id, nome: v.nome, email: v.email, perfil: v.perfil, situacao: v.situacao };
}

export function createReaderService(client) {
  return Object.freeze({
    async list(filters, { signal } = {}) {
      const query = readerQuery(filters);
      if (!readReaderQuery(query).valid) throw requestError('client');
      const payload = await client.request('usuarios', { query, signal, requiresAuth: true });
      const m = payload?.meta;
      if (!Array.isArray(payload?.data) || !m || m.page !== filters.page || m.pageSize !== filters.pageSize || !Number.isSafeInteger(m.total) || m.total < 0 || payload.data.length > m.pageSize || payload.data.length > m.total) throw unexpected();
      const data = payload.data.map(readReader);
      if (filters.situacao && data.some((v) => v.situacao !== filters.situacao)) throw unexpected();
      return { data, meta: { page: m.page, pageSize: m.pageSize, total: m.total } };
    },
    async changeStatus(id, situacao, { signal } = {}) {
      if (!isCatalogId(id) || !['ATIVO', 'INATIVO'].includes(situacao)) throw requestError('client');
      const path = `usuarios/${id}/situacao`;
      const payload = await client.request(path, { method: 'PATCH', body: { situacao }, signal, requiresAuth: true });
      try {
        const result = readReader(payload?.data);
        if (result.id !== Number(id) || result.situacao !== situacao) throw unexpected();
        return result;
      } catch { throw requestError('unexpected_response', { method: 'PATCH', path, status: 200, requestSent: true }); }
    },
  });
}
