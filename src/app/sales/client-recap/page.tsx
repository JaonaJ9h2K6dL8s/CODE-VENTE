'use client';

import StatCard from '@/components/common/StatCard';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Order } from '@/types';
import {
  AutoMode,
  AttachMoney,
  Inventory,
  People,
  PictureAsPdf,
  Search,
  ShoppingCart,
  StopCircle,
  Download,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  InputAdornment,
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
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { useSnackbar } from 'notistack';
import jsPDF from 'jspdf';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ClientRecap = {
  key: string;
  clientName: string;
  orderCount: number;
  itemCount: number;
  totalAmount: number;
  lastOrderDate: string;
  liveOrderCount: number;
};

type LiveSession = {
  id: string;
  title: string;
  startedAt: string;
  isActive: boolean;
};

type LiveClientGroup = {
  key: string;
  clientNumber: number;
  clientName: string;
  clientFacebook?: string;
  clientPhone?: string;
  shippingAddress?: string;
  orders: Order[];
  totalAmount: number;
  itemCount: number;
  lastOrderTime: string;
  firstOrderTime: string;
};

const DELIVERY_FEE = 4000;

const getToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ClientRecapPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || 'Entreprise';
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(getToday());
  const [dateTo, setDateTo] = useState(getToday());
  const [activeLiveSession, setActiveLiveSession] = useState<LiveSession | null>(null);
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastAutoExportAt, setLastAutoExportAt] = useState<string | null>(null);
  const [exportGroups, setExportGroups] = useState<LiveClientGroup[]>([]);
  const lastAutoExportMsRef = useRef(0);
  const receiptRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const buildRecapRows = useCallback((sourceOrders: Order[], normalizedSearch: string) => {
    const groups = new Map<string, ClientRecap>();
    for (const order of sourceOrders) {
      if (order.status === 'cancelled') continue;
      const key = order.clientId || order.clientName.trim().toLowerCase();
      const existing = groups.get(key);
      const orderItems = order.items || [];
      const itemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);

      if (!existing) {
        groups.set(key, {
          key,
          clientName: order.clientName,
          orderCount: 1,
          itemCount,
          totalAmount: order.totalAmount,
          lastOrderDate: order.createdAt,
          liveOrderCount: order.isLiveOrder ? 1 : 0,
        });
        continue;
      }

      existing.orderCount += 1;
      existing.itemCount += itemCount;
      existing.totalAmount += order.totalAmount;
      if (new Date(order.createdAt) > new Date(existing.lastOrderDate)) {
        existing.lastOrderDate = order.createdAt;
      }
      if (order.isLiveOrder) {
        existing.liveOrderCount += 1;
      }
    }

    return Array.from(groups.values())
      .filter((row) => !normalizedSearch || row.clientName.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, []);

  const fetchActiveLiveSession = useCallback(async () => {
    if (!selectedUserId) return null;
    const res = await fetch(`/api/live-sales?active=true&userId=${selectedUserId}`);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data) || data.length === 0) return null;
    return data[0] as LiveSession;
  }, [selectedUserId]);

  const fetchAllOrdersForLiveSession = useCallback(async (liveSessionId: string) => {
    if (!selectedUserId) return [] as Order[];
    const pageSize = 200;
    let page = 1;
    let total = 0;
    const allOrders: Order[] = [];

    while (true) {
      const res = await fetch(
        `/api/orders?userId=${selectedUserId}&liveSessionId=${liveSessionId}&page=${page}&limit=${pageSize}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur chargement commandes live');
      }
      const batch = Array.isArray(data.orders) ? (data.orders as Order[]) : [];
      total = Number(data.total || 0);
      allOrders.push(...batch);
      if (batch.length === 0 || allOrders.length >= total) {
        break;
      }
      page += 1;
    }

    return allOrders;
  }, [selectedUserId]);

  const buildLiveClientGroups = useCallback((liveOrders: Order[]) => {
    const groups = new Map<string, LiveClientGroup>();
    liveOrders.forEach((order) => {
      if (order.status === 'cancelled') return;
      const key = order.clientId || order.clientName.trim().toLowerCase();
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          key,
          clientNumber: 0,
          clientName: order.clientName,
          clientFacebook: order.clientFacebook,
          clientPhone: order.clientPhone,
          shippingAddress: order.shippingAddress,
          orders: [order],
          totalAmount: order.totalAmount,
          itemCount: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
          lastOrderTime: order.createdAt,
          firstOrderTime: order.createdAt,
        });
        return;
      }
      existing.orders.push(order);
      existing.totalAmount += order.totalAmount;
      existing.itemCount += (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
      if (new Date(order.createdAt) > new Date(existing.lastOrderTime)) {
        existing.lastOrderTime = order.createdAt;
      }
      if (new Date(order.createdAt) < new Date(existing.firstOrderTime)) {
        existing.firstOrderTime = order.createdAt;
      }
      if (!existing.clientPhone && order.clientPhone) existing.clientPhone = order.clientPhone;
      if (!existing.shippingAddress && order.shippingAddress) existing.shippingAddress = order.shippingAddress;
      if (!existing.clientFacebook && order.clientFacebook) existing.clientFacebook = order.clientFacebook;
    });

    const list = Array.from(groups.values());
    const numbering = [...list].sort((a, b) => {
      const timeDiff = new Date(a.firstOrderTime).getTime() - new Date(b.firstOrderTime).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.key.localeCompare(b.key);
    });
    const numberByKey = new Map(numbering.map((group, index) => [group.key, index + 1]));
    return list
      .sort((a, b) => new Date(b.lastOrderTime).getTime() - new Date(a.lastOrderTime).getTime())
      .map((group) => ({ ...group, clientNumber: numberByKey.get(group.key) ?? 0 }));
  }, []);

  const sanitizeFileName = useCallback((value: string) => value.replace(/[^a-z0-9]/gi, '_').toLowerCase(), []);

  const prepareLiveExportData = useCallback(async () => {
    const activeSession = await fetchActiveLiveSession();
    setActiveLiveSession(activeSession);
    if (!activeSession) return null;
    const liveOrders = await fetchAllOrdersForLiveSession(activeSession.id);
    const groups = buildLiveClientGroups(liveOrders);
    if (groups.length === 0) return null;
    setExportGroups(groups);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { activeSession, groups };
  }, [fetchActiveLiveSession, fetchAllOrdersForLiveSession, buildLiveClientGroups]);

  const createImagesZipBlob = useCallback(async (groups: LiveClientGroup[]) => {
    const zip = new JSZip();
    await Promise.all(groups.map(async (group) => {
      const element = receiptRefs.current[group.key];
      if (!element) return;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) return;
      const fileName = `client_${String(group.clientNumber).padStart(3, '0')}_${sanitizeFileName(group.clientName)}.jpg`;
      zip.file(fileName, blob);
    }));
    return await zip.generateAsync({ type: 'blob' });
  }, [sanitizeFileName]);

  const createPdfZipBlob = useCallback(async (groups: LiveClientGroup[], sessionTitle: string) => {
    const zip = new JSZip();
    const itemsPerPage = 4;
    const totalPages = Math.ceil(groups.length / itemsPerPage);
    const rWidth = 90;
    const rHeight = 130;
    const spacing = 10;

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = (pageWidth - (rWidth * 2 + spacing)) / 2;
      const marginTop = (pageHeight - (rHeight * 2 + spacing)) / 2;
      const startIdx = pageIndex * itemsPerPage;
      const endIdx = Math.min(startIdx + itemsPerPage, groups.length);

      for (let i = startIdx; i < endIdx; i++) {
        const group = groups[i];
        const element = receiptRefs.current[group.key];
        if (!element) continue;
        const canvas = await html2canvas(element, {
          scale: 3,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const posInPage = i - startIdx;
        const col = posInPage % 2;
        const row = Math.floor(posInPage / 2);
        const x = marginLeft + col * (rWidth + spacing);
        const y = marginTop + row * (rHeight + spacing);
        pdf.addImage(imgData, 'JPEG', x, y, rWidth, rHeight);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.2);
        pdf.rect(x, y, rWidth, rHeight);
      }

      const pageNumber = pageIndex + 1;
      const fileName = `page_${pageNumber}_${sanitizeFileName(sessionTitle)}.pdf`;
      zip.file(fileName, pdf.output('blob'));
    }

    return await zip.generateAsync({ type: 'blob' });
  }, [sanitizeFileName]);

  const runManualExport = useCallback(async (format: 'images' | 'pdf') => {
    if (!selectedUserId || isExporting) return;
    setIsExporting(true);
    try {
      const prepared = await prepareLiveExportData();
      if (!prepared) {
        enqueueSnackbar('Aucun live actif exportable en ce moment', { variant: 'warning' });
        return;
      }
      const { activeSession, groups } = prepared;
      const base = `live_${sanitizeFileName(activeSession.title)}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      if (format === 'images') {
        const blob = await createImagesZipBlob(groups);
        saveAs(blob, `${base}_images.zip`);
        enqueueSnackbar('Export ZIP (Images) généré', { variant: 'success' });
      } else {
        const blob = await createPdfZipBlob(groups, activeSession.title);
        saveAs(blob, `${base}_pdf_a4.zip`);
        enqueueSnackbar('Export PDF (A4) généré', { variant: 'success' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur export';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setIsExporting(false);
    }
  }, [selectedUserId, isExporting, prepareLiveExportData, sanitizeFileName, createImagesZipBlob, createPdfZipBlob, enqueueSnackbar]);

  const exportSingleClientImage = useCallback(async (clientKey: string, clientName: string) => {
    if (!selectedUserId || isExporting) return;
    setIsExporting(true);
    try {
      const prepared = await prepareLiveExportData();
      if (!prepared) {
        enqueueSnackbar('Aucun live actif exportable en ce moment', { variant: 'warning' });
        return;
      }
      const { activeSession, groups } = prepared;
      const normalizedName = clientName.trim().toLowerCase();
      const target =
        groups.find((group) => group.key === clientKey) ||
        groups.find((group) => group.clientName.trim().toLowerCase() === normalizedName);
      if (!target) {
        enqueueSnackbar('Client non trouvé dans le live actif', { variant: 'warning' });
        return;
      }
      const element = receiptRefs.current[target.key];
      if (!element) {
        enqueueSnackbar('Préparation de la fiche en cours, réessayez', { variant: 'warning' });
        return;
      }
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) {
        enqueueSnackbar('Erreur génération image', { variant: 'error' });
        return;
      }
      const fileName = `client_${String(target.clientNumber).padStart(3, '0')}_${sanitizeFileName(target.clientName)}_${sanitizeFileName(activeSession.title)}.jpg`;
      saveAs(blob, fileName);
      enqueueSnackbar('Image client exportée', { variant: 'success' });
    } finally {
      setIsExporting(false);
    }
  }, [selectedUserId, isExporting, prepareLiveExportData, sanitizeFileName, enqueueSnackbar]);

  const runAutoExport = useCallback(async () => {
    if (!selectedUserId || isExporting) return false;
    setIsExporting(true);
    try {
      const prepared = await prepareLiveExportData();
      if (!prepared) return false;
      const { activeSession, groups } = prepared;
      const imagesBlob = await createImagesZipBlob(groups);
      const pdfBlob = await createPdfZipBlob(groups, activeSession.title);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const packageZip = new JSZip();
      packageZip.file(`live_${sanitizeFileName(activeSession.title)}_${stamp}_images.zip`, imagesBlob);
      packageZip.file(`live_${sanitizeFileName(activeSession.title)}_${stamp}_pdf_a4.zip`, pdfBlob);
      const finalBlob = await packageZip.generateAsync({ type: 'blob' });
      saveAs(finalBlob, `auto_export_live_${stamp}.zip`);
      setLastAutoExportAt(new Date().toISOString());
      enqueueSnackbar('Export automatique (ZIP images + PDF) généré', { variant: 'success' });
      return true;
    } catch {
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [selectedUserId, isExporting, prepareLiveExportData, createImagesZipBlob, createPdfZipBlob, sanitizeFileName, enqueueSnackbar]);

  const fetchAllOrders = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const pageSize = 200;
      let page = 1;
      let total = 0;
      const allOrders: Order[] = [];

      while (true) {
        const res = await fetch(
          `/api/orders?userId=${selectedUserId}&dateFrom=${dateFrom}&dateTo=${dateTo}&page=${page}&limit=${pageSize}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Erreur chargement commandes');
        }
        const batch = Array.isArray(data.orders) ? (data.orders as Order[]) : [];
        total = Number(data.total || 0);
        allOrders.push(...batch);
        if (batch.length === 0 || allOrders.length >= total) {
          break;
        }
        page += 1;
      }

      setOrders(allOrders);
      setDataError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur chargement récap client';
      enqueueSnackbar('Erreur de chargement du récapitulatif client', { variant: 'error' });
      setDataError(message);
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [selectedUserId, dateFrom, dateTo, enqueueSnackbar, startDataLoading, endDataLoading, setDataError]);

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  useEffect(() => {
    const refreshLiveStatus = async () => {
      try {
        const live = await fetchActiveLiveSession();
        setActiveLiveSession(live);
      } catch {
        setActiveLiveSession(null);
      }
    };
    refreshLiveStatus();
    const timer = setInterval(refreshLiveStatus, 60000);
    return () => clearInterval(timer);
  }, [fetchActiveLiveSession]);

  useEffect(() => {
    if (!autoExportEnabled) return;
    const tick = async () => {
      const now = Date.now();
      if (lastAutoExportMsRef.current !== 0 && now - lastAutoExportMsRef.current < 600000) {
        return;
      }
      const success = await runAutoExport();
      if (success) {
        lastAutoExportMsRef.current = Date.now();
      }
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [autoExportEnabled, runAutoExport]);

  const recapRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return buildRecapRows(orders, normalizedSearch);
  }, [orders, search, buildRecapRows]);

  const totalRevenue = useMemo(
    () => recapRows.reduce((sum, row) => sum + row.totalAmount, 0),
    [recapRows]
  );
  const totalOrders = useMemo(
    () => recapRows.reduce((sum, row) => sum + row.orderCount, 0),
    [recapRows]
  );
  const totalItems = useMemo(
    () => recapRows.reduce((sum, row) => sum + row.itemCount, 0),
    [recapRows]
  );
  const avgBasket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Récapitulation client" subtitle="Synthèse des ventes par client" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Clients actifs"
                  value={recapRows.length}
                  icon={<People />}
                  color="#1D4ED8"
                  bgColor="#DBEAFE"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Commandes"
                  value={totalOrders}
                  icon={<ShoppingCart />}
                  color="#0F766E"
                  bgColor="#CCFBF1"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Articles vendus"
                  value={totalItems}
                  icon={<Inventory />}
                  color="#7C3AED"
                  bgColor="#EDE9FE"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard
                  title="Panier moyen"
                  value={`${avgBasket.toLocaleString('fr-FR')} Ar`}
                  icon={<AttachMoney />}
                  color="#B45309"
                  bgColor="#FEF3C7"
                />
              </Grid>
            </Grid>

            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <Chip
                  color={activeLiveSession ? 'success' : 'default'}
                  label={activeLiveSession ? `Live actif: ${activeLiveSession.title}` : 'Aucun live actif'}
                />
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={() => runManualExport('images')}
                  disabled={isExporting}
                >
                  ZIP (Images)
                </Button>
                <Button
                  variant="contained"
                  startIcon={isExporting ? <CircularProgress size={18} color="inherit" /> : <PictureAsPdf />}
                  onClick={() => runManualExport('pdf')}
                  disabled={isExporting}
                >
                  PDF (A4)
                </Button>
                <Button
                  variant={autoExportEnabled ? 'contained' : 'outlined'}
                  color={autoExportEnabled ? 'error' : 'success'}
                  startIcon={autoExportEnabled ? <StopCircle /> : <AutoMode />}
                  onClick={() => {
                    setAutoExportEnabled((prev) => !prev);
                    if (autoExportEnabled) {
                      lastAutoExportMsRef.current = 0;
                    }
                  }}
                  disabled={isExporting}
                >
                  {autoExportEnabled ? 'Arrêter export auto 10 min' : 'Activer export'}
                </Button>
                <Chip
                  icon={<PictureAsPdf />}
                  variant="outlined"
                  label={lastAutoExportAt ? `Dernier export auto: ${new Date(lastAutoExportAt).toLocaleString('fr-FR')}` : 'Pas encore d’export auto'}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <TextField
                    label="Date début"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    label="Date fin"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    placeholder="Rechercher client..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    size="small"
                    sx={{ minWidth: 280 }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>

                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                  Chiffre d&apos;affaires total de la période: {totalRevenue.toLocaleString('fr-FR')} Ar
                </Typography>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Client</TableCell>
                        <TableCell align="center">Commandes</TableCell>
                        <TableCell align="center">Commandes live</TableCell>
                        <TableCell align="center">Articles</TableCell>
                        <TableCell align="right">CA</TableCell>
                        <TableCell align="right">Dernier achat</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recapRows.map((row, index) => (
                        <TableRow key={row.key} hover>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {row.clientName}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">{row.orderCount}</TableCell>
                          <TableCell align="center">{row.liveOrderCount}</TableCell>
                          <TableCell align="center">{row.itemCount}</TableCell>
                          <TableCell align="right">{row.totalAmount.toLocaleString('fr-FR')} Ar</TableCell>
                          <TableCell align="right">
                            {new Date(row.lastOrderDate).toLocaleString('fr-FR')}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Exporter image client (live actif)">
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => exportSingleClientImage(row.key, row.clientName)}
                                  disabled={isExporting}
                                >
                                  <Download fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                      {recapRows.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">Aucune donnée client sur cette période</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
            <Box sx={{ position: 'fixed', left: -10000, top: 0, width: 380, zIndex: -1 }}>
              {exportGroups.map((group) => (
                <Card key={group.key} variant="outlined" sx={{ mb: 2 }}>
                  <Box
                    ref={(el: HTMLDivElement | null) => { receiptRefs.current[group.key] = el; }}
                    sx={{ p: 3, bgcolor: 'background.paper', width: '340px', minHeight: '491px', margin: '0 auto' }}
                  >
                    <Box sx={{ textAlign: 'center', mb: 2 }}>
                      <Typography variant="h5" fontWeight={800} color="primary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        {companyName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {activeLiveSession ? activeLiveSession.title : 'Live'}
                      </Typography>
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        Client N°{group.clientNumber}: {group.clientName}
                      </Typography>
                      {group.clientFacebook && (
                        <Typography variant="body2" color="text.secondary">
                          Facebook: {group.clientFacebook}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        Contact: {group.clientPhone || ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Lieux de livraison: {group.shippingAddress || ''}
                      </Typography>
                    </Box>
                    <TableContainer component={Box} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
                      <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#2980b9' }}>
                            <TableCell sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.7rem', p: 0.5 }}>Articles</TableCell>
                            <TableCell align="center" sx={{ color: 'white', fontWeight: 'bold', width: '30px', fontSize: '0.7rem', p: 0.5 }}>Qté</TableCell>
                            <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', width: '65px', fontSize: '0.7rem', p: 0.5 }}>P.U</TableCell>
                            <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold', width: '75px', fontSize: '0.7rem', p: 0.5 }}>Total</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {group.orders.map((order) => (
                            order.items?.map((item, idx) => (
                              <TableRow key={`${order.id}-${item.id}`} sx={{ bgcolor: idx % 2 === 0 ? 'background.paper' : 'action.hover' }}>
                                <TableCell sx={{ borderRight: 1, borderColor: 'divider', fontSize: '0.7rem', p: 0.5, wordBreak: 'break-word' }}>
                                  <Box sx={{ display: 'block', lineHeight: 1.2 }}>
                                    {item.productName} <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>({item.variantSize} {item.variantColor})</span>
                                  </Box>
                                </TableCell>
                                <TableCell align="center" sx={{ borderRight: 1, borderColor: 'divider', fontWeight: 'bold', fontSize: '0.75rem', p: 0.5 }}>
                                  {item.quantity}
                                </TableCell>
                                <TableCell align="right" sx={{ borderRight: 1, borderColor: 'divider', fontSize: '0.7rem', p: 0.5, whiteSpace: 'nowrap' }}>
                                  {item.unitPrice.toLocaleString('fr-FR')}
                                </TableCell>
                                <TableCell align="right" sx={{ borderColor: 'divider', fontSize: '0.7rem', p: 0.5, whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                  {(item.unitPrice * item.quantity).toLocaleString('fr-FR')}
                                </TableCell>
                              </TableRow>
                            ))
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderTop: 2, borderColor: 'primary.main', pt: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Sous-total :</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {group.totalAmount.toLocaleString('fr-FR')} Ar
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">Frais de livraison :</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {DELIVERY_FEE.toLocaleString('fr-FR')} Ar
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6" fontWeight={700}>TOTAL À PAYER :</Typography>
                        <Typography variant="h5" fontWeight={800} color="primary">
                          {(group.totalAmount + DELIVERY_FEE).toLocaleString('fr-FR')} Ar
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        ({group.itemCount} articles)
                      </Typography>
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
