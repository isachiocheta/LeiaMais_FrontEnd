import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import { api } from '../services/api.js';
import { createParticipationService } from '../services/participations.js';
import { useParticipationPagination } from '../hooks/useParticipationPagination.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { ReadingProgress } from '../components/ReadingProgress.jsx';
import { CyclePeriod } from '../components/CyclePeriod.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { ParticipationPagination } from '../components/ParticipationPagination.jsx';
import { useClubDay } from '../hooks/useClubDay.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';

const readings = createParticipationService(api);

export function ReadingHistoryPage() {
  const query = useParticipationPagination();
  const { page, pageSize } = query.filters;
  const load = useCallback((options) => readings.history({ page, pageSize }, options), [page, pageSize]);
  const resource = useApiResource(`${page}:${pageSize}`, load, query.valid);
  const result = resource.data;
  const rememberScroll = useCatalogScroll(query.valid && resource.status !== 'loading');
  const today = useClubDay();
  return <ContentContainer className="inner-page reading-history-page">
    <PageHeader eyebrow="SEU CAMINHO ENTRE PÁGINAS" title="Minhas leituras" description="Suas participações e registros de leitura, incluindo ciclos encerrados." />
    <div className="reading-page-links"><Link className="text-link" to="/minha-area">Minha área</Link><Link className="text-link" to="/ciclos">Explorar ciclos</Link><Button onClick={resource.reload} disabled={!query.valid || resource.status === 'loading'}>Recarregar histórico</Button></div>
    {!query.valid ? <ErrorState title="Confira a paginação" message={query.message} onRetry={query.reset} retryLabel="Voltar à primeira página" /> : resource.status === 'loading' ? <LoadingState message="Consultando seu histórico…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível carregar suas leituras" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
      : <><p className="reading-result-count" role="status">{result.meta.total} {result.meta.total === 1 ? 'participação registrada' : 'participações registradas'}</p>
        {!result.data.length ? <EmptyState title={result.meta.total ? 'Não há participações nesta página' : 'Seu histórico ainda está vazio'} description="As leituras aparecerão aqui após sua participação em um ciclo." action={result.meta.total ? <Button onClick={() => query.goPage(1)}>Ir para a primeira página</Button> : <Link className="text-link" to="/minha-area">Consultar ciclo em andamento</Link>} />
          : <div className="reading-history-list">{result.data.map((participation) => <ContentCard component="article" className="reading-history-card" key={participation.id}>
            <StatusBadge status={participation.ciclo.situacao} /><h2><Link to={`/ciclos/${participation.cicloId}`} onClick={rememberScroll}>{participation.ciclo.nome}</Link></h2><h3><Link to={`/catalogo/${participation.livro.id}`} onClick={rememberScroll}>{participation.livro.titulo}</Link></h3>
            <CyclePeriod cycle={participation.ciclo} today={today} /><ReadingProgress participation={participation} total={participation.livro.totalPaginas} />
            <Link className="text-link" to={`/ciclos/${participation.cicloId}`} onClick={rememberScroll}>Consultar leitura no ciclo <span aria-hidden="true">→</span></Link>
          </ContentCard>)}</div>}
        <ParticipationPagination meta={result.meta} query={query} label="Paginação do histórico de leituras" />
      </>}
  </ContentContainer>;
}
