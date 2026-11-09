import { useId } from 'react';
import { formatDashboardCount, formatDashboardPercent } from '../utils/dashboard-presentation.js';

function AnalyticsBar({ label, value, description, tone }) {
  const id = useId();
  return <div className={`dashboard-bar dashboard-bar-${tone}`}>
    <div className="dashboard-bar-heading"><h4 id={`${id}-label`}>{label}</h4><strong>{formatDashboardPercent(value)}</strong></div>
    <div className="dashboard-bar-track" role="meter" aria-labelledby={`${id}-label`} aria-describedby={`${id}-definition`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={formatDashboardPercent(value)}><span style={{ width: `${value}%`, borderRightWidth: value === 0 ? 0 : 1 }} /></div>
    <p id={`${id}-definition`}>{description}</p>
  </div>;
}

export function CycleAnalytics({ indicators }) {
  return <figure className="cycle-analytics">
    <figcaption><h3>Conclusão e avanço da leitura</h3><p>Duas medidas diferentes, em uma escala de 0 a 100%.</p></figcaption>
    <div className="dashboard-cycle-counts"><p><strong>{formatDashboardCount(indicators.participantes)}</strong> {indicators.participantes === 1 ? 'participante' : 'participantes'}</p><p><strong>{formatDashboardCount(indicators.leiturasConcluidas)}</strong> {indicators.leiturasConcluidas === 1 ? 'leitura concluída' : 'leituras concluídas'}</p></div>
    {indicators.participantes === 0 && <p className="dashboard-zero-participants">Este ciclo ainda não tem participantes. O resumo registra taxa de conclusão e progresso médio de 0%.</p>}
    <AnalyticsBar label="Taxa de conclusão" value={indicators.taxaConclusao} tone="yellow" description="Proporção de participantes que chegaram exatamente ao total de páginas do livro." />
    <AnalyticsBar label="Progresso médio" value={indicators.progressoMedio} tone="blue" description="Média do percentual de páginas lidas por cada participante, incluindo leituras ainda não concluídas." />
    <p className="dashboard-analysis-note">As participações históricas são consideradas, inclusive de contas atualmente inativas. Os percentuais são arredondados pelo clube: progresso médio de 100% não comprova que todas as leituras foram concluídas.</p>
  </figure>;
}
