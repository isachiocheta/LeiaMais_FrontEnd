import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { createParticipationService } from '../services/participations.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useParticipationPagination } from '../hooks/useParticipationPagination.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ReadingProgress } from '../components/ReadingProgress.jsx';
import { ParticipationPagination } from '../components/ParticipationPagination.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

const cycles = createCycleService(api);
const readings = createParticipationService(api);

export function CycleParticipantsPage() {
  const { id } = useParams();
  const validId = isCatalogId(id);
  const query = useParticipationPagination();
  const { page, pageSize } = query.filters;
  const loadCycle = useCallback((options) => cycles.getCycle(id, options), [id]);
  const cycle = useApiResource(id, loadCycle, validId);
  const totalPages = cycle.data?.livro.totalPaginas;
  const load = useCallback((options) => readings.participants(id, totalPages, { page, pageSize }, options), [id, totalPages, page, pageSize]);
  const resource = useApiResource(`${id}:${totalPages}:${page}:${pageSize}`, load, validId && query.valid && cycle.status === 'success');
  const result = resource.data;
  return <ContentContainer className="inner-page cycle-participants-page">
    <Link className="text-link catalog-back" to={validId ? `/ciclos/${id}` : '/ciclos'}>← Voltar ao ciclo</Link>
    <PageHeader eyebrow="ADMINISTRAÇÃO DAS LEITURAS" title="Participantes do ciclo" description={cycle.data ? `${cycle.data.nome} · ${cycle.data.livro.titulo}` : 'Consulta de participações registradas no clube.'} />
    <div className="reading-page-links"><Button disabled={!validId || cycle.status === 'loading'} onClick={cycle.reload}>Recarregar participantes</Button></div>
    {!validId ? <EmptyState title="Referência de ciclo inválida" description="Confira o endereço para consultar os participantes." /> : !query.valid ? <ErrorState title="Confira a paginação" message={query.message} onRetry={query.reset} retryLabel="Voltar à primeira página" />
      : cycle.status === 'error' ? cycle.error.status === 404 ? <EmptyState title="Ciclo não encontrado" description="Ele pode ter sido removido. Consulte a listagem de ciclos." /> : <ErrorState title="Não foi possível carregar o ciclo" message={cycle.error.policy?.userMessage} onRetry={cycle.reload} />
        : cycle.status === 'loading' || resource.status === 'loading' ? <LoadingState message="Consultando participantes…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível carregar os participantes" message={resource.error.policy?.userMessage} onRetry={cycle.reload} />
          : <><p className="reading-result-count" role="status">{result.meta.total} {result.meta.total === 1 ? 'participante registrado' : 'participantes registrados'}</p>
            <p className="reading-admin-note">A consulta inclui participações históricas de leitores desativados. A situação atual de cada conta não é informada nesta lista.</p>
            {!result.data.length ? <EmptyState title={result.meta.total ? 'Não há participantes nesta página' : 'Este ciclo ainda não tem participantes'} description="A listagem será preenchida após as participações serem registradas." action={result.meta.total ? <Button onClick={() => query.goPage(1)}>Ir para a primeira página</Button> : null} />
              : <div className="reading-history-list">{result.data.map((participation) => <ContentCard component="article" className="reading-history-card" key={participation.id}>
                <h2>{participation.usuario.nome}</h2><p className="reading-user-id">Identificação do participante: {participation.usuario.id}</p><ReadingProgress participation={participation} total={totalPages} label={`Leitura de ${participation.usuario.nome}`} />
              </ContentCard>)}</div>}
            <ParticipationPagination meta={result.meta} query={query} label="Paginação dos participantes do ciclo" />
          </>}
  </ContentContainer>;
}
