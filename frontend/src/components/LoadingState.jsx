import CircularProgress from '@mui/material/CircularProgress';

export function LoadingState({ message = 'Carregando a página…', compact = false }) {
  return (
    <div className={`loading-state${compact ? ' loading-state-compact' : ''}`} role="status" aria-live="polite">
      <CircularProgress size={compact ? 20 : 32} thickness={4} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
