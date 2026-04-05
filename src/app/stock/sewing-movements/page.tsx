'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Product, StockMovement } from '@/types';
import { exportStockMovementsReport } from '@/lib/pdf';
import {
  Box,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Button,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Delete, Download, Edit } from '@mui/icons-material';

export default function StockSewingMovementsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || 'Entreprise';
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [variantId, setVariantId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [outMovements, setOutMovements] = useState<StockMovement[]>([]);
  const [outTotal, setOutTotal] = useState(0);
  const [outPage, setOutPage] = useState(0);
  const [outRowsPerPage, setOutRowsPerPage] = useState(25);
  const [editMovement, setEditMovement] = useState<StockMovement | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editVariantId, setEditVariantId] = useState('');
  const [editQuantity, setEditQuantity] = useState(1);
  const [editChain, setEditChain] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editProductionNumber, setEditProductionNumber] = useState('');
  const [deleteMovement, setDeleteMovement] = useState<StockMovement | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [topBranchLabel, setTopBranchLabel] = useState('-');
  const [exporting, setExporting] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`/api/products?limit=1000&userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      enqueueSnackbar('Erreur de chargement des produits', { variant: 'error' });
    }
  }, [selectedUserId, enqueueSnackbar]);

  const fetchMovements = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const params = new URLSearchParams({
        userId: selectedUserId,
        page: String(page + 1),
        limit: String(rowsPerPage),
        movementType: 'in',
        reasonPrefix: 'Production couture',
      });
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      const res = await fetch(`/api/stock-movements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMovements(Array.isArray(data.movements) ? data.movements : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setDataError(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Erreur chargement mouvements');
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, page, rowsPerPage, dateFrom, dateTo, startDataLoading, endDataLoading, setDataError]);

  const fetchOutMovements = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const params = new URLSearchParams({
        userId: selectedUserId,
        page: String(outPage + 1),
        limit: String(outRowsPerPage),
        movementType: 'out',
        reasonPrefix: 'Sortie boutique',
      });
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      const res = await fetch(`/api/stock-movements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setOutMovements(Array.isArray(data.movements) ? data.movements : []);
      setOutTotal(typeof data.total === 'number' ? data.total : 0);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Erreur chargement sorties', { variant: 'error' });
    }
  }, [selectedUserId, outPage, outRowsPerPage, dateFrom, dateTo, enqueueSnackbar]);

  const fetchOutSummary = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const params = new URLSearchParams({
        userId: selectedUserId,
        page: '1',
        limit: '10000',
        movementType: 'out',
        reasonPrefix: 'Sortie boutique',
      });
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      const res = await fetch(`/api/stock-movements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      const items = Array.isArray(data.movements) ? data.movements : [];
      const totals = new Map<string, number>();
      for (const movement of items) {
        const branch = String(movement.reason || '').replace('Sortie boutique -', '').trim() || '-';
        totals.set(branch, (totals.get(branch) || 0) + Number(movement.quantity || 0));
      }
      let topName = '-';
      let topQty = 0;
      totals.forEach((qty, name) => {
        if (qty > topQty) {
          topQty = qty;
          topName = name;
        }
      });
      setTopBranchLabel(topQty > 0 ? `${topName} (${topQty})` : '-');
    } catch (error) {
      setTopBranchLabel('-');
      enqueueSnackbar(error instanceof Error ? error.message : 'Erreur chargement statistiques', { variant: 'error' });
    }
  }, [selectedUserId, dateFrom, dateTo, enqueueSnackbar]);

  useEffect(() => {
    fetchProducts();
    fetchMovements();
    fetchOutMovements();
    fetchOutSummary();
  }, [fetchMovements, fetchOutMovements, fetchProducts, fetchOutSummary]);

  const availableVariants = useMemo(() => selectedProduct?.variants || [], [selectedProduct]);
  const selectedVariant = useMemo(() => availableVariants.find((v) => v.id === variantId), [availableVariants, variantId]);
  const editVariants = useMemo(() => editProduct?.variants || [], [editProduct]);
  const totalStock = useMemo(() => {
    return products.reduce((sum, product) => {
      const variants = product.variants || [];
      return sum + variants.reduce((acc, v) => acc + (v.stock || 0), 0);
    }, 0);
  }, [products]);
  const productStockRows = useMemo(() => {
    return products.flatMap((product) => {
      const variants = product.variants || [];
      if (variants.length === 0) {
        return [{ productName: product.name, size: '-', stock: 0 }];
      }
      return variants.map((variant) => ({
        productName: product.name,
        size: `${variant.size}${variant.color ? ` - ${variant.color}` : ''}`,
        stock: variant.stock || 0,
      }));
    });
  }, [products]);

  const handleSubmitOut = async () => {
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    if (!selectedProduct || !variantId || quantity <= 0 || !branchName.trim()) {
      enqueueSnackbar('Veuillez compléter les champs obligatoires', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username || '',
          productId: selectedProduct.id,
          variantId,
          quantity,
          movementType: 'out',
          reason: `Sortie boutique - ${branchName.trim()}`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de la sortie', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Sortie enregistrée', { variant: 'success' });
      setBranchName('');
      setQuantity(1);
      fetchOutMovements();
      fetchMovements();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de la sortie', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (movement: StockMovement) => {
    const product = products.find((p) => p.id === movement.productId) || null;
    const reason = movement.reason || '';
    const isIn = movement.movementType === 'in';
    const withoutPrefix = isIn ? reason.replace('Production couture -', '').trim() : reason.replace('Sortie boutique -', '').trim();
    const match = withoutPrefix.match(/CMD-\d{8}-\d{4}/);
    const productionNumber = match?.[0] || '';
    const chain = isIn ? withoutPrefix.replace(productionNumber, '').replace(/-+/g, ' ').trim() : '';
    const branch = !isIn ? withoutPrefix : '';

    setEditMovement(movement);
    setEditProduct(product);
    setEditVariantId(movement.variantId);
    setEditQuantity(movement.quantity);
    setEditChain(chain);
    setEditBranch(branch);
    setEditProductionNumber(productionNumber);
  };

  const handleUpdateMovement = async () => {
    if (!editMovement) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    if (!editProduct || !editVariantId || editQuantity <= 0) {
      enqueueSnackbar('Veuillez compléter les champs obligatoires', { variant: 'error' });
      return;
    }
    const isIn = editMovement.movementType === 'in';
    if (isIn && !editChain.trim()) {
      enqueueSnackbar('Nom de chaîne requis', { variant: 'error' });
      return;
    }
    if (!isIn && !editBranch.trim()) {
      enqueueSnackbar('Nom de boutique requis', { variant: 'error' });
      return;
    }
    const reason = isIn
      ? `Production couture - ${editChain.trim()}${editProductionNumber ? ` - ${editProductionNumber}` : ''}`
      : `Sortie boutique - ${editBranch.trim()}`;
    try {
      const res = await fetch('/api/stock-movements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editMovement.id,
          userId: selectedUserId,
          username: user?.username || '',
          productId: editProduct.id,
          variantId: editVariantId,
          quantity: editQuantity,
          movementType: editMovement.movementType,
          reason,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de la mise à jour', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Mouvement mis à jour', { variant: 'success' });
      setEditMovement(null);
      fetchMovements();
      fetchOutMovements();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    }
  };

  const handleDeleteMovement = async () => {
    if (!deleteMovement) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const res = await fetch(`/api/stock-movements?id=${deleteMovement.id}&userId=${selectedUserId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de la suppression', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Mouvement supprimé', { variant: 'success' });
      setDeleteMovement(null);
      fetchMovements();
      fetchOutMovements();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const handleExportPdf = async () => {
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    setExporting(true);
    try {
      const buildParams = (type: 'in' | 'out') => {
        const params = new URLSearchParams({
          userId: selectedUserId,
          page: '1',
          limit: '10000',
          movementType: type,
          reasonPrefix: type === 'in' ? 'Production couture' : 'Sortie boutique',
        });
        if (dateFrom) params.append('dateFrom', dateFrom);
        if (dateTo) params.append('dateTo', dateTo);
        return params.toString();
      };
      const [inRes, outRes] = await Promise.all([
        fetch(`/api/stock-movements?${buildParams('in')}`),
        fetch(`/api/stock-movements?${buildParams('out')}`),
      ]);
      const inData = await inRes.json();
      const outData = await outRes.json();
      if (!inRes.ok || !outRes.ok) {
        enqueueSnackbar(inData.error || outData.error || 'Erreur export', { variant: 'error' });
        return;
      }
      const inItems = Array.isArray(inData.movements) ? inData.movements : [];
      const outItems = Array.isArray(outData.movements) ? outData.movements : [];
      exportStockMovementsReport(inItems, outItems, dateFrom, dateTo, totalStock, topBranchLabel, companyName);
      enqueueSnackbar('Export PDF réussi', { variant: 'success' });
    } catch {
      enqueueSnackbar('Erreur lors de l’export PDF', { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const rows = useMemo(() => {
    return movements.map((movement) => {
      const reason = movement.reason || '';
      const withoutPrefix = reason.replace('Production couture -', '').trim();
      const match = withoutPrefix.match(/CMD-\d{8}-\d{4}/);
      const productionNumber = match?.[0] || '-';
      let chain = withoutPrefix;
      if (match) {
        chain = withoutPrefix.replace(match[0], '').replace(/-+/g, ' ').trim();
      }
      return { ...movement, chainName: chain || '-', productionNumber };
    });
  }, [movements]);

  const outRows = useMemo(() => {
    return outMovements.map((movement) => {
      const branch = movement.reason?.replace('Sortie boutique -', '').trim() || '-';
      return { ...movement, branchName: branch };
    });
  }, [outMovements]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Mouvement stock vêtement" subtitle="Entrées et sorties de la couture" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                  label="Date début"
                  type="date"
                  size="small"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); setOutPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 160 }}
                />
                <TextField
                  label="Date fin"
                  type="date"
                  size="small"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); setOutPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 160 }}
                />
                <Box sx={{ flex: 1 }} />
                <Button variant="contained" startIcon={<Download />} onClick={handleExportPdf} disabled={exporting}>
                  Exporter PDF
                </Button>
              </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Statistiques stock
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Indicateur</TableCell>
                        <TableCell>Valeur</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>Stock actuel (total)</TableCell>
                        <TableCell>{totalStock}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Boutique la plus demandeuse</TableCell>
                        <TableCell>{topBranchLabel}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ mt: 2 }}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Produit</TableCell>
                          <TableCell>Taille</TableCell>
                          <TableCell align="right">Stock actuel</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {productStockRows.map((row, index) => (
                          <TableRow key={`${row.productName}-${row.size}-${index}`}>
                            <TableCell>{row.productName}</TableCell>
                            <TableCell>{row.size}</TableCell>
                            <TableCell align="right">{row.stock}</TableCell>
                          </TableRow>
                        ))}
                        {productStockRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} align="center" sx={{ py: 2 }}>
                              <Typography color="text.secondary">Aucun produit</Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </CardContent>
            </Card>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Sortie vers boutique (débouchez)
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <FormControl sx={{ minWidth: 240 }}>
                    <InputLabel>Produit</InputLabel>
                    <Select
                      value={selectedProduct?.id || ''}
                      label="Produit"
                      onChange={(e) => {
                        const product = products.find((p) => p.id === e.target.value) || null;
                        setSelectedProduct(product);
                        setVariantId('');
                      }}
                    >
                      {products.map((product) => (
                        <MenuItem key={product.id} value={product.id}>
                          {product.name}{product.code ? ` (${product.code})` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel>Taille</InputLabel>
                    <Select
                      value={variantId}
                      label="Taille"
                      onChange={(e) => setVariantId(e.target.value)}
                    >
                      {availableVariants.map((variant) => (
                        <MenuItem key={variant.id} value={variant.id}>
                          {variant.size}{variant.color ? ` - ${variant.color}` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Nom de boutique"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    sx={{ minWidth: 220 }}
                  />
                  <TextField
                    label="Quantité"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
                    inputProps={{ min: 1 }}
                    sx={{ width: 160 }}
                  />
                  <TextField
                    label="Stock actuel"
                    value={selectedVariant ? selectedVariant.stock : 0}
                    InputProps={{ readOnly: true }}
                    sx={{ width: 140 }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
                    <Button variant="contained" disabled={submitting} onClick={handleSubmitOut}>
                      Enregistrer la sortie
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Mouvements d&apos;entrée (couture)
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>N° CMD</TableCell>
                        <TableCell>Produit</TableCell>
                        <TableCell>Taille</TableCell>
                        <TableCell>Chaîne</TableCell>
                        <TableCell align="right">Quantité</TableCell>
                        <TableCell>Créé par</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((movement) => (
                        <TableRow key={movement.id} hover>
                          <TableCell>
                            {new Date(movement.createdAt).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                              {(movement as StockMovement & { productionNumber?: string }).productionNumber || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {movement.productName}
                            </Typography>
                          </TableCell>
                          <TableCell>{movement.size || '-'}</TableCell>
                          <TableCell>{movement.chainName}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700}>
                              {movement.quantity}
                            </Typography>
                          </TableCell>
                          <TableCell>{movement.createdBy || '-'}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="Modifier">
                              <IconButton size="small" onClick={() => openEdit(movement)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton size="small" color="error" onClick={() => setDeleteMovement(movement)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">Aucun mouvement trouvé</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  labelRowsPerPage="Lignes par page"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Mouvements de sortie (boutiques)
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Produit</TableCell>
                        <TableCell>Taille</TableCell>
                        <TableCell>Boutique</TableCell>
                        <TableCell align="right">Quantité</TableCell>
                        <TableCell>Créé par</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {outRows.map((movement) => (
                        <TableRow key={movement.id} hover>
                          <TableCell>
                            {new Date(movement.createdAt).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {movement.productName}
                            </Typography>
                          </TableCell>
                          <TableCell>{movement.size || '-'}</TableCell>
                          <TableCell>{movement.branchName}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700}>
                              {movement.quantity}
                            </Typography>
                          </TableCell>
                          <TableCell>{movement.createdBy || '-'}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="Modifier">
                              <IconButton size="small" onClick={() => openEdit(movement)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton size="small" color="error" onClick={() => setDeleteMovement(movement)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {outRows.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">Aucune sortie enregistrée</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={outTotal}
                  page={outPage}
                  onPageChange={(_, p) => setOutPage(p)}
                  rowsPerPage={outRowsPerPage}
                  onRowsPerPageChange={(e) => { setOutRowsPerPage(parseInt(e.target.value, 10)); setOutPage(0); }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  labelRowsPerPage="Lignes par page"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
                />
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      <Dialog open={Boolean(editMovement)} onClose={() => setEditMovement(null)} maxWidth="md" fullWidth>
        <DialogTitle>Modifier le mouvement</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
            <FormControl sx={{ minWidth: 240 }}>
              <InputLabel>Produit</InputLabel>
              <Select
                value={editProduct?.id || ''}
                label="Produit"
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value) || null;
                  setEditProduct(product);
                  setEditVariantId('');
                }}
              >
                {products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.name}{product.code ? ` (${product.code})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Taille</InputLabel>
              <Select
                value={editVariantId}
                label="Taille"
                onChange={(e) => setEditVariantId(e.target.value)}
              >
                {editVariants.map((variant) => (
                  <MenuItem key={variant.id} value={variant.id}>
                    {variant.size}{variant.color ? ` - ${variant.color}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Quantité"
              type="number"
              value={editQuantity}
              onChange={(e) => setEditQuantity(Math.max(0, Number(e.target.value) || 0))}
              inputProps={{ min: 1 }}
              sx={{ width: 160 }}
            />
            {editMovement?.movementType === 'in' ? (
              <>
                <TextField
                  label="Nom du chaîne"
                  value={editChain}
                  onChange={(e) => setEditChain(e.target.value)}
                  sx={{ minWidth: 240 }}
                />
                <TextField
                  label="N° CMD"
                  value={editProductionNumber}
                  InputProps={{ readOnly: true }}
                  sx={{ width: 180 }}
                />
              </>
            ) : (
              <TextField
                label="Nom de boutique"
                value={editBranch}
                onChange={(e) => setEditBranch(e.target.value)}
                sx={{ minWidth: 240 }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditMovement(null)}>Annuler</Button>
          <Button variant="contained" onClick={handleUpdateMovement}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteMovement)} onClose={() => setDeleteMovement(null)}>
        <DialogTitle>Supprimer le mouvement</DialogTitle>
        <DialogContent>
          <Typography>Confirmer la suppression de ce mouvement ?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMovement(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDeleteMovement}>Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
