import { formatDashboardPercent } from './dashboard-presentation.js';

export function readerReadingState(participation) {
  if (!participation) return 'not_joined';
  if (participation.concluida) return 'completed';
  return participation.paginaAtual === 0 ? 'page_zero' : 'in_progress';
}

export function readerProgressPresentation(participation) {
  const roundedIncomplete = !participation.concluida && participation.percentual === 100;
  return {
    value: roundedIncomplete ? 99.99 : participation.percentual,
    label: roundedIncomplete ? 'Menos de 100%' : formatDashboardPercent(participation.percentual),
    roundedIncomplete,
  };
}

export function readerDashboardError(error) {
  if (error.status === 401) return 'Sua sessão não está mais disponível. Entre novamente para consultar sua leitura.';
  if (error.status === 403) return 'Este painel é exclusivo de contas do perfil Leitor. Confira sua sessão.';
  return error.policy?.userMessage || 'Não foi possível consultar seu acompanhamento de leitura.';
}
