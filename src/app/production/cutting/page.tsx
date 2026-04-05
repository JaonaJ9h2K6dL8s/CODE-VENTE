'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function ProductionCuttingPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Coupe" subtitle="Suivi des étapes de coupe" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Coupe
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Gérez ici les opérations de coupe et leur suivi quotidien.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
