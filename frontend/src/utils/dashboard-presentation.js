import { CLUB_TIME_ZONE } from './civil-dates.js';

const timestamp = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, dateStyle: 'long', timeStyle: 'medium' });
export const formatDashboardInstant = (value) => timestamp.format(new Date(value));
export const formatDashboardCount = (value) => value.toLocaleString('pt-BR');
export const formatDashboardPercent = (value) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
export function dashboardErrorMessage(error) {
  if (error.status === 401) return 'Sua sessão não está mais disponível. Entre novamente para consultar o painel.';
  if (error.status === 403) return 'Sua conta não tem permissão para consultar o painel administrativo. Confira sua sessão.';
  return error.policy?.userMessage || 'Não foi possível consultar os indicadores do clube.';
}
