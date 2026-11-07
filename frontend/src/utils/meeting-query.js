import { isCatalogId } from './catalog-query.js';

export const MEETING_STATUSES = Object.freeze(['AGENDADO', 'REALIZADO', 'CANCELADO']);
export const MEETING_DEFAULTS = Object.freeze({ q: '', cicloId: '', situacao: '', sort: 'inicioEm', direction: 'asc', page: 1, pageSize: 12 });

export function readMeetingQuery(params) {
  const errors = {};
  for (const key of params.keys()) if (!Object.hasOwn(MEETING_DEFAULTS, key) || params.getAll(key).length > 1) errors.query = 'O endereço contém filtros desconhecidos ou repetidos.';
  const filters = {
    q: (params.get('q') || '').trim(), cicloId: params.get('cicloId') || '', situacao: params.get('situacao') || '',
    sort: params.get('sort') ?? MEETING_DEFAULTS.sort, direction: params.get('direction') ?? MEETING_DEFAULTS.direction,
    page: Number(params.get('page') ?? 1), pageSize: Number(params.get('pageSize') ?? 12),
  };
  if (Array.from(filters.q).length > 120) errors.q = 'A busca deve ter no máximo 120 caracteres.';
  if (filters.cicloId && !isCatalogId(filters.cicloId)) errors.cicloId = 'Selecione um ciclo válido.';
  if (filters.situacao && !MEETING_STATUSES.includes(filters.situacao)) errors.situacao = 'Selecione uma situação válida.';
  if (!['titulo', 'inicioEm'].includes(filters.sort)) errors.sort = 'Escolha título ou data e horário.';
  if (!['asc', 'desc'].includes(filters.direction)) errors.direction = 'Escolha uma direção válida.';
  for (const key of ['page', 'pageSize']) {
    if ((params.has(key) && !/^[1-9]\d*$/.test(params.get(key))) || !Number.isSafeInteger(filters[key]) || filters[key] < 1) errors[key] = 'Escolha uma página e um tamanho de página válidos.';
  }
  if (filters.pageSize > 50) errors.pageSize = 'Cada página pode ter no máximo 50 encontros.';
  if (!errors.page && !errors.pageSize && (BigInt(filters.page) - 1n) * BigInt(filters.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)) errors.page = 'O número da página é muito alto.';
  return { filters, errors, valid: Object.keys(errors).length === 0 };
}

export function meetingQuery(filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.cicloId) params.set('cicloId', String(filters.cicloId));
  if (filters.situacao) params.set('situacao', filters.situacao);
  for (const key of ['sort', 'direction', 'page', 'pageSize']) params.set(key, String(filters[key]));
  return params;
}

export function changeMeetingFilters(filters, changes) { return { ...filters, ...changes, page: 1 }; }
