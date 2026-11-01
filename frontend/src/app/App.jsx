import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { cssVariables } from '../styles/tokens.js';
import { theme } from './theme.js';
import { router } from './router.jsx';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={{ ':root': cssVariables }} />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
