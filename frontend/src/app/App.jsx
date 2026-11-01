import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { HomePage } from '../pages/HomePage.jsx';
import { SiteHeader } from '../components/SiteHeader.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { cssVariables } from '../styles/tokens.js';
import { theme } from './theme.js';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{ ':root': cssVariables }} />
      <BrowserRouter>
        <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
        <SiteHeader />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={
            <main id="conteudo" className="not-found page-width" tabIndex={-1}>
              <p className="eyebrow">PÁGINA NÃO ENCONTRADA</p>
              <h1>Essa página ficou fora da história.</h1>
              <p>Volte ao início para conhecer o clube Leia+.</p>
              <Link className="text-link" to="/">Ir para a página inicial <span aria-hidden="true">→</span></Link>
            </main>
          } />
        </Routes>
        <SiteFooter />
      </BrowserRouter>
    </ThemeProvider>
  );
}
