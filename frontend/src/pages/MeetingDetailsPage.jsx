import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createMeetingService } from '../services/meetings.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { meetingQuery, readMeetingQuery } from '../utils/meeting-query.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { MeetingActions } from '../components/MeetingActions.jsx';
import { MeetingRegistration } from '../components/MeetingRegistration.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useMeetingRevision } from '../hooks/useMeetingRevision.js';

const meetings = createMeetingService(api);

export function MeetingDetailsPage() {
  const { user } = useAuth();
  const revision = useMeetingRevision();
  const { id } = useParams();
  const initialRevision = useRef({ id, value: revision });
  if (initialRevision.current.id !== id) initialRevision.current = { id, value: revision };
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [params] = useSearchParams();
  const context = readMeetingQuery(params);
  const backTo = context.valid && params.size ? `/encontros?${meetingQuery(context.filters)}` : '/encontros';
  const load = useCallback((options) => meetings.getMeeting(id, options), [id]);
  const resource = useApiResource(`${id}:${revision}`, load, isCatalogId(id));
  const meeting = resource.data;
  const savedNotice = location.state?.meetingAction === 'created' ? 'Encontro criado como Agendado.' : location.state?.meetingAction === 'updated' ? 'Alterações salvas.' : '';
  function refresh(message) { setNotice(typeof message === 'string' ? message : ''); resource.reload(); }
  useEffect(() => { setNotice(''); }, [id]);
  useEffect(() => { document.title = meeting ? `${meeting.titulo} | Leia+` : 'Detalhes do encontro | Leia+'; }, [meeting]);
  return <ContentContainer className="inner-page meeting-details-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> Voltar à agenda</Link>
    {(notice || savedNotice) && <Alert severity="success" className="meeting-notice">{notice || savedNotice}</Alert>}
    {!isCatalogId(id) ? <><PageHeader title="Referência de encontro inválida" /><EmptyState title="Confira o endereço" description="O código do encontro precisa ser um número inteiro positivo válido." /></> : resource.status === 'loading' ? <><PageHeader title="Detalhes do encontro" /><LoadingState message="Abrindo encontro…" /></> : resource.status === 'error' ? <><PageHeader title={resource.error.status === 404 ? 'Encontro não encontrado' : 'Detalhes do encontro'} />{resource.error.status === 404 ? <EmptyState title="Este encontro não está disponível" description="Ele pode ter sido removido ou o endereço pode estar incorreto." action={<Link className="text-link" to={backTo}>Consultar agenda</Link>} /> : <ErrorState title="Não foi possível carregar o encontro" message={resource.error.policy?.userMessage} onRetry={resource.reload} />}</>
      : <ContentCard component="article" className="meeting-detail-card">
        <PageHeader eyebrow="AGENDA DO LEIA+" title={meeting.titulo} /><div className="meeting-detail-status"><StatusBadge status={meeting.situacao} /></div>
        <p className="meeting-registration-count">{meeting.quantidadeInscritos} {meeting.quantidadeInscritos === 1 ? 'inscrição registrada' : 'inscrições registradas'}</p>
        {user.perfil === 'ADMIN_CLUBE' && <Link className="text-link" to={`/admin/encontros/${meeting.id}/inscritos`}>Consultar inscritos</Link>}
        <MeetingActions meeting={meeting} editTo={`/admin/encontros/${meeting.id}/editar${context.valid && params.size ? `?${meetingQuery(context.filters)}` : ''}`} onRefresh={refresh} onDeleted={() => navigate(backTo, { replace: true, state: { meetingAction: 'deleted' } })} />
        {meeting.situacao === 'CANCELADO' && <Alert severity="info" className="meeting-cancelled-alert">Este encontro está cancelado.</Alert>}
        <dl className="meeting-facts"><div><dt>Data e horário</dt><dd><time dateTime={meeting.inicioEm}>{formatMeetingInstant(meeting.inicioEm)}</time><p className="meeting-zone-note">Horário de São Paulo · America/Sao_Paulo.</p></dd></div><div><dt>Local</dt><dd>{meeting.local}</dd></div><div><dt>Ciclo</dt><dd><Link to={`/ciclos/${meeting.cicloId}`}>{meeting.ciclo.nome}</Link></dd></div><div><dt>Livro</dt><dd><Link to={`/catalogo/${meeting.livro.id}`}>{meeting.livro.titulo}</Link></dd></div></dl>
        <h2>Sobre o encontro</h2><p className="meeting-description">{meeting.descricao?.trim() ? meeting.descricao : 'Descrição não informada para este encontro.'}</p>
        <p className="meeting-status-explanation">A situação acima é a registrada pelo clube e não muda automaticamente quando o horário passa.</p>
        {user.perfil === 'LEITOR' && <MeetingRegistration meeting={meeting} onSuccess={setNotice} focusOnLoad={revision !== initialRevision.current.value} />}
      </ContentCard>}
  </ContentContainer>;
}
