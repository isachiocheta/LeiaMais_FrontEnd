export const CATALOG_DEFAULTS = Object.freeze({ q: '', generoId: '', sort: 'titulo', direction: 'asc', page: 1, pageSize: 12 });
const keys = new Set(Object.keys(CATALOG_DEFAULTS));

export function isCatalogId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isInteger(Number(value)) && Number(value) <= 2147483647;
}

export function readCatalogQuery(params) {
  const errors = {};
  for (const key of params.keys()) {
    if (!keys.has(key) || params.getAll(key).length > 1) errors.query = 'O endereço contém filtros desconhecidos ou repetidos.';
  }
  const filters = {
    q: (params.get('q') || '').trim(),
    generoId: params.get('generoId') || '',
    sort: params.get('sort') ?? CATALOG_DEFAULTS.sort,
    direction: params.get('direction') ?? CATALOG_DEFAULTS.direction,
    page: Number(params.get('page') ?? CATALOG_DEFAULTS.page),
    pageSize: Number(params.get('pageSize') ?? CATALOG_DEFAULTS.pageSize),
  };
  if (Array.from(filters.q).length > 160) errors.q = 'A busca deve ter no máximo 160 caracteres.';
  if (filters.generoId && !isCatalogId(filters.generoId)) errors.generoId = 'Selecione um gênero válido.';
  if (!['titulo', 'anoPublicacao'].includes(filters.sort)) errors.sort = 'Escolha título ou ano de publicação.';
  if (!['asc', 'desc'].includes(filters.direction)) errors.direction = 'Escolha uma direção válida.';
  for (const key of ['page', 'pageSize']) {
    const value = params.get(key);
    if ((value !== null && !/^[1-9]\d*$/.test(value)) || !Number.isSafeInteger(filters[key]) || filters[key] < 1) errors[key] = 'Escolha uma página e um tamanho de página válidos.';
  }
  if (filters.pageSize > 50) errors.pageSize = 'Cada página pode ter no máximo 50 livros.';
  if (!errors.page && !errors.pageSize && (BigInt(filters.page) - 1n) * BigInt(filters.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)) errors.page = 'O número da página é muito alto.';
  return { filters, errors, valid: Object.keys(errors).length === 0 };
}

export function catalogQuery(filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.generoId) params.set('generoId', String(filters.generoId));
  for (const key of ['sort', 'direction', 'page', 'pageSize']) params.set(key, String(filters[key]));
  return params;
}

export function changeCatalogFilters(filters, changes) {
  return { ...filters, ...changes, page: 1 };
}

export function availableCatalogPage({ page, pageSize, total }) {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}
