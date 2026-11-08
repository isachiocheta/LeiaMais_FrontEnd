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
        path: 'minhas-leituras',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE', 'LEITOR']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Minhas leituras | Leia+', requiresAuth: true },
        children: [{ index: true, lazy: async () => ({ Component: (await import('../pages/ReadingHistoryPage.jsx')).ReadingHistoryPage }) }],
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
        path: 'ciclos',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE', 'LEITOR']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../pages/CyclesPage.jsx')).CyclesPage }),
            handle: { title: 'Ciclos de leitura | Leia+', preserveSearchFocus: true },
          },
          {
            path: ':id',
            lazy: async () => ({ Component: (await import('../pages/CycleDetailsPage.jsx')).CycleDetailsPage }),
            handle: { title: 'Detalhes do ciclo | Leia+' },
          },
        ],
      },
      {
        path: 'encontros',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE', 'LEITOR']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          { index: true, lazy: async () => ({ Component: (await import('../pages/MeetingsPage.jsx')).MeetingsPage }), handle: { title: 'Agenda do clube | Leia+', preserveSearchFocus: true } },
          { path: ':id', lazy: async () => ({ Component: (await import('../pages/MeetingDetailsPage.jsx')).MeetingDetailsPage }), handle: { title: 'Detalhes do encontro | Leia+' } },
        ],
      },
      {
        path: 'admin/encontros',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          { path: 'novo', lazy: async () => ({ Component: (await import('../pages/MeetingEditorPage.jsx')).MeetingEditorPage }), handle: { title: 'Novo encontro | Leia+' } },
          { path: ':id/editar', lazy: async () => ({ Component: (await import('../pages/MeetingEditorPage.jsx')).MeetingEditorPage }), handle: { title: 'Editar encontro | Leia+' } },
        ],
      },
      {
        path: 'admin/ciclos',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          {
            path: ':id/participantes',
            lazy: async () => ({ Component: (await import('../pages/CycleParticipantsPage.jsx')).CycleParticipantsPage }),
            handle: { title: 'Participantes do ciclo | Leia+' },
          },
          {
            path: 'novo',
            lazy: async () => ({ Component: (await import('../pages/CycleEditorPage.jsx')).CycleEditorPage }),
            handle: { title: 'Novo ciclo | Leia+' },
          },
          {
            path: ':id/editar',
            lazy: async () => ({ Component: (await import('../pages/CycleEditorPage.jsx')).CycleEditorPage }),
            handle: { title: 'Editar ciclo | Leia+' },
          },
        ],
      },
      {
        path: 'admin/livros',
        element: <RequireRole allowedRoles={['ADMIN_CLUBE']} />,
        ErrorBoundary: RouteErrorPage,
        handle: { requiresAuth: true },
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../pages/AdminBooksPage.jsx')).AdminBooksPage }),
            handle: { title: 'Administrar livros | Leia+', preserveSearchFocus: true },
          },
          {
            path: 'novo',
            lazy: async () => ({ Component: (await import('../pages/BookEditorPage.jsx')).BookEditorPage }),
            handle: { title: 'Novo livro | Leia+' },
          },
          {
            path: ':id/editar',
            lazy: async () => ({ Component: (await import('../pages/BookEditorPage.jsx')).BookEditorPage }),
            handle: { title: 'Editar livro | Leia+' },
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
