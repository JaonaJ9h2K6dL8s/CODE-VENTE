'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeColor = 'teal' | 'blue' | 'red' | 'pink' | 'purple' | 'orange' | 'green' | 'indigo' | 'amber' | 'cyan';
export type ReceiptTemplate = 'blue-grid' | 'clean-light' | 'emerald-pro' | 'mono-dark' | 'delivery-sheet' | 'pink-invoice';

export interface CompanyInfo {
  name: string;
  subtitle: string;
  logoUrl: string | null;
  receiptTemplate: ReceiptTemplate;
  receiptAccentColor: string;
}

interface ThemeStore {
  mode: 'light' | 'dark';
  accentColor: ThemeColor;
  company: CompanyInfo;
  toggleTheme: () => void;
  setTheme: (mode: 'light' | 'dark') => void;
  setAccentColor: (color: ThemeColor) => void;
  setCompany: (info: Partial<CompanyInfo>) => void;
}

export const THEME_COLORS: Record<ThemeColor, { label: string; main: string; light: string; dark: string }> = {
  teal:   { label: 'Teal',    main: '#2E7D6F', light: '#4CAF9C', dark: '#1B5E50' },
  blue:   { label: 'Bleu',    main: '#1976D2', light: '#42A5F5', dark: '#1565C0' },
  red:    { label: 'Rouge',   main: '#D32F2F', light: '#EF5350', dark: '#C62828' },
  pink:   { label: 'Rose',    main: '#C2185B', light: '#EC407A', dark: '#AD1457' },
  purple: { label: 'Violet',  main: '#7B1FA2', light: '#AB47BC', dark: '#6A1B9A' },
  orange: { label: 'Orange',  main: '#E65100', light: '#FF9800', dark: '#BF360C' },
  green:  { label: 'Vert',    main: '#2E7D32', light: '#66BB6A', dark: '#1B5E20' },
  indigo: { label: 'Indigo',  main: '#303F9F', light: '#5C6BC0', dark: '#283593' },
  amber:  { label: 'Ambre',   main: '#FF8F00', light: '#FFB300', dark: '#E65100' },
  cyan:   { label: 'Cyan',    main: '#00838F', light: '#26C6DA', dark: '#006064' },
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'light',
      accentColor: 'teal',
      company: {
        name: 'Vente',
        subtitle: 'En ligne',
        logoUrl: null,
        receiptTemplate: 'blue-grid',
        receiptAccentColor: '#D979A8',
      },
      toggleTheme: () => set((state) => ({ mode: state.mode === 'light' ? 'dark' : 'light' })),
      setTheme: (mode) => set({ mode }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setCompany: (info) => set((state) => ({ company: { ...state.company, ...info } })),
    }),
    { name: 'vel-theme' }
  )
);
