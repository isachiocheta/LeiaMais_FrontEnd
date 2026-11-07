import { civilToday, cyclePeriod, CLUB_TIME_ZONE } from './civil-dates.js';

export function readingProgress(page, total) {
  if (!Number.isInteger(page) || !Number.isInteger(total) || total < 1 || total > 2147483647 || page < 0 || page > total) throw new RangeError('Progresso inválido.');
  const complete = page === total;
  const value = complete ? 100 : Math.min(99.99, page * 100 / total);
  const truncated = Math.floor(page * 10000 / total) / 100;
  const label = complete ? '100%' : page > 0 && truncated === 0 ? '<0,01%' : `${truncated.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  return { complete, value, label };
}

export function canRecordReading(cycle, today = civilToday()) {
  return cycle.situacao === 'EM_ANDAMENTO' && cyclePeriod(cycle.dataInicio, cycle.dataFim, today)?.code === 'within';
}

export function validateReadingPage(value, total) {
  if (value.trim() === '') return 'Informe a página atual, inclusive zero se ainda não começou.';
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > total) return `Informe uma página inteira entre 0 e ${total.toLocaleString('pt-BR')}.`;
  return '';
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, dateStyle: 'long', timeStyle: 'short' });
export function formatReadingInstant(value) { return dateFormat.format(new Date(value)); }

export function readingWriteFeedback(error, operation) {
  const uncertain = error.policy?.outcomeUnknown === true;
  let message = error.policy?.userMessage || 'Não foi possível salvar sua leitura.';
  if (uncertain) message = 'Não foi possível confirmar o resultado. Atualize os dados antes de enviar novamente.';
  else if (error.status === 409) message = operation === 'join' && error.code === 'DUPLICATE_RESOURCE'
    ? 'Você já possui uma participação neste ciclo. Atualize os dados para consultar sua leitura.'
    : 'O ciclo ou o período não permite esta operação no estado atual. Atualize os dados para conferir.';
  else if (error.status === 404) message = 'O ciclo ou a participação não está mais disponível. Atualize os dados para conferir.';
  return { message, field: error.fieldErrors?.paginaAtual?.join(' ') || '', refreshRequired: uncertain || error.status === 409 || error.status === 404 };
}
