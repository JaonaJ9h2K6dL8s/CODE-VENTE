'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useDebounce } from '@/hooks/useDebounce';
import type { Client, ClientFormData } from '@/types';
import {
    Add,
    Delete,
    Edit,
    Facebook,
    LocationOn, Person,
    Download,
    Phone,
    Search,
} from '@mui/icons-material';
import {
    Avatar,
    Box,
    Button,
    Card, CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Menu,
    Grid,
    IconButton,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import * as XLSX from 'xlsx';

const emptyForm: ClientFormData = { name: '', facebookPseudo: '', nif: '', stat: '', phone: '', address: '', notes: '' };

interface ClientRowProps {
  client: Client;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  totalSpentText: string;
  avatarText: string;
}

const ClientRow = memo(function ClientRow({ client, onEdit, onDelete, totalSpentText, avatarText }: ClientRowProps) {
  return (
    <TableRow key={client.id} hover sx={{ cursor: 'pointer' }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: '0.85rem' }}>
            {avatarText}
          </Avatar>
          <Typography variant="body2" fontWeight={600}>{client.name}</Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Facebook sx={{ fontSize: 16, color: '#1877F2' }} />
          <Typography variant="body2">{client.facebookPseudo || '-'}</Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{client.nif || '-'}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{client.stat || '-'}</Typography>
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Phone sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="body2">{client.phone || '-'}</Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ maxWidth: 200 }} noWrap>{client.address || '-'}</Typography>
      </TableCell>
      <TableCell align="center">
        <Chip label={client.totalPurchases} size="small" color="primary" variant="outlined" />
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight={600}>
          {totalSpentText} MGA
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Tooltip title="Modifier">
          <IconButton size="small" onClick={() => onEdit(client)}><Edit fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Supprimer">
          <IconButton size="small" color="error" onClick={() => onDelete(client)}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
});

