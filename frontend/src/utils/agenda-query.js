import { readParticipationQuery, participationQuery } from './participation-query.js';
export function readAgendaQuery(params) {
  const paging = new URLSearchParams(params);
  paging.delete('futuros');
  const result = readParticipationQuery(paging);
  const validFuture = params.getAll('futuros').length <= 1 && (!params.has('futuros') || ['true', 'false'].includes(params.get('futuros')));
  return { filters: { ...result.filters, futuros: params.get('futuros') === 'true' }, valid: result.valid && validFuture, message: [result.message, validFuture ? '' : 'O filtro de próximos encontros precisa ser true ou false.'].filter(Boolean).join(' ') };
}
export function agendaQuery(filters) { const query = participationQuery(filters); query.set('futuros', String(filters.futuros)); return query; }
