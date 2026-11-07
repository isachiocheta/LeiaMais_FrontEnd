import { cyclePeriod, formatCivilDate } from '../utils/civil-dates.js';

export function CyclePeriod({ cycle, today }) {
  const period = cyclePeriod(cycle.dataInicio, cycle.dataFim, today);
  return <div className="cycle-period">
    <p><time dateTime={cycle.dataInicio}>{formatCivilDate(cycle.dataInicio)}</time> a <time dateTime={cycle.dataFim}>{formatCivilDate(cycle.dataFim)}</time></p>
    <p className={`cycle-calendar cycle-calendar-${period.code}`}><span aria-hidden="true">▦</span> {period.label}</p>
    {period.code === 'past' && cycle.situacao === 'EM_ANDAMENTO' && <p className="cycle-period-note">O período terminou, mas a situação registrada continua em andamento. A conclusão depende de atualização pela administração.</p>}
  </div>;
}
