import { isCatalogId } from './catalog-query.js';
import { meetingCivilToInstant, meetingInstantToCivil } from './meeting-instants.js';

export function meetingFormValues(meeting) {
  const civil = meeting ? meetingInstantToCivil(meeting.inicioEm) : null;
  return { cicloId: meeting ? String(meeting.cicloId) : '', titulo: meeting?.titulo ?? '', inicioLocal: civil ? `${civil.date}T${civil.time}` : '', local: meeting?.local ?? '', descricao: meeting?.descricao ?? '' };
}

function startInstant(values, original) {
  if (original && values.inicioLocal === meetingFormValues(original).inicioLocal) return original.inicioEm;
  const [date, time, extra] = values.inicioLocal.split('T');
  if (extra !== undefined) throw new RangeError('Informe uma data e um horário válidos em São Paulo.');
  return meetingCivilToInstant({ date, time });
}

export function meetingFormPayload(values, original) {
  const payload = { cicloId: Number(values.cicloId), titulo: values.titulo.trim(), inicioEm: startInstant(values, original), local: values.local.trim(), descricao: values.descricao === '' ? null : values.descricao };
  if (!original) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([field, value]) => field === 'inicioEm' ? Date.parse(value) !== Date.parse(original.inicioEm) : value !== original[field]));
}

export function validateMeetingForm(values, cycle, original, now = Date.now()) {
  const errors = {};
  for (const [field, limit, label] of [['titulo', 120, 'título'], ['local', 180, 'local']]) {
    const length = Array.from(values[field].trim()).length;
    if (!length) errors[field] = `Informe o ${label}.`;
    else if (length > limit) errors[field] = `Use no máximo ${limit} caracteres.`;
  }
  if (!isCatalogId(values.cicloId)) errors.cicloId = 'Escolha um ciclo.';
  else if (!cycle || cycle.id !== Number(values.cicloId)) errors.cicloId = 'Carregue um ciclo disponível antes de salvar.';
  if (Array.from(values.descricao).length > 2000) errors.descricao = 'Use no máximo 2000 caracteres.';
  let iso;
  try { iso = startInstant(values, original); }
  catch (error) { errors.inicioLocal = error instanceof RangeError ? error.message : 'Informe uma data e um horário válidos.'; }
  const changedCycle = Boolean(original && Number(values.cicloId) !== original.cicloId);
  const changedStart = Boolean(original && iso && Date.parse(iso) !== Date.parse(original.inicioEm));
  if (original && original.situacao !== 'AGENDADO') {
    if (changedCycle) errors.cicloId = 'Encontros finalizados não podem trocar de ciclo.';
    if (changedStart) errors.inicioLocal = 'Encontros finalizados não podem ser reagendados.';
  } else if (!original || changedCycle || changedStart) {
    if (cycle?.situacao === 'CONCLUIDO') errors.cicloId = 'Escolha um ciclo que não esteja concluído.';
    if (iso && Date.parse(iso) <= now) errors.inicioLocal = 'Use um horário futuro para criar ou reagendar.';
    if (iso && cycle) {
      const day = meetingInstantToCivil(iso).date;
      if (day < cycle.dataInicio || day > cycle.dataFim) errors.inicioLocal = 'O dia em São Paulo deve estar dentro do período do ciclo.';
    }
  }
  return errors;
}

export function mergeMeetingDraft(values, previous, fresh) {
  const before = meetingFormValues(previous);
  const after = meetingFormValues(fresh);
  for (const field of Object.keys(after)) if (values[field] !== before[field]) after[field] = values[field];
  if (fresh.situacao !== 'AGENDADO') {
    const locked = meetingFormValues(fresh);
    after.cicloId = locked.cicloId;
    after.inicioLocal = locked.inicioLocal;
  }
  return after;
}

export function meetingWriteFeedback(error, operation) {
  const fields = {};
  for (const field of ['cicloId', 'titulo', 'local', 'descricao']) if (error.fieldErrors?.[field]?.length) fields[field] = error.fieldErrors[field].join(' ');
  if (error.fieldErrors?.inicioEm?.length) fields.inicioLocal = `${error.fieldErrors.inicioEm.join(' ')} Confira o horário futuro e o período atual do ciclo.`;
  const uncertain = error.policy?.outcomeUnknown === true;
  let message = error.policy?.userMessage || 'Não foi possível concluir a operação.';
  if (uncertain) message = 'Não foi possível confirmar o resultado. Confira os dados atualizados antes de enviar novamente.';
  else if (error.code === 'INVALID_REFERENCE') { fields.cicloId = 'O ciclo escolhido não está disponível. Selecione outro ciclo.'; message = fields.cicloId; }
  else if (error.status === 404) message = 'Este encontro não está mais disponível. Consulte a agenda atualizada.';
  else if (error.status === 409) {
    if (error.code === 'RESOURCE_IN_USE' && operation === 'update') message = 'A troca de ciclo foi recusada porque há inscrições associadas. O encontro e as inscrições foram mantidos.';
    else if (operation === 'realize') message = 'Não foi possível realizar o encontro. O horário deve ter chegado e a situação atual precisa permitir a ação. Atualize os dados para conferir.';
    else if (operation === 'create') message = 'A criação exige um ciclo não concluído. Os dados podem ter mudado; confira o ciclo atualizado antes de tentar novamente.';
    else message = 'A operação conflita com os dados atuais do encontro ou do ciclo. Estados finais não permitem reabertura, troca de ciclo ou reagendamento. Atualize os dados para conferir.';
  }
  return { fields, message, uncertain, refreshRequired: uncertain || error.status === 409 || error.status === 404 };
}
