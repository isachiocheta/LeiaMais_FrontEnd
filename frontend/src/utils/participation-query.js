export function readParticipationQuery(params) {
  const errors = [];
  for (const key of params.keys()) if (!['page', 'pageSize'].includes(key) || params.getAll(key).length > 1) errors.push('O endereço contém parâmetros desconhecidos ou repetidos.');
  const filters = { page: Number(params.get('page') ?? 1), pageSize: Number(params.get('pageSize') ?? 12) };
  for (const key of ['page', 'pageSize']) {
    if ((params.has(key) && !/^[1-9]\d*$/.test(params.get(key))) || !Number.isSafeInteger(filters[key]) || filters[key] < 1) errors.push('Informe página e tamanho de página inteiros positivos.');
  }
  if (filters.pageSize > 50) errors.push('Cada página pode ter no máximo 50 registros.');
  if (!errors.length && (BigInt(filters.page) - 1n) * BigInt(filters.pageSize) > BigInt(Number.MAX_SAFE_INTEGER)) errors.push('O número da página é muito alto.');
  return { filters, valid: errors.length === 0, message: [...new Set(errors)].join(' ') };
}

export function participationQuery({ page, pageSize }) { return new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); }
