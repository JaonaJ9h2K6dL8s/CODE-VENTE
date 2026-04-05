'use client';

import { THEME_COLORS, type ThemeColor } from '@/stores/themeStore';
import { createTheme, type ThemeOptions } from '@mui/material/styles';

const commonTheme: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, fontSize: '2.5rem' },
    h2: { fontWeight: 700, fontSize: '2rem' },
    h3: { fontWeight: 600, fontSize: '1.75rem' },
    h4: { fontWeight: 600, fontSize: '1.5rem' },
    h5: { fontWeight: 600, fontSize: '1.25rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    subtitle1: { fontWeight: 500, fontSize: '1rem' },
    subtitle2: { fontWeight: 500, fontSize: '0.875rem' },
    body1: { fontSize: '0.938rem' },
    body2: { fontSize: '0.875rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          fontWeight: 600,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          border: '1px solid',
          borderColor: 'rgba(0,0,0,0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: { '& .MuiOutlinedInput-root': { borderRadius: 10 } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 8 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { border: 'none' },
      },
    },
  },
};

export function buildTheme(mode: 'light' | 'dark', accentColor: ThemeColor) {
  const color = THEME_COLORS[accentColor];

  if (mode === 'dark') {
    return createTheme({
      ...commonTheme,
      palette: {
        mode: 'dark',
        primary: {
          main: color.light,
          light: color.light,
          dark: color.main,
          contrastText: '#FFFFFF',
        },
        secondary: {
          main: '#FF8A5C',
          light: '#FFAB8A',
          dark: '#FF6B35',
        },
        background: {
          default: '#0F1724',
          paper: '#1A2332',
        },
        text: {
          primary: '#E8ECF2',
          secondary: '#8899AA',
        },
        success: { main: '#22C55E', light: '#14532D' },
        warning: { main: '#F59E0B', light: '#78350F' },
        error: { main: '#EF4444', light: '#7F1D1D' },
        info: { main: '#3B82F6', light: '#1E3A5F' },
        divider: 'rgba(255,255,255,0.08)',
      },
    });
  }

  return createTheme({
    ...commonTheme,
    palette: {
      mode: 'light',
      primary: {
        main: color.main,
        light: color.light,
        dark: color.dark,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: '#FF6B35',
        light: '#FF8A5C',
        dark: '#E55A2B',
      },
      background: {
        default: '#F5F7FA',
        paper: '#FFFFFF',
      },
      text: {
        primary: '#1A2138',
        secondary: '#6B7A99',
      },
      success: { main: '#22C55E', light: '#DCFCE7' },
      warning: { main: '#F59E0B', light: '#FEF3C7' },
      error: { main: '#EF4444', light: '#FEE2E2' },
      info: { main: '#3B82F6', light: '#DBEAFE' },
      divider: 'rgba(0,0,0,0.08)',
    },
  });
}

// Keep exports for backward compatibility
export const lightTheme = buildTheme('light', 'teal');
export const darkTheme = buildTheme('dark', 'teal');