export default function ClientsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || 'Entreprise';
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const fetchClients = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const res = await fetch(`/api/clients?search=${debouncedSearch}&page=${page + 1}&limit=${rowsPerPage}&userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setClients(Array.isArray(data.clients) ? data.clients : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement', { variant: 'error' });
      setDataError(getErrorMessage(error, 'Erreur chargement clients'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [debouncedSearch, page, rowsPerPage, enqueueSnackbar, selectedUserId, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleOpenExportMenu = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleCloseExportMenu = () => {
    setExportAnchorEl(null);
  };

  const handleExportExcel = () => {
    if (clients.length === 0) {
      setExportError('Aucun client à exporter');
      return;
    }
    const rows = clients.map((client) => ({
      Client: client.name,
      Facebook: client.facebookPseudo || '-',
      NIF: client.nif || '-',
      STAT: client.stat || '-',
      Téléphone: client.phone || '-',
      Adresse: client.address || '-',
      Achats: client.totalPurchases,
      'CA réalisé': `${client.totalSpent.toLocaleString('fr-FR')} MGA`,
    }));
    const headerRows = [
      [companyName],
      ['Liste des clients'],
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
      { wch: 22 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, `clients_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (clients.length === 0) {
      setExportError('Aucun client à exporter');
      return;
    }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(companyName, 14, 16);
    doc.setFontSize(18);
    doc.text('Liste des clients', 14, 26);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

    const tableData = clients.map((client) => [
      client.name,
      client.facebookPseudo || '-',
      client.nif || '-',
      client.stat || '-',
      client.phone || '-',
      client.address || '-',
      String(client.totalPurchases),
      `${client.totalSpent.toLocaleString('fr-FR')} MGA`,
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Client', 'Facebook', 'NIF', 'STAT', 'Téléphone', 'Adresse', 'Achats', 'CA réalisé']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        6: { halign: 'center' },
        7: { halign: 'right' },
      },
    });

    doc.save(`clients_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { enqueueSnackbar('Le nom est requis', { variant: 'warning' }); return; }
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const method = editingClient ? 'PUT' : 'POST';
      const body = editingClient
        ? { ...form, id: editingClient.id, userId: selectedUserId, username: user?.username }
        : { ...form, userId: selectedUserId, username: user?.username };
      const res = await fetch('/api/clients', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        enqueueSnackbar(editingClient ? 'Client modifié' : 'Client ajouté', { variant: 'success' });
        setDialogOpen(false);
        setEditingClient(null);
        setForm(emptyForm);
        fetchClients();
      }
    } catch { enqueueSnackbar('Erreur lors de la sauvegarde', { variant: 'error' }); }
  };

  const handleDelete = async () => {
    if (!clientToDelete) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const res = await fetch(`/api/clients?id=${clientToDelete.id}&userId=${selectedUserId}&username=${encodeURIComponent(user?.username || '')}`, { method: 'DELETE' });
      if (res.ok) {
        enqueueSnackbar('Client supprimé', { variant: 'success' });
        setDeleteDialogOpen(false);
        setClientToDelete(null);
        fetchClients();
      }
    } catch { enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' }); }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      facebookPseudo: client.facebookPseudo,
      nif: client.nif,
      stat: client.stat,
      phone: client.phone,
      address: client.address,
      notes: client.notes,
    });
    setDialogOpen(true);
  };

  const openCreate = () => { setEditingClient(null); setForm(emptyForm); setDialogOpen(true); };

  const clientRows = useMemo(() => {
    return clients.map((client) => ({
      client,
      avatarText: (client.name?.charAt(0) || 'C').toUpperCase(),
      totalSpentText: client.totalSpent.toLocaleString('fr-FR'),
    }));
  }, [clients]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Gestion Clients" subtitle={`${total} clients enregistrés`} />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
          {/* Actions Bar */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <TextField
                placeholder="Rechercher un client..."
                size="small"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
                sx={{ minWidth: 300 }}
              />
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" startIcon={<Download />} onClick={handleOpenExportMenu}>
                Exporter
              </Button>
              <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={handleCloseExportMenu}>
                <MenuItem onClick={() => { handleCloseExportMenu(); handleExportPdf(); }}>
                  Exporter PDF
                </MenuItem>
                <MenuItem onClick={() => { handleCloseExportMenu(); handleExportExcel(); }}>
                  Exporter Excel
                </MenuItem>
              </Menu>
              <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
                Nouveau Client
              </Button>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Pseudo Facebook</TableCell>
                    <TableCell>NIF</TableCell>
                    <TableCell>STAT</TableCell>
                    <TableCell>Téléphone</TableCell>
                    <TableCell>Adresse</TableCell>
                    <TableCell align="center">Achats</TableCell>
                    <TableCell align="right">CA réalisé</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clientRows.map(({ client, avatarText, totalSpentText }) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      avatarText={avatarText}
                      totalSpentText={totalSpentText}
                      onEdit={openEdit}
                      onDelete={(c) => { setClientToDelete(c); setDeleteDialogOpen(true); }}
                    />
                  ))}
                  {clients.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <Person sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                      <Typography color="text.secondary">Aucun client trouvé</Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total} page={page} onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]} labelRowsPerPage="Lignes par page"
            />
          </Card>
        </Box>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={12}>
                <TextField fullWidth label="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Pseudo Facebook" value={form.facebookPseudo} onChange={(e) => setForm({ ...form, facebookPseudo: e.target.value })}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Facebook sx={{ color: '#1877F2' }} /></InputAdornment> } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="NIF" value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="STAT" value={form.stat} onChange={(e) => setForm({ ...form, stat: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Phone /></InputAdornment> } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><LocationOn /></InputAdornment> } }} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Notes internes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline rows={3} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button variant="contained" onClick={handleSave}>{editingClient ? 'Modifier' : 'Ajouter'}</Button>
          </DialogActions>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>Confirmer la suppression</DialogTitle>
          <DialogContent>
            <Typography>Supprimer le client <strong>{clientToDelete?.name}</strong> ? Cette action est irréversible.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="contained" color="error" onClick={handleDelete}>Supprimer</Button>
          </DialogActions>
        </Dialog>
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
      </Box>
    </Box>
  );
}
