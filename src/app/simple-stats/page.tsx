'use client';

import StatCard from '@/components/common/StatCard';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import {
  AttachMoney,
  Inventory,
  ShoppingCart,
} from '@mui/icons-material';
import { Box, Grid, LinearProgress, TextField, Typography, Paper } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

interface SimpleStats {
  totalProductSold: number;
  expectedRevenue: number;
  totalOrdersCount: number;
}

export default function SimpleStatsPage() {
  const [stats, setStats] = useState<SimpleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();

  const fetchStats = useCallback(async () => {
    try {
      if (!selectedUserId) return;
      startDataLoading();
      
      const params = new URLSearchParams({
        type: 'dashboard',
        userId: selectedUserId,
      });
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const res = await fetch(`/api/stats?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setStats({
        totalProductSold: data.totalProductSold || 0,
        expectedRevenue: data.expectedRevenue || 0,
        totalOrdersCount: data.totalOrdersCount || 0,
      });
      setDataError(null);
    } catch (error) {
      console.error('Error fetching simple stats:', error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDataError((error as any).message || 'Erreur chargement statistiques');
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, dateFrom, dateTo, startDataLoading, endDataLoading, setDataError]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Statistiques Globales" subtitle="Vue simplifiée des performances" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            
            {/* Filtres de date */}
            <Paper elevation={0} sx={{ p: 3, mb: 4, bgcolor: 'white', borderRadius: 2, display: 'flex', gap: 2, alignItems: 'center', border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>Filtrer par période :</Typography>
              <TextField
                label="Du"
                type="date"
                size="small"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <TextField
                label="Au"
                type="date"
                size="small"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Paper>

            <Typography variant="h4" fontWeight={700} color="text.secondary" gutterBottom sx={{ mb: 6 }}>
              Résumé de l&apos;Activité
            </Typography>

            <Grid container spacing={4} maxWidth="lg">
              {/* Total Produits Vendus */}
              <Grid size={{ xs: 12, md: 4 }}>
                <StatCard
                  title="Total Produits Vendus"
                  value={stats?.totalProductSold || 0}
                  icon={<Inventory sx={{ fontSize: 40 }} />}
                  color="#3B82F6" // Blue
                  bgColor="#EFF6FF"
                  subtitle={dateFrom || dateTo ? 'Période sélectionnée' : 'Total global'}
                />
              </Grid>

              {/* Recettes Prévues */}
              <Grid size={{ xs: 12, md: 4 }}>
                <StatCard
                  title="Recettes Prévues"
                  value={`${(stats?.expectedRevenue || 0).toLocaleString('fr-FR')} Ar`}
                  icon={<AttachMoney sx={{ fontSize: 40 }} />}
                  color="#10B981" // Green
                  bgColor="#ECFDF5"
                  subtitle="Chiffre d'affaires total"
                />
              </Grid>

              {/* Volume Commandes */}
              <Grid size={{ xs: 12, md: 4 }}>
                <StatCard
                  title="Volume Commandes"
                  value={stats?.totalOrdersCount || 0}
                  icon={<ShoppingCart sx={{ fontSize: 40 }} />}
                  color="#F59E0B" // Orange
                  bgColor="#FFFBEB"
                  subtitle="Nombre total de commandes"
                />
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
