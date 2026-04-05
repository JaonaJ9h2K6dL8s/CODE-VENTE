'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function DashboardStockStatsPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Stats globales stock" subtitle="Vue globale du stock" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Indicateurs globaux du stock
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Cette section regroupe les statistiques clés liées au stock.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
