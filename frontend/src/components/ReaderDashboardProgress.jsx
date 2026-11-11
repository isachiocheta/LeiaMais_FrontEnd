import { useId } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import { readerProgressPresentation, readerReadingState } from '../utils/reader-dashboard-presentation.js';
import { formatDashboardCount, formatDashboardInstant } from '../utils/dashboard-presentation.js';

const labels = { page_zero: 'Leitura ainda não iniciada', in_progress: 'Leitura em progresso', completed: 'Leitura concluída' };

export function ReaderDashboardProgress({ participation }) {
  const id = useId();
  const progress = readerProgressPresentation(participation);
  const state = readerReadingState(participation);
  const pages = `Página ${formatDashboardCount(participation.paginaAtual)} de ${formatDashboardCount(participation.totalPaginas)}`;
  return <section className="reader-home-progress" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{labels[state]}</h3>
    {state === 'page_zero' && <p>Sua participação está registrada. A leitura começa na página zero.</p>}
    <div className="reader-home-progress-summary"><p id={`${id}-pages`}>{pages}</p><strong>{progress.label}</strong></div>
    <LinearProgress variant="determinate" value={progress.value} aria-labelledby={`${id}-pages`} aria-valuetext={`${pages}; ${progress.label}; ${labels[state]}`} />
    {progress.roundedIncomplete && <p className="reader-home-progress-note">O percentual foi arredondado no resumo. Sua leitura continua em progresso até registrar a última página.</p>}
    {state === 'in_progress' && participation.percentual === 0 && <p className="reader-home-progress-note">O percentual está arredondado para 0%, mas as páginas já registradas estão preservadas.</p>}
    {participation.concluidaEm && <p className="reader-home-completion">Conclusão registrada em <time dateTime={participation.concluidaEm}>{formatDashboardInstant(participation.concluidaEm)}</time> (São Paulo).</p>}
  </section>;
}
