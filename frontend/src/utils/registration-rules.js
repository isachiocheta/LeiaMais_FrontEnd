import { canRecordReading } from './reading-progress.js';
import { civilToday } from './civil-dates.js';
import { meetingInstantToCivil } from './meeting-instants.js';

export function registrationBlock(meeting, cycle, participation, now = Date.now()) {
  if (meeting.situacao !== 'AGENDADO') return 'A inscrição e o cancelamento só são permitidos em encontros Agendados.';
  if (Date.parse(meeting.inicioEm) <= now) return 'O horário deste encontro já chegou. Inscrições e cancelamentos estão encerrados.';
  if (!canRecordReading(cycle, civilToday(new Date(now)))) return 'O ciclo precisa estar Em andamento e dentro do período para inscrever-se ou cancelar.';
  const day = meetingInstantToCivil(meeting.inicioEm).date;
  if (day < cycle.dataInicio || day > cycle.dataFim) return 'A data do encontro precisa estar dentro do período do ciclo.';
  if (!participation || participation.cicloId !== meeting.cicloId) return 'É necessário participar da leitura neste mesmo ciclo antes de se inscrever no encontro.';
  return '';
}

export function registrationFeedback(error) {
  if (error.policy?.outcomeUnknown) return 'Não foi possível confirmar o resultado. Atualize os dados antes de tentar novamente.';
  if (error.status === 409) return error.code === 'DUPLICATE_RESOURCE'
    ? 'Você já tem uma inscrição neste encontro. Atualize os dados para consultar seu registro.'
    : 'O encontro ou ciclo mudou, ou o prazo encerrou. Atualize os dados para conferir.';
  if (error.status === 404) return 'O encontro ou a sua inscrição não está mais disponível. Atualize os dados para conferir.';
  if (error.status === 403) return 'A operação não foi autorizada. Confira sua participação no ciclo e atualize os dados; a validação de segurança também pode ter expirado.';
  return error.policy?.userMessage || 'Não foi possível alterar sua inscrição. Atualize os dados para conferir.';
}
