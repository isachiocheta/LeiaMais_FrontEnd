// Fixture exclusiva de teste: não é uma rota da aplicação nem entra no build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import { theme } from '../src/app/theme.js';
import { cssVariables } from '../src/styles/tokens.js';
import { ConfirmDialog } from '../src/components/ConfirmDialog.jsx';
import { ContentContainer } from '../src/components/ContentContainer.jsx';
import { ContentCard } from '../src/components/ContentCard.jsx';
import { PageHeader } from '../src/components/PageHeader.jsx';
import { PrimaryButton } from '../src/components/PrimaryButton.jsx';
import { LoadingState } from '../src/components/LoadingState.jsx';
import { EmptyState } from '../src/components/EmptyState.jsx';
import { ErrorState } from '../src/components/ErrorState.jsx';
import { StatusBadge } from '../src/components/StatusBadge.jsx';
import '../src/styles/global.css';
import '../src/styles/public.css';

function ComponentsFixture() {
  const [open, setOpen] = useState(false);
  const [fail, setFail] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [retries, setRetries] = useState(0);

  async function confirm() {
    setAttempts((count) => count + 1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (fail) throw new Error('Falha exclusiva do cenário de teste.');
    setOpen(false);
  }

  return (
    <ContentContainer component="main" className="inner-page">
      <PageHeader eyebrow="FIXTURE SEM API OU PERSISTÊNCIA" title="Componentes — cenário de teste" />
      <ContentCard className="profile-card">
        <h2>Confirmação</h2>
        <label><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} /> Simular falha</label>
        <div className="state-action"><PrimaryButton onClick={() => setOpen(true)}>Abrir confirmação de teste</PrimaryButton></div>
        <p role="status">Confirmações executadas: {attempts}</p>
        <ConfirmDialog open={open} title="Confirmar ação de teste?" description="Este cenário não acessa a API nem altera dados." onConfirm={confirm} onCancel={() => setOpen(false)} />
      </ContentCard>
      <LoadingState message="Carregando cenário de teste…" />
      <ContentCard><EmptyState title="Nenhum item no cenário de teste" description="Exemplo exclusivo da fixture." /></ContentCard>
      <div className="about-section">
        <ErrorState title="Erro do cenário de teste" message="Falha controlada, sem comunicação com a API." onRetry={() => setRetries((count) => count + 1)} />
        <p role="status">Novas tentativas: {retries}</p>
      </div>
      <p>Situações de exemplo: <StatusBadge status="PENDENTE" /> <StatusBadge status="ATIVO" /> <StatusBadge status="INATIVO" /> <StatusBadge status="DESCONHECIDO" /></p>
    </ContentContainer>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{ ':root': cssVariables }} />
      <ComponentsFixture />
    </ThemeProvider>
  </React.StrictMode>,
);
