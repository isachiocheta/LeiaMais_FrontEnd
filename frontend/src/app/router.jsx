import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './PublicLayout.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { RouteErrorPage } from '../pages/RouteErrorPage.jsx';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { RequireAuth, RequireRole } from '../components/AuthGuards.jsx';
import { MemberPage } from '../pages/MemberPage.jsx';
import { AccessDeniedPage } from '../pages/AccessDeniedPage.jsx';

function InitialLoadingState() {
  return <ContentContainer className="initial-loading"><LoadingState /></ContentContainer>;
}

export const router = createBrowserRouter([
  {
    Component: PublicLayout,
    HydrateFallback: InitialLoadingState,
    children: [
      {
        index: true,
        Component: HomePage,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Leia+ | Histórias que aproximam' },
      },
      {
        path: 'sobre',
        lazy: async () => {
          const { AboutPage } = await import('../pages/AboutPage.jsx');
          return { Component: AboutPage };
        },
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Sobre o clube | Leia+' },
      },
      {
        path: 'login',
        lazy: async () => {
          const { LoginPage } = await import('../pages/LoginPage.jsx');
          return { Component: LoginPage };
        },
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Entrar | Leia+', handlesSessionError: true },
      },
      {
        path: 'cadastro',
        lazy: async () => {
          const { RegistrationPage } = await import('../pages/RegistrationPage.jsx');
          return { Component: RegistrationPage };
        },
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Cadastro | Leia+', handlesSessionError: true },
      },
      {
        path: 'minha-area',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE', 'LEITOR']}><MemberPage /></RequireRole>,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Minha área | Leia+', requiresAuth: true },
      },
      {
        path: 'catalogo',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE', 'LEITOR']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../pages/CatalogPage.jsx')).CatalogPage }),
            handle: { title: 'Catálogo de livros | Leia+', preserveSearchFocus: true },
          },
          {
            path: ':id',
            lazy: async () => ({ Component: (await import('../pages/BookDetailsPage.jsx')).BookDetailsPage }),
            handle: { title: 'Detalhes do livro | Leia+' },
          },
        ],
      },
      {
        path: 'acesso-negado',
        element: <RequireAuth><AccessDeniedPage /></RequireAuth>,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Acesso não permitido | Leia+', requiresAuth: true },
      },
      {
        path: '*',
        Component: NotFoundPage,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Página não encontrada | Leia+' },
      },
    ],
  },
]);
