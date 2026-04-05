'use client';

import StatCard from '@/components/common/StatCard';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import type { Order, PendingDelivery } from '@/types';
import {
  AccessTime,
  Add,
  CheckCircle,
  Delete,
  Edit,
  Event,
  Inventory,
  LiveTv,
  LocalShipping,
  Paid,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useState } from 'react';

type PendingDeliveryStats = {
  total: number;
  paid: number;
  unpaid: number;
  live: number;
  overdue: number;
  totalPendingQuantity: number;
  liveOrderQuantity: number;
};

type OrderOption = {
  order: Order;
  totalQty: number;
  clientKey: string;
  clientLabel: string;
  commandLabel: string;
  sourceLabel: string;
  orderDateLabel: string;
};

type PendingDeliveryDialogState = {
  id: string | null;
  clientKey: string;
  orderId: string;
  pendingQuantity: string;
  paidAmount: string;
  paymentStatus: 'paid' | 'unpaid';
  limitDate: string;
  notes: string;
};

const emptyDialogState: PendingDeliveryDialogState = {
  id: null,
  clientKey: '',
  orderId: '',
  pendingQuantity: '',
  paidAmount: '0',
  paymentStatus: 'unpaid',
  limitDate: '',
  notes: '',
};

const todayValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toDateDisplay = (value: string | null | undefined) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR');
};

const toDateTimeDisplay = (value: string | null | undefined) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
};

const toLongDateDisplay = (value: string | null | undefined) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatMoney = (value: number) => `${Number(value || 0).toLocaleString('fr-FR')} MGA`;

