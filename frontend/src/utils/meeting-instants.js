import { DateTime } from 'luxon';
import { CLUB_TIME_ZONE, isCivilDate } from './civil-dates.js';

export { CLUB_TIME_ZONE as MEETING_TIME_ZONE };
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const stampDay = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, day: '2-digit' });
const stampMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: CLUB_TIME_ZONE, month: 'short' });

export function isMeetingInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isCivilDate(value.slice(0, 10)) && DateTime.fromISO(value, { setZone: true }).isValid;
}

function instant(value) {
  if (!isMeetingInstant(value)) throw new RangeError('Informe um instante ISO válido com fuso explícito.');
  return DateTime.fromISO(value, { setZone: true }).setZone(CLUB_TIME_ZONE);
}

export function meetingPresentation(value) {
  const millis = instant(value).toMillis();
  return { date: dateFormat.format(millis), time: timeFormat.format(millis), day: stampDay.format(millis), month: stampMonth.format(millis) };
}

export function formatMeetingInstant(value) {
  const { date, time } = meetingPresentation(value);
  return `${date} às ${time}`;
}

export function meetingInstantToCivil(value) {
  const local = instant(value);
  return { date: local.toFormat('yyyy-MM-dd'), time: local.toFormat('HH:mm:ss.SSS'), offsetMinutes: local.offset };
}

export function meetingCivilToInstant({ date, time, offsetMinutes }, { disambiguation = 'reject' } = {}) {
  if (!isCivilDate(date) || typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(time) || !['reject', 'earlier', 'later'].includes(disambiguation)) throw new RangeError('Informe data e horário civis válidos em São Paulo.');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, seconds = '0'] = time.split(':');
  const [second, fraction = ''] = seconds.split('.');
  const fields = { year, month, day, hour: Number(hour), minute: Number(minute), second: Number(second), millisecond: Number(fraction.padEnd(3, '0')) };
  const local = DateTime.fromObject(fields, { zone: CLUB_TIME_ZONE });
  if (!local.isValid || Object.entries(fields).some(([key, value]) => local[key] !== value)) throw new RangeError('Este horário não existe no calendário de São Paulo.');
  const candidates = local.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
  let selected;
  if (offsetMinutes !== undefined) selected = candidates.find((candidate) => candidate.offset === offsetMinutes);
  else if (candidates.length === 1 || disambiguation === 'earlier') selected = candidates[0];
  else if (disambiguation === 'later') selected = candidates.at(-1);
  if (!selected) throw new RangeError('Este horário é ambíguo ou o deslocamento informado não corresponde a São Paulo.');
  return selected.toUTC().toISO({ suppressMilliseconds: false });
}
