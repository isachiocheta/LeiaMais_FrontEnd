import { readParticipationQuery } from './participation-query.js';

export const READER_STATUSES = Object.freeze(['PENDENTE', 'ATIVO', 'INATIVO']);
export const READER_SORTS = Object.freeze({ id: 'Identificação', nome: 'Nome', email: 'E-mail', situacao: 'Situação', criadoEm: 'Data de cadastro' });
export const READER_DEFAULTS = Object.freeze({ page: 1, pageSize: 12, sort: 'id', direction: 'asc', situacao: '' });

export function readReaderQuery(params) {
  const messages = [];
  for (const key of params.keys()) if (!Object.hasOwn(READER_DEFAULTS, key) || params.getAll(key).length > 1) messages.push('O endereço contém parâmetros desconhecidos ou repetidos.');
  const paging = new URLSearchParams();
  for (const key of ['page', 'pageSize']) if (params.has(key)) paging.set(key, params.get(key));
  const pagination = readParticipationQuery(paging);
  if (!pagination.valid) messages.push(pagination.message);
  const filters = { ...READER_DEFAULTS, ...pagination.filters, sort: params.get('sort') ?? 'id', direction: params.get('direction') ?? 'asc', situacao: params.get('situacao') ?? '' };
  if (!Object.hasOwn(READER_SORTS, filters.sort)) messages.push('Escolha uma ordenação disponível.');
  if (!['asc', 'desc'].includes(filters.direction)) messages.push('Escolha a direção crescente ou decrescente.');
  if (params.has('situacao') && !READER_STATUSES.includes(filters.situacao)) messages.push('Escolha uma situação disponível.');
  return { filters: messages.length ? { ...READER_DEFAULTS } : filters, valid: messages.length === 0, message: [...new Set(messages)].join(' ') };
}

export function readerQuery(filters) {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize), sort: filters.sort, direction: filters.direction });
  if (filters.situacao) query.set('situacao', filters.situacao);
  return query;
}
