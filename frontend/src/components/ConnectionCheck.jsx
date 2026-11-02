import { ContentCard } from './ContentCard.jsx';
import { PrimaryButton } from './PrimaryButton.jsx';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { useConnectionCheck } from '../hooks/useConnectionCheck.js';

export function ConnectionCheck() {
  const { status, error, check } = useConnectionCheck();
  return (
    <ContentCard component="section" className="connection-check" aria-labelledby="connection-title">
      <h2 id="connection-title">Conexão com o Leia+</h2>
      <p>Verifique se o clube está disponível neste momento.</p>
      {status === 'loading' && <LoadingState compact message="Verificando a conexão com o clube…" />}
      {status === 'success' && <p className="connection-result" role="status">O Leia+ respondeu e estava disponível na última verificação.</p>}
      {status === 'error' && <ErrorState title="Não foi possível verificar a conexão" message={error?.policy?.userMessage} />}
      <PrimaryButton onClick={check} disabled={status === 'loading'}>
        {status === 'loading' ? 'Verificando…' : status === 'idle' ? 'Verificar conexão' : 'Verificar novamente'}
      </PrimaryButton>
    </ContentCard>
  );
}
