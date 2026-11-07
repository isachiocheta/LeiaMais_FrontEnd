import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { CYCLE_DEFAULTS } from '../utils/cycle-query.js';
import { requestError } from '../services/api-errors.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { ContentCard } from './ContentCard.jsx';
import { CycleParticipation } from './CycleParticipation.jsx';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { EmptyState } from './EmptyState.jsx';
import { StatusBadge } from './StatusBadge.jsx';

const cycles = createCycleService(api);

export function CurrentReading() {
  const load = useCallback(async (options) => {
    const result = await cycles.listCycles({ ...CYCLE_DEFAULTS, situacao: 'EM_ANDAMENTO', pageSize: 2 }, options);
    if (result.meta.total > 1 || result.data.length !== result.meta.total) throw requestError('unexpected_response', { status: 200 });
    return result.data[0] ?? null;
  }, []);
  const resource = useApiResource('current-reading', load);
  const cycle = resource.data;
  return <ContentCard className="current-reading-card">
    <h2>Ciclo em andamento</h2>
    {resource.status === 'loading' ? <LoadingState message="Consultando o ciclo em andamento…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível consultar o ciclo atual" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
      : cycle ? <><h3><Link to={`/ciclos/${cycle.id}`}>{cycle.nome}</Link></h3><p className="current-reading-book">{cycle.livro.titulo}</p><StatusBadge status={cycle.situacao} /><CycleParticipation key={cycle.id} cycle={cycle} onReloadCycle={resource.reload} /></>
        : <EmptyState title="Nenhum ciclo em andamento" description="Um ciclo planejado não é considerado o ciclo atual. Você pode consultar suas leituras anteriores no histórico." action={<Link className="text-link" to="/minhas-leituras">Ver histórico</Link>} />}
  </ContentCard>;
}
