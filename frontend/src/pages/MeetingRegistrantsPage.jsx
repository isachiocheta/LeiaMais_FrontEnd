import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import { api } from '../services/api.js';
import { createRegistrationService } from '../services/registrations.js';
import { createMeetingService } from '../services/meetings.js';
import { meetingChanges } from '../services/meeting-changes.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useParticipationPagination } from '../hooks/useParticipationPagination.js';
import { useMeetingRevision } from '../hooks/useMeetingRevision.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { ParticipationPagination } from '../components/ParticipationPagination.jsx';

const registrations = createRegistrationService(api);
const meetings = createMeetingService(api);
export function MeetingRegistrantsPage() {
  const { id } = useParams();
  const query = useParticipationPagination();
  const revision = useMeetingRevision();
  const { page, pageSize } = query.filters;
  const load = useCallback(async (options) => {
    const [meeting, rows] = await Promise.all([meetings.getMeeting(id, options), registrations.registrants(id, { page, pageSize }, options)]);
    return { meeting, ...rows };
  }, [id, page, pageSize]);
  const resource = useApiResource(`${id}:${page}:${pageSize}:${revision}`, load, isCatalogId(id) && query.valid);
  const result = resource.data;
  const pages = result ? Math.max(1, Math.ceil(result.meta.total / pageSize)) : 1;
  const adjusting = resource.status === 'success' && page > pages;
  useEffect(() => { if (adjusting) query.goPage(pages, { replace: true }); }, [adjusting, pages]);
  return <ContentContainer className="inner-page meeting-registrants-page">
    <Link className="text-link catalog-back" to={isCatalogId(id) ? `/encontros/${id}` : '/encontros'}>← Voltar ao encontro</Link>
    <PageHeader eyebrow="ADMINISTRAÇÃO DOS ENCONTROS" title="Inscritos no encontro" description={result?.meeting.titulo || 'Consulta das inscrições registradas no clube.'} />
    <p className="meeting-form-rule">Inscrição não significa comparecimento. Esta consulta apresenta somente os dados disponibilizados para os inscritos.</p>
    <div className="reading-page-links"><Button disabled={!isCatalogId(id) || !query.valid || resource.status === 'loading'} onClick={() => meetingChanges.invalidate()}>Atualizar inscritos</Button></div>
    {!isCatalogId(id) ? <EmptyState title="Referência de encontro inválida" description="Confira o endereço." /> : !query.valid ? <ErrorState title="Confira a paginação" message={query.message} onRetry={query.reset} retryLabel="Voltar à primeira página" /> : resource.status === 'loading' || adjusting ? <LoadingState message="Consultando inscritos…" /> : resource.status === 'error' ? resource.error.status === 404 ? <EmptyState title="Encontro não encontrado" description="O encontro pode ter sido removido." /> : <ErrorState title="Não foi possível carregar os inscritos" message={resource.error.policy?.userMessage} onRetry={() => meetingChanges.invalidate()} /> : <>
      <p className="meeting-zone-note">{formatMeetingInstant(result.meeting.inicioEm)} · São Paulo.</p>
      <p className="reading-result-count" role="status">{result.meta.total} {result.meta.total === 1 ? 'inscrição registrada' : 'inscrições registradas'}</p>
      {!result.data.length ? <EmptyState title="Este encontro ainda não tem inscritos" description="As inscrições aparecerão aqui após serem registradas pelos leitores." /> : <div className="reading-history-list">{result.data.map((row) => <ContentCard component="article" className="reading-history-card" key={row.id}>
        <h2>{row.usuario.nome}</h2><p className="reading-user-id">Identificação do leitor: {row.usuario.id}</p><p className="meeting-zone-note">Inscrição registrada em {formatMeetingInstant(row.criadoEm)} (São Paulo).</p>
      </ContentCard>)}</div>}
      <ParticipationPagination meta={result.meta} query={query} label="Paginação dos inscritos no encontro" />
    </>}
  </ContentContainer>;
}
