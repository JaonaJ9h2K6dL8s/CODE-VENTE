'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import type { Product } from '@/types';
import {
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';

export default function BoutiqueStockPage() {
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockRows, setStockRows] = useState<Array<{ productId: string; productName: string; variantId: string; size: string; color: string; price: number; outQty: number; soldQty: number; available: number }>>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const [productsRes, stockRes] = await Promise.all([
        fetch(`/api/products?limit=1000&userId=${selectedUserId}`),
        fetch(`/api/boutique-stock?userId=${selectedUserId}`),
      ]);
      const productsData = await productsRes.json();
      const stockData = await stockRes.json();

      if (!productsRes.ok || !stockRes.ok) {
        throw new Error(productsData?.error || stockData?.error || 'Erreur');
      }

      setProducts(Array.isArray(productsData.products) ? productsData.products : []);
      setStockRows(Array.isArray(stockData.rows) ? stockData.rows : []);
      setDataError(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Erreur chargement stock boutique');
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, startDataLoading, endDataLoading, setDataError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const next: Record<string, string> = {};
    stockRows.forEach((row) => {
      next[row.variantId] = String(row.price ?? 0);
    });
    setPriceInputs(next);
  }, [stockRows]);

  const boutiqueStockRows = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    return stockRows
      .filter((row) => row.outQty > 0)
      .map((row) => {
        const product = productMap.get(row.productId);
        const sizeLabel = row.size ? `${row.size}${row.color ? ` - ${row.color}` : ''}` : '-';
        return {
          productName: product?.name || row.productName,
          size: sizeLabel,
          outQty: row.outQty,
          soldQty: row.soldQty,
          available: row.available,
          price: row.price,
          variantId: row.variantId,
        };
      });
  }, [products, stockRows]);

  const handlePriceChange = (variantId: string, value: string) => {
    setPriceInputs((prev) => ({ ...prev, [variantId]: value }));
  };

  const handleSavePrice = useCallback(async (variantId: string) => {
    if (!selectedUserId) return;
    const raw = priceInputs[variantId] ?? '';
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      enqueueSnackbar('Prix invalide', { variant: 'warning' });
      return;
    }
    setSavingVariantId(variantId);
    try {
      const res = await fetch('/api/boutique-stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, variantId, price }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      enqueueSnackbar('Prix mis à jour', { variant: 'success' });
      fetchData();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Erreur', { variant: 'error' });
    } finally {
      setSavingVariantId(null);
    }
  }, [enqueueSnackbar, fetchData, priceInputs, selectedUserId]);

  const handleMigrateStock = useCallback(async () => {
    if (!selectedUserId) return;
    setMigrating(true);
    try {
      const res = await fetch('/api/boutique-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, username: user?.username || 'system' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      enqueueSnackbar(`Stock boutique mis à jour: ${data.movedVariants} variante(s), ${data.movedTotal} article(s)`, { variant: 'success' });
      fetchData();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Erreur', { variant: 'error' });
    } finally {
      setMigrating(false);
    }
  }, [enqueueSnackbar, fetchData, selectedUserId, user?.username]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Stock boutique" subtitle="Disponibilités issues des sorties boutique" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>
                    Stock disponible pour vente
                  </Typography>
                  <Button variant="outlined" onClick={handleMigrateStock} disabled={migrating || loading}>
                    Importer stock actuel
                  </Button>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Produit</TableCell>
                        <TableCell>Taille</TableCell>
                        <TableCell align="right">Sortie</TableCell>
                        <TableCell align="right">Vendu</TableCell>
                        <TableCell align="right">Disponible</TableCell>
                        <TableCell align="right">Prix</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {boutiqueStockRows.map((row, index) => (
                        <TableRow key={`${row.productName}-${row.size}-${index}`}>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell>{row.size}</TableCell>
                          <TableCell align="right">{row.outQty}</TableCell>
                          <TableCell align="right">{row.soldQty}</TableCell>
                          <TableCell align="right">{row.available}</TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              value={priceInputs[row.variantId] ?? ''}
                              onChange={(e) => handlePriceChange(row.variantId, e.target.value)}
                              sx={{ width: 120 }}
                              slotProps={{ htmlInput: { min: 0 } }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleSavePrice(row.variantId)}
                              disabled={savingVariantId === row.variantId}
                            >
                              Enregistrer
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {boutiqueStockRows.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                            <Typography color="text.secondary">Aucun stock boutique disponible</Typography>
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
    </Box>
  );
}
