import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { AUTH_STATUS } from '../app/auth-controller.js';
import { loginDestination } from '../utils/return-to.js';
import { ContentContainer } from './ContentContainer.jsx';
import { PageHeader } from './PageHeader.jsx';
import { LoadingState } from './LoadingState.jsx';
import { SessionProblem } from './SessionProblem.jsx';

export function RequireAuth({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === AUTH_STATUS.CHECKING) return <LoadingState message={auth.action === 'logout' ? 'Encerrando sua sessão…' : 'Verificando sua sessão…'} />;
  if (auth.status === AUTH_STATUS.TEMPORARY_ERROR) return (
    <ContentContainer className="inner-page">
      <PageHeader eyebrow="SUA CONTA" title="Vamos conferir sua sessão" />
      <SessionProblem />
    </ContentContainer>
  );
  if (auth.status !== AUTH_STATUS.AUTHENTICATED) return <Navigate to={loginDestination(location)} replace />;
  return children ?? <Outlet />;
}

function RoleContent({ allowedRoles, children }) {
  const { user } = useAuth();
  if (!allowedRoles.includes(user.perfil)) return <Navigate to="/acesso-negado" replace />;
  return children ?? <Outlet />;
}

export function RequireRole({ allowedRoles, children }) {
  return <RequireAuth><RoleContent allowedRoles={allowedRoles}>{children}</RoleContent></RequireAuth>;
}
