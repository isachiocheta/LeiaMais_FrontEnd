export const CYCLE_STATUSES = Object.freeze(['PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO']);
export const CYCLE_DEFAULTS = Object.freeze({ q: '', situacao: '', sort: 'dataInicio', direction: 'asc', page: 1, pageSize: 12 });

export function readCycleQuery(params) {
  const errors = {};
  for (const key of params.keys()) {
    if (!Object.hasOwn(CYCLE_DEFAULTS, key) || params.getAll(key).length > 1) errors.query = 'O endereço contém filtros desconhecidos ou repetidos.';
  }
  const filters = {
    q: (params.get('q') || '').trim(), situacao: params.get('situacao') || '',
    sort: params.get('sort') ?? CYCLE_DEFAULTS.sort, direction: params.get('direction') ?? CYCLE_DEFAULTS.direction,
    page: Number(params.get('page') ?? 1), pageSize: Number(params.get('pageSize') ?? 12),
  };
  if (Array.from(filters.q).length > 120) errors.q = 'A busca deve ter no máximo 120 caracteres.';
  if (filters.situacao && !CYCLE_STATUSES.includes(filters.situacao)) errors.situacao = 'Selecione uma situação válida.';
  if (!['nome', 'dataInicio'].includes(filters.sort)) errors.sort = 'Escolha nome ou data de início.';
  if (!['asc', 'desc'].includes(filters.direction)) errors.direction = 'Escolha uma direção válida.';
  for (const key of ['page', 'pageSize']) {
    const value = params.get(key);
    if ((value !== null && !/^[1-9]\d*$/.test(value)) || !Number.isSafeInteger(filters[key]) || filters[key] < 1) errors[key] = 'Escolha uma página e um tamanho de página válidos.';
  }
  if (filters.pageSize > 50) errors.pageSize = 'Cada página pode ter no máximo 50 ciclos.';
  if (!errors.page && !errors.pageSize && (BigInt(filters.page) - 1n) * BigInt(filters.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)) errors.page = 'O número da página é muito alto.';
  return { filters, errors, valid: Object.keys(errors).length === 0 };
}

export function cycleQuery(filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.situacao) params.set('situacao', filters.situacao);
  for (const key of ['sort', 'direction', 'page', 'pageSize']) params.set(key, String(filters[key]));
  return params;
}

export function changeCycleFilters(filters, changes) { return { ...filters, ...changes, page: 1 }; }
