import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { cssVariables } from '../styles/tokens.js';
import { theme } from './theme.js';
import { router } from './router.jsx';
import { AuthProvider } from './AuthProvider.jsx';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{ ':root': cssVariables }} />
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </ThemeProvider>
  );
}
