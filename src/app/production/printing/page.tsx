'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function ProductionPrintingPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Imprimerie" subtitle="Gestion des impressions" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Imprimerie
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Centralisez ici les opérations liées à l’impression.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
