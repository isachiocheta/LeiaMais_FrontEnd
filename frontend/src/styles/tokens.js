// Fonte única dos tokens usados pelo ThemeProvider e pelas variáveis CSS.
export const tokens = {
  colors: {
    cream: '#FDF4E3',
    blue: '#6A89A7',
    yellow: '#F4C542',
    sand: '#EFD8A6',
    ink: '#1D1D1D',
    muted: '#4D4A43',
    blueText: '#35516B',
  },
  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '32px', 7: '48px', 8: '64px', 9: '96px' },
  radius: { small: '12px', medium: '20px', large: '28px', pill: '999px' },
  border: '2px solid #1D1D1D',
  shadow: { small: '3px 3px 0 #1D1D1D', medium: '6px 6px 0 #1D1D1D', blue: '5px 5px 0 #6A89A7' },
  font: '"Poppins", "Segoe UI", Arial, sans-serif',
};

export const cssVariables = {
  ...Object.fromEntries(Object.entries(tokens.colors).map(([key, value]) => [`--color-${key}`, value])),
  ...Object.fromEntries(Object.entries(tokens.space).map(([key, value]) => [`--space-${key}`, value])),
  ...Object.fromEntries(Object.entries(tokens.radius).map(([key, value]) => [`--radius-${key}`, value])),
  ...Object.fromEntries(Object.entries(tokens.shadow).map(([key, value]) => [`--shadow-${key}`, value])),
  '--border': tokens.border,
  '--font-body': tokens.font,
};
