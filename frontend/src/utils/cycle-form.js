import { isCatalogId } from './catalog-query.js';
import { isCivilDate } from './civil-dates.js';

export function cycleFormValues(cycle) {
  return { nome: cycle?.nome ?? '', livroId: cycle ? String(cycle.livroId) : '', dataInicio: cycle?.dataInicio ?? '', dataFim: cycle?.dataFim ?? '', orientacoes: cycle?.orientacoes ?? '' };
}

export function validateCycleForm(values) {
  const errors = {};
  const length = Array.from(values.nome.trim()).length;
  if (!length) errors.nome = 'Informe o nome do ciclo.';
  else if (length > 120) errors.nome = 'Use no máximo 120 caracteres.';
  if (!isCatalogId(values.livroId)) errors.livroId = 'Escolha um livro do catálogo.';
  for (const field of ['dataInicio', 'dataFim']) if (!isCivilDate(values[field])) errors[field] = 'Informe uma data válida.';
  if (!errors.dataInicio && !errors.dataFim && values.dataInicio > values.dataFim) errors.dataFim = 'A data final deve ser igual ou posterior à inicial.';
  if (Array.from(values.orientacoes).length > 2000) errors.orientacoes = 'Use no máximo 2000 caracteres.';
  return errors;
}

export function cycleFormPayload(values, original) {
  const payload = { nome: values.nome.trim(), livroId: Number(values.livroId), dataInicio: values.dataInicio, dataFim: values.dataFim, orientacoes: values.orientacoes === '' ? null : values.orientacoes };
  if (!original) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([field, value]) => value !== original[field]));
}

export function cycleWriteFeedback(error, operation) {
  const fields = {};
  for (const field of Object.keys(cycleFormValues())) if (error.fieldErrors?.[field]?.length) fields[field] = error.fieldErrors[field].join(' ');
  const uncertain = error.policy?.outcomeUnknown === true;
  let message = error.policy?.userMessage || 'Não foi possível concluir a operação.';
  if (uncertain) message = 'Não foi possível confirmar o resultado. Confira os dados atualizados antes de enviar novamente.';
  else if (error.code === 'INVALID_REFERENCE') { fields.livroId = 'O livro selecionado não está disponível. Escolha outro livro.'; message = fields.livroId; }
  else if (error.status === 404) message = 'Este ciclo não está mais disponível. Volte à listagem para conferir os dados atuais.';
  else if (error.status === 409) {
    if (error.code === 'RESOURCE_IN_USE') {
      message = operation === 'delete'
        ? 'A exclusão foi recusada porque há participações ou encontros vinculados. Os vínculos e o ciclo foram mantidos.'
        : operation === 'complete'
          ? 'A conclusão foi recusada porque há encontros agendados. O ciclo foi mantido em andamento.'
          : 'A troca de livro foi recusada porque há participações ou encontros vinculados. Os vínculos foram mantidos.';
    } else if (operation === 'start') message = 'Não foi possível iniciar. O servidor exige o período válido e nenhum outro ciclo em andamento. Os dados podem ter mudado; atualize a tela para conferir.';
    else message = 'A alteração conflita com os dados atuais. O período deve incluir os encontros vinculados e a situação deve respeitar a sequência permitida. Atualize a tela para conferir.';
  }
  return { fields, message, uncertain, conflict: error.status === 409 };
}
