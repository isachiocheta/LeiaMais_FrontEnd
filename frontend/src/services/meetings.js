import { requestError } from './api-errors.js';
import { createCycleService } from './cycles.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { CYCLE_STATUSES } from '../utils/cycle-query.js';
import { MEETING_STATUSES, meetingQuery } from '../utils/meeting-query.js';
import { isMeetingInstant } from '../utils/meeting-instants.js';

const positive = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const unexpected = () => requestError('unexpected_response', { status: 200 });

function readMeeting(value) {
  if (!value || !positive(value.id) || !positive(value.cicloId) || !text(value.titulo) || !isMeetingInstant(value.inicioEm)
    || !text(value.local) || !(value.descricao === null || typeof value.descricao === 'string') || !MEETING_STATUSES.includes(value.situacao)
    || !isMeetingInstant(value.criadoEm) || !isMeetingInstant(value.atualizadoEm) || !Number.isInteger(value.quantidadeInscritos) || value.quantidadeInscritos < 0
    || !value.ciclo || value.ciclo.id !== value.cicloId || !text(value.ciclo.nome) || !CYCLE_STATUSES.includes(value.ciclo.situacao)) throw unexpected();
  const { id, cicloId, titulo, inicioEm, local, descricao, situacao, criadoEm, atualizadoEm, quantidadeInscritos } = value;
  return { id, cicloId, titulo, inicioEm, local, descricao, situacao, criadoEm, atualizadoEm, quantidadeInscritos, ciclo: { id: cicloId, nome: value.ciclo.nome, situacao: value.ciclo.situacao } };
}

export function createMeetingService(client) {
  const cycles = createCycleService(client);
  async function withBooks(meetings, options) {
    const ids = [...new Set(meetings.map((meeting) => meeting.cicloId))];
    const related = new Map(await Promise.all(ids.map(async (id) => [id, (await cycles.getCycle(id, options)).livro])));
    return meetings.map((meeting) => ({ ...meeting, livro: related.get(meeting.cicloId) }));
  }
  return Object.freeze({
    async listMeetings(filters, { signal } = {}) {
      const payload = await client.request('encontros', { query: meetingQuery(filters), signal, requiresAuth: true });
      const meta = payload?.meta;
      if (!Array.isArray(payload?.data) || !meta || meta.page !== filters.page || meta.pageSize !== filters.pageSize || !Number.isSafeInteger(meta.total) || meta.total < 0 || payload.data.length > meta.pageSize || payload.data.length > meta.total) throw unexpected();
      const data = await withBooks(payload.data.map(readMeeting), { signal });
      return { data, meta: { page: meta.page, pageSize: meta.pageSize, total: meta.total } };
    },
    async getMeeting(id, { signal } = {}) {
      if (!isCatalogId(id)) throw requestError('client');
      const meeting = readMeeting((await client.request(`encontros/${id}`, { signal, requiresAuth: true }))?.data);
      if (meeting.id !== Number(id)) throw unexpected();
      return (await withBooks([meeting], { signal }))[0];
    },
  });
}
