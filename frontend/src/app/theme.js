import { createTheme } from '@mui/material/styles';
import { tokens } from '../styles/tokens.js';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.colors.blueText, contrastText: tokens.colors.cream },
    secondary: { main: tokens.colors.yellow, contrastText: tokens.colors.ink },
    background: { default: tokens.colors.cream, paper: tokens.colors.cream },
    text: { primary: tokens.colors.ink, secondary: tokens.colors.muted },
    divider: tokens.colors.ink,
  },
  typography: { fontFamily: tokens.font, button: { textTransform: 'none', fontWeight: 600 } },
  spacing: 4,
  shape: { borderRadius: 12 },
  leia: tokens,
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: true },
      styleOverrides: {
        root: {
          border: tokens.border,
          borderRadius: tokens.radius.small,
          padding: '13px 22px',
          fontSize: '0.875rem',
          lineHeight: 1.6,
          minHeight: 48,
          boxShadow: tokens.shadow.small,
          '&:focus-visible': { outline: `3px solid ${tokens.colors.ink}`, outlineOffset: 5 },
        },
        containedSecondary: {
          '&:hover': { backgroundColor: tokens.colors.sand, boxShadow: tokens.shadow.small },
        },
      },
    },
  },
});
