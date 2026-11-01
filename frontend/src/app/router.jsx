import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './PublicLayout.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { RouteErrorPage } from '../pages/RouteErrorPage.jsx';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { LoadingState } from '../components/LoadingState.jsx';

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
        path: '*',
        Component: NotFoundPage,
        ErrorBoundary: RouteErrorPage,
        handle: { title: 'Página não encontrada | Leia+' },
      },
    ],
  },
]);
