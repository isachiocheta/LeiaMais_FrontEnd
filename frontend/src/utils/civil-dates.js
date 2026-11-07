export const CLUB_TIME_ZONE = 'America/Sao_Paulo';
const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function isCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function formatCivilDate(value) {
  if (!isCivilDate(value)) return 'Data inválida';
  const [year, month, day] = value.split('-');
  return `${Number(day)} de ${months[Number(month) - 1]} de ${year}`;
}

export function civilToday(instant = Date.now()) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

export function cyclePeriod(start, end, today = civilToday()) {
  if (![start, end, today].every(isCivilDate) || start > end) return null;
  if (today < start) return { code: 'future', label: 'Período previsto ainda não iniciado' };
  if (today > end) return { code: 'past', label: 'Período previsto encerrado' };
  return { code: 'within', label: 'Dentro do período previsto' };
}
