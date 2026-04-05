'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function ProductionDtfPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="DTF" subtitle="Flux d’impression DTF" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              DTF
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Accès aux opérations DTF et à leurs statistiques.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
