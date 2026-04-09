'use client';

import StatCard from '@/components/common/StatCard';
import StatusChip from '@/components/common/StatusChip';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ReceiptTemplate } from '@/stores/themeStore';
import { Client, Order, Product } from '@/types';
import {
  Add,
  AttachMoney,
  CheckCircle,
  Delete,
  LiveTv,
  PlayArrow,
  Receipt,
  ShoppingCart,
  Stop,
  Timer,
  ExpandMore,
  ExpandLess,
  History as HistoryIcon,
  Download,
  PictureAsPdf,
  Edit,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  ListSubheader,
  Menu,
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
import { useCallback, useEffect, useState, useRef, useMemo, Fragment } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

interface LiveSession {
  id: string;
  title: string;
  isActive: boolean;
  startedAt: string;
  endedAt?: string;
  totalOrders: number;
  totalRevenue: number;
}

interface OrderItemForm {
  productId: string;
  variantId: string;
  quantity: number;
}

interface SpecialOfferRow {
  productId: string;
  bundleQuantity?: number;
}

const DELIVERY_FEE = 4000;

const RECEIPT_TEMPLATE_STYLES: Record<ReceiptTemplate, {
  headerBg: string;
  headerText: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  borderColor: string;
  rowAltBg: string;
  totalColor: string;
}> = {
  'blue-grid': {
    headerBg: '#0B4F9C',
    headerText: '#FFFFFF',
    tableHeaderBg: '#2980B9',
    tableHeaderText: '#FFFFFF',
    borderColor: '#94A3B8',
    rowAltBg: '#F1F5F9',
    totalColor: '#0B4F9C',
  },
  'clean-light': {
    headerBg: '#F8FAFC',
    headerText: '#0F172A',
    tableHeaderBg: '#E2E8F0',
    tableHeaderText: '#1E293B',
    borderColor: '#CBD5E1',
    rowAltBg: '#F8FAFC',
    totalColor: '#4F46E5',
  },
  'emerald-pro': {
    headerBg: '#065F46',
    headerText: '#ECFDF5',
    tableHeaderBg: '#10B981',
    tableHeaderText: '#ECFDF5',
    borderColor: '#6EE7B7',
    rowAltBg: '#ECFDF5',
    totalColor: '#047857',
  },
  'mono-dark': {
    headerBg: '#111827',
    headerText: '#F9FAFB',
    tableHeaderBg: '#1F2937',
    tableHeaderText: '#F9FAFB',
    borderColor: '#4B5563',
    rowAltBg: '#F3F4F6',
    totalColor: '#111827',
  },
  'delivery-sheet': {
    headerBg: '#0B4F9C',
    headerText: '#FFFFFF',
    tableHeaderBg: '#1B9AD7',
    tableHeaderText: '#FFFFFF',
    borderColor: '#94A3B8',
    rowAltBg: '#F8FAFC',
    totalColor: '#0B4F9C',
  },
  'pink-invoice': {
    headerBg: '#D979A8',
    headerText: '#FFFFFF',
    tableHeaderBg: '#D979A8',
    tableHeaderText: '#FFFFFF',
    borderColor: '#E9B6CC',
    rowAltBg: '#FFF0F7',
    totalColor: '#C06091',
  },
};

export default function LiveSalesPage() {
  const { user, selectedUserId } = useAuthStore();
  const company = useThemeStore((state) => state.company);
  const companyName = company.name || "Joy's K boutique";
  const receiptTemplate: ReceiptTemplate = company.receiptTemplate || 'blue-grid';
  const receiptAccent = company.receiptAccentColor || '#D979A8';
  const receiptStyle = receiptTemplate === 'pink-invoice'
    ? {
        ...RECEIPT_TEMPLATE_STYLES['pink-invoice'],
        headerBg: receiptAccent,
        tableHeaderBg: receiptAccent,
        totalColor: receiptAccent,
      }
    : RECEIPT_TEMPLATE_STYLES[receiptTemplate];
  const { enqueueSnackbar } = useSnackbar();
  
  // Session state
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pastSessions, setPastSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  // Data state
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allowedVariantIds, setAllowedVariantIds] = useState<Set<string>>(new Set());
  const [allowedOutQuantities, setAllowedOutQuantities] = useState<Record<string, number>>({});
  const [sessionOrders, setSessionOrders] = useState<Order[]>([]);
  const [offerBundleQtyByProductId, setOfferBundleQtyByProductId] = useState<Record<string, number>>({});

  // Form state
  const [selectedClient, setSelectedClient] = useState<Client | string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ productId: '', variantId: '', quantity: 1 }]);
  const [clientInputValue, setClientInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const lastSilentRefreshRef = useRef(0);
  const getRealItemQuantity = useCallback((productId: string, quantity: number) => {
    const bundleQty = Number(offerBundleQtyByProductId[productId] || 0);
    return bundleQty > 0 ? quantity * bundleQty : quantity;
  }, [offerBundleQtyByProductId]);

  const totalItemsLive = useMemo(() => {
    return sessionOrders.reduce((sum, order) => {
      const items = order.items || [];
      return sum + items.reduce((acc, item) => acc + getRealItemQuantity(item.productId, item.quantity), 0);
    }, 0);
  }, [sessionOrders, getRealItemQuantity]);
  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const uniqueClients: Client[] = [];
    for (const client of clients) {
      const key = `${client.name.trim().toLowerCase()}|${(client.facebookPseudo || '').trim().toLowerCase()}|${(client.phone || '').trim().toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      uniqueClients.push(client);
    }
    return uniqueClients;
  }, [clients]);

  const fetchAllSessionOrders = useCallback(async (liveSessionId: string) => {
    if (!selectedUserId) return [] as Order[];
    const pageSize = 200;
    let page = 1;
    let total = 0;
    const allOrders: Order[] = [];

    while (true) {
      const res = await fetch(
        `/api/orders?liveSessionId=${liveSessionId}&userId=${selectedUserId}&page=${page}&limit=${pageSize}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur chargement commandes live');
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

  // Fetch initial data
  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedUserId) return;
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setLoading(true);
      }
      const [sessionRes, clientsRes, productsRes, pastSessionsRes, specialOffersRes] = await Promise.all([
        fetch(`/api/live-sales?active=true&userId=${selectedUserId}`),
        fetch(`/api/clients?limit=1000&userId=${selectedUserId}`),
        fetch(`/api/products?limit=1000&userId=${selectedUserId}`),
        fetch(`/api/live-sales?active=false&userId=${selectedUserId}`),
        fetch(`/api/special-offers?mode=offers&userId=${selectedUserId}`),
      ]);

      const sessionData = await sessionRes.json();
      
      if (sessionRes.ok && Array.isArray(sessionData) && sessionData.length > 0) {
        setSession(sessionData[0]);
        // If active session, fetch its orders
        const allLiveOrders = await fetchAllSessionOrders(sessionData[0].id);
        setSessionOrders(allLiveOrders);
      } else {
        setSession(null);
      }

      const clientsData = await clientsRes.json();
      const productsData = await productsRes.json();
      const pastSessionsData = await pastSessionsRes.json();
      const specialOffersData = await specialOffersRes.json();
      if (clientsRes.ok) setClients(clientsData.clients || []);
      if (productsRes.ok) setProducts(productsData.products || []);
      if (pastSessionsRes.ok) setPastSessions(pastSessionsData || []);
      if (specialOffersRes.ok) {
        const offers = Array.isArray(specialOffersData.offers) ? (specialOffersData.offers as SpecialOfferRow[]) : [];
        const map: Record<string, number> = {};
        offers.forEach((offer) => {
          map[offer.productId] = Math.max(1, Number(offer.bundleQuantity || 0));
        });
        setOfferBundleQtyByProductId(map);
      }
      const productList = Array.isArray(productsData.products) ? productsData.products : [];
      const availableMap: Record<string, number> = {};
      const variantIds: string[] = [];
      productList.forEach((product: Product) => {
        if (!product.isActive) return;
        (product.variants || []).forEach((variant) => {
          variantIds.push(variant.id);
          availableMap[variant.id] = Number(variant.stock || 0);
        });
      });
      setAllowedVariantIds(new Set(variantIds));
      setAllowedOutQuantities(availableMap);

    } catch (error) {
      console.error('Error fetching data:', error);
      enqueueSnackbar('Erreur de chargement des données', { variant: 'error' });
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [selectedUserId, enqueueSnackbar, fetchAllSessionOrders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      if (now - lastSilentRefreshRef.current < 15000) return;
      lastSilentRefreshRef.current = now;
      fetchData({ silent: true });
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [fetchData]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (session?.isActive && session.startedAt) {
      interval = setInterval(() => {
        const start = new Date(session.startedAt).getTime();
        const now = new Date().getTime();
        const diff = now - start;
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [session]);



  const [deleteOrderOpen, setDeleteOrderOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  const confirmDeleteOrder = (order: Order) => {
    setOrderToDelete(order);
    setDeleteOrderOpen(true);
  };

  const handleDeleteOrder = async () => {
    if (!selectedUserId || !orderToDelete) return;
    try {
      const res = await fetch(`/api/orders?id=${orderToDelete.id}&userId=${selectedUserId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Erreur suppression');
      
      setSessionOrders(sessionOrders.filter(o => o.id !== orderToDelete.id));
      if (session && session.id === orderToDelete.liveSessionId) {
        setSession({
          ...session,
          totalOrders: session.totalOrders - 1,
          totalRevenue: session.totalRevenue - orderToDelete.totalAmount
        });
      }

      // Update past sessions list
      setPastSessions(pastSessions.map(ps => {
        if (ps.id === orderToDelete.liveSessionId) {
          return {
            ...ps,
            totalOrders: ps.totalOrders - 1,
            totalRevenue: ps.totalRevenue - orderToDelete.totalAmount
          };
        }
        return ps;
      }));

      // Update view details list
      if (viewSessionDetails) {
        setViewSessionOrders(viewSessionOrders.filter(o => o.id !== orderToDelete.id));
      }

      setDeleteOrderOpen(false);
      setOrderToDelete(null);
      enqueueSnackbar('Commande supprimée', { variant: 'success' });
      fetch(`/api/products?limit=1000&userId=${selectedUserId}`)
        .then(res => res.json())
        .then(data => setProducts(data.products || []));
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const [viewSessionDetails, setViewSessionDetails] = useState<LiveSession | null>(null);
  const [viewSessionOrders, setViewSessionOrders] = useState<Order[]>([]);
  const [viewSessionLoading, setViewSessionLoading] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const receiptRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Edit order state
  const [editOrderOpen, setEditOrderOpen] = useState(false);
  const [editingOrder, setEditOrder] = useState<Order | null>(null);
  const [editOrderItems, setEditOrderItems] = useState<OrderItemForm[]>([]);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);

  const handleOpenEditOrder = (order: Order) => {
    setEditOrder(order);
    setEditOrderItems(order.items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity
    })));
    setEditOrderOpen(true);
  };

  const handleUpdateOrder = async () => {
    if (!selectedUserId || !editingOrder) return;
    
    const validItems = editOrderItems.filter(i => i.productId && i.variantId && i.quantity > 0);
    if (validItems.length === 0) {
      enqueueSnackbar('Veuillez ajouter au moins un article', { variant: 'warning' });
      return;
    }

    setIsUpdatingOrder(true);
    try {
      const res = await fetch(`/api/orders`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingOrder.id,
          userId: selectedUserId,
          status: editingOrder.status,
          paymentMethod: editingOrder.paymentMethod,
          deliveryPerson: editingOrder.deliveryPerson,
          notes: editingOrder.notes,
          shippingAddress: editingOrder.shippingAddress,
          deliveryDate: editingOrder.deliveryDate,
          items: validItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh session orders locally
      setSessionOrders(sessionOrders.map(o => o.id === editingOrder.id ? data : o));
      
      // Update session stats if it's the active one
      if (session && session.id === editingOrder.liveSessionId) {
        const amountDiff = data.totalAmount - editingOrder.totalAmount;
        setSession({
          ...session,
          totalRevenue: session.totalRevenue + amountDiff
        });
      }

      // Update past sessions list
      setPastSessions(pastSessions.map(ps => {
        if (ps.id === editingOrder.liveSessionId) {
          return {
            ...ps,
            totalRevenue: ps.totalRevenue + (data.totalAmount - editingOrder.totalAmount)
          };
        }
        return ps;
      }));

      setEditOrderOpen(false);
      enqueueSnackbar('Commande mise à jour !', { variant: 'success' });
      fetch(`/api/products?limit=1000&userId=${selectedUserId}`)
        .then(res => res.json())
        .then(data => setProducts(data.products || []));
      
      // If we are viewing session details, update that too
      if (viewSessionDetails) {
        setViewSessionOrders(viewSessionOrders.map(o => o.id === editingOrder.id ? data : o));
      }
    } catch {
      enqueueSnackbar('Erreur lors de la mise à jour', { variant: 'error' });
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleViewSession = async (session: LiveSession) => {
    setViewSessionDetails(session);
    setViewSessionLoading(true);
    try {
      const allLiveOrders = await fetchAllSessionOrders(session.id);
      setViewSessionOrders(allLiveOrders);
    } catch {
      enqueueSnackbar('Erreur chargement détails session', { variant: 'error' });
    } finally {
      setViewSessionLoading(false);
    }
  };

  const groupedViewOrders = useMemo(() => {
    const groups: Record<string, {
      key: string;
      clientNumber: number;
      clientName: string;
      clientFacebook?: string;
      clientPhone?: string;
      shippingAddress?: string;
      orders: Order[];
      totalAmount: number;
      lastOrderTime: string;
      firstOrderTime: string;
      itemCount: number;
    }> = {};

    viewSessionOrders.forEach(order => {
      const key = order.clientId || order.clientName;
      if (!groups[key]) {
        groups[key] = {
          key,
          clientNumber: 0,
          clientName: order.clientName,
          clientFacebook: order.clientFacebook,
          clientPhone: order.clientPhone,
          shippingAddress: order.shippingAddress,
          orders: [],
          totalAmount: 0,
          lastOrderTime: order.createdAt,
          firstOrderTime: order.createdAt,
          itemCount: 0,
        };
      }
      groups[key].orders.push(order);
      groups[key].totalAmount += order.totalAmount;
      groups[key].itemCount += (order.items || []).reduce((sum, item) => sum + getRealItemQuantity(item.productId, item.quantity), 0);
      if (new Date(order.createdAt) > new Date(groups[key].lastOrderTime)) {
        groups[key].lastOrderTime = order.createdAt;
      }
      if (new Date(order.createdAt) < new Date(groups[key].firstOrderTime)) {
        groups[key].firstOrderTime = order.createdAt;
      }
      // Update info if missing
      if (!groups[key].clientPhone && order.clientPhone) groups[key].clientPhone = order.clientPhone;
      if (!groups[key].shippingAddress && order.shippingAddress) groups[key].shippingAddress = order.shippingAddress;
    });

    const allGroups = Object.values(groups);
    const numbering = [...allGroups].sort((a, b) => {
      const timeDiff = new Date(a.firstOrderTime).getTime() - new Date(b.firstOrderTime).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.key.localeCompare(b.key);
    });
    const numberByKey = new Map(numbering.map((group, index) => [group.key, index + 1]));

    return allGroups
      .sort((a, b) => new Date(b.lastOrderTime).getTime() - new Date(a.lastOrderTime).getTime())
      .map((group) => ({
        ...group,
        clientNumber: numberByKey.get(group.key) ?? 0,
      }));
  }, [viewSessionOrders, getRealItemQuantity]);

  const handleExportZip = async () => {
    if (!groupedViewOrders.length || !viewSessionDetails) return;
    setIsExportingZip(true);
    // Wait for state update to reflect width change
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const zip = new JSZip();

    try {
      const safePart = (value: string) =>
        value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase() || 'client';
      const exportGroups = [...groupedViewOrders].sort((a, b) => a.clientNumber - b.clientNumber);
      // Process each client receipt
      const promises = exportGroups.map(async (group) => {
        const element = receiptRefs.current[group.key];
        if (element) {
          const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          });
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (blob) {
            const filename = `client_N${group.clientNumber}_${safePart(group.clientName)}.jpg`;
            zip.file(filename, blob);
          }
        }
      });

      await Promise.all(promises);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Live_${viewSessionDetails.title.replace(/[^a-z0-9]/gi, '_')}.zip`);
      enqueueSnackbar('Export ZIP terminé !', { variant: 'success' });
    } catch (error) {
      console.error('Zip export error:', error);
      enqueueSnackbar('Erreur lors de l\'export ZIP', { variant: 'error' });
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportPdf = async () => {
    if (!groupedViewOrders.length || !viewSessionDetails) return;
    setIsExportingPdf(true);
    
    // Wait for state update to reflect width change (A4 layout requires 9x13cm)
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const zip = new JSZip();
      const exportGroups = [...groupedViewOrders].sort((a, b) => a.clientNumber - b.clientNumber);
      const totalGroups = exportGroups.length;
      const itemsPerPage = 4;
      const totalPages = Math.ceil(totalGroups / itemsPerPage);

      // Receipt size in mm (90x130)
      const rWidth = 90;
      const rHeight = 130;
      const spacing = 10;

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        // Margins to center the grid
        const marginLeft = (pageWidth - (rWidth * 2 + spacing)) / 2;
        const marginTop = (pageHeight - (rHeight * 2 + spacing)) / 2;

        const startIdx = pageIndex * itemsPerPage;
        const endIdx = Math.min(startIdx + itemsPerPage, totalGroups);
        
        for (let i = startIdx; i < endIdx; i++) {
          const group = exportGroups[i];
          const element = receiptRefs.current[group.key];
          
          if (element) {
            const canvas = await html2canvas(element, {
              scale: 3, // Higher quality for PDF
              useCORS: true,
              backgroundColor: '#ffffff',
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            // Calculate position (0, 1, 2, 3 per page)
            const posInPage = i - startIdx;
            const col = posInPage % 2;
            const row = Math.floor(posInPage / 2);
            
            const x = marginLeft + col * (rWidth + spacing);
            const y = marginTop + row * (rHeight + spacing);
            
            pdf.addImage(imgData, 'JPEG', x, y, rWidth, rHeight);
            
            // Add border for easier cutting
            pdf.setDrawColor(0, 0, 0); // Black
            pdf.setLineWidth(0.2); // Thin line
            pdf.rect(x, y, rWidth, rHeight);
          }
        }
        
        // Add PDF to zip
        const pdfBlob = pdf.output('blob');
        const pageNum = pageIndex + 1;
        const fileName = `Page_${pageNum}_${viewSessionDetails.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        zip.file(fileName, pdfBlob);
      }

      // Generate and save ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Live_${viewSessionDetails.title.replace(/[^a-z0-9]/gi, '_')}_PDFs.zip`);
      
      enqueueSnackbar('Export PDF (ZIP) terminé !', { variant: 'success' });
    } catch (error) {
      console.error('PDF export error:', error);
      enqueueSnackbar('Erreur lors de l\'export PDF', { variant: 'error' });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [deleteSessionDialogOpen, setDeleteSessionDialogOpen] = useState(false);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, session: LiveSession) => {
    setAnchorEl(event.currentTarget);
    setSelectedSession(session);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDeleteSession = async () => {
    if (!selectedUserId || !selectedSession) return;
    try {
      const res = await fetch(`/api/live-sales?id=${selectedSession.id}&userId=${selectedUserId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erreur suppression session');
      
      setPastSessions(pastSessions.filter(s => s.id !== selectedSession.id));
      enqueueSnackbar('Session supprimée', { variant: 'success' });
      setDeleteSessionDialogOpen(false);
      handleMenuClose();
    } catch {
      enqueueSnackbar('Erreur lors de la suppression', { variant: 'error' });
    }
  };

  const handleStartSession = async () => {
    if (!selectedUserId) return;
    try {
      const res = await fetch('/api/live-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          username: user?.username,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSession(data);
      setStartDialogOpen(false);
      setSessionOrders([]);
      enqueueSnackbar('Session Live démarrée !', { variant: 'success' });
    } catch {
      enqueueSnackbar('Erreur lors du démarrage de la session', { variant: 'error' });
    }
  };

  const handleEndSession = async () => {
    if (!selectedUserId || !session) return;
    try {
      const res = await fetch('/api/live-sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          userId: selectedUserId,
          isActive: false,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSession(null);
      setEndDialogOpen(false);
      enqueueSnackbar('Session Live terminée', { variant: 'success' });
      // Reload page data to refresh state
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la clôture de la session', { variant: 'error' });
    }
  };

  const handleResumeSession = async (sessionToResume: LiveSession) => {
    if (!selectedUserId) return;
    try {
      const res = await fetch('/api/live-sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionToResume.id,
          userId: selectedUserId,
          username: user?.username,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data);
      setSessionOrders([]);
      enqueueSnackbar('Session Live reprise', { variant: 'success' });
      fetchData();
    } catch {
      enqueueSnackbar('Erreur lors de la reprise de la session', { variant: 'error' });
    }
  };

  const handleAddOrder = async () => {
    if (!selectedUserId || !session) return;
    
    // Validate client
    let finalClientId = typeof selectedClient === 'object' && selectedClient ? selectedClient.id : undefined;
    let finalClientName = '';
    let finalClientAddress = typeof selectedClient === 'object' && selectedClient ? selectedClient.address : '';

    if (selectedClient) {
      finalClientName = typeof selectedClient === 'string' ? selectedClient : selectedClient.name;
    } else if (clientInputValue) {
      finalClientName = clientInputValue;
    }

    if (!finalClientName) {
      enqueueSnackbar('Veuillez sélectionner ou entrer un nom de client', { variant: 'warning' });
      return;
    }

    // Handle free solo input (string)
    if (!finalClientId) {
      // Check if client with this name already exists (case insensitive)
      const existingClient = clients.find(c => c.name.trim().toLowerCase() === finalClientName.trim().toLowerCase());
      
      if (existingClient) {
        finalClientId = existingClient.id;
        finalClientAddress = existingClient.address || '';
      } else {
        // We need to create the client first or handle it in the order creation
        // For simplicity and speed, let's create a "quick client" via API first
        try {
          const clientRes = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: selectedUserId,
              name: finalClientName,
              phone: '', // Optional for quick add
              address: '',
              facebookPseudo: '',
            }),
          });
          const clientData = await clientRes.json();
          if (!clientRes.ok) throw new Error(clientData.error || 'Erreur création client');
          finalClientId = clientData.id;
          
          // Refresh clients list silently
          fetch(`/api/clients?limit=1000&userId=${selectedUserId}`)
            .then(res => res.json())
            .then(data => setClients(data.clients || []));
            
        } catch {
          enqueueSnackbar('Erreur lors de la création du client rapide', { variant: 'error' });
          return;
        }
      }
    }
    
    // Validate items
    const validItems = orderItems.filter(i => i.productId && i.variantId && i.quantity > 0);
    if (validItems.length === 0) {
      enqueueSnackbar('Veuillez ajouter au moins un article', { variant: 'warning' });
      return;
    }
    const invalid = validItems.find((item) => !allowedVariantIds.has(item.variantId));
    if (invalid) {
      enqueueSnackbar('Produit non disponible', { variant: 'warning' });
      return;
    }
    const overQty = validItems.find((item) => {
      const available = allowedOutQuantities[item.variantId] ?? 0;
      return item.quantity > available;
    });
    if (overQty) {
      const available = allowedOutQuantities[overQty.variantId] ?? 0;
      enqueueSnackbar(`Quantité disponible insuffisante (${available})`, { variant: 'warning' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          clientId: finalClientId,
          items: validItems,
          isLiveOrder: true,
          liveSessionId: session.id,
          status: 'confirmed', // Live orders are usually confirmed immediately
          paymentMethod: null,
          deliveryPerson: '',
          notes: '',
          shippingAddress: finalClientAddress || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Add to local list and update session stats
      if (res.status === 200) {
        // Updated existing order (merged)
        setSessionOrders(sessionOrders.map(o => o.id === data.id ? data : o));
        setSession({
          ...session,
          totalRevenue: session.totalRevenue + currentOrderTotal
        });
      } else {
        // Created new order (201)
        setSessionOrders([data, ...sessionOrders]);
        setSession({
          ...session,
          totalOrders: session.totalOrders + 1,
          totalRevenue: session.totalRevenue + data.totalAmount
        });
      }

      setProducts(prevProducts => {
        const productMap = new Map(prevProducts.map(p => [p.id, { ...p }]));
        for (const item of validItems) {
          const product = productMap.get(item.productId);
          if (!product || !product.variants) continue;
          product.variants = product.variants.map(v => {
            if (v.id !== item.variantId) return v;
            const nextStock = Math.max(0, (v.stock || 0) - item.quantity);
            return { ...v, stock: nextStock };
          });
        }
        return Array.from(productMap.values());
      });

      setAllowedOutQuantities(prev => {
        const next = { ...prev };
        for (const item of validItems) {
          const current = Number(next[item.variantId] ?? 0);
          next[item.variantId] = Math.max(0, current - item.quantity);
        }
        return next;
      });

      // Reset form
      setSelectedClient(null);
      setClientInputValue(''); // Reset input value
      setOrderItems([{ productId: '', variantId: '', quantity: 1 }]);
      enqueueSnackbar('Commande ajoutée', { variant: 'success' });
    } catch {
      enqueueSnackbar('Erreur lors de l\'ajout de la commande', { variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addOrderItem = () => setOrderItems([...orderItems, { productId: '', variantId: '', quantity: 1 }]);
  const removeOrderItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));
  const updateOrderItem = (index: number, field: keyof OrderItemForm, value: string | number) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value } as OrderItemForm;
    if (field === 'productId') updated[index].variantId = '';
    setOrderItems(updated);
  };

  const allowedProductIds = useMemo(() => {
    return new Set(
      products
        .filter((p) => p.isActive && (p.variants || []).some((v) => allowedVariantIds.has(v.id)))
        .map((p) => p.id)
    );
  }, [products, allowedVariantIds]);

  const articleGroups = useMemo(() => {
    return products
      .filter((product) => allowedProductIds.has(product.id))
      .map((product) => ({
        product,
        variants: (product.variants || [])
          .filter((variant) => allowedVariantIds.has(variant.id))
          .sort((a, b) => `${a.size} ${a.color}`.localeCompare(`${b.size} ${b.color}`, 'fr', { numeric: true })),
      }))
      .filter((group) => group.variants.length > 0)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'));
  }, [products, allowedProductIds, allowedVariantIds]);

  const variantProductMap = useMemo(() => {
    const map: Record<string, string> = {};
    articleGroups.forEach((group) => {
      group.variants.forEach((variant) => {
        map[variant.id] = group.product.id;
      });
    });
    return map;
  }, [articleGroups]);

  const getProductVariants = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return (product?.variants || []).filter((variant) => allowedVariantIds.has(variant.id));
  };

  const currentOrderTotal = orderItems.reduce((sum, item) => {
    if (!item.variantId) return sum;
    const product = products.find(p => p.id === item.productId);
    const variant = product?.variants?.find(v => v.id === item.variantId);
    return sum + (variant ? variant.price * item.quantity : 0);
  }, 0);

  // Group orders by client
  const groupedOrders = useMemo(() => {
    const groups: Record<string, {
      key: string;
      clientNumber: number;
      clientName: string;
      clientFacebook?: string;
      orders: Order[];
      totalAmount: number;
      lastOrderTime: string;
      firstOrderTime: string;
      itemCount: number;
    }> = {};

    sessionOrders.forEach(order => {
      // Use client ID if available, otherwise name (for quick adds that might share name)
      // But actually, we want to group by PERSON.
      const key = order.clientId || order.clientName;
      
      if (!groups[key]) {
        groups[key] = {
          key,
          clientNumber: 0,
          clientName: order.clientName,
          clientFacebook: order.clientFacebook,
          orders: [],
          totalAmount: 0,
          lastOrderTime: order.createdAt,
          firstOrderTime: order.createdAt,
          itemCount: 0,
        };
      }
      
      groups[key].orders.push(order);
      groups[key].totalAmount += order.totalAmount;
      groups[key].itemCount += (order.items || []).reduce((sum, item) => sum + getRealItemQuantity(item.productId, item.quantity), 0);
      
      if (new Date(order.createdAt) > new Date(groups[key].lastOrderTime)) {
        groups[key].lastOrderTime = order.createdAt;
      }
      if (new Date(order.createdAt) < new Date(groups[key].firstOrderTime)) {
        groups[key].firstOrderTime = order.createdAt;
      }
    });

    const allGroups = Object.values(groups);
    const numbering = [...allGroups].sort((a, b) => {
      const timeDiff = new Date(a.firstOrderTime).getTime() - new Date(b.firstOrderTime).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.key.localeCompare(b.key);
    });
    const numberByKey = new Map(numbering.map((group, index) => [group.key, index + 1]));

    return allGroups
      .sort((a, b) => new Date(b.lastOrderTime).getTime() - new Date(a.lastOrderTime).getTime())
      .map((group) => ({
        ...group,
        clientNumber: numberByKey.get(group.key) ?? 0,
      }));
  }, [sessionOrders, getRealItemQuantity]);

  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Vente en Live" subtitle="Gestion des ventes en direct" />
        
        {loading ? (
          <LinearProgress />
        ) : !session ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, overflowY: 'auto' }}>
            <LiveTv sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h5" gutterBottom fontWeight={600}>Aucune session en cours</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
              Démarrez une nouvelle session pour commencer à vendre en direct.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrow />}
              onClick={() => setStartDialogOpen(true)}
              sx={{ px: 4, py: 1.5, borderRadius: 2 }}
            >
              Démarrer un Live
            </Button>

            {pastSessions.length > 0 && (
              <Box sx={{ mt: 8, width: '100%', maxWidth: 800 }}>
                <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryIcon color="action" /> Historique des Lives
                </Typography>
                <TableContainer component={Card} variant="outlined" sx={{ maxHeight: 450, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ 
                        bgcolor: 'action.hover',
                        '& th': { bgcolor: 'action.hover' } // Ensure header cells have background for sticky effect
                      }}>
                        <TableCell>Date</TableCell>
                        <TableCell>Titre</TableCell>
                        <TableCell align="center">Durée</TableCell>
                        <TableCell align="center">Commandes</TableCell>
                        <TableCell align="right">Chiffre d&apos;affaire</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pastSessions.slice(0, 10).map((session) => {
                        const start = new Date(session.startedAt);
                        const end = session.endedAt ? new Date(session.endedAt) : new Date();
                        const durationMs = end.getTime() - start.getTime();
                        const hours = Math.floor(durationMs / (1000 * 60 * 60));
                        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

                        return (
                          <TableRow key={session.id} hover>
                            <TableCell>{start.toLocaleDateString('fr-FR')}</TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{session.title}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              {hours}h {minutes}m
                            </TableCell>
                            <TableCell align="center">
                              <Chip label={session.totalOrders} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={700} color="primary">
                                {session.totalRevenue.toLocaleString('fr-FR')} Ar
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <IconButton size="small" onClick={(e) => handleMenuOpen(e, session)}>
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
            {/* Session Header Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%', bgcolor: 'primary.main', color: 'white' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>SESSION EN COURS</Typography>
                      <Typography variant="h5" fontWeight={700}>{session.title}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <Timer sx={{ fontSize: 16, opacity: 0.8 }} />
                        <Typography variant="body2">{elapsedTime}</Typography>
                      </Box>
                    </Box>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<Stop />}
                      onClick={() => setEndDialogOpen(true)}
                      sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                    >
                      Terminer
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 4, md: 2 }}>
                <StatCard
                  title="Commandes"
                  value={session.totalOrders}
                  icon={<ShoppingCart />}
                  color="#2E7D6F"
                  bgColor="#E8F5F1"
                />
              </Grid>
              <Grid size={{ xs: 4, md: 2 }}>
                <StatCard
                  title="Recettes"
                  value={`${session.totalRevenue.toLocaleString('fr-FR')} Ar`}
                  icon={<AttachMoney />}
                  color="#8B5CF6"
                  bgColor="#F3F0FF"
                />
              </Grid>
              <Grid size={{ xs: 4, md: 2 }}>
                <StatCard
                  title="Recette d'article"
                  value={totalItemsLive}
                  icon={<Receipt />}
                  color="#0EA5E9"
                  bgColor="#E0F2FE"
                />
              </Grid>
            </Grid>

            <Grid container spacing={3}>
              {/* Quick Order Form */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Add color="primary" /> Nouvelle Commande Rapide
                    </Typography>
                    <Divider sx={{ mb: 3 }} />

                    <Box component="form" noValidate autoComplete="off">
                      <Autocomplete
                        freeSolo
                        options={clientOptions}
                        getOptionLabel={(option) => typeof option === 'string' ? option : `${option.name} ${option.facebookPseudo ? `(${option.facebookPseudo})` : ''}`}
                        isOptionEqualToValue={(option, value) => typeof value !== 'string' && option.id === value.id}
                        value={selectedClient}
                        onChange={(_, val) => setSelectedClient(val as Client | string | null)}
                        inputValue={clientInputValue}
                        onInputChange={(_, newInputValue) => setClientInputValue(newInputValue)}
                        renderInput={(params) => <TextField {...params} label="Client" placeholder="Rechercher ou entrer un nom..." />}
                        sx={{ mb: 3 }}
                      />

                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>Articles</Typography>
                      {orderItems.map((item, index) => {
                        return (
                          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
                            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <FormControl fullWidth size="small">
                                <InputLabel>Article</InputLabel>
                                <Select
                                  value={item.variantId}
                                  label="Article"
                                  onChange={(e) => {
                                    const nextVariantId = e.target.value;
                                    const nextProductId = variantProductMap[nextVariantId] || '';
                                    const updated = [...orderItems];
                                    updated[index] = { ...updated[index], productId: nextProductId, variantId: nextVariantId };
                                    setOrderItems(updated);
                                  }}
                                  MenuProps={{ PaperProps: { style: { maxHeight: 420 } } }}
                                >
                                  {articleGroups.length === 0 && (
                                    <MenuItem disabled value="">
                                      Aucun article actif disponible
                                    </MenuItem>
                                  )}
                                  {articleGroups.flatMap((group) => [
                                    <ListSubheader key={`group-${group.product.id}`}>
                                      Catégorie : {group.product.name}
                                    </ListSubheader>,
                                    ...group.variants.map((variant) => (
                                      <MenuItem key={variant.id} value={variant.id}>
                                        {`${group.product.name} ${variant.size} ${variant.color}`.trim()} (stock: {allowedOutQuantities[variant.id] ?? 0})
                                      </MenuItem>
                                    )),
                                  ])}
                                </Select>
                              </FormControl>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField
                                  label="Qté"
                                  type="number"
                                  size="small"
                                  value={item.quantity}
                                  onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                  sx={{ width: 80 }}
                                />
                              </Box>
                            </Box>
                            {orderItems.length > 1 && (
                              <IconButton color="error" onClick={() => removeOrderItem(index)} sx={{ mt: 1 }}>
                                <Delete />
                              </IconButton>
                            )}
                          </Box>
                        );
                      })}

                      <Button startIcon={<Add />} onClick={addOrderItem} size="small" sx={{ mb: 3 }}>
                        Ajouter un article
                      </Button>

                      <Box sx={{ bgcolor: 'primary.50', p: 2, borderRadius: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1">Total Estimé</Typography>
                        <Typography variant="h6" fontWeight={700} color="primary">
                          {currentOrderTotal.toLocaleString('fr-FR')} MGA
                        </Typography>
                      </Box>

                      <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={handleAddOrder}
                        disabled={(!selectedClient && !clientInputValue) || currentOrderTotal === 0 || isSubmitting}
                        startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <CheckCircle />}
                      >
                        {isSubmitting ? 'Enregistrement...' : 'Valider la commande'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Recent Orders List */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Receipt color="secondary" /> Commandes de la session
                    </Typography>
                    <Divider sx={{ mb: 0 }} />
                    
                    <Box sx={{ flex: 1, overflow: 'auto', minHeight: 400 }}>
                      <TableContainer>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell width="8%">N°</TableCell>
                              <TableCell width="10%"></TableCell>
                              <TableCell>Client</TableCell>
                              <TableCell align="center">Articles Total</TableCell>
                              <TableCell align="right">Total Payé</TableCell>
                              <TableCell align="right">Dernier Ajout</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {groupedOrders.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                  <Typography color="text.secondary">Aucune commande pour le moment</Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              groupedOrders.map((group) => {
                                const isExpanded = expandedClient === group.key;
                                return (
                                  <Fragment key={group.key}>
                                    <TableRow 
                                      hover 
                                      onClick={() => setExpandedClient(isExpanded ? null : group.key)}
                                      sx={{ cursor: 'pointer', bgcolor: isExpanded ? 'action.hover' : 'inherit' }}
                                    >
                                      <TableCell>
                                        <Chip label={group.clientNumber} size="small" color="secondary" />
                                      </TableCell>
                                      <TableCell>
                                        <IconButton size="small">
                                          {isExpanded ? <ExpandLess /> : <ExpandMore />}
                                        </IconButton>
                                      </TableCell>
                                      <TableCell>
                                        <Typography variant="body2" fontWeight={700}>{group.clientName}</Typography>
                                        <Typography variant="caption" color="text.secondary">{group.clientFacebook}</Typography>
                                      </TableCell>
                                      <TableCell align="center">
                                        <Chip label={group.itemCount} size="small" color="primary" variant="outlined" />
                                      </TableCell>
                                      <TableCell align="right">
                                        <Typography variant="body2" fontWeight={700} color="primary">
                                          {group.totalAmount.toLocaleString('fr-FR')} Ar
                                        </Typography>
                                      </TableCell>
                                      <TableCell align="right">
                                        <Typography variant="caption" color="text.secondary">
                                          {new Date(group.lastOrderTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                    <TableRow>
                                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                          <Box sx={{ margin: 1 }}>
                                            <Typography variant="caption" gutterBottom component="div" fontWeight={600}>
                                              Détail des commandes
                                            </Typography>
                                            <Table size="small" aria-label="purchases">
                                              <TableHead>
                                                <TableRow>
                                                  <TableCell>Heure</TableCell>
                                                  <TableCell>Articles</TableCell>
                                                  <TableCell align="right">Montant</TableCell>
                                                  <TableCell align="center">Statut</TableCell>
                                                  <TableCell align="center">Actions</TableCell>
                                                </TableRow>
                                              </TableHead>
                                              <TableBody>
                                                {group.orders.map((order) => (
                                                  <TableRow key={order.id}>
                                                    <TableCell component="th" scope="row">
                                                      {new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                    </TableCell>
                                                    <TableCell>
                                                      {order.items?.map((i) => `${getRealItemQuantity(i.productId, i.quantity)}x ${i.productName}`).join(', ')}
                                                    </TableCell>
                                                    <TableCell align="right">{order.totalAmount.toLocaleString('fr-FR')} Ar</TableCell>
                                                    <TableCell align="center">
                                                      <StatusChip status={order.status} />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                                        <IconButton size="small" color="primary" onClick={() => handleOpenEditOrder(order)}>
                                                          <Edit fontSize="small" />
                                                        </IconButton>
                                                        <IconButton size="small" color="error" onClick={() => confirmDeleteOrder(order)}>
                                                          <Delete fontSize="small" />
                                                        </IconButton>
                                                      </Box>
                                                    </TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                          </Box>
                                        </Collapse>
                                      </TableCell>
                                    </TableRow>
                                  </Fragment>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Start Session Dialog */}
        <Dialog open={startDialogOpen} onClose={() => setStartDialogOpen(false)}>
          <DialogTitle>Démarrer une nouvelle session Live</DialogTitle>
          <DialogContent>
            <Typography>
              Le titre sera généré automatiquement pour aujourd&apos;hui.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStartDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleStartSession} variant="contained">Commencer</Button>
          </DialogActions>
        </Dialog>

        {/* End Session Dialog */}
        <Dialog open={endDialogOpen} onClose={() => setEndDialogOpen(false)}>
          <DialogTitle>Terminer la session Live ?</DialogTitle>
          <DialogContent>
            <Typography>
              Voulez-vous vraiment terminer cette session ? <br />
              Cela arrêtera le compteur et clôturera les statistiques de cette session.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEndDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleEndSession} variant="contained" color="error">Terminer le Live</Button>
          </DialogActions>
        </Dialog>

        {/* Delete Order Confirmation Dialog */}
        <Dialog open={deleteOrderOpen} onClose={() => setDeleteOrderOpen(false)}>
          <DialogTitle>Supprimer la commande ?</DialogTitle>
          <DialogContent>
            <Typography>
              Êtes-vous sûr de vouloir supprimer cette commande de <b>{orderToDelete?.clientName}</b> ? <br />
              Montant : <b>{orderToDelete?.totalAmount.toLocaleString('fr-FR')} Ar</b>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteOrderOpen(false)}>Annuler</Button>
            <Button onClick={handleDeleteOrder} variant="contained" color="error">Supprimer</Button>
          </DialogActions>
        </Dialog>

        {/* View Session Details Dialog */}
        <Dialog open={!!viewSessionDetails} onClose={() => setViewSessionDetails(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              Détails de la session : {viewSessionDetails?.title}
              <Typography variant="caption" display="block" color="text.secondary">
                {viewSessionDetails && new Date(viewSessionDetails.startedAt).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant="outlined" 
                startIcon={isExportingZip ? <CircularProgress size={20} /> : <Download />} 
                onClick={handleExportZip}
                disabled={isExportingZip || isExportingPdf || groupedViewOrders.length === 0}
              >
                {isExportingZip ? 'Génération ZIP...' : 'ZIP (Images)'}
              </Button>
              <Button 
                variant="contained" 
                startIcon={isExportingPdf ? <CircularProgress size={20} color="inherit" /> : <PictureAsPdf />} 
                onClick={handleExportPdf}
                disabled={isExportingZip || isExportingPdf || groupedViewOrders.length === 0}
              >
                {isExportingPdf ? 'Génération PDF...' : 'PDF (A4)'}
              </Button>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            {viewSessionLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {groupedViewOrders.length === 0 ? (
                  <Typography align="center" color="text.secondary" sx={{ py: 4 }}>Aucune commande dans cette session</Typography>
                ) : (
                  groupedViewOrders.map((group) => (
                    <Card key={group.key} variant="outlined" sx={{ mb: 2 }}>
                      <Box 
                        ref={(el: HTMLDivElement | null) => { receiptRefs.current[group.key] = el; }} 
                        sx={{
                          p: 3,
                          bgcolor: receiptTemplate === 'pink-invoice' ? '#FFF8FC' : 'background.paper',
                          background: receiptTemplate === 'pink-invoice'
                            ? `radial-gradient(circle at top left, ${receiptAccent}22 0%, ${receiptAccent}12 35%, #FFFFFF 70%)`
                            : undefined,
                          width: (isExportingZip || isExportingPdf) ? '340px' : 'auto',
                          minHeight: (isExportingZip || isExportingPdf) ? '491px' : 'auto',
                          margin: '0 auto',
                          border: receiptTemplate === 'pink-invoice' ? '1px solid' : 'none',
                          borderColor: receiptTemplate === 'pink-invoice' ? `${receiptAccent}55` : 'transparent',
                          borderRadius: receiptTemplate === 'pink-invoice' ? 1.5 : 0,
                        }}
                      >
                        {/* Company Header */}
                        <Box sx={{ textAlign: 'center', mb: 2, bgcolor: receiptStyle.headerBg, color: receiptStyle.headerText, borderRadius: 1, py: 1 }}>
                          <Typography variant="h5" fontWeight={800} sx={{ textTransform: 'uppercase', letterSpacing: 1, color: receiptStyle.headerText }}>
                            {companyName}
                          </Typography>
                          <Typography variant="body2" sx={{ color: receiptStyle.headerText, opacity: 0.92 }}>
                            Live du {viewSessionDetails && new Date(viewSessionDetails.startedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </Typography>
                        </Box>

                        {/* Client Info */}
                        <Box sx={{ mb: 2 }}>
                          {(receiptTemplate === 'delivery-sheet' || receiptTemplate === 'pink-invoice') ? (
                            <Typography variant="subtitle1" fontWeight={700}>
                              Client: {group.clientName}
                            </Typography>
                          ) : (
                          <Typography variant="subtitle1" fontWeight={700}>
                            Client N°{group.clientNumber}: {group.clientName}
                          </Typography>
                          )}
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
                          {(receiptTemplate === 'delivery-sheet' || receiptTemplate === 'pink-invoice') && (
                            <>
                              <Typography variant="body2" color="text.secondary">
                                Mode de paiement: {Array.from(new Set(group.orders.map((o) => o.paymentMethod).filter(Boolean))).map((method) => {
                                  if (method === 'mvola') return 'MVola';
                                  if (method === 'orange_money') return 'Orange Money';
                                  if (method === 'airtel_money') return 'Airtel Money';
                                  if (method === 'espece') return 'Espèce';
                                  return String(method);
                                }).join(', ') || '-'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Livreur: {Array.from(new Set(group.orders.map((o) => o.deliveryPerson).filter((value) => Boolean(value && value.trim())))).join(', ') || '-'}
                              </Typography>
                            </>
                          )}
                        </Box>

                        {/* Order Table */}
                        <TableContainer component={Box} sx={{ border: 1, borderColor: receiptStyle.borderColor, borderRadius: 1, mb: 2 }}>
                          <Table size="small" sx={{ tableLayout: 'fixed' }}>
                            <TableHead>
                              <TableRow sx={{ bgcolor: receiptStyle.tableHeaderBg }}>
                                <TableCell sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', fontSize: '0.7rem', p: 0.5 }}>Articles</TableCell>
                                <TableCell align="center" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '30px', fontSize: '0.7rem', p: 0.5 }}>Qté</TableCell>
                                <TableCell align="right" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '65px', fontSize: '0.7rem', p: 0.5 }}>P.U</TableCell>
                                <TableCell align="right" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '75px', fontSize: '0.7rem', p: 0.5 }}>Total</TableCell>
                                {!(isExportingZip || isExportingPdf) && (
                                  <TableCell align="center" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '60px', fontSize: '0.7rem', p: 0.5 }}>Actions</TableCell>
                                )}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {group.orders.map((order) => (
                                <Fragment key={order.id}>
                                  {order.items?.map((item, idx) => (
                                    <TableRow key={item.id} sx={{ bgcolor: idx % 2 === 0 ? 'background.paper' : receiptStyle.rowAltBg }}>
                                      <TableCell sx={{ borderRight: 1, borderColor: receiptStyle.borderColor, fontSize: '0.7rem', p: 0.5, wordBreak: 'break-word' }}>
                                        <Box sx={{ display: 'block', lineHeight: 1.2 }}>
                                          {item.productName} <span style={{opacity: 0.7, fontSize: '0.65rem'}}>({item.variantSize} {item.variantColor})</span>
                                        </Box>
                                      </TableCell>
                                      <TableCell align="center" sx={{ borderRight: 1, borderColor: receiptStyle.borderColor, fontWeight: 'bold', fontSize: '0.75rem', p: 0.5 }}>
                                        {item.quantity}
                                      </TableCell>
                                      <TableCell align="right" sx={{ borderRight: 1, borderColor: receiptStyle.borderColor, fontSize: '0.7rem', p: 0.5, whiteSpace: 'nowrap' }}>
                                        {item.unitPrice.toLocaleString('fr-FR')}
                                      </TableCell>
                                      <TableCell align="right" sx={{ borderRight: !(isExportingZip || isExportingPdf) ? 1 : 0, borderColor: receiptStyle.borderColor, fontSize: '0.7rem', p: 0.5, whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                        {(item.unitPrice * item.quantity).toLocaleString('fr-FR')}
                                      </TableCell>
                                      {!(isExportingZip || isExportingPdf) && (
                                        <TableCell align="center" sx={{ p: 0 }}>
                                          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                            <IconButton size="small" color="primary" onClick={() => handleOpenEditOrder(order)} sx={{ p: 0.5 }}>
                                              <Edit sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                            <IconButton size="small" color="error" onClick={() => confirmDeleteOrder(order)} sx={{ p: 0.5 }}>
                                              <Delete sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                          </Box>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>

                        {/* Total Footer */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderTop: 2, borderColor: receiptStyle.totalColor, pt: 1 }}>
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
                            <Typography variant="h5" fontWeight={800} sx={{ color: receiptStyle.totalColor }}>
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
                  ))
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setViewSessionDetails(null)}>Fermer</Button>
          </DialogActions>
        </Dialog>

        {/* Edit Order Dialog */}
        <Dialog open={editOrderOpen} onClose={() => setEditOrderOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Modifier la commande de {editingOrder?.clientName}</DialogTitle>
          <DialogContent dividers>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Articles</Typography>
            {editOrderItems.map((item, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Produit</InputLabel>
                    <Select
                      value={item.productId}
                      label="Produit"
                      onChange={(e) => {
                        const updated = [...editOrderItems];
                        updated[index] = { ...updated[index], productId: e.target.value, variantId: '' };
                        setEditOrderItems(updated);
                      }}
                    >
                      {products.filter(p => p.isActive).map(p => (
                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Variante</InputLabel>
                      <Select
                        value={item.variantId}
                        label="Variante"
                        onChange={(e) => {
                          const updated = [...editOrderItems];
                          updated[index] = { ...updated[index], variantId: e.target.value };
                          setEditOrderItems(updated);
                        }}
                        disabled={!item.productId}
                      >
                        {getProductVariants(item.productId).map(v => (
                          <MenuItem key={v.id} value={v.id}>
                            {v.size} {v.color} ({v.stock})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Qté"
                      type="number"
                      size="small"
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...editOrderItems];
                        updated[index] = { ...updated[index], quantity: parseInt(e.target.value) || 1 };
                        setEditOrderItems(updated);
                      }}
                      sx={{ width: 80 }}
                    />
                  </Box>
                </Box>
                {editOrderItems.length > 1 && (
                  <IconButton color="error" onClick={() => setEditOrderItems(editOrderItems.filter((_, i) => i !== index))} sx={{ mt: 1 }}>
                    <Delete fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
            <Button 
              startIcon={<Add />} 
              onClick={() => setEditOrderItems([...editOrderItems, { productId: '', variantId: '', quantity: 1 }])} 
              size="small"
            >
              Ajouter un article
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOrderOpen(false)}>Annuler</Button>
            <Button 
              onClick={handleUpdateOrder} 
              variant="contained" 
              disabled={isUpdatingOrder}
              startIcon={isUpdatingOrder && <CircularProgress size={20} color="inherit" />}
            >
              {isUpdatingOrder ? 'Mise à jour...' : 'Enregistrer les modifications'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* History Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => { handleViewSession(selectedSession!); handleMenuClose(); }}>
            <Receipt sx={{ mr: 1, fontSize: 20 }} /> Détails
          </MenuItem>
          <MenuItem onClick={() => { handleResumeSession(selectedSession!); handleMenuClose(); }}>
            <PlayArrow sx={{ mr: 1, fontSize: 20 }} /> Continuer ce Live
          </MenuItem>
          <MenuItem onClick={() => { setDeleteSessionDialogOpen(true); handleMenuClose(); }} sx={{ color: 'error.main' }}>
            <Delete sx={{ mr: 1, fontSize: 20 }} /> Supprimer
          </MenuItem>
        </Menu>

        {/* Delete Session Confirmation */}
        <Dialog open={deleteSessionDialogOpen} onClose={() => setDeleteSessionDialogOpen(false)}>
          <DialogTitle>Supprimer la session ?</DialogTitle>
          <DialogContent>
            <Typography>
              Êtes-vous sûr de vouloir supprimer la session <b>{selectedSession?.title}</b> ? <br />
              Cette action est irréversible.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteSessionDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleDeleteSession} variant="contained" color="error">Supprimer</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
