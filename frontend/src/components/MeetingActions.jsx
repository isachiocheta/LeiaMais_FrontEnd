import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createMeetingService } from '../services/meetings.js';
import { meetingWriteFeedback } from '../utils/meeting-form.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { useAuth } from '../hooks/useAuth.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

const meetings = createMeetingService(api);
const actions = {
  realize: { label: 'Realizar encontro', description: 'O encontro passará de Agendado para Realizado. A ação só é permitida quando o horário tiver chegado. Não será possível reabrir ou reagendar depois.' },
  cancel: { label: 'Cancelar encontro', description: 'O encontro passará de Agendado para Cancelado. As inscrições existentes continuarão registradas. Não será possível reabrir ou reagendar depois.' },
  delete: { label: 'Excluir encontro', description: 'O encontro será excluído definitivamente. Todas as inscrições associadas também serão removidas automaticamente.' },
};

export function MeetingActions({ meeting, editTo, onRefresh, onDeleted }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [pending, setPending] = useState(false);
  const requestRef = useRef(null);
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  if (user?.perfil !== 'ADMIN_CLUBE') return null;
  const locked = feedback?.refreshRequired === true;
  function refresh() { setSelected(null); setFeedback(null); onRefresh(); }
  function open(operation) { setSelected({ operation, meeting }); setFeedback(null); }
  async function confirm() {
    if (requestRef.current || !selected) return;
    const controller = new AbortController(); requestRef.current = controller; setPending(true);
    try {
      if (selected.operation === 'delete') await meetings.deleteMeeting(selected.meeting.id, { signal: controller.signal });
      else await meetings.setMeetingStatus(selected.meeting.id, selected.operation === 'realize' ? 'REALIZADO' : 'CANCELADO', { signal: controller.signal });
      if (requestRef.current !== controller) return;
      setSelected(null);
      if (selected.operation === 'delete') onDeleted();
      else onRefresh(selected.operation === 'realize' ? 'Encontro realizado.' : 'Encontro cancelado.');
    } catch (error) { if (requestRef.current === controller) setFeedback(meetingWriteFeedback(error, selected.operation)); throw error; }
    finally { if (requestRef.current === controller) { requestRef.current = null; setPending(false); } }
  }
  return <section className="meeting-admin-actions" aria-label="Administração do encontro">
    {!selected && locked && <Alert severity="error">{feedback.message}<Button onClick={refresh}>Atualizar dados do encontro</Button></Alert>}
    <div className="meeting-action-buttons"><Button component={Link} variant="outlined" to={editTo} disabled={pending || locked}>Editar encontro</Button>{meeting.situacao === 'AGENDADO' && <><Button variant="contained" onClick={() => open('realize')} disabled={pending || locked}>Realizar encontro</Button><Button variant="outlined" onClick={() => open('cancel')} disabled={pending || locked}>Cancelar encontro</Button></>}<Button variant="outlined" onClick={() => open('delete')} disabled={pending || locked}>Excluir encontro</Button><Button onClick={refresh} disabled={pending}>Atualizar dados</Button></div>
    {selected && <ConfirmDialog open title={`${actions[selected.operation].label}: ${selected.meeting.titulo}`} description={`${formatMeetingInstant(selected.meeting.inicioEm)} (São Paulo), ${selected.meeting.local}. ${actions[selected.operation].description}`} confirmLabel={actions[selected.operation].label} onConfirm={confirm} onCancel={() => setSelected(null)} pending={pending} errorMessage={feedback?.message} confirmDisabled={locked} recoveryAction={locked && <Button onClick={refresh}>Atualizar dados do encontro</Button>} />}
  </section>;
}
