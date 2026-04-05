'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import type { Product, ProductVariant, PurchaseInvoice, PurchaseNeed } from '@/types';
import {
    Add,
    Delete,
    Inventory,
} from '@mui/icons-material';
import {
    Box,
    Button,
    Card,
    CardContent,
    Divider,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

type InvoiceItemForm = {
  productId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
};

const emptyInvoiceItem: InvoiceItemForm = { productId: '', variantId: '', quantity: 1, unitCost: 0 };

export default function AchatsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const [needs, setNeeds] = useState<PurchaseNeed[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [needDescription, setNeedDescription] = useState('');
  const [needQuantity, setNeedQuantity] = useState(1);

  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemForm[]>([{ ...emptyInvoiceItem }]);

  const fetchData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const [needsRes, invoicesRes, productsRes] = await Promise.all([
        fetch(`/api/purchase-needs?userId=${selectedUserId}`),
        fetch(`/api/purchase-invoices?userId=${selectedUserId}`),
        fetch(`/api/products?limit=1000&userId=${selectedUserId}`),
      ]);
      const needsData = await needsRes.json();
      const invoicesData = await invoicesRes.json();
      const productsData = await productsRes.json();
      if (!needsRes.ok || !invoicesRes.ok || !productsRes.ok) {
        throw new Error(needsData?.error || invoicesData?.error || productsData?.error || 'Erreur serveur');
      }
      setNeeds(needsData.needs || []);
      setInvoices(invoicesData.invoices || []);
      setProducts(productsData.products || []);
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement', { variant: 'error' });
      setDataError(error instanceof Error ? error.message : 'Erreur de chargement achats');
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, startDataLoading, endDataLoading, enqueueSnackbar, setDataError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getProductVariants = useCallback((productId: string): ProductVariant[] => {
    const product = products.find(p => p.id === productId);
    return product?.variants || [];
  }, [products]);

  const addNeed = async () => {
    if (!selectedUserId) return;
    if (!needDescription.trim()) {
      enqueueSnackbar('Description requise', { variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/purchase-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username,
          description: needDescription,
          quantity: needQuantity,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }
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
      const res = await fetch(`/api/purchase-needs?id=${id}&userId=${selectedUserId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const addInvoiceItem = () => setInvoiceItems([...invoiceItems, { ...emptyInvoiceItem }]);
  const removeInvoiceItem = (index: number) => setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  const updateInvoiceItem = (index: number, field: keyof InvoiceItemForm, value: string | number) => {
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'productId') updated[index].variantId = '';
    setInvoiceItems(updated);
  };

  const invoiceTotal = useMemo(() => {
    return invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
  }, [invoiceItems]);

  const saveInvoice = async () => {
    if (!selectedUserId) return;
    const validItems = invoiceItems.filter(i => i.productId && i.variantId && i.quantity > 0);
    if (validItems.length === 0) {
      enqueueSnackbar('Ajoutez au moins un article', { variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/purchase-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username,
          supplier,
          invoiceNumber,
          invoiceDate,
          notes: invoiceNotes,
          items: validItems,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }
      setSupplier('');
      setInvoiceNumber('');
      setInvoiceDate('');
      setInvoiceNotes('');
      setInvoiceItems([{ ...emptyInvoiceItem }]);
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la saisie', { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Achats" subtitle="Expression des besoins et factures d'achat" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 5 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Expression des besoins</Typography>
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
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Qté</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {needs.map((need) => (
                          <TableRow key={need.id} hover>
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
                            <TableCell colSpan={3} align="center">
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
                    <Typography variant="h6" sx={{ mb: 2 }}>Saisie des factures d&apos;achat</Typography>
                    <Grid container spacing={2}>
                      <Grid size={6}>
                        <TextField fullWidth size="small" label="Fournisseur" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                      </Grid>
                      <Grid size={6}>
                        <TextField fullWidth size="small" label="N° Facture" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                      </Grid>
                      <Grid size={6}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Date facture"
                          type="date"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <TextField fullWidth size="small" label="Notes" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} />
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    {invoiceItems.map((item, index) => (
                      <Box key={index} sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ flex: 2 }}>
                          <InputLabel>Produit</InputLabel>
                          <Select value={item.productId} label="Produit" onChange={(e) => updateInvoiceItem(index, 'productId', e.target.value)}>
                            {products.map((p) => (
                              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ flex: 2 }}>
                          <InputLabel>Taille</InputLabel>
                          <Select value={item.variantId} label="Taille"
                            onChange={(e) => updateInvoiceItem(index, 'variantId', e.target.value)}
                            disabled={!item.productId}
                          >
                            {getProductVariants(item.productId).map((v) => (
                              <MenuItem key={v.id} value={v.id}>{v.size} ({v.stock})</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField
                          label="Qté"
                          type="number"
                          size="small"
                          sx={{ width: 90 }}
                          value={item.quantity}
                          onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                        <TextField
                          label="Coût"
                          type="number"
                          size="small"
                          sx={{ width: 110 }}
                          value={item.unitCost}
                          onChange={(e) => updateInvoiceItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        />
                        {invoiceItems.length > 1 && (
                          <IconButton size="small" color="error" onClick={() => removeInvoiceItem(index)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    ))}
                    <Button size="small" startIcon={<Add />} onClick={addInvoiceItem}>
                      Ajouter un article
                    </Button>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Total: {invoiceTotal.toLocaleString('fr-FR')} MGA
                      </Typography>
                      <Button variant="contained" onClick={saveInvoice} startIcon={<Inventory />}>
                        Enregistrer et entrer en stock
                      </Button>
                    </Box>
                  </CardContent>
                </Card>

                <Card sx={{ mt: 3 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Factures enregistrées</Typography>
                    {invoices.map((invoice) => (
                      <Box key={invoice.id} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography fontWeight={600}>{invoice.supplier || 'Fournisseur'}</Typography>
                          <Typography color="text.secondary">{invoice.invoiceNumber || '-'}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Date: {invoice.invoiceDate || '-'}
                        </Typography>
                        <Table size="small" sx={{ mt: 1 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Article</TableCell>
                              <TableCell>Taille</TableCell>
                              <TableCell align="right">Qté</TableCell>
                              <TableCell align="right">Coût</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(invoice.items || []).map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>{item.productName}</TableCell>
                                <TableCell>{item.variantSize}</TableCell>
                                <TableCell align="right">{item.quantity}</TableCell>
                                <TableCell align="right">{item.totalCost.toLocaleString('fr-FR')} MGA</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    ))}
                    {invoices.length === 0 && (
                      <Typography color="text.secondary">Aucune facture enregistrée</Typography>
                    )}
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
