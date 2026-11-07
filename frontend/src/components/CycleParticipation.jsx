import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { api } from '../services/api.js';
import { createParticipationService } from '../services/participations.js';
import { canRecordReading, readingWriteFeedback, validateReadingPage, formatReadingInstant } from '../utils/reading-progress.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useClubDay } from '../hooks/useClubDay.js';
import { ReadingProgress } from './ReadingProgress.jsx';
import { PrimaryButton } from './PrimaryButton.jsx';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';

const readings = createParticipationService(api);

function ReadingPageForm({ participation, onSave, disabled, pending, fieldError }) {
  const [page, setPage] = useState(String(participation.paginaAtual));
  const [error, setError] = useState('');
  const input = useRef(null);
  useEffect(() => { if (fieldError) input.current?.focus(); }, [fieldError]);
  function submit(event) {
    event.preventDefault();
    if (disabled) return;
    const invalid = validateReadingPage(page, participation.livro.totalPaginas);
    setError(invalid);
    if (invalid) { input.current?.focus(); return; }
    onSave(Number(page));
  }
  return <form className="reading-page-form" aria-label="Atualizar página atual" onSubmit={submit} noValidate aria-busy={pending}>
    <TextField id="reading-current-page" inputRef={input} label="Página atual" name="paginaAtual" type="number" required value={page} onChange={(event) => { setPage(event.target.value); setError(''); }} disabled={disabled} error={Boolean(error || fieldError)} helperText={error || fieldError || `Inteiro de 0 a ${participation.livro.totalPaginas.toLocaleString('pt-BR')}. Você pode reduzir a página para corrigir seu registro.`} slotProps={{ htmlInput: { min: 0, max: participation.livro.totalPaginas, step: 1, inputMode: 'numeric' } }} />
    <PrimaryButton type="submit" disabled={disabled}>{pending ? 'Salvando…' : 'Salvar página'}</PrimaryButton>
    <p>A leitura é concluída somente ao registrar a última página. Ao reduzir a página, a conclusão e sua data são desfeitas.</p>
  </form>;
}

export function CycleParticipation({ cycle, onReloadCycle }) {
  const load = useCallback((options) => readings.getMine(cycle.id, options), [cycle.id]);
  const resource = useApiResource(cycle.id, load);
  const today = useClubDay();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const requestRef = useRef(null);
  const errorRef = useRef(null);
  const headingRef = useRef(null);
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  useEffect(() => { if (feedback && !feedback.field) errorRef.current?.focus(); }, [feedback]);
  useEffect(() => { if (notice && resource.status === 'success') headingRef.current?.focus({ preventScroll: true }); }, [notice, resource.status]);
  const participation = resource.data;
  const available = canRecordReading(participation?.ciclo || cycle, today);

  function refresh() {
    setFeedback(null);
    setNotice('');
    onReloadCycle();
  }
  async function mutate(operation, page) {
    if (requestRef.current || feedback?.refreshRequired) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setFeedback(null);
    setNotice('');
    try {
      if (operation === 'join') await readings.join(cycle.id, { signal: controller.signal });
      else await readings.updatePage(cycle.id, page, { signal: controller.signal });
      if (requestRef.current !== controller) return;
      setNotice(operation === 'join' ? 'Participação registrada. Sua leitura começa na página zero.' : 'Página atual salva.');
      resource.reload();
    } catch (error) {
      if (requestRef.current === controller) setFeedback(readingWriteFeedback(error, operation));
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }

  return <section className="cycle-participation" aria-labelledby="my-reading-title">
    <div className="reading-section-heading"><h2 ref={headingRef} tabIndex={-1} id="my-reading-title">Sua leitura neste ciclo</h2><Button onClick={refresh} disabled={pending}>Atualizar dados da leitura</Button></div>
    {notice && <Alert severity="success">{notice}<p>Os indicadores relacionados precisam ser recarregados para refletir esta alteração.</p></Alert>}
    {feedback && <Alert ref={errorRef} tabIndex={-1} severity="error">{feedback.message}{feedback.refreshRequired && <div><Button onClick={refresh}>Atualizar ciclo e participação</Button></div>}</Alert>}
    {resource.status === 'loading' ? <LoadingState message="Consultando sua participação…" />
      : resource.status === 'error' ? <ErrorState title="Não foi possível consultar sua leitura" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
        : participation ? <>
          <ReadingProgress participation={participation} total={participation.livro.totalPaginas} />
          <p className="reading-updated">Atualização registrada em <time dateTime={participation.atualizadoEm}>{formatReadingInstant(participation.atualizadoEm)}</time> (São Paulo).</p>
          {available ? <ReadingPageForm key={`${participation.id}:${participation.paginaAtual}:${participation.atualizadoEm}`} participation={participation} onSave={(page) => mutate('update', page)} disabled={pending || feedback?.refreshRequired === true} pending={pending} fieldError={feedback?.field} /> : <p className="reading-closed">O ciclo ou o período não permite atualizar páginas. Sua participação e seu histórico continuam disponíveis.</p>}
        </> : <div className="reading-join">
          <p>Você ainda não participa deste ciclo.</p>
          {available ? <><p>A participação começa na página zero. É necessário que o ciclo esteja em andamento, dentro do período previsto, e que sua conta esteja ativa.</p><PrimaryButton onClick={() => mutate('join')} disabled={pending || feedback?.refreshRequired === true}>{pending ? 'Registrando…' : 'Participar deste ciclo'}</PrimaryButton></> : <p>A participação só é permitida em ciclo Em andamento e dentro do período previsto.</p>}
        </div>}
    <Link className="text-link reading-history-link" to="/minhas-leituras">Consultar histórico de leituras <span aria-hidden="true">→</span></Link>
  </section>;
}
