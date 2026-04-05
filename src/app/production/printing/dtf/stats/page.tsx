'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function ProductionDtfStatsPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Statistique métrage fini DTF" subtitle="Suivi du métrage DTF fini" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Statistiques métrage fini DTF
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Suivez ici le métrage produit et les volumes finis par la machine DTF.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
