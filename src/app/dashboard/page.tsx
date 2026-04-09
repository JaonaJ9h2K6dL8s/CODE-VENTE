'use client';

import StatCard from '@/components/common/StatCard';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import type { DashboardStats } from '@/types';
import {
    AttachMoney,
    Inventory,
    People,
    ShoppingCart,
    TrendingUp,
    Warning,
} from '@mui/icons-material';
import { Box, Card, CardContent, Chip, CircularProgress, Grid, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

// Lazy load Recharts components — they are ~120kB and not needed at initial render
const LazyBarChart = dynamic(() => import('recharts').then(mod => ({ default: mod.BarChart })), { ssr: false });
const LazyBar = dynamic(() => import('recharts').then(mod => ({ default: mod.Bar })), { ssr: false });
const LazyXAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.XAxis })), { ssr: false });
const LazyYAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.YAxis })), { ssr: false });
const LazyCartesianGrid = dynamic(() => import('recharts').then(mod => ({ default: mod.CartesianGrid })), { ssr: false });
const LazyTooltip = dynamic(() => import('recharts').then(mod => ({ default: mod.Tooltip })), { ssr: false });
const LazyResponsiveContainer = dynamic(() => import('recharts').then(mod => ({ default: mod.ResponsiveContainer })), { ssr: false });
const LazyPieChart = dynamic(() => import('recharts').then(mod => ({ default: mod.PieChart })), { ssr: false });
const LazyPie = dynamic(() => import('recharts').then(mod => ({ default: mod.Pie })), { ssr: false });
const LazyCell = dynamic(() => import('recharts').then(mod => ({ default: mod.Cell })), { ssr: false });

const ChartPlaceholder = () => (
  <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <CircularProgress size={32} />
  </Box>
);

const PIE_COLORS = ['#22C55E', '#F59E0B', '#3B82F6', '#EF4444'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      if (!selectedUserId) return;
      startDataLoading();
      const res = await fetch(`/api/stats?type=dashboard&userId=${selectedUserId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setStats(data);
      setDataError(null);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setDataError(getErrorMessage(error, 'Erreur chargement dashboard'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Tableau de bord" subtitle="Vue d'ensemble de votre activité" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
          {/* Stat Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Ventes du jour"
                value={stats?.todayOrders || 0}
                icon={<ShoppingCart />}
                color="#2E7D6F"
                bgColor="#E8F5F1"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Chiffre d'affaires jour"
                value={`${(stats?.todayRevenue || 0).toLocaleString('fr-FR')} MGA`}
                icon={<AttachMoney />}
                color="#FF6B35"
                bgColor="#FFF3ED"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="CA Mensuel"
                value={`${(stats?.monthlyRevenue || 0).toLocaleString('fr-FR')} MGA`}
                icon={<TrendingUp />}
                color="#3B82F6"
                bgColor="#EFF6FF"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Total Clients"
                value={stats?.totalClients || 0}
                icon={<People />}
                color="#8B5CF6"
                bgColor="#F3F0FF"
              />
            </Grid>
          </Grid>

          {/* Charts Row */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Revenue Chart */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Revenus des 30 derniers jours
                  </Typography>
                  <Box sx={{ height: 320 }}>
                    <Suspense fallback={<ChartPlaceholder />}>
                      <LazyResponsiveContainer width="100%" height="100%">
                        <LazyBarChart data={stats?.revenueByDay || []}>
                          <LazyCartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                          <LazyXAxis
                            dataKey="date"
                            tick={{ fontSize: 11 }}
                            tickFormatter={(val: string) => {
                              const d = new Date(val);
                              return `${d.getDate()}/${d.getMonth() + 1}`;
                            }}
                          />
                          <LazyYAxis tick={{ fontSize: 11 }} tickFormatter={(val: number) => `${(val / 1000).toFixed(0)}k`} />
                          <LazyTooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(value: any) => [`${Number(value).toLocaleString('fr-FR')} MGA`, 'Revenus']}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            labelFormatter={(label: any) => new Date(String(label)).toLocaleDateString('fr-FR')}
                          />
                          <LazyBar dataKey="revenue" fill="#2E7D6F" radius={[6, 6, 0, 0]} />
                        </LazyBarChart>
                      </LazyResponsiveContainer>
                    </Suspense>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Orders by Status Pie */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} gutterBottom>
                    Commandes par statut
                  </Typography>
                  <Box sx={{ height: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {stats?.ordersByStatus && stats.ordersByStatus.length > 0 ? (
                      <Suspense fallback={<ChartPlaceholder />}>
                        <LazyResponsiveContainer width="100%" height="100%">
                          <LazyPieChart>
                            <LazyPie
                              data={stats.ordersByStatus}
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              innerRadius={50}
                              dataKey="count"
                              nameKey="status"
                              label={({ name, value }: { name?: string; value?: number }) => `${name ?? ''}: ${value ?? 0}`}
                            >
                              {stats.ordersByStatus.map((_: unknown, index: number) => (
                                <LazyCell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </LazyPie>
                            <LazyTooltip />
                          </LazyPieChart>
                        </LazyResponsiveContainer>
                      </Suspense>
                    ) : (
                      <Typography color="text.secondary">Aucune donnée</Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Bottom Row */}
          <Grid container spacing={3}>
            {/* Top Products */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Inventory color="primary" />
                    <Typography variant="h6" fontWeight={600}>
                      Produits les plus vendus
                    </Typography>
                  </Box>
                  <TableContainer sx={{ maxHeight: 300 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Produit</TableCell>
                          <TableCell align="center">Vendus</TableCell>
                          <TableCell align="right">Revenus</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(stats?.topProducts || []).map((product, i) => (
                          <TableRow key={i} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{product.productName}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip label={product.totalSold} size="small" color="primary" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={600}>
                                {product.revenue.toLocaleString('fr-FR')} MGA
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!stats?.topProducts || stats.topProducts.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={3} align="center">
                              <Typography color="text.secondary" variant="body2">Aucune vente enregistrée</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>

            {/* Low Stock Alerts */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Warning color="warning" />
                    <Typography variant="h6" fontWeight={600}>
                      Alertes rupture de stock
                    </Typography>
                  </Box>
                  <TableContainer sx={{ maxHeight: 300 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Produit</TableCell>
                          <TableCell>Variante</TableCell>
                          <TableCell align="center">Stock</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(stats?.lowStockProducts || []).map((product, i) => (
                          <TableRow key={i} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{product.productName}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{product.variantInfo}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={product.stock}
                                size="small"
                                color={product.stock === 0 ? 'error' : 'warning'}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!stats?.lowStockProducts || stats.lowStockProducts.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={3} align="center">
                              <Typography color="text.secondary" variant="body2">Tous les stocks sont OK</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Box>
      </Box>
    </Box>
  );
}
