'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import type { ActivityLog } from '@/types';
import {
    Add,
    Delete,
    Edit,
    History, Login,
    Download
} from '@mui/icons-material';
import {
    Avatar,
    Box, Button, Card, CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Menu,
    MenuItem,
    Table, TableBody, TableCell,
    TableContainer, TableHead,
    TablePagination,
    TableRow,
    Typography,
} from '@mui/material';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import * as XLSX from 'xlsx';

const actionIcons: Record<string, React.ReactElement> = {
  login: <Login fontSize="small" />,
  create: <Add fontSize="small" />,
  update: <Edit fontSize="small" />,
  delete: <Delete fontSize="small" />,
};

const actionColors: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  login: 'info',
  create: 'success',
  update: 'warning',
  delete: 'error',
};

const entityLabels: Record<string, string> = {
  client: 'Client',
  product: 'Produit',
  order: 'Commande',
  live_session: 'Session Live',
  auth: 'Authentification',
};

interface LogRowModel {
  log: ActivityLog;
  actionIcon: React.ReactElement;
  actionColor: 'success' | 'info' | 'warning' | 'error' | 'default';
  entityLabel: string;
  usernameText: string;
  avatarText: string;
  createdText: string;
}

interface LogRowProps {
  row: LogRowModel;
}

const LogRow = memo(function LogRow({ row }: LogRowProps) {
  const { log, actionIcon, actionColor, entityLabel, usernameText, avatarText, createdText } = row;
  return (
    <TableRow key={log.id} hover>
      <TableCell>
        <Chip
          icon={actionIcon}
          label={log.action}
          size="small"
          color={actionColor}
          variant="outlined"
        />
      </TableCell>
      <TableCell>
        <Chip
          label={entityLabel}
          size="small"
          variant="filled"
          sx={{ fontWeight: 500 }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ maxWidth: 400 }} noWrap>
          {log.details}
        </Typography>
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: 'primary.main' }}>
            {avatarText}
          </Avatar>
          <Typography variant="body2">{usernameText}</Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="caption">
          {createdText}
        </Typography>
      </TableCell>
    </TableRow>
  );
});

export default function HistoryPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const { selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || 'Entreprise';

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const res = await fetch(`/api/stats?type=logs&page=${page + 1}&limit=${rowsPerPage}&userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setDataError(null);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setDataError(getErrorMessage(error, 'Erreur chargement historique'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [page, rowsPerPage, selectedUserId, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleOpenExportMenu = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleCloseExportMenu = () => {
    setExportAnchorEl(null);
  };

  const handleExportExcel = () => {
    if (logs.length === 0) {
      setExportError('Aucun historique à exporter');
      return;
    }
    const rows = logs.map((log) => ({
      Date: new Date(log.createdAt).toLocaleDateString('fr-FR'),
      Action: log.action,
      Entité: entityLabels[log.entity] || log.entity,
      Détails: log.details,
      Utilisateur: log.username,
    }));
    const headerRows = [
      [companyName],
      ['Historique des actions'],
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
      { wch: 14 },
      { wch: 16 },
      { wch: 40 },
      { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historique');
    XLSX.writeFile(workbook, `historique_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (logs.length === 0) {
      setExportError('Aucun historique à exporter');
      return;
    }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(companyName, 14, 16);
    doc.setFontSize(18);
    doc.text('Historique des actions', 14, 26);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

    const tableData = logs.map((log) => [
      new Date(log.createdAt).toLocaleDateString('fr-FR'),
      log.action,
      entityLabels[log.entity] || log.entity,
      log.details,
      log.username,
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Date', 'Action', 'Entité', 'Détails', 'Utilisateur']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    });

    doc.save(`historique_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const logRows = useMemo<LogRowModel[]>(() => {
    return logs.map((log) => {
      const actionIcon = actionIcons[log.action] || <Edit fontSize="small" />;
      const actionColor = actionColors[log.action] || 'default';
      const entityLabel = entityLabels[log.entity] || log.entity;
      const usernameText = log.username || 'system';
      const avatarText = (log.username || 'S').charAt(0).toUpperCase();
      const createdText = new Date(log.createdAt).toLocaleString('fr-FR');
      return {
        log,
        actionIcon,
        actionColor,
        entityLabel,
        usernameText,
        avatarText,
        createdText,
      };
    });
  }, [logs]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Header title="Historique d'activité" subtitle="Journal de toutes les actions effectuées" />
        {loading && <LinearProgress />}

          <Box sx={{ p: 3 }}>
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h6" sx={{ flex: 1 }}>Journal des activités</Typography>
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
              </CardContent>
            </Card>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <History color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Journal d&apos;activité ({total} entrées)
                </Typography>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Action</TableCell>
                      <TableCell>Entité</TableCell>
                      <TableCell>Détails</TableCell>
                      <TableCell>Utilisateur</TableCell>
                      <TableCell>Date & Heure</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logRows.map((row) => (
                      <LogRow key={row.log.id} row={row} />
                    ))}
                    {logs.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                          <History sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                          <Typography color="text.secondary">Aucune activité enregistrée</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div" count={total} page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[25, 50, 100, 200]}
                labelRowsPerPage="Lignes par page"
              />
            </CardContent>
          </Card>
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
    </Box>
  );
}
