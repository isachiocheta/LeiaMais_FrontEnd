import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { PrimaryButton } from './PrimaryButton.jsx';

export function ErrorState({ title = 'Não foi possível continuar', message, onRetry, retryLabel = 'Tentar novamente' }) {
  return (
    <Alert severity="error" className="error-state" icon={false}>
      <AlertTitle component="h2">{title}</AlertTitle>
      <p>{message || 'Ocorreu um problema ao abrir este conteúdo. Tente novamente.'}</p>
      {onRetry && <div className="state-action"><PrimaryButton onClick={onRetry}>{retryLabel}</PrimaryButton></div>}
    </Alert>
  );
}
