'use client';

import type { User, UserRole } from '@/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  selectedUserId: string | null;
  dataLoadingCount: number;
  lastDataError: string | null;
  login: (user: User) => void;
  logout: () => void;
  setSelectedUserId: (userId: string) => void;
  hasRole: (role: UserRole) => boolean;
  startDataLoading: () => void;
  endDataLoading: () => void;
  setDataError: (message: string | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      selectedUserId: null,
      dataLoadingCount: 0,
      lastDataError: null,
      login: (user) => set({ user, isAuthenticated: true, selectedUserId: user.id }),
      logout: () => set({ user: null, isAuthenticated: false, selectedUserId: null }),
      setSelectedUserId: (userId) => set({ selectedUserId: userId }),
      hasRole: (role) => get().user?.role === role,
      startDataLoading: () => set((state) => ({ dataLoadingCount: state.dataLoadingCount + 1 })),
      endDataLoading: () => set((state) => ({ dataLoadingCount: Math.max(0, state.dataLoadingCount - 1) })),
      setDataError: (message) => set({ lastDataError: message }),
    }),
    {
      name: 'vel-auth',
      onRehydrateStorage: () => (state) => {
        state?.setDataError(null);
        useAuthStore.setState({ hasHydrated: true });
      },
    }
  )
);
