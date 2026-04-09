'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import type { Product, ProductVariant } from '@/types';
import { Add, Delete, LocalOffer } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  ListSubheader,
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

type OfferItemForm = {
  productId: string;
  variantId: string;
  quantity: number;
};

type SpecialOffer = {
  id: string;
  productId: string;
  name: string;
  offerCode: string;
  subtotalAmount: number;
  discountAmount: number;
  finalAmount: number;
  offerStock: number;
  bundleQuantity: number;
  items: Array<{
    id: string;
    productName: string;
    variantSize: string;
    variantColor: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  createdAt: string;
};

export default function SpecialOffersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { selectedUserId, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<SpecialOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<SpecialOffer | null>(null);

  const [offerName, setOfferName] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [stockQuantity, setStockQuantity] = useState(1);
  const [items, setItems] = useState<OfferItemForm[]>([{ productId: '', variantId: '', quantity: 1 }]);

  const fetchData = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const [productsRes, offersRes] = await Promise.all([
        fetch(`/api/special-offers?mode=articles&userId=${selectedUserId}`),
        fetch(`/api/special-offers?mode=offers&userId=${selectedUserId}`),
      ]);
      const productsData = await productsRes.json();
      const offersData = await offersRes.json();

      if (!productsRes.ok || !offersRes.ok) {
        throw new Error(productsData?.error || offersData?.error || 'Erreur serveur');
      }

      setProducts(Array.isArray(productsData.products) ? productsData.products : []);
      setOffers(Array.isArray(offersData.offers) ? offersData.offers : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, enqueueSnackbar]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const articleGroups = useMemo(() => {
    return products
      .map((product) => ({
        product,
        variants: (product.variants || [])
          .filter((variant) => Number(variant.stock || 0) > 0)
          .sort((a, b) => `${a.size} ${a.color}`.localeCompare(`${b.size} ${b.color}`, 'fr', { numeric: true })),
      }))
      .filter((group) => group.variants.length > 0)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'));
  }, [products]);

  const variantProductMap = useMemo(() => {
    const map: Record<string, string> = {};
    articleGroups.forEach((group) => {
      group.variants.forEach((variant) => {
        map[variant.id] = group.product.id;
      });
    });
    return map;
  }, [articleGroups]);

  const getVariant = useCallback((item: OfferItemForm): ProductVariant | undefined => {
    const product = products.find((p) => p.id === item.productId);
    return product?.variants?.find((variant) => variant.id === item.variantId);
  }, [products]);

  const subtotalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      if (!item.variantId || item.quantity <= 0) return sum;
      const variant = getVariant(item);
      return sum + (variant ? Number(variant.price || 0) * item.quantity : 0);
    }, 0);
  }, [items, getVariant]);

  const finalAmount = Math.max(0, subtotalAmount - discountAmount);

  const addItem = () => {
    setItems((prev) => [...prev, { productId: '', variantId: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OfferItemForm, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value } as OfferItemForm;
      if (field === 'productId') {
        next[index].variantId = '';
      }
      return next;
    });
  };

  const handleSaveOffer = async () => {
    if (!selectedUserId) return;
    if (!offerName.trim()) {
      enqueueSnackbar("Nom de l'offre requis", { variant: 'warning' });
      return;
    }
    const validItems = items.filter((item) => item.productId && item.variantId && item.quantity > 0);
    if (validItems.length === 0) {
      enqueueSnackbar('Ajoutez au moins un article', { variant: 'warning' });
      return;
    }
    if (discountAmount < 0) {
      enqueueSnackbar('La remise ne peut pas être négative', { variant: 'warning' });
      return;
    }
    if (discountAmount > subtotalAmount) {
      enqueueSnackbar('La remise dépasse le total des articles', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/special-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username || '',
          offerName: offerName.trim(),
          items: validItems,
          discountAmount,
          stockQuantity: Math.max(1, stockQuantity),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Erreur d'enregistrement");
      }

      enqueueSnackbar(
        `Offre enregistrée: ${finalAmount.toLocaleString('fr-FR')} MGA. Disponible dans stock, commande et live.`,
        { variant: 'success' }
      );
      setOfferName('');
      setDiscountAmount(0);
      setStockQuantity(1);
      setItems([{ productId: '', variantId: '', quantity: 1 }]);
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur d'enregistrement";
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Offre spéciale" subtitle="Créer une offre remisée et la rendre vendable automatiquement" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocalOffer color="primary" />
                      Ajouter une offre spéciale
                    </Typography>

                    <Grid container spacing={2}>
                      <Grid size={8}>
                        <TextField
                          fullWidth
                          label="Nom de l'offre"
                          value={offerName}
                          onChange={(e) => setOfferName(e.target.value)}
                          placeholder="Ex: Pack Promo T-shirt"
                        />
                      </Grid>
                      <Grid size={2}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Remise (Ar)"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(Number(e.target.value || 0))}
                        />
                      </Grid>
                      <Grid size={2}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Stock offre"
                          value={stockQuantity}
                          onChange={(e) => setStockQuantity(Number(e.target.value || 1))}
                          slotProps={{ htmlInput: { min: 1 } }}
                        />
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2, mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Articles de l&apos;offre
                      </Typography>
                      <Button startIcon={<Add />} onClick={addItem}>
                        Ajouter article
                      </Button>
                    </Box>

                    {items.map((item, index) => {
                      const variant = getVariant(item);
                      return (
                        <Box key={index} sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
                          <FormControl size="small" sx={{ flex: 1 }}>
                            <InputLabel>Article</InputLabel>
                            <Select
                              value={item.variantId}
                              label="Article"
                              onChange={(e) => {
                                const variantId = e.target.value;
                                const productId = variantProductMap[variantId] || '';
                                updateItem(index, 'productId', productId);
                                updateItem(index, 'variantId', variantId);
                              }}
                              MenuProps={{ PaperProps: { style: { maxHeight: 420 } } }}
                            >
                              {articleGroups.length === 0 && (
                                <MenuItem value="" disabled>
                                  Aucun article en stock disponible
                                </MenuItem>
                              )}
                              {articleGroups.flatMap((group) => [
                                <ListSubheader key={`group-${group.product.id}`}>
                                  Catégorie : {group.product.name}
                                </ListSubheader>,
                                ...group.variants.map((v) => (
                                  <MenuItem key={v.id} value={v.id}>
                                    {`${group.product.name} ${v.size} ${v.color}`.trim()} - {Number(v.price || 0).toLocaleString('fr-FR')} MGA (stock: {v.stock})
                                  </MenuItem>
                                )),
                              ])}
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            type="number"
                            label="Qté"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', Math.max(1, Number(e.target.value || 1)))}
                            slotProps={{ htmlInput: { min: 1 } }}
                            sx={{ width: 90 }}
                          />
                          <Typography sx={{ minWidth: 130, textAlign: 'right' }} fontWeight={700} color="primary">
                            {variant ? (Number(variant.price || 0) * item.quantity).toLocaleString('fr-FR') : 0} MGA
                          </Typography>
                          {items.length > 1 && (
                            <Button color="error" onClick={() => removeItem(index)} startIcon={<Delete />}>
                              Enlever
                            </Button>
                          )}
                        </Box>
                      );
                    })}

                    <Alert severity="info" sx={{ mt: 1 }}>
                      Total articles: <b>{subtotalAmount.toLocaleString('fr-FR')} Ar</b> | Remise: <b>{discountAmount.toLocaleString('fr-FR')} Ar</b> | Total offre: <b>{finalAmount.toLocaleString('fr-FR')} Ar</b>
                    </Alert>

                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        onClick={handleSaveOffer}
                        disabled={saving || !offerName.trim() || subtotalAmount <= 0}
                      >
                        {saving ? 'Enregistrement...' : "Enregistrer l'offre"}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                      Offres enregistrées
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Offre</TableCell>
                            <TableCell align="center">Articles pack</TableCell>
                            <TableCell align="right">Prix final</TableCell>
                            <TableCell align="center">Stock</TableCell>
                            <TableCell align="center">Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {offers.map((offer) => (
                            <TableRow key={offer.id}>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>{offer.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{offer.offerCode}</Typography>
                              </TableCell>
                              <TableCell align="center">{Number(offer.bundleQuantity || 0)}</TableCell>
                              <TableCell align="right">{Number(offer.finalAmount || 0).toLocaleString('fr-FR')} Ar</TableCell>
                              <TableCell align="center">{offer.offerStock}</TableCell>
                              <TableCell align="center">
                                <Button size="small" onClick={() => setSelectedOffer(offer)}>
                                  Voir détail
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {offers.length === 0 && !loading && (
                            <TableRow>
                              <TableCell colSpan={5} align="center">
                                Aucune offre spéciale
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
      <Dialog open={Boolean(selectedOffer)} onClose={() => setSelectedOffer(null)} maxWidth="md" fullWidth>
        <DialogTitle>Détail offre spéciale</DialogTitle>
        <DialogContent>
          {selectedOffer && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="h6" fontWeight={700}>{selectedOffer.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedOffer.offerCode} | Total pack: {selectedOffer.bundleQuantity} articles
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Article</TableCell>
                      <TableCell align="center">Qté</TableCell>
                      <TableCell align="right">P.U</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedOffer.items || []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.productName} ({item.variantSize} {item.variantColor})
                        </TableCell>
                        <TableCell align="center">{item.quantity}</TableCell>
                        <TableCell align="right">{Number(item.unitPrice || 0).toLocaleString('fr-FR')} Ar</TableCell>
                        <TableCell align="right">{Number(item.totalPrice || 0).toLocaleString('fr-FR')} Ar</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedOffer(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
