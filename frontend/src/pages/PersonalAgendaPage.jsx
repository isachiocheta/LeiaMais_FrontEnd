import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { api } from '../services/api.js';
import { createRegistrationService } from '../services/registrations.js';
import { meetingChanges } from '../services/meeting-changes.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useAgendaFilters } from '../hooks/useAgendaFilters.js';
import { useMeetingRevision } from '../hooks/useMeetingRevision.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { ParticipationPagination } from '../components/ParticipationPagination.jsx';

const registrations = createRegistrationService(api);
export function PersonalAgendaPage() {
  const query = useAgendaFilters();
  const revision = useMeetingRevision();
  const { page, pageSize, futuros } = query.filters;
  const load = useCallback((options) => registrations.agenda({ page, pageSize, futuros }, options), [page, pageSize, futuros]);
  const resource = useApiResource(`${page}:${pageSize}:${futuros}:${revision}`, load, query.valid);
  const result = resource.data;
  const pages = result ? Math.max(1, Math.ceil(result.meta.total / pageSize)) : 1;
  const adjusting = resource.status === 'success' && page > pages;
  useEffect(() => { if (adjusting) query.goPage(pages, { replace: true }); }, [adjusting, pages]);
  const rememberScroll = useCatalogScroll(query.valid && resource.status !== 'loading' && !adjusting);
  return <ContentContainer className="inner-page personal-agenda-page">
    <PageHeader eyebrow="SEUS ENCONTROS ENTRE PÁGINAS" title="Minha agenda" description="Encontros nos quais você tem inscrição, incluindo o histórico. Inscrição não comprova comparecimento." />
    <div className="reading-page-links"><Link className="text-link" to="/encontros">Agenda do clube</Link><Link className="text-link" to="/minha-area">Minha área</Link><Button disabled={!query.valid || resource.status === 'loading'} onClick={() => meetingChanges.invalidate()}>Atualizar minha agenda</Button></div>
    <TextField select label="Período dos encontros" value={String(futuros)} onChange={(event) => query.changeFuture(event.target.value === 'true')} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}><option value="false">Todos, incluindo anteriores</option><option value="true">Somente futuros</option></TextField>
    <p className="meeting-zone-note">Horários de São Paulo · America/Sao_Paulo. O filtro de futuros considera o início e mantém encontros cancelados identificados.</p>
    {!query.valid ? <ErrorState title="Confira os filtros da agenda" message={query.message} onRetry={query.reset} retryLabel="Limpar filtros" /> : resource.status === 'loading' || adjusting ? <LoadingState message="Consultando sua agenda…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível carregar sua agenda" message={resource.error.policy?.userMessage} onRetry={() => meetingChanges.invalidate()} /> : <>
      <p className="reading-result-count" role="status">{result.meta.total} {result.meta.total === 1 ? 'inscrição encontrada' : 'inscrições encontradas'}</p>
      {!result.data.length ? <EmptyState title={futuros ? 'Nenhum encontro futuro na sua agenda' : 'Sua agenda ainda está vazia'} description={futuros ? 'Consulte também o histórico ou encontre outros encontros na agenda do clube.' : 'Consulte os encontros do clube e as condições para se inscrever.'} action={<Link className="text-link" to="/encontros">Consultar encontros</Link>} />
        : <div className="reading-history-list">{result.data.map((row) => <ContentCard component="article" className="reading-history-card" key={row.id}>
          <StatusBadge status={row.encontro.situacao} /><h2><Link to={`/encontros/${row.encontroId}`} onClick={rememberScroll}>{row.encontro.titulo}</Link></h2>
          <p className="meeting-date"><time dateTime={row.encontro.inicioEm}>{formatMeetingInstant(row.encontro.inicioEm)}</time></p><p className="meeting-location">Local: {row.encontro.local}</p>
          <p className="meeting-related">Ciclo: <Link to={`/ciclos/${row.ciclo.id}`} onClick={rememberScroll}>{row.ciclo.nome}</Link></p><p className="meeting-related">Livro: <Link to={`/catalogo/${row.livro.id}`} onClick={rememberScroll}>{row.livro.titulo}</Link> · {row.livro.autor}</p>
          {row.encontro.situacao === 'CANCELADO' && <p className="meeting-cancelled-note">Encontro cancelado. Sua inscrição continua no histórico.</p>}
          <Link className="text-link" to={`/encontros/${row.encontroId}`} onClick={rememberScroll}>Consultar encontro e inscrição →</Link>
        </ContentCard>)}</div>}
      <ParticipationPagination meta={result.meta} query={query} label="Paginação da minha agenda" />
    </>}
  </ContentContainer>;
}
