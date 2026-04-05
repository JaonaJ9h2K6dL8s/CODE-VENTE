'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import type { ProductionNeed, ProductionPrintOrder } from '@/types';
import {
    Add,
    Delete,
} from '@mui/icons-material';
import {
    Box,
    Button,
    Card,
    CardContent,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

export default function ProductionPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const [needs, setNeeds] = useState<ProductionNeed[]>([]);
  const [orders, setOrders] = useState<ProductionPrintOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [needSource, setNeedSource] = useState('Commercial');
  const [needDescription, setNeedDescription] = useState('');
  const [needQuantity, setNeedQuantity] = useState(1);

  const [printDate, setPrintDate] = useState(new Date().toISOString().split('T')[0]);
  const [printDescription, setPrintDescription] = useState('');
  const [printQuantity, setPrintQuantity] = useState(1);
  const [printStatus, setPrintStatus] = useState('En attente');

  const fetchData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const [needsRes, ordersRes] = await Promise.all([
        fetch(`/api/production-needs?userId=${selectedUserId}`),
        fetch(`/api/production-print-orders?userId=${selectedUserId}`),
      ]);
      const needsData = await needsRes.json();
      const ordersData = await ordersRes.json();
      if (!needsRes.ok || !ordersRes.ok) {
        throw new Error(needsData?.error || ordersData?.error || 'Erreur serveur');
      }
      setNeeds(needsData.needs || []);
      setOrders(ordersData.orders || []);
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement', { variant: 'error' });
      setDataError(error instanceof Error ? error.message : 'Erreur chargement production');
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, startDataLoading, endDataLoading, enqueueSnackbar, setDataError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addNeed = async () => {
    if (!selectedUserId) return;
    if (!needDescription.trim()) {
      enqueueSnackbar('Description requise', { variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/production-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username,
          source: needSource,
          description: needDescription,
          quantity: needQuantity,
        }),
      });
      if (!res.ok) throw new Error();
      setNeedDescription('');
      setNeedQuantity(1);
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la création', { variant: 'error' });
    }
  };

  const deleteNeed = async (id: string) => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`/api/production-needs?id=${id}&userId=${selectedUserId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const addPrintOrder = async () => {
    if (!selectedUserId) return;
    if (!printDescription.trim()) {
      enqueueSnackbar('Description requise', { variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/production-print-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username,
          requestDate: printDate,
          description: printDescription,
          quantity: printQuantity,
          status: printStatus,
        }),
      });
      if (!res.ok) throw new Error();
      setPrintDescription('');
      setPrintQuantity(1);
      setPrintStatus('En attente');
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la création', { variant: 'error' });
    }
  };

  const updatePrintStatus = async (id: string, status: string) => {
    if (!selectedUserId) return;
    try {
      const res = await fetch('/api/production-print-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: selectedUserId, status }),
      });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    }
  };

  const deletePrintOrder = async (id: string) => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`/api/production-print-orders?id=${id}&userId=${selectedUserId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Production" subtitle="Besoins et commandes DTF" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 5 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Expression des besoins</Typography>
                    <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Source</InputLabel>
                      <Select value={needSource} label="Source" onChange={(e) => setNeedSource(e.target.value)}>
                        <MenuItem value="Commercial">Commercial</MenuItem>
                        <MenuItem value="Live">Live</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Description"
                      fullWidth
                      size="small"
                      value={needDescription}
                      onChange={(e) => setNeedDescription(e.target.value)}
                      sx={{ mb: 2 }}
                    />
                    <TextField
                      label="Quantité"
                      type="number"
                      fullWidth
                      size="small"
                      value={needQuantity}
                      onChange={(e) => setNeedQuantity(parseInt(e.target.value) || 1)}
                      sx={{ mb: 2 }}
                    />
                    <Button variant="contained" onClick={addNeed} startIcon={<Add />}>
                      Ajouter
                    </Button>
                  </CardContent>
                </Card>

                <Card sx={{ mt: 3 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Besoins enregistrés</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Source</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Qté</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {needs.map((need) => (
                          <TableRow key={need.id} hover>
                            <TableCell>{need.source}</TableCell>
                            <TableCell>{need.description}</TableCell>
                            <TableCell align="right">{need.quantity}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" color="error" onClick={() => deleteNeed(need.id)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        {needs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center">
                              <Typography color="text.secondary">Aucun besoin enregistré</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 7 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Commande d&apos;impression DTF</Typography>
                    <Grid container spacing={2}>
                      <Grid size={4}>
                        <TextField
                          label="Date"
                          type="date"
                          size="small"
                          fullWidth
                          value={printDate}
                          onChange={(e) => setPrintDate(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Situation</InputLabel>
                          <Select value={printStatus} label="Situation" onChange={(e) => setPrintStatus(e.target.value)}>
                            <MenuItem value="En attente">En attente</MenuItem>
                            <MenuItem value="En cours">En cours</MenuItem>
                            <MenuItem value="Terminé">Terminé</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={4}>
                        <TextField
                          label="Quantité"
                          type="number"
                          size="small"
                          fullWidth
                          value={printQuantity}
                          onChange={(e) => setPrintQuantity(parseInt(e.target.value) || 1)}
                        />
                      </Grid>
                      <Grid size={12}>
                        <TextField
                          label="Description"
                          fullWidth
                          size="small"
                          value={printDescription}
                          onChange={(e) => setPrintDescription(e.target.value)}
                        />
                      </Grid>
                    </Grid>
                    <Button variant="contained" onClick={addPrintOrder} sx={{ mt: 2 }} startIcon={<Add />}>
                      Enregistrer la demande
                    </Button>
                  </CardContent>
                </Card>

                <Card sx={{ mt: 3 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Demandes DTF</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Qté</TableCell>
                          <TableCell>Situation</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {orders.map((order) => (
                          <TableRow key={order.id} hover>
                            <TableCell>{order.requestDate}</TableCell>
                            <TableCell>{order.description}</TableCell>
                            <TableCell align="right">{order.quantity}</TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select value={order.status} onChange={(e) => updatePrintStatus(order.id, e.target.value)}>
                                  <MenuItem value="En attente">En attente</MenuItem>
                                  <MenuItem value="En cours">En cours</MenuItem>
                                  <MenuItem value="Terminé">Terminé</MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" color="error" onClick={() => deletePrintOrder(order.id)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        {orders.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} align="center">
                              <Typography color="text.secondary">Aucune demande enregistrée</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
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
