'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Wifi, WifiOff } from '@mui/icons-material';

export default function ServerStatus() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  const checkStatus = async () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('/api/health', { 
        signal: controller.signal,
        cache: 'no-store' 
      });

      if (res.ok) {
        setIsOnline(true);
      } else {
        setIsOnline(false);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setIsOnline(false);
    } finally {
      clearTimeout(timeoutId);
      setLastChecked(new Date());
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => {
      clearInterval(interval);
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  if (isOnline === null) return null; // Initial state

  const lastCheckedText = lastChecked ? `Dernière vérif: ${lastChecked.toLocaleTimeString('fr-FR')}` : 'Vérification en cours';
  const tooltipText = isOnline ? `Serveur connecté • ${lastCheckedText}` : `Serveur déconnecté / inaccessible • ${lastCheckedText}`;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'background.paper',
        p: 1,
        borderRadius: 2,
        boxShadow: 3,
        border: '1px solid',
        borderColor: isOnline ? 'success.light' : 'error.light',
      }}
    >
      <Tooltip title={tooltipText}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isOnline ? (
            <Wifi color="success" fontSize="small" />
          ) : (
            <WifiOff color="error" fontSize="small" />
          )}
          <Typography variant="caption" fontWeight="bold" color={isOnline ? "success.main" : "error.main"}>
            {isOnline ? "En ligne" : "Hors ligne"}
          </Typography>
        </Box>
      </Tooltip>
    </Box>
  );
}
