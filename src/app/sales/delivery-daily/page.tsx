'use client';

import StatCard from '@/components/common/StatCard';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { exportFinanceReport } from '@/lib/pdf';
import type { Order } from '@/types';
import {
  AttachMoney,
  CalendarMonth,
  CheckCircle,
  Download,
  Inventory,
  ShoppingCart,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Select,
  TableFooter,
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
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import * as XLSX from 'xlsx';

type ConfirmItem = {
  id: string;
  productName: string;
  variantSize: string;
  variantColor: string;
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
};

type ConfirmOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  clientPhone: string;
  deliveryDate: string;
  shippingAddress: string;
  status: Order['status'];
  paymentMethod: Order['paymentMethod'];
  paymentReference: string;
  items: ConfirmItem[];
  paidAmount: number;
};

export default function DeliveryDailyStatsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || 'Entreprise';
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableDeliverers, setAvailableDeliverers] = useState<string[]>([]);

  const getToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [dateFrom, setDateFrom] = useState(getToday);
  const [dateTo, setDateTo] = useState(getToday);
  const [deliveryPersonFilter, setDeliveryPersonFilter] = useState('');
  const [realizedStatusFilter, setRealizedStatusFilter] = useState<'delivered' | 'confirmed'>('delivered');
  const [clientSearch, setClientSearch] = useState('');
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRows, setConfirmRows] = useState<ConfirmOrder[]>([]);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const fetchDeliverers = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`/api/orders?userId=${selectedUserId}&limit=1000`);
      const data = await res.json();
      if (data.orders) {
        const deliverers = new Set<string>();
        data.orders.forEach((o: Order) => {
          if (o.deliveryPerson) deliverers.add(o.deliveryPerson);
        });
        setAvailableDeliverers(Array.from(deliverers).sort());
      }
    } catch (error) {
      console.error('Error fetching deliverers:', error);
    }
  }, [selectedUserId]);

  const fetchFinanceData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      let url = `/api/orders?deliveryDateFrom=${dateFrom}&deliveryDateTo=${dateTo}&limit=1000&userId=${selectedUserId}`;
      if (deliveryPersonFilter) {
        url += `&deliveryPerson=${encodeURIComponent(deliveryPersonFilter)}`;
      }
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erreur chargement');

      setOrders(data.orders || []);
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement des données financières', { variant: 'error' });
      setDataError(getErrorMessage(error, 'Erreur chargement finance'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [dateFrom, dateTo, deliveryPersonFilter, selectedUserId, enqueueSnackbar, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => {
    fetchDeliverers();
  }, [fetchDeliverers]);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  const stats = orders.reduce(
    (acc, order) => {
      acc.count++;
      if (order.status !== 'cancelled') {
        acc.expectedRevenue += order.totalAmount;
        if (order.status === realizedStatusFilter) {
          acc.realizedRevenue += order.totalAmount;
        } else if (order.status === 'pending' || order.status === 'confirmed') {
          acc.pendingCount++;
        }
        if (order.status === 'delivered') {
          acc.deliveredCount++;
          acc.deliveredItems += (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
        }
      }
      return acc;
    },
    { count: 0, expectedRevenue: 0, realizedRevenue: 0, deliveredCount: 0, pendingCount: 0, deliveredItems: 0 }
  );

  const formatDate = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  const formatMoney = (amount: number) => amount.toLocaleString('fr-FR').replace(/\s/g, '.');

  const getStatusLabel = (status: Order['status']) => {
    if (status === 'delivered') return 'Livrée';
    if (status === 'cancelled') return 'Annulée';
    if (status === 'paid') return 'Payée';
    if (status === 'pending') return 'En attente';
    if (status === 'confirmed') return 'Confirmée';
    return status;
  };
  const getPaymentLabel = (method: Order['paymentMethod']) => {
    if (method === 'mvola') return 'MVola';
    if (method === 'orange_money') return 'Orange Money';
    if (method === 'airtel_money') return 'Airtel Money';
    if (method === 'espece') return 'Espèce';
    return method || '-';
  };

  const handleUpdateOrderStatus = useCallback(async (order: Order, nextStatus: Order['status']) => {
    if (!selectedUserId || order.status === nextStatus) return;
    const previousOrders = orders;
    setUpdatingOrderId(order.id);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          userId: selectedUserId,
          status: nextStatus,
          paymentMethod: order.paymentMethod,
          paymentReference: order.paymentReference,
          deliveryPerson: order.deliveryPerson,
          notes: order.notes,
          shippingAddress: order.shippingAddress,
          deliveryDate: order.deliveryDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour statut');
      setOrders((prev) => prev.map((o) => (o.id === order.id ? data : o)));
      enqueueSnackbar('Statut de commande mis à jour', { variant: 'success' });
    } catch (error) {
      setOrders(previousOrders);
      enqueueSnackbar(getErrorMessage(error, 'Erreur mise à jour statut'), { variant: 'error' });
    } finally {
      setUpdatingOrderId(null);
    }
  }, [selectedUserId, orders, enqueueSnackbar, getErrorMessage]);

  const buildConfirmRows = useCallback(() => {
    const rows: ConfirmOrder[] = orders.map((order) => {
      const items = (order.items || []).map((item) => ({
        id: item.id || `${item.productId}-${item.variantId}`,
        productName: item.productName,
        variantSize: item.variantSize,
        variantColor: item.variantColor,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        maxQuantity: item.quantity,
      }));
      const totalFromItems = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      return {
        id: order.id,
        orderNumber: order.orderNumber || order.id.slice(0, 8),
        clientName: order.clientName,
        clientPhone: order.clientPhone || '-',
        deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : '-',
        shippingAddress: order.shippingAddress || '-',
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentReference: order.paymentReference || '',
        items,
        paidAmount: totalFromItems || order.totalAmount,
      };
    });
    setConfirmRows(rows);
  }, [orders]);

  const openConfirmExport = () => {
    buildConfirmRows();
    setConfirmOpen(true);
  };

  const updateConfirmItemQty = (orderId: string, itemId: string, value: number) => {
    setConfirmRows((prev) => prev.map((order) => {
      if (order.id !== orderId) return order;
      const items = order.items.map((item) => {
        if (item.id !== itemId) return item;
        const next = Math.max(0, Math.min(item.maxQuantity, value));
        return { ...item, quantity: next };
      });
      const paidAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      return { ...order, items, paidAmount };
    }));
  };

  const updateConfirmStatus = (orderId: string, status: Order['status']) => {
    setConfirmRows((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
  };

  const updateConfirmPaidAmount = (orderId: string, value: number) => {
    setConfirmRows((prev) => prev.map((order) => (order.id === orderId ? { ...order, paidAmount: Math.max(0, value) } : order)));
  };

  const confirmationStats = useMemo(() => {
    const deliveredOrders = confirmRows.filter((o) => o.status === 'delivered' || o.status === 'paid');
    const realizedRevenue = deliveredOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
    const deliveredItems = deliveredOrders.reduce((sum, o) => sum + o.items.reduce((acc, item) => acc + item.quantity, 0), 0);
    const paymentTotals = deliveredOrders.reduce((acc, o) => {
      const method = o.paymentMethod || 'Autre';
      acc[method] = (acc[method] || 0) + (o.paidAmount || 0);
      return acc;
    }, {} as Record<string, number>);
    const itemMap = new Map<string, { productName: string; variantLabel: string; quantity: number }>();
    deliveredOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (item.quantity <= 0) return;
        const key = `${item.productName}__${item.variantSize}__${item.variantColor}`;
        const variantLabel = `${item.variantSize} ${item.variantColor}`.trim();
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          itemMap.set(key, { productName: item.productName, variantLabel, quantity: item.quantity });
        }
      });
    });
    return {
      realizedRevenue,
      deliveredItems,
      paymentTotals,
      deliveredOrders,
      deliveredItemsRows: Array.from(itemMap.values()),
    };
  }, [confirmRows]);

  const filteredOrders = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const clientName = (order.clientName || '').toLowerCase();
      const clientPhone = (order.clientPhone || '').toLowerCase();
      const orderNumber = (order.orderNumber || '').toLowerCase();
      return clientName.includes(q) || clientPhone.includes(q) || orderNumber.includes(q);
    });
  }, [orders, clientSearch]);

  const handleOpenExportMenu = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleCloseExportMenu = () => {
    setExportAnchorEl(null);
  };

  const handleExportPdf = () => {
    if (orders.length === 0) {
      setExportError('Aucune transaction à exporter');
      return;
    }
    try {
      exportFinanceReport(orders, dateFrom, dateTo, deliveryPersonFilter, companyName);
      enqueueSnackbar('Export PDF réussi', { variant: 'success' });
    } catch (error) {
      console.error('Erreur export PDF:', error);
      setExportError('Erreur lors de l\'export PDF');
    }
  };

  const handleExportExcel = () => {
    if (orders.length === 0) {
      setExportError('Aucune transaction à exporter');
      return;
    }
    const rows = orders.map((order) => {
      const itemsSummary = (order.items || [])
        .map((i) => `${i.productName} (${i.quantity})`)
        .join(', ');
      return {
        'N° Commande': order.orderNumber || order.id.slice(0, 8),
        Client: order.clientName,
        Contact: order.clientPhone || '-',
        'Date Livraison': order.deliveryDate ? formatDate(order.deliveryDate) : '-',
        'Adresse Livraison': order.shippingAddress || '-',
        Articles: itemsSummary,
        Statut: getStatusLabel(order.status),
        Montant: `${order.totalAmount.toLocaleString('fr-FR')} MGA`,
      };
    });
    const headerRows = [
      [companyName],
      ['Rapport livraison journalière'],
      [`Généré le ${new Date().toLocaleDateString('fr-FR')}`],
      [],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(headerRows);
    XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A5' });
    const columnCount = Object.keys(rows[0] || {}).length || 1;
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
    ];
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 26 },
      { wch: 30 },
      { wch: 12 },
      { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rapport');
    XLSX.writeFile(workbook, `rapport_financier_${dateFrom}_${dateTo}.xlsx`);
  };

  const handleExportConfirmPdf = async () => {
    if (confirmationStats.deliveredOrders.length === 0) {
      enqueueSnackbar('Aucune livraison confirmée à exporter', { variant: 'warning' });
      return;
    }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(companyName, 14, 16);
    doc.setFontSize(18);
    doc.text('Confirmation des livraisons', 14, 28);
    doc.setFontSize(11);
    doc.setTextColor(100);
    const subTitle = `Période : du ${formatDate(dateFrom)} au ${formatDate(dateTo)}` + (deliveryPersonFilter ? ` | Livreur : ${deliveryPersonFilter}` : '');
    doc.text(subTitle, 14, 36);

    doc.setFontSize(10);
    doc.setTextColor(0);
    let y = 46;
    doc.text(`Recettes réalisées: ${formatMoney(confirmationStats.realizedRevenue)} MGA`, 14, y);
    y += 6;
    doc.text(`Articles livrés: ${confirmationStats.deliveredItems}`, 14, y);
    y += 8;
    doc.text('Détail des paiements (Livrées/Payées) :', 14, y);
    y += 6;
    Object.entries(confirmationStats.paymentTotals).forEach(([method, amount]) => {
      doc.text(`- ${method}: ${formatMoney(amount)} MGA`, 20, y);
      y += 5;
    });

    autoTable(doc, {
      startY: y + 6,
      head: [['Produit', 'Variante', 'Quantité livrée']],
      body: confirmationStats.deliveredItemsRows.map((row) => [
        row.productName,
        row.variantLabel || '-',
        String(row.quantity),
      ]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' } },
    });

    const lastY = ((doc as unknown) as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 20;
    autoTable(doc, {
      startY: lastY + 8,
      head: [['N° Commande', 'Client', 'Contact', 'Date Livraison', 'Adresse Livraison', 'Statut', 'Paiement', 'Montant payé']],
      body: confirmationStats.deliveredOrders.map((o) => [
        o.orderNumber,
        o.clientName,
        o.clientPhone,
        o.deliveryDate,
        o.shippingAddress,
        getStatusLabel(o.status),
        getPaymentLabel(o.paymentMethod),
        `${formatMoney(o.paidAmount)} MGA`,
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        3: { cellWidth: 20 },
        6: { cellWidth: 22 },
        7: { halign: 'right' },
      },
    });

    doc.save(`confirmation_livraisons_${dateFrom}_${dateTo}.pdf`);
  };

  const handleExportConfirmExcel = () => {
    if (confirmationStats.deliveredOrders.length === 0) {
      enqueueSnackbar('Aucune livraison confirmée à exporter', { variant: 'warning' });
      return;
    }
    const deliveriesRows = confirmationStats.deliveredOrders.map((o) => ({
      'N° Commande': o.orderNumber,
      Client: o.clientName,
      Contact: o.clientPhone,
      'Date Livraison': o.deliveryDate,
      'Adresse Livraison': o.shippingAddress,
      Statut: getStatusLabel(o.status),
      Paiement: getPaymentLabel(o.paymentMethod),
      'Montant payé': `${formatMoney(o.paidAmount)} MGA`,
    }));
    const itemsRows = confirmationStats.deliveredItemsRows.map((row) => ({
      Produit: row.productName,
      Variante: row.variantLabel || '-',
      'Quantité livrée': row.quantity,
    }));
    const paymentRows = Object.entries(confirmationStats.paymentTotals).map(([method, amount]) => ({
      Paiement: method,
      Montant: `${formatMoney(amount)} MGA`,
    }));

    const buildSheet = (title: string, rows: Record<string, unknown>[]) => {
      const headerRows = [
        [companyName],
        [title],
        [`Période : du ${formatDate(dateFrom)} au ${formatDate(dateTo)}` + (deliveryPersonFilter ? ` | Livreur : ${deliveryPersonFilter}` : '')],
        [],
      ];
      const ws = XLSX.utils.aoa_to_sheet(headerRows);
      XLSX.utils.sheet_add_json(ws, rows, { origin: 'A5' });
      const columnCount = Object.keys(rows[0] || {}).length || 1;
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: columnCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: columnCount - 1 } },
      ];
      return ws;
    };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildSheet('Livraisons confirmées', deliveriesRows), 'Livraisons');
    XLSX.utils.book_append_sheet(workbook, buildSheet('Articles livrés', itemsRows), 'Articles');
    XLSX.utils.book_append_sheet(workbook, buildSheet('Détail des paiements', paymentRows), 'Paiements');
    XLSX.writeFile(workbook, `confirmation_livraisons_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Statistique de livraison journalière" subtitle="Suivi quotidien des livraisons" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}

          <Box sx={{ p: 3 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarMonth color="primary" />
                  <Typography variant="h6">Période :</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TextField
                    label="Date début"
                    type="date"
                    size="small"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ width: 160 }}
                  />
                  <Typography color="text.secondary">à</Typography>
                  <TextField
                    label="Date fin"
                    type="date"
                    size="small"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ width: 160 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <FormControl size="small" sx={{ width: 200 }}>
                    <InputLabel>Filtrer par livreur</InputLabel>
                    <Select
                      value={deliveryPersonFilter}
                      label="Filtrer par livreur"
                      onChange={(e) => setDeliveryPersonFilter(e.target.value)}
                    >
                      <MenuItem value="">Tous les livreurs</MenuItem>
                      {availableDeliverers.map((person) => (
                        <MenuItem key={person} value={person}>{person}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <FormControl size="small" sx={{ width: 220 }}>
                    <InputLabel>Recettes réalisées</InputLabel>
                    <Select
                      value={realizedStatusFilter}
                      label="Recettes réalisées"
                      onChange={(e) => setRealizedStatusFilter(e.target.value as 'delivered' | 'confirmed')}
                    >
                      <MenuItem value="delivered">Statut livrée</MenuItem>
                      <MenuItem value="confirmed">Statut confirmée</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Box sx={{ ml: 'auto' }}>
                  <Button
                    variant="contained"
                    startIcon={<Download />}
                    onClick={handleOpenExportMenu}
                    disabled={loading}
                  >
                    Exporter
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{ ml: 1 }}
                    onClick={openConfirmExport}
                    disabled={loading}
                  >
                    Export 2
                  </Button>
                  <Menu
                    anchorEl={exportAnchorEl}
                    open={Boolean(exportAnchorEl)}
                    onClose={handleCloseExportMenu}
                  >
                    <MenuItem onClick={() => { handleCloseExportMenu(); handleExportPdf(); }}>
                      Exporter PDF
                    </MenuItem>
                    <MenuItem onClick={() => { handleCloseExportMenu(); handleExportExcel(); }}>
                      Exporter Excel
                    </MenuItem>
                  </Menu>
                </Box>
              </CardContent>
            </Card>

            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Recettes Réalisées"
                  value={`${stats.realizedRevenue.toLocaleString('fr-FR')} MGA`}
                  icon={<AttachMoney />}
                  color="#10B981"
                  bgColor="#ECFDF5"
                  subtitle={realizedStatusFilter === 'delivered' ? 'Statut livrée' : 'Statut confirmée'}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Articles livrés"
                  value={stats.deliveredItems}
                  icon={<Inventory />}
                  color="#2563EB"
                  bgColor="#DBEAFE"
                  subtitle="Total des articles livrés"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Recettes Prévues"
                  value={`${stats.expectedRevenue.toLocaleString('fr-FR')} MGA`}
                  icon={<Inventory />}
                  color="#3B82F6"
                  bgColor="#EFF6FF"
                  subtitle="Total (hors annulées)"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Volume commandes"
                  value={stats.count}
                  icon={<ShoppingCart />}
                  color="#8B5CF6"
                  bgColor="#F3F0FF"
                  subtitle={`${stats.deliveredCount} livrées / ${stats.pendingCount} en attente`}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Taux de livraison"
                  value={`${stats.count > 0 ? Math.round((stats.deliveredCount / stats.count) * 100) : 0}%`}
                  icon={<CheckCircle />}
                  color="#F59E0B"
                  bgColor="#FFFBEB"
                />
              </Grid>
            </Grid>

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="lg" fullWidth>
              <DialogTitle>Confirmation des livraisons</DialogTitle>
              <DialogContent>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
                  <Typography variant="body2">Période : {formatDate(dateFrom)} → {formatDate(dateTo)}</Typography>
                  {deliveryPersonFilter && <Typography variant="body2">Livreur : {deliveryPersonFilter}</Typography>}
                  <Typography variant="body2">Recettes réalisées : {formatMoney(confirmationStats.realizedRevenue)} MGA</Typography>
                  <Typography variant="body2">Articles livrés : {confirmationStats.deliveredItems}</Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>N° Commande</TableCell>
                        <TableCell>Client</TableCell>
                        <TableCell>Date livraison</TableCell>
                        <TableCell>Adresse</TableCell>
                        <TableCell>Statut</TableCell>
                        <TableCell>Articles livrés</TableCell>
                        <TableCell align="right">Montant payé</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {confirmRows.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell>{order.orderNumber}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{order.clientName}</Typography>
                            <Typography variant="caption" color="text.secondary">{order.clientPhone}</Typography>
                          </TableCell>
                          <TableCell>{order.deliveryDate}</TableCell>
                          <TableCell>{order.shippingAddress}</TableCell>
                          <TableCell>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <Select
                                value={order.status}
                                onChange={(e) => updateConfirmStatus(order.id, e.target.value as Order['status'])}
                              >
                                <MenuItem value="delivered">Livrée</MenuItem>
                                <MenuItem value="paid">Payée</MenuItem>
                                <MenuItem value="confirmed">Confirmée</MenuItem>
                                <MenuItem value="cancelled">Annulée</MenuItem>
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {order.items.map((item) => (
                                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="caption" sx={{ minWidth: 180 }}>
                                    {item.productName} ({item.variantSize} {item.variantColor})
                                  </Typography>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateConfirmItemQty(order.id, item.id, Number(e.target.value || 0))}
                                    sx={{ width: 90 }}
                                    slotProps={{ htmlInput: { min: 0, max: item.maxQuantity } }}
                                  />
                                  <Typography variant="caption" color="text.secondary">/ {item.maxQuantity}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={order.paidAmount}
                              onChange={(e) => updateConfirmPaidAmount(order.id, Number(e.target.value || 0))}
                              sx={{ width: 120 }}
                              slotProps={{ htmlInput: { min: 0 } }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={6} align="right">
                          <Typography fontWeight={600}>Total payé</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={700}>{formatMoney(confirmationStats.realizedRevenue)} MGA</Typography>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setConfirmOpen(false)}>Fermer</Button>
                <Button variant="outlined" onClick={handleExportConfirmExcel}>Exporter Excel</Button>
                <Button variant="contained" onClick={handleExportConfirmPdf}>Exporter PDF</Button>
              </DialogActions>
            </Dialog>

            <Card>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="h6">
                  Transactions du {formatDate(dateFrom)} au {formatDate(dateTo)}
                </Typography>
                <TextField
                  size="small"
                  label="Rechercher client"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  sx={{ minWidth: 280 }}
                />
              </Box>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>N° Commande</TableCell>
                      <TableCell>Client</TableCell>
                      <TableCell>Contact</TableCell>
                      <TableCell>Date de livraison</TableCell>
                      <TableCell>Lieu de livraison</TableCell>
                      <TableCell>Articles</TableCell>
                      <TableCell align="center">Statut</TableCell>
                      <TableCell align="right">Montant</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} fontFamily="monospace">
                            {order.orderNumber || order.id.slice(0, 8)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Créée le {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{order.clientName}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{order.clientPhone || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('fr-FR') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {order.shippingAddress || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {(order.items || []).map((item, i) => (
                            <Typography key={i} variant="caption" display="block">
                              {item.productName} ({item.quantity})
                            </Typography>
                          ))}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <FormControl size="small" sx={{ minWidth: 135 }}>
                              <Select
                                value={order.status}
                                onChange={(e) => handleUpdateOrderStatus(order, e.target.value as Order['status'])}
                                disabled={updatingOrderId === order.id}
                              >
                                <MenuItem value="pending">En attente</MenuItem>
                                <MenuItem value="confirmed">Confirmée</MenuItem>
                                <MenuItem value="shipping">En livraison</MenuItem>
                                <MenuItem value="delivered">Livrée</MenuItem>
                                <MenuItem value="paid">Payée</MenuItem>
                                <MenuItem value="cancelled">Annulée</MenuItem>
                              </Select>
                            </FormControl>
                            {updatingOrderId === order.id && <CircularProgress size={16} />}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={order.status === 'cancelled' ? 'text.disabled' : 'primary'}>
                            {order.totalAmount.toLocaleString('fr-FR')} MGA
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredOrders.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">Aucune commande trouvée pour cette période</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Box>
        </Box>
      </Box>
      <Dialog open={Boolean(exportError)} onClose={() => setExportError(null)}>
        <DialogTitle>Export</DialogTitle>
        <DialogContent>
          <Typography>{exportError}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportError(null)}>OK</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
