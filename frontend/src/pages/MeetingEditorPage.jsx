import { useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { createMeetingService } from '../services/meetings.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { meetingQuery, readMeetingQuery } from '../utils/meeting-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { MeetingForm } from '../components/MeetingForm.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

const meetings = createMeetingService(api);

export function MeetingEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const context = readMeetingQuery(params);
  const suffix = context.valid && params.size ? `?${meetingQuery(context.filters)}` : '';
  const editing = id !== undefined;
  const validId = !editing || isCatalogId(id);
  const backTo = editing ? `/encontros/${id}${suffix}` : `/encontros${suffix}`;
  const load = useCallback((options) => meetings.getMeeting(id, options), [id]);
  const resource = useApiResource(id, load, editing && validId);
  async function save(values, options) {
    const result = editing ? await meetings.updateMeeting(id, values, options) : await meetings.createMeeting(values, options);
    navigate(`/encontros/${result.id}${suffix}`, { replace: true, state: { meetingAction: editing ? 'updated' : 'created' } });
  }
  return <ContentContainer className="inner-page meeting-editor-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> {editing ? 'Voltar ao encontro' : 'Voltar à agenda'}</Link>
    <PageHeader eyebrow="ADMINISTRAÇÃO DA AGENDA" title={editing ? 'Editar encontro' : 'Novo encontro'} description="Organize os encontros de leitura do clube." />
    {!validId ? <EmptyState title="Referência de encontro inválida" description="Confira o endereço ou consulte a agenda." /> : editing && resource.status === 'loading' ? <LoadingState message="Consultando encontro…" /> : editing && resource.status === 'error' ? resource.error.status === 404 ? <EmptyState title="Encontro não encontrado" description="Ele pode ter sido removido. Consulte a agenda atualizada." /> : <ErrorState title="Não foi possível carregar o encontro" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
      : <ContentCard className="meeting-editor-card"><MeetingForm key={id || 'new'} initialMeeting={editing ? resource.data : null} onSave={save} onReload={load} backTo={backTo} /></ContentCard>}
  </ContentContainer>;
}