export default function PendingDeliveriesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingDelivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<PendingDeliveryStats>({
    total: 0,
    paid: 0,
    unpaid: 0,
    live: 0,
    overdue: 0,
    totalPendingQuantity: 0,
    liveOrderQuantity: 0,
  });

  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [createdDateFrom, setCreatedDateFrom] = useState(todayValue());
  const [createdDateTo, setCreatedDateTo] = useState(todayValue());
  const [limitDateFrom, setLimitDateFrom] = useState('');
  const [limitDateTo, setLimitDateTo] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogState, setDialogState] = useState<PendingDeliveryDialogState>(emptyDialogState);
  const [clientSearch, setClientSearch] = useState('');

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const orderOptions: OrderOption[] = useMemo(() => {
    return orders
      .filter((order) => order.status !== 'cancelled' && order.status !== 'delivered')
      .map((order) => {
        const totalQty = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const clientKey = (order.clientName || '').trim().toLowerCase();
        const sourceLabel = order.isLiveOrder ? `live ${toLongDateDisplay(order.createdAt)}` : toLongDateDisplay(order.createdAt);
        const clientLabel = `${order.clientName} : ${sourceLabel}`;
        return {
          order,
          totalQty,
          clientKey,
          clientLabel,
          sourceLabel,
          orderDateLabel: toDateTimeDisplay(order.createdAt),
          commandLabel: `${order.orderNumber || order.id.slice(0, 8)} — ${formatMoney(order.totalAmount)}`,
        };
      })
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt));
  }, [orders]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    orderOptions.forEach((option) => {
      if (!option.clientKey) return;
      if (!map.has(option.clientKey)) {
        map.set(option.clientKey, { key: option.clientKey, label: option.clientLabel });
      }
    });
    return Array.from(map.values());
  }, [orderOptions]);

  const filteredClientOptions = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clientOptions;
    return clientOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [clientOptions, clientSearch]);

  const dialogOrdersByClient = useMemo(() => {
    if (!dialogState.clientKey) return [];
    return orderOptions.filter((option) => option.clientKey === dialogState.clientKey);
  }, [dialogState.clientKey, orderOptions]);

  const selectedDialogOrder = useMemo(
    () => dialogOrdersByClient.find((option) => option.order.id === dialogState.orderId) || orderOptions.find((option) => option.order.id === dialogState.orderId),
    [dialogOrdersByClient, dialogState.orderId, orderOptions]
  );

  const fetchOrders = useCallback(async () => {
    if (!selectedUserId) return;
    const res = await fetch(`/api/orders?limit=1000&userId=${selectedUserId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Erreur de chargement des commandes');
    }
    setOrders(Array.isArray(data.orders) ? data.orders : []);
  }, [selectedUserId]);

  const fetchRows = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const query = new URLSearchParams();
      query.set('userId', selectedUserId);
      if (search.trim()) query.set('search', search.trim());
      if (paymentStatusFilter) query.set('paymentStatus', paymentStatusFilter);
      if (sourceFilter) query.set('source', sourceFilter);
      if (createdDateFrom) query.set('createdDateFrom', createdDateFrom);
      if (createdDateTo) query.set('createdDateTo', createdDateTo);
      if (limitDateFrom) query.set('limitDateFrom', limitDateFrom);
      if (limitDateTo) query.set('limitDateTo', limitDateTo);
      const res = await fetch(`/api/pending-deliveries?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur de chargement');
      }
      const normalizedRows: PendingDelivery[] = Array.isArray(data.rows)
        ? data.rows.map((row: PendingDelivery & { isLiveOrder: number | boolean }) => ({
            ...row,
            isLiveOrder: Boolean(row.isLiveOrder),
          }))
        : [];
      setRows(normalizedRows);
      setStats(data.stats || {
        total: 0,
        paid: 0,
        unpaid: 0,
        live: 0,
        overdue: 0,
        totalPendingQuantity: 0,
        liveOrderQuantity: 0,
      });
      setDataError(null);
    } catch (error) {
      const message = getErrorMessage(error, 'Erreur de chargement');
      enqueueSnackbar(message, { variant: 'error' });
      setDataError(message);
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [
    createdDateFrom,
    createdDateTo,
    enqueueSnackbar,
    endDataLoading,
    getErrorMessage,
    limitDateFrom,
    limitDateTo,
    paymentStatusFilter,
    search,
    selectedUserId,
    setDataError,
    sourceFilter,
    startDataLoading,
  ]);

  useEffect(() => {
    if (!selectedUserId) return;
    Promise.all([fetchOrders(), fetchRows()]).catch((error) => {
      const message = getErrorMessage(error, 'Erreur de chargement');
      enqueueSnackbar(message, { variant: 'error' });
      setDataError(message);
    });
  }, [enqueueSnackbar, fetchOrders, fetchRows, getErrorMessage, selectedUserId, setDataError]);

  const openCreateDialog = () => {
    const firstOrder = orderOptions[0];
    setDialogState({
      id: null,
      clientKey: firstOrder?.clientKey || '',
      orderId: firstOrder?.order.id || '',
      pendingQuantity: String(firstOrder?.totalQty || ''),
      paidAmount: '0',
      paymentStatus: 'unpaid',
      limitDate: '',
      notes: '',
    });
    setClientSearch('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: PendingDelivery) => {
    const orderOption = orderOptions.find((option) => option.order.id === row.orderId);
    setDialogState({
      id: row.id,
      clientKey: orderOption?.clientKey || '',
      orderId: row.orderId,
      pendingQuantity: String(row.pendingQuantity),
      paidAmount: String(Number(row.paidAmount || 0)),
      paymentStatus: row.paymentStatus,
      limitDate: row.limitDate || '',
      notes: row.notes || '',
    });
    setClientSearch(orderOption?.clientLabel || '');
    setDialogOpen(true);
  };

  const handleDialogClientChange = (clientKey: string) => {
    const clientOrders = orderOptions.filter((option) => option.clientKey === clientKey);
    const firstOrder = clientOrders[0];
    setDialogState((prev) => ({
      ...prev,
      clientKey,
      orderId: firstOrder?.order.id || '',
      pendingQuantity: firstOrder ? String(firstOrder.totalQty) : '',
      paidAmount: firstOrder ? '0' : prev.paidAmount,
    }));
  };

  const handleDialogOrderChange = (orderId: string) => {
    const selected = orderOptions.find((option) => option.order.id === orderId);
    setDialogState((prev) => ({
      ...prev,
      clientKey: selected?.clientKey || prev.clientKey,
      orderId,
      pendingQuantity: selected ? String(selected.totalQty) : prev.pendingQuantity,
    }));
  };

  const closeDialog = () => {
    if (dialogSaving) return;
    setDialogOpen(false);
    setDialogState(emptyDialogState);
    setClientSearch('');
  };

  const saveDialog = async () => {
    if (!selectedUserId) return;
    if (!dialogState.orderId && !dialogState.id) {
      enqueueSnackbar('Commande requise', { variant: 'warning' });
      return;
    }
    const pendingQuantity = Number(dialogState.pendingQuantity || 0);
    if (!Number.isFinite(pendingQuantity) || pendingQuantity <= 0) {
      enqueueSnackbar('Quantité invalide', { variant: 'warning' });
      return;
    }
    const paidAmount = Number(dialogState.paidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      enqueueSnackbar('Montant payé invalide', { variant: 'warning' });
      return;
    }
    if (selectedDialogOrder && paidAmount > Number(selectedDialogOrder.order.totalAmount || 0)) {
      enqueueSnackbar('Montant payé supérieur au montant de la commande', { variant: 'warning' });
      return;
    }
    setDialogSaving(true);
    try {
      const payload = {
        id: dialogState.id,
        userId: selectedUserId,
        username: user?.username || 'system',
        orderId: dialogState.orderId,
        pendingQuantity,
        paidAmount,
        paymentStatus: dialogState.paymentStatus,
        limitDate: dialogState.limitDate,
        notes: dialogState.notes,
      };
      const method = dialogState.id ? 'PUT' : 'POST';
      const res = await fetch('/api/pending-deliveries', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur de sauvegarde');
      }
      enqueueSnackbar(dialogState.id ? 'Livraison en attente mise à jour' : 'Livraison en attente créée', { variant: 'success' });
      closeDialog();
      fetchRows();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error, 'Erreur de sauvegarde'), { variant: 'error' });
    } finally {
      setDialogSaving(false);
    }
  };

  const deleteRow = async (row: PendingDelivery) => {
    if (!selectedUserId) return;
    const confirmed = window.confirm(`Supprimer la livraison en attente ${row.orderNumber || row.id} ?`);
    if (!confirmed) return;
    try {
      const query = new URLSearchParams();
      query.set('id', row.id);
      query.set('userId', selectedUserId);
      query.set('username', user?.username || 'system');
      const res = await fetch(`/api/pending-deliveries?${query.toString()}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur suppression');
      }
      enqueueSnackbar('Livraison en attente supprimée', { variant: 'success' });
      fetchRows();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error, 'Erreur suppression'), { variant: 'error' });
    }
  };

  const setQuickPaymentStatus = async (row: PendingDelivery, paymentStatus: 'paid' | 'unpaid') => {
    if (!selectedUserId) return;
    try {
      const res = await fetch('/api/pending-deliveries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          userId: selectedUserId,
          username: user?.username || 'system',
          pendingQuantity: row.pendingQuantity,
          paidAmount: paymentStatus === 'paid'
            ? (Number(row.paidAmount || 0) > 0 ? Number(row.paidAmount || 0) : Number(row.totalAmount || 0))
            : Number(row.paidAmount || 0),
          paymentStatus,
          limitDate: row.limitDate || '',
          notes: row.notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur mise à jour');
      enqueueSnackbar('Statut de paiement mis à jour', { variant: 'success' });
      fetchRows();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error, 'Erreur mise à jour'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Livraison en attente" subtitle="Suivi des commandes à livrer et statut de paiement" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <StatCard title="Total" value={stats.total} icon={<LocalShipping />} color="#1D4ED8" bgColor="#DBEAFE" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <StatCard title="Non payées" value={stats.unpaid} icon={<AccessTime />} color="#B45309" bgColor="#FEF3C7" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <StatCard title="Payées" value={stats.paid} icon={<Paid />} color="#0F766E" bgColor="#CCFBF1" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <StatCard title="Depuis Live" value={stats.live} icon={<LiveTv />} color="#7C3AED" bgColor="#EDE9FE" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <StatCard title="Qté en attente" value={stats.totalPendingQuantity} icon={<Inventory />} color="#C2410C" bgColor="#FFEDD5" subtitle={`Qté live: ${stats.liveOrderQuantity}`} />
              </Grid>
            </Grid>

            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                  size="small"
                  label="Recherche"
                  placeholder="N° commande ou client"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  sx={{ minWidth: 240 }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Paiement</InputLabel>
                  <Select
                    value={paymentStatusFilter}
                    label="Paiement"
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    <MenuItem value="unpaid">Non payé</MenuItem>
                    <MenuItem value="paid">Payé</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Source</InputLabel>
                  <Select value={sourceFilter} label="Source" onChange={(e) => setSourceFilter(e.target.value)}>
                    <MenuItem value="">Toutes</MenuItem>
                    <MenuItem value="manual">Commande manuelle</MenuItem>
                    <MenuItem value="live">Vente en live</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="Ajout du"
                  type="date"
                  value={createdDateFrom}
                  onChange={(e) => setCreatedDateFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Ajout au"
                  type="date"
                  value={createdDateTo}
                  onChange={(e) => setCreatedDateTo(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Date limite du"
                  type="date"
                  value={limitDateFrom}
                  onChange={(e) => setLimitDateFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Date limite au"
                  type="date"
                  value={limitDateTo}
                  onChange={(e) => setLimitDateTo(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button variant="outlined" onClick={fetchRows}>
                  Appliquer
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSearch('');
                    setPaymentStatusFilter('');
                    setSourceFilter('');
                    setCreatedDateFrom(todayValue());
                    setCreatedDateTo(todayValue());
                    setLimitDateFrom('');
                    setLimitDateTo('');
                  }}
                >
                  Réinitialiser
                </Button>
                <Box sx={{ ml: 'auto' }}>
                  <Button variant="contained" startIcon={<Add />} onClick={openCreateDialog}>
                    Nouvelle livraison en attente
                  </Button>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Commande</TableCell>
                        <TableCell>Client</TableCell>
                        <TableCell align="right">Montant cmd</TableCell>
                        <TableCell align="right">Montant payé</TableCell>
                        <TableCell>Ajoutée le</TableCell>
                        <TableCell>Date limite</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell align="right">Qté attente</TableCell>
                        <TableCell align="right">Qté commande live</TableCell>
                        <TableCell>Paiement</TableCell>
                        <TableCell>Notes</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const isOverdue = Boolean(row.limitDate) && new Date(row.limitDate) < new Date() && row.paymentStatus === 'unpaid';
                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              <Typography fontWeight={600}>{row.orderNumber || row.orderId.slice(0, 8)}</Typography>
                              <Typography variant="caption" color="text.secondary">{row.orderId.slice(0, 8)}</Typography>
                            </TableCell>
                            <TableCell>{row.clientName}</TableCell>
                            <TableCell align="right">{formatMoney(row.totalAmount)}</TableCell>
                            <TableCell align="right">{formatMoney(row.paidAmount)}</TableCell>
                            <TableCell>{toDateTimeDisplay(row.createdAt)}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Event sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="body2">{toDateDisplay(row.limitDate)}</Typography>
                                {isOverdue && <Chip size="small" color="error" label="Dépassée" />}
                              </Box>
                            </TableCell>
                            <TableCell>
                              {row.isLiveOrder ? (
                                <Chip
                                  size="small"
                                  color="secondary"
                                  icon={<LiveTv />}
                                  label={`Live ${toDateTimeDisplay(row.liveStartedAt)}`}
                                />
                              ) : (
                                <Chip size="small" label="Manuelle" />
                              )}
                            </TableCell>
                            <TableCell align="right">{row.pendingQuantity}</TableCell>
                            <TableCell align="right">{row.isLiveOrder ? row.orderTotalQuantity : 0}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                color={row.paymentStatus === 'paid' ? 'success' : 'warning'}
                                icon={row.paymentStatus === 'paid' ? <CheckCircle /> : <AccessTime />}
                                label={row.paymentStatus === 'paid' ? 'Payé' : 'Non payé'}
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 220 }}>
                              <Typography noWrap title={row.notes || ''}>{row.notes || '-'}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => setQuickPaymentStatus(row, row.paymentStatus === 'paid' ? 'unpaid' : 'paid')}
                              >
                                {row.paymentStatus === 'paid' ? 'Marquer non payé' : 'Marquer payé'}
                              </Button>
                              <Button size="small" startIcon={<Edit />} onClick={() => openEditDialog(row)}>
                                Modifier
                              </Button>
                              <Button size="small" color="error" startIcon={<Delete />} onClick={() => deleteRow(row)}>
                                Supprimer
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {rows.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">Aucune livraison en attente trouvée</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogState.id ? 'Modifier livraison en attente' : 'Nouvelle livraison en attente'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            size="small"
            label="Recherche client"
            placeholder="Tapez le nom du client"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            disabled={Boolean(dialogState.id)}
          />

          <FormControl fullWidth size="small" disabled={Boolean(dialogState.id)}>
            <InputLabel>Client</InputLabel>
            <Select
              value={dialogState.clientKey}
              label="Client"
              onChange={(e) => handleDialogClientChange(e.target.value)}
            >
              {filteredClientOptions.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
              {filteredClientOptions.length === 0 && (
                <MenuItem disabled value="">
                  Aucun client trouvé
                </MenuItem>
              )}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" disabled={Boolean(dialogState.id)}>
            <InputLabel>Commande</InputLabel>
            <Select
              value={dialogState.orderId}
              label="Commande"
              onChange={(e) => handleDialogOrderChange(e.target.value)}
            >
              {dialogOrdersByClient.map((option) => (
                <MenuItem key={option.order.id} value={option.order.id}>
                  {option.commandLabel}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Card variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Date d&apos;ajout commande: {selectedDialogOrder ? selectedDialogOrder.orderDateLabel : '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Source: {selectedDialogOrder ? selectedDialogOrder.sourceLabel : '-'}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                Montant commande: {selectedDialogOrder ? formatMoney(selectedDialogOrder.order.totalAmount) : formatMoney(0)}
              </Typography>
            </CardContent>
          </Card>

          <TextField
            size="small"
            type="number"
            label="Quantité en attente"
            value={dialogState.pendingQuantity}
            onChange={(e) => setDialogState((prev) => ({ ...prev, pendingQuantity: e.target.value }))}
            slotProps={{ htmlInput: { min: 1 } }}
            helperText={selectedDialogOrder ? `Qté commandée: ${selectedDialogOrder.totalQty}` : ''}
          />

          <TextField
            size="small"
            type="number"
            label="Montant payé"
            value={dialogState.paidAmount}
            onChange={(e) => setDialogState((prev) => ({ ...prev, paidAmount: e.target.value }))}
            slotProps={{ htmlInput: { min: 0 } }}
            helperText={selectedDialogOrder ? `Maximum: ${formatMoney(selectedDialogOrder.order.totalAmount)}` : ''}
          />

          <FormControl fullWidth size="small">
            <InputLabel>Paiement</InputLabel>
            <Select
              value={dialogState.paymentStatus}
              label="Paiement"
              onChange={(e) => setDialogState((prev) => ({ ...prev, paymentStatus: e.target.value as 'paid' | 'unpaid' }))}
            >
              <MenuItem value="unpaid">Non payé</MenuItem>
              <MenuItem value="paid">Payé</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="date"
            label="Date limite"
            value={dialogState.limitDate}
            onChange={(e) => setDialogState((prev) => ({ ...prev, limitDate: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            size="small"
            label="Notes"
            multiline
            minRows={2}
            value={dialogState.notes}
            onChange={(e) => setDialogState((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={dialogSaving}>Annuler</Button>
          <Button onClick={saveDialog} variant="contained" disabled={dialogSaving}>
            {dialogState.id ? 'Mettre à jour' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
