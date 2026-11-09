import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createRegistrationService } from '../services/registrations.js';
import { createParticipationService } from '../services/participations.js';
import { createCycleService } from '../services/cycles.js';
import { meetingChanges } from '../services/meeting-changes.js';
import { registrationBlock, registrationFeedback } from '../utils/registration-rules.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useClubDay } from '../hooks/useClubDay.js';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { PrimaryButton } from './PrimaryButton.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

const registrations = createRegistrationService(api);
const readings = createParticipationService(api);
const cycles = createCycleService(api);

export function MeetingRegistration({ meeting, onSuccess, focusOnLoad = false }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [now, setNow] = useState(Date.now);
  const day = useClubDay();
  const request = useRef(null);
  const heading = useRef(null);
  const load = useCallback(async (options) => {
    const [mine, participation, cycle] = await Promise.all([registrations.getMine(meeting.id, options), readings.getMine(meeting.cicloId, options), cycles.getCycle(meeting.cicloId, options)]);
    return { mine, participation, cycle };
  }, [meeting.id, meeting.cicloId]);
  const resource = useApiResource(meeting.id, load);
  useEffect(() => { if (focusOnLoad && resource.status === 'success') heading.current?.focus({ preventScroll: true }); }, [focusOnLoad, resource.status]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const remaining = Date.parse(meeting.inicioEm) - Date.now();
    const timer = remaining > 0 && remaining <= 2147483647 ? setTimeout(update, remaining + 1) : null;
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [meeting.inicioEm, day]);
  const data = resource.data;
  const blocked = data ? registrationBlock(meeting, data.cycle, data.participation, Math.max(now, Date.now())) : '';
  async function mutate(cancel) {
    if (request.current || !data || feedback) return;
    const reason = registrationBlock(meeting, data.cycle, data.participation);
    if (reason) { setFeedback(reason); return; }
    const controller = new AbortController(); request.current = controller; setPending(true);
    try {
      if (cancel) await registrations.cancel(meeting.id, { signal: controller.signal });
      else await registrations.register(meeting.id, { signal: controller.signal });
      if (request.current !== controller) return;
      setConfirming(false);
      onSuccess(cancel ? 'Sua inscrição foi cancelada.' : 'Inscrição confirmada. Este registro não comprova comparecimento.');
      meetingChanges.invalidate();
    } catch (error) {
      if (request.current === controller) setFeedback(registrationFeedback(error));
      throw error;
    } finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  return <section className="meeting-registration" aria-labelledby="own-registration-title" aria-busy={pending}>
    <h2 id="own-registration-title" ref={heading} tabIndex={-1}>Sua inscrição</h2>
    <p>Para se inscrever, é necessário participar da leitura no mesmo ciclo. Inscrição não significa comparecimento.</p>
    {resource.status === 'loading' ? <LoadingState message="Conferindo sua inscrição e participação…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível conferir sua inscrição" message={resource.error.policy?.userMessage} onRetry={() => meetingChanges.invalidate()} /> : <>
      <p className="registration-state" role="status">{data.mine ? '✓ Você está inscrito neste encontro.' : 'Você não tem inscrição neste encontro.'}</p>
      {blocked && <p id="registration-block" className="meeting-form-rule">{blocked}</p>}
      {feedback && !confirming && <Alert severity="error">{feedback}</Alert>}
      <div className="meeting-action-buttons">
        {data.mine ? <Button variant="outlined" disabled={pending || Boolean(blocked) || Boolean(feedback)} aria-describedby={blocked ? 'registration-block' : undefined} onClick={() => setConfirming(true)}>Cancelar minha inscrição</Button>
          : <PrimaryButton disabled={pending || Boolean(blocked) || Boolean(feedback)} aria-describedby={blocked ? 'registration-block' : undefined} onClick={() => mutate(false).catch(() => {})}>{pending ? 'Inscrevendo…' : 'Inscrever-me'}</PrimaryButton>}
        <Button disabled={pending} onClick={() => meetingChanges.invalidate()}>Atualizar inscrição e encontro</Button>
        <Link className="text-link" to="/minha-agenda">Minha agenda</Link>
        {!data.participation && <Link className="text-link" to={`/ciclos/${meeting.cicloId}`}>Consultar participação no ciclo</Link>}
      </div>
      <p className="meeting-zone-note">Inscrição e cancelamento exigem ciclo Em andamento dentro do período e encontro Agendado futuro. O servidor confirma as condições no momento do envio.</p>
    </>}
    {confirming && <ConfirmDialog open title={`Cancelar sua inscrição: ${meeting.titulo}`} description={`${formatMeetingInstant(meeting.inicioEm)} (São Paulo), ${meeting.local}. Seu registro de inscrição será removido. Uma nova inscrição dependerá das condições válidas naquele momento.${blocked ? ` ${blocked}` : ''}`} confirmLabel="Confirmar cancelamento" cancelLabel="Manter inscrição" onCancel={() => setConfirming(false)} onConfirm={() => mutate(true)} pending={pending} confirmDisabled={Boolean(blocked) || Boolean(feedback)} errorMessage={feedback || blocked} recoveryAction={<Button onClick={() => meetingChanges.invalidate()}>Atualizar inscrição e encontro</Button>} />}
  </section>;
}
