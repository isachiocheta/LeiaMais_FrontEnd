import { requestError } from './api-errors.js';
import { catalogQuery, isCatalogId } from '../utils/catalog-query.js';

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function readGenre(value) {
  if (!value || !positive(value.id) || !text(value.nome)) throw requestError('unexpected_response', { status: 200 });
  return { id: value.id, nome: value.nome };
}

function readBook(value) {
  if (!value || !positive(value.id) || !text(value.titulo) || !text(value.autor)
    || !positive(value.generoId) || !positive(value.totalPaginas)
    || !(value.anoPublicacao === null || positive(value.anoPublicacao))
    || !(value.descricao === null || typeof value.descricao === 'string')
    || !(value.capaUrl === null || typeof value.capaUrl === 'string')
    || !timestamp(value.criadoEm) || !timestamp(value.atualizadoEm)) throw requestError('unexpected_response', { status: 200 });
  const genero = readGenre(value.genero);
  if (genero.id !== value.generoId) throw requestError('unexpected_response', { status: 200 });
  const { id, titulo, autor, generoId, totalPaginas, anoPublicacao, descricao, capaUrl, criadoEm, atualizadoEm } = value;
  return { id, titulo, autor, generoId, totalPaginas, anoPublicacao, descricao, capaUrl, criadoEm, atualizadoEm, genero };
}

function readPage(payload, page, pageSize, readItem) {
  const meta = payload?.meta;
  if (!Array.isArray(payload?.data) || !meta || meta.page !== page || meta.pageSize !== pageSize
    || !Number.isSafeInteger(meta.total) || meta.total < 0 || payload.data.length > pageSize || payload.data.length > meta.total) {
    throw requestError('unexpected_response', { status: 200 });
  }
  return { data: payload.data.map(readItem), meta: { page: meta.page, pageSize: meta.pageSize, total: meta.total } };
}

export function createCatalogService(client) {
  return Object.freeze({
    async listBooks(filters, { signal } = {}) {
      const payload = await client.request('livros', { query: catalogQuery(filters), signal, requiresAuth: true });
      return readPage(payload, filters.page, filters.pageSize, readBook);
    },
    async getBook(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const book = readBook((await client.request(`livros/${id}`, { signal, requiresAuth: true }))?.data);
      if (book.id !== Number(id)) throw requestError('unexpected_response', { status: 200 });
      return book;
    },
    async listGenres({ signal } = {}) {
      const genres = new Map();
      let page = 1;
      let total;
      do {
        const payload = await client.request('generos', { query: new URLSearchParams({ page: String(page), pageSize: '50' }), signal, requiresAuth: true });
        const result = readPage(payload, page, 50, readGenre);
        total = result.meta.total;
        if (total > 0 && result.data.length === 0) throw requestError('unexpected_response', { status: 200 });
        for (const genre of result.data) genres.set(genre.id, genre);
        page += 1;
      } while ((page - 1) * 50 < total);
      if (genres.size !== total) throw requestError('unexpected_response', { status: 200 });
      return [...genres.values()];
    },
  });
}
