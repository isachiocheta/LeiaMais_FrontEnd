import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { formatCivilDate } from '../utils/civil-dates.js';
import { meetingFormValues, meetingFormPayload, validateMeetingForm, mergeMeetingDraft, meetingWriteFeedback } from '../utils/meeting-form.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { CyclePicker } from './CyclePicker.jsx';
import { PrimaryButton } from './PrimaryButton.jsx';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';

const cycles = createCycleService(api);

export function MeetingForm({ initialMeeting, onSave, onReload, backTo }) {
  const [baseline, setBaseline] = useState(initialMeeting);
  const [values, setValues] = useState(() => meetingFormValues(initialMeeting));
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const refs = useRef({});
  const errorRef = useRef(null);
  const requestRef = useRef(null);
  const load = useCallback((options) => cycles.getCycle(values.cicloId, options), [values.cicloId]);
  const cycle = useApiResource(values.cicloId, load, isCatalogId(values.cicloId));
  const final = baseline && baseline.situacao !== 'AGENDADO';
  const busy = saving || refreshing;
  let unchanged = false;
  try { unchanged = Boolean(baseline && Object.keys(meetingFormPayload(values, baseline)).length === 0); } catch {}
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  useEffect(() => {
    const field = Object.keys(meetingFormValues()).find((name) => errors[name]);
    if (field) refs.current[field]?.focus();
    else if (feedback) errorRef.current?.focus();
  }, [errors, feedback]);

  function field(name, label, helperText, extra = {}) {
    return { id: `encontro-${name}`, name, label, value: values[name], fullWidth: true, disabled: busy,
      onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
      inputRef: (node) => { refs.current[name] = node; }, error: Boolean(errors[name]), helperText: errors[name] || helperText, ...extra };
  }

  async function submit(event) {
    event.preventDefault();
    if (requestRef.current || unchanged || feedback?.refreshRequired || (values.cicloId && cycle.status !== 'success')) return;
    const invalid = validateMeetingForm(values, cycle.data, baseline);
    setErrors(invalid); setFeedback(null); setNotice('');
    if (Object.keys(invalid).length) return;
    const controller = new AbortController();
    requestRef.current = controller; setSaving(true);
    try { await onSave(meetingFormPayload(values, baseline), { signal: controller.signal }); }
    catch (error) {
      if (requestRef.current === controller) { const next = meetingWriteFeedback(error, baseline ? 'update' : 'create'); setErrors(next.fields); setFeedback(next); }
    } finally { if (requestRef.current === controller) { requestRef.current = null; setSaving(false); } }
  }

  async function refresh() {
    if (requestRef.current || !baseline) return;
    const controller = new AbortController(); requestRef.current = controller; setRefreshing(true);
    try {
      const fresh = await onReload({ signal: controller.signal });
      if (requestRef.current !== controller) return;
      setValues((current) => mergeMeetingDraft(current, baseline, fresh)); setBaseline(fresh); setErrors({}); setFeedback(null);
      setNotice(fresh.situacao === 'AGENDADO' ? 'Dados recarregados. Seus campos alterados foram mantidos para revisão.' : 'Dados recarregados. Seus textos alterados foram mantidos; ciclo e horário agora seguem o estado final registrado.');
      cycle.reload();
    } catch (error) { if (requestRef.current === controller) setFeedback((current) => ({ ...current, refreshRequired: true, message: `Não foi possível atualizar o registro. ${error.policy?.userMessage || 'Tente novamente.'}` })); }
    finally { if (requestRef.current === controller) { requestRef.current = null; setRefreshing(false); } }
  }

  async function refreshCycleDraft() {
    if (requestRef.current || !isCatalogId(values.cicloId) || feedback?.uncertain) return;
    const controller = new AbortController(); requestRef.current = controller; setRefreshing(true);
    try {
      await cycles.getCycle(values.cicloId, { signal: controller.signal });
      if (requestRef.current !== controller) return;
      cycle.reload(); setErrors({}); setFeedback(null); setNotice('Ciclo recarregado. Seus campos foram mantidos para revisão.');
    } catch (error) { if (requestRef.current === controller) setFeedback({ refreshRequired: true, message: `Não foi possível atualizar o ciclo. ${error.policy?.userMessage || 'Tente novamente.'}` }); }
    finally { if (requestRef.current === controller) { requestRef.current = null; setRefreshing(false); } }
  }

  return <>
    <p className="meeting-form-intro">Ciclo, título, data, horário e local são obrigatórios. {baseline ? 'Realização e cancelamento são ações separadas, disponíveis no detalhe.' : 'O encontro será criado como Agendado.'}</p>
    {notice && <Alert severity="info" className="meeting-form-feedback">{notice}</Alert>}
    {feedback && <Alert ref={errorRef} tabIndex={-1} severity="error" className="meeting-form-feedback">{feedback.message}{feedback.refreshRequired && <div>{baseline ? <Button disabled={busy} onClick={refresh}>{refreshing ? 'Atualizando…' : 'Recarregar e preservar minhas alterações'}</Button> : feedback.uncertain ? <Link to={backTo}>Conferir agenda antes de tentar novamente</Link> : <Button disabled={busy} onClick={refreshCycleDraft}>{refreshing ? 'Atualizando…' : 'Recarregar ciclo e preservar alterações'}</Button>}</div>}</Alert>}
    <form onSubmit={submit} noValidate aria-label={baseline ? 'Editar encontro' : 'Criar encontro'} aria-busy={busy} className="meeting-form">
      <div className="meeting-cycle-choice" role="group" aria-labelledby="meeting-cycle-label" aria-describedby="meeting-cycle-help">
        <p id="meeting-cycle-label" className="cycle-field-label">Ciclo (obrigatório)</p>
        <p className="meeting-selected-cycle">{cycle.data?.nome || (values.cicloId ? `Ciclo #${values.cicloId}` : 'Nenhum ciclo selecionado.')}</p>
        {values.cicloId && cycle.status === 'loading' && <LoadingState compact message="Consultando ciclo…" />}
        {values.cicloId && cycle.status === 'error' && <ErrorState title="Não foi possível consultar o ciclo" message={cycle.error.status === 404 ? 'Escolha outro ciclo disponível.' : cycle.error.policy?.userMessage} onRetry={cycle.reload} />}
        {cycle.data && <p className="meeting-cycle-period">Período: {formatCivilDate(cycle.data.dataInicio)} a {formatCivilDate(cycle.data.dataFim)}.</p>}
        <Button variant="outlined" ref={(node) => { refs.current.cicloId = node; }} disabled={busy || Boolean(final)} aria-invalid={Boolean(errors.cicloId)} aria-describedby="meeting-cycle-help" onClick={() => setPickerOpen(true)}>{values.cicloId ? 'Trocar ciclo' : 'Escolher ciclo'}</Button>
        {isCatalogId(values.cicloId) && <Button disabled={busy || cycle.status === 'loading'} onClick={cycle.reload}>Atualizar período do ciclo</Button>}
        <p id="meeting-cycle-help" className={errors.cicloId ? 'cycle-field-error' : 'cycle-field-help'}>{errors.cicloId || (final ? 'Em estado final, o ciclo não pode ser alterado.' : 'A seleção permite buscar e percorrer todos os ciclos. A troca é recusada se houver inscrições.')}</p>
      </div>
      <TextField {...field('titulo', 'Título do encontro', 'Até 120 caracteres.', { required: true })} />
      <TextField {...field('inicioLocal', 'Data e horário em São Paulo', final ? 'O horário não pode mudar em um encontro realizado ou cancelado.' : 'America/Sao_Paulo. Criação e reagendamento exigem horário futuro dentro do período do ciclo.', { type: 'datetime-local', required: true, disabled: busy || Boolean(final), slotProps: { inputLabel: { shrink: true }, htmlInput: { step: '0.001' } } })} />
      <TextField {...field('local', 'Local', 'Até 180 caracteres.', { required: true })} />
      <TextField {...field('descricao', 'Descrição (opcional)', `${Array.from(values.descricao).length}/2000 caracteres. Quebras de linha serão preservadas.`, { multiline: true, minRows: 5 })} />
      <p className="meeting-form-rule">Correções de título, local e descrição podem ser salvas sem reagendar, inclusive após o horário ou em estados finais. As condições são verificadas ao salvar.</p>
      <div className="meeting-form-actions"><PrimaryButton type="submit" disabled={busy || unchanged || feedback?.refreshRequired === true || (Boolean(values.cicloId) && cycle.status !== 'success')}>{saving ? 'Salvando…' : baseline ? 'Salvar alterações' : 'Criar encontro'}</PrimaryButton><Link className="text-link" to={backTo}>Voltar sem salvar</Link></div>
    </form>
    {pickerOpen && <CyclePicker open title="Escolher ciclo do encontro" onClose={() => setPickerOpen(false)} onSelect={(selected) => { setValues((current) => ({ ...current, cicloId: String(selected.id) })); setPickerOpen(false); }} />}
  </>;
}
