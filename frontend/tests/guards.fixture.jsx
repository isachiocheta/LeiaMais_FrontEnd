import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { AuthContext } from '../src/app/AuthProvider.jsx';
import { RequireRole } from '../src/components/AuthGuards.jsx';
import { theme } from '../src/app/theme.js';
import { cssVariables } from '../src/styles/tokens.js';
import '../src/styles/global.css';
import '../src/styles/public.css';
import '../src/styles/auth.css';

function Destination() {
  const location = useLocation();
  return <><h1>Login da fixture</h1><p>{location.search}</p></>;
}

function Fixture() {
  const params = new URLSearchParams(window.location.search);
  const [status, setStatus] = useState(params.get('estado') || 'authenticated');
  const user = { id: 1, nome: 'Pessoa da fixture', email: 'fixture@example.test', perfil: params.get('perfil') || 'LEITOR', situacao: 'ATIVO' };
  return (
    <AuthContext.Provider value={{ status, user: status === 'authenticated' ? user : null, action: null, reason: 'verification_failed', needsVerification: false, verifySession: async () => setStatus('authenticated') }}>
      <MemoryRouter initialEntries={[params.get('destino') || '/admin']}>
        <p>Cenário isolado de teste de guardas, sem dados da API.</p>
        <Routes>
          <Route path="/admin" element={<RequireRole allowedRoles={['ADMIN_CLUBE']}><h1>Conteúdo protegido de administração</h1></RequireRole>} />
          <Route path="/leitor" element={<RequireRole allowedRoles={['LEITOR']}><h1>Conteúdo protegido de leitor</h1></RequireRole>} />
          <Route path="/acesso-negado" element={<h1>Acesso negado na fixture</h1>} />
          <Route path="/login" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline /><GlobalStyles styles={{ ':root': cssVariables }} /><Fixture /></ThemeProvider>);
