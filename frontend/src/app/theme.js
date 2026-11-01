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
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: tokens.border,
          borderRadius: tokens.radius.medium,
          backgroundColor: tokens.colors.cream,
          boxShadow: tokens.shadow.medium,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 600, lineHeight: 1.4 } } },
    MuiDialogActions: { styleOverrides: { root: { gap: 12, padding: 24, flexWrap: 'wrap' } } },
    MuiDialogContentText: { styleOverrides: { root: { color: tokens.colors.muted, fontSize: 14, lineHeight: 1.8 } } },
    MuiChip: {
      styleOverrides: {
        root: { border: tokens.border, fontWeight: 600, color: tokens.colors.ink, backgroundColor: tokens.colors.cream },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { border: tokens.border, borderRadius: tokens.radius.medium, boxShadow: tokens.shadow.blue },
        standardError: { color: tokens.colors.ink, backgroundColor: tokens.colors.sand },
        message: { width: '100%' },
      },
    },
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
          '&.Mui-disabled': { backgroundColor: tokens.colors.sand, color: tokens.colors.muted, boxShadow: 'none' },
        },
      },
    },
  },
});
