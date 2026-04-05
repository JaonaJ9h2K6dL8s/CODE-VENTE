'use client';

import { useAuthStore } from '@/stores/authStore';
import { Box, CircularProgress } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (hasHydrated) {
      setIsAuthReady(true);
    }
  }, [hasHydrated]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setIsAuthReady(true);
    }, 1200);
    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }
    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isAuthReady, isAuthenticated, router]);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <CircularProgress />
    </Box>
  );
}
