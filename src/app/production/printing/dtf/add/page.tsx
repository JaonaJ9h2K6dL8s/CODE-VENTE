'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Box, Typography } from '@mui/material';

export default function ProductionDtfAddPage() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Ajout impression DTF" subtitle="Impression DTF sur vêtements finis" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600}>
              Ajout impression DTF
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Enregistrez ici l’ajout d’impression DTF sur chaque vêtement fini.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
