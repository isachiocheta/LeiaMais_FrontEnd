import { useId } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import { readingProgress, formatReadingInstant } from '../utils/reading-progress.js';

export function ReadingProgress({ participation, total, label = 'Progresso da leitura' }) {
  const id = useId();
  const progress = readingProgress(participation.paginaAtual, total);
  const pagesText = `Página ${participation.paginaAtual.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
  return <div className="reading-progress">
    <div className="reading-progress-summary"><p id={id}>{label}: <strong>{pagesText}</strong></p><span>{progress.label}</span></div>
    <LinearProgress variant="determinate" value={progress.value} aria-labelledby={id} aria-valuetext={`${pagesText}; ${progress.label}; ${participation.concluida ? 'leitura concluída' : 'leitura não concluída'}`} />
    <p className="reading-completion"><span aria-hidden="true">{participation.concluida ? '✓' : '◇'}</span> {participation.concluida ? 'Leitura concluída' : 'Leitura não concluída'}{participation.concluidaEm && <> · Conclusão registrada em <time dateTime={participation.concluidaEm}>{formatReadingInstant(participation.concluidaEm)}</time></>}</p>
  </div>;
}
