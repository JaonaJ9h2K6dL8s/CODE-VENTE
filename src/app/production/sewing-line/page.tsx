'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import type { Product, ProductionSewingEntry } from '@/types';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useState } from 'react';
import { Delete, Edit } from '@mui/icons-material';

export default function ProductionSewingLinePage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<ProductionSewingEntry[]>([]);
  const [productName, setProductName] = useState('');
  const [variantSize, setVariantSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [chainName, setChainName] = useState('');
  const [chiefName, setChiefName] = useState('');
  const [notes, setNotes] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ProductionSewingEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<ProductionSewingEntry | null>(null);

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

  const fetchEntries = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const res = await fetch(`/api/sewing-line?userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setDataError(null);
    } catch {
      setDataError('Erreur chargement couture');
      enqueueSnackbar('Erreur de chargement des entrées couture', { variant: 'error' });
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, enqueueSnackbar, startDataLoading, endDataLoading, setDataError]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const openEdit = (entry: ProductionSewingEntry) => {
    setProductName(entry.productName || '');
    setVariantSize(entry.variantSize || '');
    setQuantity(entry.quantity);
    setChainName(entry.chainName || '');
    setChiefName(entry.chiefName || '');
    setNotes(entry.notes || '');
    setEditEntry(entry);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    if (!editEntry || !productName.trim() || !variantSize.trim() || quantity <= 0 || !chainName.trim() || !chiefName.trim()) {
      enqueueSnackbar('Veuillez compléter les champs obligatoires', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sewing-line', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry.id,
          userId: selectedUserId,
          username: user?.username || '',
          productName: productName.trim(),
          variantSize: variantSize.trim(),
          quantity,
          chainName: chainName.trim(),
          chiefName: chiefName.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de la mise à jour', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Entrée mise à jour', { variant: 'success' });
      setEditOpen(false);
      setEditEntry(null);
      setProductName('');
      setVariantSize('');
      fetchEntries();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const res = await fetch(`/api/sewing-line?id=${deleteEntry.id}&userId=${selectedUserId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de la suppression', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Entrée supprimée', { variant: 'success' });
      setDeleteEntry(null);
      fetchEntries();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const handleSubmit = async () => {
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    if (!productName.trim() || !variantSize.trim() || quantity <= 0 || !chainName.trim() || !chiefName.trim()) {
      enqueueSnackbar('Veuillez compléter les champs obligatoires', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sewing-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username || '',
          productName: productName.trim(),
          variantSize: variantSize.trim(),
          quantity,
          chainName: chainName.trim(),
          chiefName: chiefName.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur lors de l\'enregistrement', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Entrée couture enregistrée', { variant: 'success' });
      setQuantity(1);
      setProductName('');
      setVariantSize('');
      setChainName('');
      setChiefName('');
      setNotes('');
      fetchEntries();
      fetchProducts();
    } catch {
      enqueueSnackbar('Erreur lors de l\'enregistrement', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Chaîne de production couture" subtitle="Suivi des lignes de couture" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Nouvelle entrée couture
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <TextField
                      fullWidth
                      label="Nom de produit"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      fullWidth
                      label="Taille"
                      value={variantSize}
                      onChange={(e) => setVariantSize(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 2 }}>
                    <TextField
                      fullWidth
                      label="Nombre d'articles"
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Nom du chaîne"
                      value={chainName}
                      onChange={(e) => setChainName(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Nom du chef de chaîne"
                      value={chiefName}
                      onChange={(e) => setChiefName(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="contained" onClick={handleSubmit} disabled={saving}>
                        Enregistrer et entrer en stock
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  Entrées récentes
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
                        <TableCell>Chef</TableCell>
                    <TableCell align="right">Quantité</TableCell>
                    <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {new Date(entry.createdAt).toLocaleDateString('fr-FR')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                              {entry.productionNumber || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{entry.productName}</Typography>
                          </TableCell>
                          <TableCell>{entry.variantSize || '-'}</TableCell>
                          <TableCell>{entry.chainName || '-'}</TableCell>
                          <TableCell>{entry.chiefName || '-'}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700}>{entry.quantity}</Typography>
                          </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Modifier">
                          <IconButton size="small" onClick={() => openEdit(entry)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Supprimer">
                          <IconButton size="small" color="error" onClick={() => setDeleteEntry(entry)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                        </TableRow>
                      ))}
                      {entries.length === 0 && !loading && (
                        <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">Aucune entrée enregistrée</Typography>
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

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Modifier l&apos;entrée couture</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                label="Nom de produit"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Taille"
                value={variantSize}
                onChange={(e) => setVariantSize(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                fullWidth
                label="Nombre d'articles"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Nom du chaîne"
                value={chainName}
                onChange={(e) => setChainName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Nom du chef de chaîne"
                value={chiefName}
                onChange={(e) => setChiefName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving}>Enregistrer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteEntry)} onClose={() => setDeleteEntry(null)}>
        <DialogTitle>Supprimer l&apos;entrée</DialogTitle>
        <DialogContent>
          <Typography>Confirmer la suppression de cette entrée couture ?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteEntry(null)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
