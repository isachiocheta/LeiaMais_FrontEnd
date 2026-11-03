import { useAuth } from '../hooks/useAuth.js';
import { ErrorState } from './ErrorState.jsx';

export function SessionProblem() {
  const auth = useAuth();
  const message = auth.reason === 'logout_uncertain'
    ? 'Não foi possível confirmar a saída. Verifique sua sessão antes de repetir a operação.'
    : auth.needsVerification
      ? 'A entrada pode ter sido concluída. Verifique sua sessão antes de tentar entrar novamente.'
      : 'Não foi possível verificar sua sessão. Uma falha de conexão não significa que você saiu da conta.';
  return <ErrorState title="Não foi possível verificar a sessão" message={message} retryLabel="Verificar sessão novamente" onRetry={() => auth.verifySession().catch(() => {})} />;
}
