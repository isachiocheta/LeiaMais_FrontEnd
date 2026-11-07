import { requestError } from './api-errors.js';
import { catalogQuery, isCatalogId } from '../utils/catalog-query.js';

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const writeFields = ['titulo', 'autor', 'generoId', 'totalPaginas', 'anoPublicacao', 'descricao', 'capaUrl'];

function writeBody(data) {
  return Object.fromEntries(writeFields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]]));
}

function writtenBook(payload, method, path) {
  try { return readBook(payload?.data); }
  catch { throw requestError('unexpected_response', { method, path, status: method === 'POST' ? 201 : 200, requestSent: true }); }
}

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
    async createBook(data, { signal } = {}) {
      const payload = await client.request('livros', { method: 'POST', body: writeBody(data), signal, requiresAuth: true });
      return writtenBook(payload, 'POST', 'livros');
    },
    async updateBook(id, data, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `livros/${id}`;
      const payload = await client.request(path, { method: 'PATCH', body: writeBody(data), signal, requiresAuth: true });
      const book = writtenBook(payload, 'PATCH', path);
      if (book.id !== Number(id)) throw requestError('unexpected_response', { method: 'PATCH', path, status: 200, requestSent: true });
      return book;
    },
    async deleteBook(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const path = `livros/${id}`;
      const payload = await client.request(path, { method: 'DELETE', signal, requiresAuth: true });
      if (payload !== null) throw requestError('unexpected_response', { method: 'DELETE', path, status: 200, requestSent: true });
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
