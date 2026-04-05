'use client';

import StatCard from '@/components/common/StatCard';
import StatusChip from '@/components/common/StatusChip';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useDebounce } from '@/hooks/useDebounce';
import type { Client, Order, OrderStatus, Product, ProductVariant, PaymentMethod } from '@/types';
import {
    Add,
    CalendarMonth,
    CheckCircle,
    Close,
    Delete,
    Download,
    Edit,
    EventBusy,
    FilterList,
    HourglassEmpty,
    Image as ImageIcon,
    LocalShipping,
    PictureAsPdf,
    Print,
    Receipt,
    Schedule,
    Search,
    ShoppingCart,
    Today,
    Visibility,
} from '@mui/icons-material';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card, CardContent,
    Chip,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel, LinearProgress,
    ListSubheader,
    Menu,
    MenuItem, Select,
    Step,
    StepLabel,
    Stepper,
    Tab,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TablePagination,
    TableRow,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { memo, useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ReceiptTemplate } from '@/stores/themeStore';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

interface OrderItemForm {
  productId: string;
  variantId: string;
  quantity: number;
}

interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  pendingRevenue: number;
  confirmedOrders: number;
  deliveredOrders: number;
  deliveredRevenue: number;
  cancelledOrders: number;
  todayOrders: number;
  todayRevenue: number;
  todayDeliveries: number;
  upcomingDeliveries: number;
  overdueDeliveries: number;
  totalProductsSold: number;
}

interface DeliveryLocationItem {
  id: string;
  placeName: string;
  deliveryPerson: string;
}

const STATUS_STEPS: OrderStatus[] = ['pending', 'confirmed', 'shipping', 'delivered', 'paid'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  shipping: 'En cours de livraison',
  delivered: 'Livrée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  airtel_money: 'Airtel Money',
  mvola: 'MVola',
  orange_money: 'Orange Money',
  espece: 'Espèce',
};

interface OrderRowModel {
  order: Order;
  isOverdue: boolean;
  isToday: boolean;
  deliveryLabel: string | null;
  createdDate: string;
  createdTime: string;
  itemsPreview: string[];
  extraItemsCount: number;
}

interface OrderRowProps {
  row: OrderRowModel;
  onView: (order: Order) => void;
  onPrint: (order: Order) => void;
  onExport: (order: Order) => void;
  onExportImage: (order: Order) => void;
  onDelete: (order: Order) => void;
  onQuickConfirm: (order: Order) => void;
  onQuickDeliverToday: (order: Order) => void;
}

const OrderRow = memo(function OrderRow({ row, onView, onPrint, onExport, onExportImage, onDelete, onQuickConfirm, onQuickDeliverToday }: OrderRowProps) {
  const { order, isOverdue, isToday, deliveryLabel, createdDate, createdTime, itemsPreview, extraItemsCount } = row;
  const canConfirm = order.status === 'pending';
  const canDeliverToday = order.status !== 'delivered' && order.status !== 'cancelled';
  return (
    <TableRow key={order.id} hover sx={{ cursor: 'pointer', ...(isOverdue ? { bgcolor: 'error.50' } : {}) }} onClick={() => onView(order)}>
      <TableCell>
        <Typography variant="body2" fontWeight={700} color="primary" fontFamily="monospace">
          {order.orderNumber || order.id.slice(0, 8)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{order.clientName}</Typography>
        <Typography variant="caption" color="text.secondary">{order.clientFacebook}</Typography>
      </TableCell>
      <TableCell>
        {itemsPreview.map((label, i) => (
          <Typography key={i} variant="caption" display="block">
            {label}
          </Typography>
        ))}
        {extraItemsCount > 0 && (
          <Typography variant="caption" color="primary" fontWeight={600}>
            +{extraItemsCount} autre(s)
          </Typography>
        )}
      </TableCell>
      <TableCell align="center"><StatusChip status={order.status} /></TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight={700}>
          {order.totalAmount.toLocaleString('fr-FR')} MGA
        </Typography>
      </TableCell>
      <TableCell align="center">
        {deliveryLabel ? (
          <Chip
            icon={isOverdue ? <EventBusy sx={{ fontSize: 16 }} /> : isToday ? <Today sx={{ fontSize: 16 }} /> : <Schedule sx={{ fontSize: 16 }} />}
            label={deliveryLabel}
            size="small"
            color={isOverdue ? 'error' : isToday ? 'success' : 'default'}
            variant={isOverdue || isToday ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
          />
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="caption">
          {createdDate}
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          {createdTime}
        </Typography>
      </TableCell>
      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
          <Tooltip title="Confirmer">
            <span>
              <IconButton size="small" color="success" disabled={!canConfirm} onClick={() => onQuickConfirm(order)}>
                <CheckCircle fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Livrer aujourd'hui">
            <span>
              <IconButton size="small" color="warning" disabled={!canDeliverToday} onClick={() => onQuickDeliverToday(order)}>
                <LocalShipping fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Voir détails">
            <IconButton size="small" onClick={() => onView(order)}>
              <Visibility fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Imprimer reçu">
            <IconButton size="small" color="primary" onClick={() => onPrint(order)}>
              <Print fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Télécharger PDF">
            <IconButton size="small" color="secondary" onClick={() => onExport(order)}>
              <PictureAsPdf fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Image JPEG">
            <IconButton size="small" color="info" onClick={() => onExportImage(order)}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Supprimer">
            <IconButton size="small" color="error" onClick={() => onDelete(order)}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </TableCell>
    </TableRow>
  );
});

const DELIVERY_FEE = 4000;

const RECEIPT_TEMPLATE_STYLES: Record<ReceiptTemplate, {
  headerBg: string;
  headerText: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  borderColor: string;
  rowAltBg: string;
  totalColor: string;
  sheetBg: string;
}> = {
  'blue-grid': {
    headerBg: '#0B4F9C',
    headerText: '#FFFFFF',
    tableHeaderBg: '#2980B9',
    tableHeaderText: '#FFFFFF',
    borderColor: '#94A3B8',
    rowAltBg: '#F1F5F9',
    totalColor: '#0B4F9C',
    sheetBg: '#FFFFFF',
  },
  'clean-light': {
    headerBg: '#F8FAFC',
    headerText: '#0F172A',
    tableHeaderBg: '#E2E8F0',
    tableHeaderText: '#1E293B',
    borderColor: '#CBD5E1',
    rowAltBg: '#F8FAFC',
    totalColor: '#4F46E5',
    sheetBg: '#FFFFFF',
  },
  'emerald-pro': {
    headerBg: '#065F46',
    headerText: '#ECFDF5',
    tableHeaderBg: '#10B981',
    tableHeaderText: '#ECFDF5',
    borderColor: '#6EE7B7',
    rowAltBg: '#ECFDF5',
    totalColor: '#047857',
    sheetBg: '#FFFFFF',
  },
  'mono-dark': {
    headerBg: '#111827',
    headerText: '#F9FAFB',
    tableHeaderBg: '#1F2937',
    tableHeaderText: '#F9FAFB',
    borderColor: '#4B5563',
    rowAltBg: '#F3F4F6',
    totalColor: '#111827',
    sheetBg: '#FFFFFF',
  },
  'delivery-sheet': {
    headerBg: '#0B4F9C',
    headerText: '#FFFFFF',
    tableHeaderBg: '#1B9AD7',
    tableHeaderText: '#FFFFFF',
    borderColor: '#94A3B8',
    rowAltBg: '#F8FAFC',
    totalColor: '#0B4F9C',
    sheetBg: '#FFFFFF',
  },
  'pink-invoice': {
    headerBg: '#D979A8',
    headerText: '#FFFFFF',
    tableHeaderBg: '#D979A8',
    tableHeaderText: '#FFFFFF',
    borderColor: '#E9B6CC',
    rowAltBg: '#FFF0F7',
    totalColor: '#C06091',
    sheetBg: '#FFF8FC',
  },
};

export default function OrdersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const receiptRef = useRef<HTMLDivElement>(null);
  const exportReceiptRef = useRef<HTMLDivElement>(null);
  const mergeLiveDoneRef = useRef(false);
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderToExport, setOrderToExport] = useState<Order | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deliveryDateFrom, setDeliveryDateFrom] = useState('');
  const [deliveryDateTo, setDeliveryDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deliveryLocationsOpen, setDeliveryLocationsOpen] = useState(false);
  const [deliveryLocations, setDeliveryLocations] = useState<DeliveryLocationItem[]>([]);
  const [deliveryPlaceName, setDeliveryPlaceName] = useState('');
  const [deliveryPersonName, setDeliveryPersonName] = useState('');
  const [deliveryLocationsLoading, setDeliveryLocationsLoading] = useState(false);

  // Create order state
  const [createOpen, setCreateOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ productId: '', variantId: '', quantity: 1 }]);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('pending');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [deliveryPerson, setDeliveryPerson] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [orderDeliveryDate, setOrderDeliveryDate] = useState('');
  const [allowedVariantIds, setAllowedVariantIds] = useState<Set<string>>(new Set());
  const [allowedOutQuantities, setAllowedOutQuantities] = useState<Record<string, number>>({});

  // View/Edit state
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<OrderStatus>('pending');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod | null>(null);
  const [editPaymentReference, setEditPaymentReference] = useState('');
  const [editDeliveryPerson, setEditDeliveryPerson] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editOrderItems, setEditOrderItems] = useState<OrderItemForm[]>([]);
  const [viewTab, setViewTab] = useState<'details' | 'actions'>('details');
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'confirm' | 'shipping' | 'deliver' | 'pay' | 'cancel' | null>(null);
  const [actionPaymentMethod, setActionPaymentMethod] = useState<PaymentMethod | ''>('');
  const [actionPaymentReference, setActionPaymentReference] = useState('');

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      if (!selectedUserId) return;
      startDataLoading();
      const params = new URLSearchParams({
        stats: 'true',
        userId: selectedUserId,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setStats(data);
      setDataError(null);
    } catch (error) {
      setDataError(getErrorMessage(error, 'Erreur chargement stats'));
    } finally {
      endDataLoading();
    }
  }, [selectedUserId, dateFrom, dateTo, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  const fetchDeliveryLocations = useCallback(async () => {
    if (!selectedUserId) return;
    setDeliveryLocationsLoading(true);
    try {
      const res = await fetch(`/api/settings?type=deliveryLocations&userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setDeliveryLocations(Array.isArray(data.locations) ? data.locations : []);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error, 'Erreur chargement lieux de livraison'), { variant: 'error' });
    } finally {
      setDeliveryLocationsLoading(false);
    }
  }, [selectedUserId, enqueueSnackbar, getErrorMessage]);

  const openDeliveryLocations = async () => {
    setDeliveryLocationsOpen(true);
    await fetchDeliveryLocations();
  };

  const handleAddDeliveryLocation = async () => {
    if (!selectedUserId) return;
    if (!deliveryPlaceName.trim()) {
      enqueueSnackbar('Lieu de livraison requis', { variant: 'warning' });
      return;
    }
    if (!deliveryPersonName.trim()) {
      enqueueSnackbar('Livreur requis', { variant: 'warning' });
      return;
    }
    setDeliveryLocationsLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addDeliveryLocation',
          userId: selectedUserId,
          placeName: deliveryPlaceName.trim(),
          deliveryPerson: deliveryPersonName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setDeliveryLocations(Array.isArray(data.locations) ? data.locations : []);
      setDeliveryPlaceName('');
      setDeliveryPersonName('');
      enqueueSnackbar('Lieu de livraison enregistré', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error, 'Erreur enregistrement lieu de livraison'), { variant: 'error' });
    } finally {
      setDeliveryLocationsLoading(false);
    }
  };

  const fetchOrders = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    startDataLoading();
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        status: filterStatus,
        dateFrom,
        dateTo,
        deliveryDateFrom,
        deliveryDateTo,
        page: String(page + 1),
        limit: String(rowsPerPage),
        userId: selectedUserId,
      });
      if (filterType !== 'all') {
        params.set('type', filterType);
      }
      if (!mergeLiveDoneRef.current) {
        params.append('mergeLive', 'true');
      }
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      mergeLiveDoneRef.current = true;
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement', { variant: 'error' });
      setDataError(getErrorMessage(error, 'Erreur chargement commandes'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [debouncedSearch, filterStatus, filterType, dateFrom, dateTo, deliveryDateFrom, deliveryDateTo, page, rowsPerPage, enqueueSnackbar, selectedUserId, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => { fetchOrders(); fetchStats(); }, [fetchOrders, fetchStats]);

  const fetchFormData = async () => {
    try {
      if (!selectedUserId) return;
      startDataLoading();
      const [clientsRes, productsRes, deliveryLocationsRes] = await Promise.all([
        fetch(`/api/clients?limit=1000&userId=${selectedUserId}`),
        fetch(`/api/products?limit=1000&userId=${selectedUserId}`),
        fetch(`/api/settings?type=deliveryLocations&userId=${selectedUserId}`),
      ]);
      const clientsData = await clientsRes.json();
      const productsData = await productsRes.json();
      const deliveryLocationsData = await deliveryLocationsRes.json();
      if (!clientsRes.ok || !productsRes.ok || !deliveryLocationsRes.ok) {
        throw new Error(clientsData?.error || productsData?.error || deliveryLocationsData?.error || 'Erreur serveur');
      }
      setClients(Array.isArray(clientsData.clients) ? clientsData.clients : []);
      const productList = Array.isArray(productsData.products) ? productsData.products : [];
      setProducts(productList);
      setDeliveryLocations(Array.isArray(deliveryLocationsData.locations) ? deliveryLocationsData.locations : []);
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
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement des données', { variant: 'error' });
      setDataError(getErrorMessage(error, 'Erreur chargement données'));
    } finally {
      endDataLoading();
    }
  };

  const openCreate = async () => {
    await fetchFormData();
    setSelectedClient(null);
    setOrderItems([{ productId: '', variantId: '', quantity: 1 }]);
    setOrderNotes('');
    setOrderStatus('pending');
    setPaymentMethod('');
    setDeliveryPerson('');
    setShippingAddress('');
    setOrderDeliveryDate('');
    setCreateOpen(true);
  };

  const getLinkedDeliveryPerson = useCallback((address: string) => {
    const normalizedAddress = address.trim().toLowerCase();
    if (!normalizedAddress) return '';
    const match = deliveryLocations.find(
      (location) => location.placeName.trim().toLowerCase() === normalizedAddress
    );
    return match?.deliveryPerson || '';
  }, [deliveryLocations]);

  useEffect(() => {
    if (!createOpen && !viewOpen) {
      setClients([]);
      setProducts([]);
    }
  }, [createOpen, viewOpen]);

  const todayDateString = useMemo(() => new Date().toDateString(), []);
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

  const orderRows = useMemo<OrderRowModel[]>(() => {
    return orders.map((order) => {
      const deliveryDate = order.deliveryDate ? new Date(order.deliveryDate) : null;
      const isOverdue = !!deliveryDate && deliveryDate < new Date(new Date().toDateString()) && order.status !== 'delivered' && order.status !== 'cancelled';
      const isToday = !!deliveryDate && deliveryDate.toDateString() === todayDateString && order.status !== 'delivered' && order.status !== 'cancelled';
      const created = new Date(order.createdAt);
      const itemsPreview = (order.items || []).slice(0, 2).map(item => `${item.productName} (${item.variantSize} ${item.variantColor}) ×${item.quantity}`);
      const extraItemsCount = Math.max(0, (order.items?.length || 0) - 2);
      const totalAmount = typeof order.totalAmount === 'number' ? order.totalAmount : Number(order.totalAmount || 0);
      const normalizedOrder = { ...order, totalAmount };
      return {
        order: normalizedOrder,
        isOverdue,
        isToday,
        deliveryLabel: deliveryDate ? deliveryDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : null,
        createdDate: created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
        createdTime: created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        itemsPreview,
        extraItemsCount,
      };
    });
  }, [orders, todayDateString]);

  const handleCreateOrder = async () => {
    if (!selectedClient) { enqueueSnackbar('Sélectionnez un client', { variant: 'warning' }); return; }
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    const validItems = orderItems.filter(i => i.productId && i.variantId && i.quantity > 0);
    if (validItems.length === 0) { enqueueSnackbar('Ajoutez au moins un article', { variant: 'warning' }); return; }
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

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: (() => {
          const finalAddress = shippingAddress || selectedClient.address;
          const linkedDeliveryPerson = getLinkedDeliveryPerson(finalAddress);
          return JSON.stringify({
            userId: selectedUserId,
            username: user?.username,
            clientId: selectedClient.id,
            status: orderStatus,
            paymentMethod: paymentMethod || null,
            deliveryPerson: linkedDeliveryPerson || deliveryPerson || '',
            isLiveOrder: false,
            notes: orderNotes,
            shippingAddress: finalAddress,
            deliveryDate: orderDeliveryDate,
            items: validItems,
          });
        })(),
      });
      if (res.ok) {
        const data = await res.json();
        enqueueSnackbar(`Commande ${data.orderNumber || ''} créée avec succès`, { variant: 'success' });
        setCreateOpen(false);
        fetchOrders();
        fetchStats();
      } else {
        const data = await res.json();
        enqueueSnackbar(data.error || 'Erreur', { variant: 'error' });
      }
    } catch { enqueueSnackbar('Erreur lors de la création', { variant: 'error' }); }
  };

  const openViewOrder = async (order: Order) => {
    await fetchFormData();
    setViewOrder(order);
    setEditStatus(order.status);
    setEditPaymentMethod(order.paymentMethod);
    setEditPaymentReference(order.paymentReference || '');
    setEditDeliveryPerson(order.deliveryPerson || '');
    setEditNotes(order.notes || '');
    setEditAddress(order.shippingAddress || '');
    setEditDeliveryDate(order.deliveryDate || '');
    setViewTab('details');
    setActionPaymentMethod(order.paymentMethod || '');
    setActionPaymentReference(order.paymentReference || '');
    
    // Initialize edit items from existing order items
    if (order.items) {
      setEditOrderItems(order.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity
      })));
    } else {
      setEditOrderItems([]);
    }
    
    setIsEditing(false);
    setViewOpen(true);
  };

  const addEditOrderItem = () => setEditOrderItems([...editOrderItems, { productId: '', variantId: '', quantity: 1 }]);
  const removeEditOrderItem = (index: number) => setEditOrderItems(editOrderItems.filter((_, i) => i !== index));
  const updateEditOrderItem = (index: number, field: keyof OrderItemForm, value: string | number) => {
    const updated = [...editOrderItems];
    updated[index] = { ...updated[index], [field]: value } as OrderItemForm;
    if (field === 'productId') updated[index].variantId = '';
    setEditOrderItems(updated);
  };

  const editOrderTotal = editOrderItems.reduce((sum, item) => {
    if (!item.variantId) return sum;
    // Find product in products list to get price
    // Note: This assumes products are loaded. If products list is empty, price will be 0
    // In a real app, we might need to fetch product details or use existing order item price if product not found
    const product = products.find(p => p.id === item.productId);
    const variant = product?.variants?.find(v => v.id === item.variantId);
    
    // Fallback to existing item price if product/variant not found in current products list (e.g. if archived)
    if (!variant && viewOrder?.items) {
       const existingItem = viewOrder.items.find(i => i.productId === item.productId && i.variantId === item.variantId);
       if (existingItem) return sum + (existingItem.unitPrice * item.quantity);
    }
    
    return sum + (variant ? variant.price * item.quantity : 0);
  }, 0);

  const handleUpdateOrder = async () => {
    if (!viewOrder) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    const validItems = editOrderItems.filter(i => i.productId && i.variantId && i.quantity > 0);
    if (validItems.length === 0 && editOrderItems.length > 0) {
      enqueueSnackbar('Ajoutez au moins un article', { variant: 'warning' });
      return;
    }
    const existingQtyMap = new Map<string, number>();
    (viewOrder.items || []).forEach((item) => {
      existingQtyMap.set(item.variantId, item.quantity);
    });
    const invalid = validItems.find((item) => {
      if (allowedVariantIds.has(item.variantId)) return false;
      return !existingQtyMap.has(item.variantId);
    });
    if (invalid) {
      enqueueSnackbar('Produit non disponible', { variant: 'warning' });
      return;
    }
    const overQty = validItems.find((item) => {
      const available = allowedOutQuantities[item.variantId] ?? 0;
      const previous = existingQtyMap.get(item.variantId) ?? 0;
      return item.quantity > available + previous;
    });
    if (overQty) {
      const available = allowedOutQuantities[overQty.variantId] ?? 0;
      const previous = existingQtyMap.get(overQty.variantId) ?? 0;
      enqueueSnackbar(`Quantité disponible insuffisante (${available + previous})`, { variant: 'warning' });
      return;
    }
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewOrder.id,
          userId: selectedUserId,
          username: user?.username,
          status: editStatus,
          paymentMethod: editPaymentMethod,
          paymentReference: editPaymentReference,
          deliveryPerson: editDeliveryPerson,
          notes: editNotes,
          shippingAddress: editAddress,
          deliveryDate: editDeliveryDate,
          items: editOrderItems,
        }),
      });
      if (res.ok) {
        enqueueSnackbar('Commande mise à jour', { variant: 'success' });
        setViewOpen(false);
        setIsEditing(false);
        fetchOrders();
        fetchStats();
      }
    } catch { enqueueSnackbar('Erreur', { variant: 'error' }); }
  };

  const openActionDialog = (type: 'confirm' | 'shipping' | 'deliver' | 'pay' | 'cancel') => {
    setActionType(type);
    if (type === 'pay') {
      setActionPaymentMethod(viewOrder?.paymentMethod || '');
      setActionPaymentReference(viewOrder?.paymentReference || '');
    }
    setActionDialogOpen(true);
  };

  const closeActionDialog = () => {
    setActionDialogOpen(false);
  };

  const handleConfirmAction = async () => {
    if (!viewOrder) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    if (actionType === 'pay' && (!actionPaymentReference.trim() || !actionPaymentMethod)) {
      setExportError('Veuillez saisir la référence et le mode de paiement');
      return;
    }
    const nextStatus: OrderStatus | null =
      actionType === 'confirm' ? 'confirmed' :
      actionType === 'shipping' ? 'shipping' :
      actionType === 'deliver' ? 'delivered' :
      actionType === 'pay' ? 'paid' :
      actionType === 'cancel' ? 'cancelled' : null;
    if (!nextStatus) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: viewOrder.id,
          userId: selectedUserId,
          username: user?.username,
          status: nextStatus,
          paymentMethod: actionType === 'pay' ? actionPaymentMethod : viewOrder.paymentMethod,
          paymentReference: actionType === 'pay' ? actionPaymentReference.trim() : viewOrder.paymentReference,
          deliveryPerson: viewOrder.deliveryPerson || '',
          notes: viewOrder.notes || '',
          shippingAddress: viewOrder.shippingAddress || '',
          deliveryDate: viewOrder.deliveryDate || '',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Mise à jour effectuée', { variant: 'success' });
      setActionDialogOpen(false);
      fetchOrders();
      fetchStats();
      setViewOpen(false);
    } catch {
      enqueueSnackbar('Erreur', { variant: 'error' });
    }
  };

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleQuickUpdate = async (order: Order, nextStatus: OrderStatus, forceTodayDelivery?: boolean) => {
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          userId: selectedUserId,
          username: user?.username,
          status: nextStatus,
          paymentMethod: order.paymentMethod || null,
          paymentReference: order.paymentReference || '',
          deliveryPerson: order.deliveryPerson || '',
          notes: order.notes || '',
          shippingAddress: order.shippingAddress || '',
          deliveryDate: forceTodayDelivery ? getTodayString() : order.deliveryDate || '',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        enqueueSnackbar(data?.error || 'Erreur', { variant: 'error' });
        return;
      }
      enqueueSnackbar('Mise à jour effectuée', { variant: 'success' });
      fetchOrders();
      fetchStats();
    } catch {
      enqueueSnackbar('Erreur', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!orderToDelete) return;
    if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
    try {
      const res = await fetch(`/api/orders?id=${orderToDelete.id}&userId=${selectedUserId}&username=${encodeURIComponent(user?.username || '')}`, { method: 'DELETE' });
      if (res.ok) {
        enqueueSnackbar('Commande supprimée', { variant: 'success' });
        setDeleteOpen(false);
        setOrderToDelete(null);
        fetchOrders();
        fetchStats();
      }
    } catch { enqueueSnackbar('Erreur', { variant: 'error' }); }
  };

  const handlePrintReceipt = (order: Order) => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    const itemsHtml = (order.items || []).map(item =>
      `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${item.productName}<br/><small style="color:#666">${item.variantSize} ${item.variantColor}</small></td>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee">${item.unitPrice.toLocaleString('fr-FR')} MGA</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee"><b>${item.totalPrice.toLocaleString('fr-FR')} MGA</b></td>
      </tr>`
    ).join('');

    const html = `
      <html><head><title>Reçu ${order.orderNumber || order.id.slice(0, 8)}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;max-width:380px;margin:0 auto}
      table{width:100%;border-collapse:collapse}h1{font-size:18px;text-align:center}
      .header{text-align:center;border-bottom:2px dashed #333;padding-bottom:12px;margin-bottom:12px}
      .footer{text-align:center;border-top:2px dashed #333;padding-top:12px;margin-top:12px;font-size:12px;color:#666}
      @media print{button{display:none}}</style></head><body>
      <div class="header">
        <h1>🛍️ ${companyName}</h1>
        <p style="margin:4px 0;font-size:12px">Reçu de commande</p>
      </div>
      <p><b>N° Commande:</b> ${order.orderNumber || order.id.slice(0, 8)}</p>
      <p><b>Date:</b> ${new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <p><b>Client:</b> ${order.clientName}</p>
      ${order.clientPhone ? `<p><b>Tél:</b> ${order.clientPhone}</p>` : ''}
      ${order.shippingAddress ? `<p><b>Adresse:</b> ${order.shippingAddress}</p>` : ''}
      <p><b>Statut:</b> ${STATUS_LABELS[order.status] || order.status}</p>
      ${order.paymentMethod ? `<p><b>Paiement:</b> ${PAYMENT_METHODS[order.paymentMethod] || order.paymentMethod}</p>` : ''}
      ${order.deliveryPerson ? `<p><b>Livreur:</b> ${order.deliveryPerson}</p>` : ''}
      ${order.deliveryDate ? `<p><b>🚚 Livraison prévue:</b> ${new Date(order.deliveryDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>` : ''}
      <hr/>
      <table>
        <thead><tr style="background:#f5f5f5">
          <th style="padding:6px 8px;text-align:left">Article</th>
          <th style="padding:6px 8px;text-align:center">Qté</th>
          <th style="padding:6px 8px;text-align:right">P.U.</th>
          <th style="padding:6px 8px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr>
          <td colspan="3" style="padding:8px;text-align:right;font-weight:bold;font-size:16px">TOTAL</td>
          <td style="padding:8px;text-align:right;font-weight:bold;font-size:16px;color:#2E7D6F">${order.totalAmount.toLocaleString('fr-FR')} MGA</td>
        </tr></tfoot>
      </table>
      ${order.notes ? `<p style="margin-top:12px"><b>Notes:</b> ${order.notes}</p>` : ''}
      <div class="footer">
        <p>Merci pour votre achat ! 🙏</p>
        <p>${companyName}</p>
      </div>
      <button onclick="window.print()" style="width:100%;padding:10px;margin-top:16px;background:#2E7D6F;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Imprimer</button>
      </body></html>
    `;
    win.document.documentElement.innerHTML = html;
    win.document.close();
  };

  const handleExportPDF = async (order: Order) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      // Helper to format currency with dot separator
      const formatCurrency = (amount: number) => {
        return amount.toLocaleString('fr-FR').replace(/\s/g, '.');
      };

      const doc = new jsPDF();

      // Header style (Finance Report style)
      doc.setFontSize(18);
      doc.setTextColor(0);
      doc.text(`${companyName} - Commande`, 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 32);

      // Order info
      doc.setFontSize(11);
      doc.setTextColor(0);
      let y = 42;
      
      // Order details section
      doc.setFontSize(10);
      doc.text(`N° Commande: ${order.orderNumber || order.id.slice(0, 8)}`, 14, y);
      y += 6;
      doc.text(`Date de création: ${new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, y);
      y += 6;
      doc.text(`Statut: ${STATUS_LABELS[order.status] || order.status}`, 14, y);
      y += 6;
      
      if (order.paymentMethod) {
        doc.text(`Mode de paiement: ${PAYMENT_METHODS[order.paymentMethod] || order.paymentMethod}`, 14, y);
        y += 6;
      }
      
      if (order.deliveryPerson) {
        doc.text(`Livreur: ${order.deliveryPerson}`, 14, y);
        y += 6;
      }
      
      if (order.deliveryDate) {
        doc.text(`Livraison prévue: ${new Date(order.deliveryDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, y);
        y += 10;
      } else {
        y += 4;
      }

      // Client info
      doc.setFontSize(11);
      doc.text('Information Client:', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Nom: ${order.clientName}`, 20, y);
      y += 5;
      if (order.clientPhone) {
        doc.text(`Téléphone: ${order.clientPhone}`, 20, y);
        y += 5;
      }
      if (order.shippingAddress) {
        doc.text(`Adresse: ${order.shippingAddress}`, 20, y);
        y += 5;
      }
      
      // Items table
      y += 10;
      const tableData = (order.items || []).map(item => [
        item.productName,
        `${item.variantSize} ${item.variantColor}`,
        String(item.quantity),
        `${formatCurrency(item.unitPrice)} MGA`,
        `${formatCurrency(item.totalPrice)} MGA`,
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Produit', 'Variante', 'Qté', 'Prix unitaire', 'Total']],
        body: tableData,
        foot: [['', '', '', 'TOTAL', `${formatCurrency(order.totalAmount)} MGA`]],
        theme: 'grid', // Changed from 'striped' to 'grid' to match Finance
        styles: { 
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: { 
          fillColor: [41, 128, 185], // Finance Blue
          textColor: 255,
          fontStyle: 'bold'
        },
        footStyles: { 
          fillColor: [245, 245, 245], 
          textColor: 0, 
          fontStyle: 'bold', 
          halign: 'right' 
        },
        columnStyles: {
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
      });

      // Notes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
      if (order.notes) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Notes: ${order.notes}`, 14, finalY + 10);
      }

      // Footer with page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `Page ${pageCount}`, 
        doc.internal.pageSize.width - 20, 
        doc.internal.pageSize.height - 10
      );

      doc.save(`commande-${order.orderNumber || order.id.slice(0, 8)}.pdf`);
      enqueueSnackbar('PDF téléchargé', { variant: 'success' });
    } catch {
      enqueueSnackbar('Erreur lors de la génération du PDF', { variant: 'error' });
    }
  };

  const handleExportJPEG = async (order: Order) => {
    setOrderToExport(order);
    
    // Attendre que le DOM se mette à jour avec l'ordre à exporter
    setTimeout(async () => {
      if (!exportReceiptRef.current) {
        enqueueSnackbar('Erreur: contenu d\'export introuvable', { variant: 'error' });
        return;
      }

      try {
        const canvas = await html2canvas(exportReceiptRef.current, {
          scale: 3, // Qualité supérieure
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const link = document.createElement('a');
        link.download = `commande-${order.orderNumber || order.id.slice(0, 8)}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
        enqueueSnackbar('Image JPEG téléchargée', { variant: 'success' });
        setOrderToExport(null);
      } catch (error) {
        console.error('JPEG export error:', error);
        enqueueSnackbar('Erreur lors de la génération de l\'image', { variant: 'error' });
      }
    }, 100);
  };

  const handleOpenExportMenu = (event: React.MouseEvent<HTMLElement>) => {
    setExportAnchorEl(event.currentTarget);
  };

  const handleCloseExportMenu = () => {
    setExportAnchorEl(null);
  };

  const handleExportListPdf = async () => {
    if (orders.length === 0) {
      setExportError('Aucune commande à exporter');
      return;
    }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(companyName, 14, 16);
    doc.setFontSize(18);
    doc.text('Liste des commandes', 14, 26);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

    const tableData = orders.map((order) => [
      order.orderNumber || order.id.slice(0, 8),
      order.clientName,
      order.clientPhone || '-',
      order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('fr-FR') : '-',
      order.shippingAddress || '-',
      STATUS_LABELS[order.status] || order.status,
      `${order.totalAmount.toLocaleString('fr-FR')} MGA`,
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['N° Commande', 'Client', 'Contact', 'Date Livraison', 'Adresse Livraison', 'Statut', 'Montant']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        2: { cellWidth: 24 },
        3: { cellWidth: 22 },
        4: { cellWidth: 30 },
        5: { cellWidth: 20 },
        6: { halign: 'right' },
      },
    });

    doc.save(`commandes_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportListExcel = () => {
    if (orders.length === 0) {
      setExportError('Aucune commande à exporter');
      return;
    }
    const rows = orders.map((order) => ({
      'N° Commande': order.orderNumber || order.id.slice(0, 8),
      Client: order.clientName,
      Contact: order.clientPhone || '-',
      'Date Livraison': order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('fr-FR') : '-',
      'Adresse Livraison': order.shippingAddress || '-',
      Statut: STATUS_LABELS[order.status] || order.status,
      Montant: `${order.totalAmount.toLocaleString('fr-FR')} MGA`,
    }));
    const headerRows = [
      [companyName],
      ['Liste des commandes'],
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
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Commandes');
    XLSX.writeFile(workbook, `commandes_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const addOrderItem = () => setOrderItems([...orderItems, { productId: '', variantId: '', quantity: 1 }]);
  const removeOrderItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));
  const updateOrderItem = (index: number, field: keyof OrderItemForm, value: string | number) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
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

  const getProductVariants = (productId: string): ProductVariant[] => {
    const product = products.find(p => p.id === productId);
    const variants = product?.variants || [];
    return variants.filter((variant) => allowedVariantIds.has(variant.id));
  };

  // Calculate create order total
  const createOrderTotal = orderItems.reduce((sum, item) => {
    if (!item.variantId) return sum;
    const product = products.find(p => p.id === item.productId);
    const variant = product?.variants?.find(v => v.id === item.variantId);
    return sum + (variant ? variant.price * item.quantity : 0);
  }, 0);

  const getStatusStepIndex = (status: OrderStatus) => {
    if (status === 'cancelled') return -1;
    return STATUS_STEPS.indexOf(status);
  };

  const clearFilters = () => {
    setFilterStatus('');
    setDateFrom('');
    setDateTo('');
    setDeliveryDateFrom('');
    setDeliveryDateTo('');
    setPage(0);
  };

  const hasActiveFilters = filterStatus || dateFrom || dateTo || deliveryDateFrom || deliveryDateTo;
  const deliveryPersons = useMemo(
    () => Array.from(new Set(deliveryLocations.map((location) => location.deliveryPerson).filter(Boolean))),
    [deliveryLocations]
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header title="Gestion des Commandes" subtitle="Vente en ligne — Suivi et gestion" />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && <LinearProgress />}
          <Box sx={{ p: 3 }}>
          {/* Stats Cards */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <StatCard
                title="Total Commandes"
                value={stats?.totalOrders || 0}
                icon={<ShoppingCart />}
                color="#2E7D6F"
                bgColor="#E8F5F1"
                subtitle={`${stats?.todayOrders || 0} aujourd'hui`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <StatCard
                title="Produits Vendus"
                value={stats?.totalProductsSold || 0}
                icon={<ImageIcon />}
                color="#1976D2"
                bgColor="#E3F2FD"
                subtitle={dateFrom || dateTo ? 'Filtré par date' : 'Total global'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <StatCard
                title="En attente"
                value={stats?.pendingOrders || 0}
                icon={<HourglassEmpty />}
                color="#F59E0B"
                bgColor="#FFFBEB"
                subtitle={`${(stats?.pendingRevenue || 0).toLocaleString('fr-FR')} MGA`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <StatCard
                title="Livraisons aujourd'hui"
                value={stats?.todayDeliveries || 0}
                icon={<Today />}
                color="#10B981"
                bgColor="#ECFDF5"
                subtitle={`${stats?.upcomingDeliveries || 0} à venir`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              {(stats?.overdueDeliveries || 0) > 0 ? (
                <StatCard
                  title="Livraisons en retard"
                  value={stats?.overdueDeliveries || 0}
                  icon={<EventBusy />}
                  color="#EF4444"
                  bgColor="#FEF2F2"
                  subtitle="À traiter en urgence"
                />
              ) : (
                <StatCard
                  title="Chiffre d'affaires"
                  value={`${(stats?.totalRevenue || 0).toLocaleString('fr-FR')} MGA`}
                  icon={<Receipt />}
                  color="#8B5CF6"
                  bgColor="#F3F0FF"
                />
              )}
            </Grid>
          </Grid>

          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ py: 1 }}>
              <Tabs
                value={filterType}
                onChange={(_, value) => { setFilterType(value); setPage(0); }}
              >
                <Tab label="Toutes les ventes" value="all" />
                <Tab label="Ventes Commerciales" value="manual" />
                <Tab label="Ventes Live" value="live" />
              </Tabs>
            </CardContent>
          </Card>

          {/* Search & Actions Bar */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <TextField placeholder="Rechercher par n° commande, client..." size="small" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }}
                sx={{ minWidth: 300 }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Statut</InputLabel>
                <Select value={filterStatus} label="Statut" onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
                  <MenuItem value="">Tous</MenuItem>
                  <MenuItem value="pending">En attente</MenuItem>
                <MenuItem value="confirmed">Confirmée</MenuItem>
                <MenuItem value="shipping">En cours de livraison</MenuItem>
                <MenuItem value="delivered">Livrée</MenuItem>
                <MenuItem value="paid">Payée</MenuItem>
                <MenuItem value="cancelled">Annulée</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title="Filtres avancés">
                <IconButton onClick={() => setShowFilters(!showFilters)}
                  color={hasActiveFilters ? 'primary' : 'default'}>
                  <FilterList />
                </IconButton>
              </Tooltip>
              {hasActiveFilters && (
                <Chip label="Réinitialiser filtres" size="small" onDelete={clearFilters} color="primary" variant="outlined" />
              )}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" startIcon={<Download />} onClick={handleOpenExportMenu} sx={{ px: 3 }}>
                Exporter
              </Button>
              <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={handleCloseExportMenu}>
                <MenuItem onClick={() => { handleCloseExportMenu(); handleExportListPdf(); }}>
                  Exporter PDF
                </MenuItem>
                <MenuItem onClick={() => { handleCloseExportMenu(); handleExportListExcel(); }}>
                  Exporter Excel
                </MenuItem>
              </Menu>
              <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ px: 3 }}>
                Nouvelle Commande
              </Button>
              <Button variant="outlined" startIcon={<LocalShipping />} onClick={openDeliveryLocations} sx={{ px: 3 }}>
                Lieux de livraison
              </Button>
            </CardContent>
          </Card>

          {/* Advanced Filters */}
          <Collapse in={showFilters}>
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                <CalendarMonth sx={{ color: 'text.secondary' }} />
                <TextField label="Date début" type="date" size="small" value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
                <TextField label="Date fin" type="date" size="small" value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
                <TextField label="Livraison début" type="date" size="small" value={deliveryDateFrom}
                  onChange={(e) => { setDeliveryDateFrom(e.target.value); setPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
                <TextField label="Livraison fin" type="date" size="small" value={deliveryDateTo}
                  onChange={(e) => { setDeliveryDateTo(e.target.value); setPage(0); }}
                  slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Type</InputLabel>
                  <Select value={filterType} label="Type" onChange={(e) => { setFilterType(e.target.value); setPage(0); }}>
                    <MenuItem value="all">Tous</MenuItem>
                    <MenuItem value="manual">Vente en ligne</MenuItem>
                    <MenuItem value="live">Vente Live</MenuItem>
                  </Select>
                </FormControl>
              </CardContent>
            </Card>
          </Collapse>

          {/* Orders Table */}
          <Card>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>N° Commande</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Articles</TableCell>
                    <TableCell align="center">Statut</TableCell>
                    <TableCell align="right">Montant</TableCell>
                    <TableCell align="center">Livraison</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderRows.map((row) => (
                    <OrderRow
                      key={row.order.id}
                      row={row}
                      onView={openViewOrder}
                      onPrint={handlePrintReceipt}
                      onExport={handleExportPDF}
                      onExportImage={handleExportJPEG}
                      onDelete={(order) => { setOrderToDelete(order); setDeleteOpen(true); }}
                      onQuickConfirm={(order) => handleQuickUpdate(order, 'confirmed')}
                      onQuickDeliverToday={(order) => handleQuickUpdate(order, 'delivered', true)}
                    />
                  ))}
                  {orders.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <ShoppingCart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                      <Typography color="text.secondary">Aucune commande trouvée</Typography>
                      {hasActiveFilters && (
                        <Button size="small" onClick={clearFilters} sx={{ mt: 1 }}>Réinitialiser les filtres</Button>
                      )}
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={total} page={page} onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]} labelRowsPerPage="Lignes par page"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
            />
          </Card>
        </Box>
      </Box>
    </Box>

    <Dialog open={deliveryLocationsOpen} onClose={() => setDeliveryLocationsOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>Lieux de livraison</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, mt: 1 }}>
          <TextField
            fullWidth
            label="Lieux de livraison"
            value={deliveryPlaceName}
            onChange={(e) => setDeliveryPlaceName(e.target.value)}
            size="small"
          />
          <Autocomplete
            freeSolo
            options={deliveryPersons}
            value={deliveryPersonName}
            onInputChange={(_, value) => setDeliveryPersonName(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                fullWidth
                label="Livreur"
                size="small"
              />
            )}
            sx={{ width: '100%' }}
          />
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddDeliveryLocation}
            disabled={deliveryLocationsLoading}
          >
            Ajouter lieux de livraison
          </Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lieux de livraison</TableCell>
                <TableCell>Livreur</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deliveryLocations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell>{location.placeName}</TableCell>
                  <TableCell>{location.deliveryPerson}</TableCell>
                </TableRow>
              ))}
              {deliveryLocations.length === 0 && !deliveryLocationsLoading && (
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    Aucune donnée
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeliveryLocationsOpen(false)}>Fermer</Button>
      </DialogActions>
    </Dialog>

    {/* ============== CREATE ORDER DIALOG ============== */}
        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShoppingCart color="primary" />
            Nouvelle Commande — Vente en ligne
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={8}>
                <Autocomplete
                  options={clientOptions}
                  getOptionLabel={(option) => `${option.name} ${option.facebookPseudo ? `(${option.facebookPseudo})` : ''} ${option.phone ? `— ${option.phone}` : ''}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={selectedClient}
                  onChange={(_, val) => {
                    setSelectedClient(val);
                    if (val?.address) {
                      setShippingAddress(val.address);
                      const linkedDeliveryPerson = getLinkedDeliveryPerson(val.address);
                      if (linkedDeliveryPerson) setDeliveryPerson(linkedDeliveryPerson);
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Sélectionner un client" required />}
                />
              </Grid>
              <Grid size={4}>
                <FormControl fullWidth>
                  <InputLabel>Statut initial</InputLabel>
                  <Select value={orderStatus} label="Statut initial" onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}>
                    <MenuItem value="pending">En attente</MenuItem>
                    <MenuItem value="confirmed">Confirmée</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
                <Grid size={4}>
                  <FormControl fullWidth>
                    <InputLabel>Mode de paiement</InputLabel>
                    <Select
                      value={paymentMethod}
                      label="Mode de paiement"
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      <MenuItem value="">Aucun</MenuItem>
                      <MenuItem value="airtel_money">Airtel Money</MenuItem>
                      <MenuItem value="mvola">MVola</MenuItem>
                      <MenuItem value="orange_money">Orange Money</MenuItem>
                      <MenuItem value="espece">Espèce</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    label="Livreur"
                    value={deliveryPerson}
                    onChange={(e) => setDeliveryPerson(e.target.value)}
                    placeholder="Nom du livreur"
                  />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth label="Adresse de livraison" value={shippingAddress}
                  onChange={(e) => {
                    const value = e.target.value;
                    setShippingAddress(value);
                    const linkedDeliveryPerson = getLinkedDeliveryPerson(value);
                    if (linkedDeliveryPerson) setDeliveryPerson(linkedDeliveryPerson);
                  }}
                  placeholder="Adresse de livraison du client" size="small" />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Date de livraison" type="date" value={orderDeliveryDate}
                  onChange={(e) => setOrderDeliveryDate(e.target.value)} size="small"
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Notes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)}
                  multiline rows={2} placeholder="Instructions spéciales, remarques..." size="small" />
              </Grid>

              <Grid size={12}>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600}>📦 Articles</Typography>
                  <Button size="small" startIcon={<Add />} onClick={addOrderItem}>Ajouter article</Button>
                </Box>
                {orderItems.map((item, index) => {
                  const variant = products.find(p => p.id === item.productId)?.variants?.find(v => v.id === item.variantId);
                  return (
                    <Box key={index} sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
                      <FormControl size="small" sx={{ flex: 4 }}>
                        <InputLabel>Article</InputLabel>
                        <Select value={item.variantId} label="Article"
                          onChange={(e) => {
                            const nextVariantId = e.target.value;
                            const nextProductId = variantProductMap[nextVariantId] || '';
                            const updated = [...orderItems];
                            updated[index] = { ...updated[index], productId: nextProductId, variantId: nextVariantId };
                            setOrderItems(updated);
                          }}
                          MenuProps={{ PaperProps: { style: { maxHeight: 420 } } }}>
                          {articleGroups.length === 0 && (
                            <MenuItem disabled value="">
                              Aucun article actif disponible
                            </MenuItem>
                          )}
                          {articleGroups.flatMap((group) => [
                            <ListSubheader key={`group-${group.product.id}`}>
                              Catégorie : {group.product.name}
                            </ListSubheader>,
                            ...group.variants.map((v) => (
                              <MenuItem key={v.id} value={v.id}>
                                {`${group.product.name} ${v.size} ${v.color}`.trim()} — {v.price.toLocaleString('fr-FR')} MGA (stock: {allowedOutQuantities[v.id] ?? 0})
                              </MenuItem>
                            )),
                          ])}
                        </Select>
                      </FormControl>
                      <TextField label="Qté" type="number" size="small" sx={{ width: 80 }}
                        value={item.quantity} onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        slotProps={{ htmlInput: { min: 1 } }}
                      />
                      {variant && (
                        <Typography variant="body2" fontWeight={700} color="primary" sx={{ minWidth: 100, textAlign: 'right' }}>
                          {(variant.price * item.quantity).toLocaleString('fr-FR')} MGA
                        </Typography>
                      )}
                      {orderItems.length > 1 && (
                        <IconButton size="small" color="error" onClick={() => removeOrderItem(index)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  );
                })}

                {/* Order Total Preview */}
                {createOrderTotal > 0 && (
                  <Alert severity="success" sx={{ mt: 2 }} icon={<Receipt />}>
                    <Typography variant="body1" fontWeight={700}>
                      Total de la commande : {createOrderTotal.toLocaleString('fr-FR')} MGA
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {orderItems.filter(i => i.variantId).length} article(s)
                      {selectedClient ? ` — Client: ${selectedClient.name}` : ''}
                    </Typography>
                  </Alert>
                )}
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button variant="contained" onClick={handleCreateOrder} startIcon={<CheckCircle />}
              disabled={!selectedClient || createOrderTotal === 0}>
              Créer la commande
            </Button>
          </DialogActions>
        </Dialog>

        {/* ============== VIEW/EDIT ORDER DIALOG ============== */}
        <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Receipt color="primary" />
              <Typography variant="h6" fontWeight={700}>
                Commande {viewOrder?.orderNumber || viewOrder?.id.slice(0, 8)}
              </Typography>
              {viewOrder && <StatusChip status={viewOrder.status} />}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {!isEditing && (
                <Tooltip title="Modifier">
                  <IconButton onClick={() => setIsEditing(true)} color="primary">
                    <Edit />
                  </IconButton>
                </Tooltip>
              )}
              {viewOrder && (
                <>
                  <Tooltip title="Imprimer">
                    <IconButton onClick={() => handlePrintReceipt(viewOrder)} color="primary">
                      <Print />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="PDF">
                    <IconButton onClick={() => handleExportPDF(viewOrder)} color="secondary">
                      <PictureAsPdf />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Image JPEG">
                    <IconButton onClick={() => handleExportJPEG(viewOrder)} color="info">
                      <ImageIcon />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              <IconButton onClick={() => setViewOpen(false)}><Close /></IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            {viewOrder && (
              <Box sx={{ bgcolor: 'background.paper' }}>
                <Tabs
                  value={viewTab}
                  onChange={(_, value) => setViewTab(value)}
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Tab label="Détails" value="details" />
                  <Tab label="Actions" value="actions" />
                </Tabs>
                {viewTab === 'details' && (
                  <Box ref={receiptRef} sx={{ p: isEditing ? 0 : 2 }}>
                {/* Status Progress */}
                {viewOrder.status !== 'cancelled' && (
                  <Box sx={{ mb: 3, mt: 1 }}>
                    <Stepper activeStep={getStatusStepIndex(isEditing ? editStatus : viewOrder.status)} alternativeLabel>
                      {STATUS_STEPS.map((step) => (
                        <Step key={step}>
                          <StepLabel>{STATUS_LABELS[step]}</StepLabel>
                        </Step>
                      ))}
                    </Stepper>
                  </Box>
                )}

                <Grid container spacing={2.5}>
                  {/* Client Info */}
                  <Grid size={6}>
                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>👤 CLIENT</Typography>
                      <Typography variant="body1" fontWeight={700} sx={{ mt: 0.5 }}>{viewOrder.clientName}</Typography>
                      {viewOrder.clientFacebook && (
                        <Typography variant="body2" color="text.secondary">Facebook: {viewOrder.clientFacebook}</Typography>
                      )}
                      {viewOrder.clientPhone && (
                        <Typography variant="body2" color="text.secondary">📞 {viewOrder.clientPhone}</Typography>
                      )}
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>📋 DÉTAILS</Typography>
                      <Typography variant="h5" fontWeight={700} color="primary" sx={{ mt: 0.5 }}>
                        {viewOrder.totalAmount.toLocaleString('fr-FR')} MGA
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(viewOrder.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Chip label={viewOrder.isLiveOrder ? '🔴 Vente Live' : '🛒 Vente en ligne'} size="small"
                        variant="outlined" sx={{ mt: 0.5 }}
                        color={viewOrder.isLiveOrder ? 'error' : 'primary'} />
                    </Box>
                  </Grid>

                  {/* Editable Fields */}
                  {isEditing && (
                    <>
                      <Grid size={4}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Statut</InputLabel>
                          <Select value={editStatus} label="Statut" onChange={(e) => setEditStatus(e.target.value as OrderStatus)}>
                            <MenuItem value="pending">En attente</MenuItem>
                            <MenuItem value="confirmed">Confirmée</MenuItem>
                            <MenuItem value="shipping">En cours de livraison</MenuItem>
                            <MenuItem value="delivered">Livrée</MenuItem>
                            <MenuItem value="paid">Payée</MenuItem>
                            <MenuItem value="cancelled">Annulée</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={4}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Mode de paiement</InputLabel>
                          <Select
                            value={editPaymentMethod || ''}
                            label="Mode de paiement"
                            onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod || null)}
                          >
                            <MenuItem value="">Aucun</MenuItem>
                            <MenuItem value="airtel_money">Airtel Money</MenuItem>
                            <MenuItem value="mvola">MVola</MenuItem>
                            <MenuItem value="orange_money">Orange Money</MenuItem>
                            <MenuItem value="espece">Espèce</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={4}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Référence de transaction"
                          value={editPaymentReference}
                          onChange={(e) => setEditPaymentReference(e.target.value)}
                        />
                      </Grid>
                      <Grid size={4}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Livreur"
                          value={editDeliveryPerson}
                          onChange={(e) => setEditDeliveryPerson(e.target.value)}
                        />
                      </Grid>
                      <Grid size={8}>
                        <TextField fullWidth size="small" label="Adresse de livraison" value={editAddress}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditAddress(value);
                            const linkedDeliveryPerson = getLinkedDeliveryPerson(value);
                            if (linkedDeliveryPerson) setEditDeliveryPerson(linkedDeliveryPerson);
                          }} />
                      </Grid>
                      <Grid size={12}>
                        <TextField fullWidth size="small" label="Date de livraison" type="date" value={editDeliveryDate}
                          onChange={(e) => setEditDeliveryDate(e.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }} />
                      </Grid>
                      <Grid size={12}>
                        <TextField fullWidth size="small" label="Notes" value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)} multiline rows={2} />
                      </Grid>
                    </>
                  )}

                  {/* Display address and notes when not editing */}
                  {!isEditing && (viewOrder.shippingAddress || viewOrder.notes || viewOrder.deliveryDate || viewOrder.paymentMethod) && (
                    <Grid size={12}>
                      <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                        {viewOrder.shippingAddress && (
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            📍 <b>Adresse:</b> {viewOrder.shippingAddress}
                          </Typography>
                        )}
                        {viewOrder.deliveryDate && (
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            🚚 <b>Date de livraison:</b> {new Date(viewOrder.deliveryDate).toLocaleDateString('fr-FR')}
                          </Typography>
                        )}
                        {viewOrder.paymentMethod && (
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            💳 <b>Paiement:</b> {PAYMENT_METHODS[viewOrder.paymentMethod] || viewOrder.paymentMethod}
                          </Typography>
                        )}
                        {viewOrder.paymentReference && (
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            🔖 <b>Référence:</b> {viewOrder.paymentReference}
                          </Typography>
                        )}
                        {viewOrder.deliveryPerson && (
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            🛵 <b>Livreur:</b> {viewOrder.deliveryPerson}
                          </Typography>
                        )}
                        {viewOrder.notes && (
                          <Typography variant="body2">
                            📝 <b>Notes:</b> {viewOrder.notes}
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                  )}
                </Grid>

                <Divider sx={{ my: 2.5 }} />

                {/* Items Table */}
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>📦 Articles commandés</Typography>
                
                {isEditing ? (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                      <Button size="small" startIcon={<Add />} onClick={addEditOrderItem}>Ajouter article</Button>
                    </Box>
                    {editOrderItems.map((item, index) => {
                      const variant = products.find(p => p.id === item.productId)?.variants?.find(v => v.id === item.variantId);
                      const existingItem = !variant && viewOrder?.items ? viewOrder.items.find(i => i.productId === item.productId && i.variantId === item.variantId) : null;
                      const unitPrice = variant ? variant.price : (existingItem ? existingItem.unitPrice : 0);
                      return (
                        <Box key={index} sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
                          <FormControl size="small" sx={{ flex: 2 }}>
                            <InputLabel>Produit</InputLabel>
                            <Select value={item.productId} label="Produit" onChange={(e) => updateEditOrderItem(index, 'productId', e.target.value)}>
                              {products.filter(p => (p.isActive && allowedProductIds.has(p.id)) || (item.productId === p.id)).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <FormControl size="small" sx={{ flex: 2 }}>
                            <InputLabel>Variante</InputLabel>
                            <Select value={item.variantId} label="Variante"
                              onChange={(e) => updateEditOrderItem(index, 'variantId', e.target.value)}
                              disabled={!item.productId}>
                              {getProductVariants(item.productId).map(v => (
                                <MenuItem key={v.id} value={v.id}>
                                  {v.size} {v.color} — {v.price.toLocaleString('fr-FR')} MGA (stock: {allowedOutQuantities[v.id] ?? 0})
                                </MenuItem>
                              ))}
                              {/* If current variant is not in list (e.g. out of stock or changed), add it as disabled option to show current value */}
                              {!getProductVariants(item.productId).some(v => v.id === item.variantId) && item.variantId && (
                                <MenuItem value={item.variantId} disabled>
                                  {existingItem ? `${existingItem.variantSize} ${existingItem.variantColor} (Actuel)` : 'Variante indisponible'}
                                </MenuItem>
                              )}
                            </Select>
                          </FormControl>
                          <TextField label="Qté" type="number" size="small" sx={{ width: 80 }}
                            value={item.quantity} onChange={(e) => updateEditOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            slotProps={{ htmlInput: { min: 1 } }}
                          />
                          <Typography variant="body2" fontWeight={700} color="primary" sx={{ minWidth: 100, textAlign: 'right' }}>
                            {(unitPrice * item.quantity).toLocaleString('fr-FR')} MGA
                          </Typography>
                          {editOrderItems.length > 1 && (
                            <IconButton size="small" color="error" onClick={() => removeEditOrderItem(index)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      );
                    })}
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 1, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle2">Nouveau Total Estimé</Typography>
                      <Typography variant="subtitle1" fontWeight={700} color="primary">{editOrderTotal.toLocaleString('fr-FR')} MGA</Typography>
                    </Box>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                          <TableCell sx={{ fontWeight: 700 }}>Produit</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Variante</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700 }}>Qté</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Prix unitaire</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {viewOrder.items?.map((item, i) => (
                          <TableRow key={i} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{item.productName}</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip label={`${item.variantSize} ${item.variantColor}`} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell align="center">
                              <Chip label={`×${item.quantity}`} size="small" color="primary" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">{item.unitPrice.toLocaleString('fr-FR')} MGA</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={700}>{item.totalPrice.toLocaleString('fr-FR')} MGA</Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableBody>
                        <TableRow>
                          <TableCell colSpan={4} align="right">
                            <Typography variant="subtitle1" fontWeight={700}>TOTAL</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="h6" fontWeight={700} color="primary">
                              {viewOrder.totalAmount.toLocaleString('fr-FR')} MGA
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {/* Last updated */}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  Dernière mise à jour: {new Date(viewOrder.updatedAt).toLocaleString('fr-FR')}
                </Typography>
                </Box>
                )}

                {viewTab === 'actions' && (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                      Actions rapides
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      <Button variant="contained" onClick={() => openActionDialog('confirm')} disabled={viewOrder.status !== 'pending'}>
                        Confirmer commande
                      </Button>
                      <Button variant="contained" onClick={() => openActionDialog('shipping')} disabled={!['confirmed', 'pending'].includes(viewOrder.status)}>
                        En cours de livraison
                      </Button>
                      <Button variant="contained" color="success" onClick={() => openActionDialog('deliver')} disabled={!['shipping', 'confirmed'].includes(viewOrder.status)}>
                        Livraison effectuée
                      </Button>
                      <Button variant="contained" color="info" onClick={() => openActionDialog('pay')} disabled={viewOrder.status === 'paid' || viewOrder.status === 'cancelled'}>
                        Paiement effectué
                      </Button>
                      <Button variant="contained" color="error" onClick={() => openActionDialog('cancel')} disabled={viewOrder.status === 'cancelled'}>
                        Annuler
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            {isEditing ? (
              <>
                <Button onClick={() => setIsEditing(false)}>Annuler</Button>
                <Button variant="contained" onClick={handleUpdateOrder} startIcon={<CheckCircle />}>
                  Enregistrer les modifications
                </Button>
              </>
            ) : (
              <Button onClick={() => setViewOpen(false)}>Fermer</Button>
            )}
          </DialogActions>
        </Dialog>

        <Dialog open={actionDialogOpen} onClose={closeActionDialog} maxWidth="xs" fullWidth>
          <DialogTitle>
            {actionType === 'confirm' && 'Confirmer la commande'}
            {actionType === 'shipping' && 'En cours de livraison'}
            {actionType === 'deliver' && 'Livraison effectuée'}
            {actionType === 'pay' && 'Paiement effectué'}
            {actionType === 'cancel' && 'Annuler la commande'}
          </DialogTitle>
          <DialogContent>
            {actionType === 'pay' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Mode de paiement</InputLabel>
                  <Select
                    value={actionPaymentMethod}
                    label="Mode de paiement"
                    onChange={(e) => setActionPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    <MenuItem value="">Sélectionner</MenuItem>
                    <MenuItem value="airtel_money">Airtel Money</MenuItem>
                    <MenuItem value="mvola">MVola</MenuItem>
                    <MenuItem value="orange_money">Orange Money</MenuItem>
                    <MenuItem value="espece">Espèce</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Référence de transaction"
                  size="small"
                  value={actionPaymentReference}
                  onChange={(e) => setActionPaymentReference(e.target.value)}
                />
              </Box>
            ) : (
              <Typography>
                {actionType === 'confirm' && 'Confirmer cette commande ?'}
                {actionType === 'shipping' && 'Marquer la commande comme en cours de livraison ?'}
                {actionType === 'deliver' && 'Confirmer la livraison effectuée ?'}
                {actionType === 'cancel' && 'Annuler cette commande ?'}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeActionDialog}>Non</Button>
            <Button variant="contained" onClick={handleConfirmAction}>Oui</Button>
          </DialogActions>
        </Dialog>

        {/* ============== DELETE DIALOG ============== */}
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ color: 'error.main' }}>⚠️ Confirmer la suppression</DialogTitle>
          <DialogContent>
            {orderToDelete && (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Cette action est irréversible. Le stock des articles sera restauré.
                </Alert>
                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                  <Typography variant="body2"><b>N° Commande:</b> {orderToDelete.orderNumber || orderToDelete.id.slice(0, 8)}</Typography>
                  <Typography variant="body2"><b>Client:</b> {orderToDelete.clientName}</Typography>
                  <Typography variant="body2"><b>Montant:</b> {orderToDelete.totalAmount.toLocaleString('fr-FR')} MGA</Typography>
                  <Typography variant="body2"><b>Articles:</b> {orderToDelete.items?.length || 0}</Typography>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleteOpen(false)}>Annuler</Button>
            <Button variant="contained" color="error" onClick={handleDelete} startIcon={<Delete />}>
              Supprimer définitivement
            </Button>
          </DialogActions>
        </Dialog>

        {/* Hidden Export Receipt Area (9cm x 13cm format) */}
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          <Box 
            ref={exportReceiptRef} 
            sx={{ 
              p: 3, 
              bgcolor: receiptStyle.sheetBg,
              background: receiptTemplate === 'pink-invoice'
                ? `radial-gradient(circle at top left, ${receiptAccent}22 0%, ${receiptAccent}12 35%, #FFFFFF 70%)`
                : undefined,
              width: '340px', 
              minHeight: '491px', 
              display: 'flex', 
              flexDirection: 'column',
              border: receiptTemplate === 'pink-invoice' ? '1px solid' : 'none',
              borderColor: receiptTemplate === 'pink-invoice' ? `${receiptAccent}55` : 'transparent',
              borderRadius: receiptTemplate === 'pink-invoice' ? 1.5 : 0,
            }}
          >
            {orderToExport && (
              <Fragment>
                {/* Company Header */}
                <Box sx={{ textAlign: 'center', mb: 2, bgcolor: receiptStyle.headerBg, color: receiptStyle.headerText, borderRadius: 1, py: 1 }}>
                  <Typography variant="h5" fontWeight={800} sx={{ textTransform: 'uppercase', letterSpacing: 1, color: receiptStyle.headerText }}>
                    {companyName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: receiptStyle.headerText, opacity: 0.92 }}>
                    Commande du {new Date(orderToExport.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </Typography>
                </Box>

                {/* Client Info */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Client: {orderToExport.clientName}
                  </Typography>
                  {orderToExport.clientFacebook && (
                    <Typography variant="body2" color="text.secondary">
                      Facebook: {orderToExport.clientFacebook}
                    </Typography>
                  )}
                  {orderToExport.clientPhone && (
                    <Typography variant="body2" color="text.secondary">
                      Contact: {orderToExport.clientPhone}
                    </Typography>
                  )}
                  {orderToExport.shippingAddress && (
                    <Typography variant="body2" color="text.secondary">
                      Lieux de livraison: {orderToExport.shippingAddress}
                    </Typography>
                  )}
                  {(receiptTemplate === 'delivery-sheet' || receiptTemplate === 'pink-invoice') && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Mode de paiement: {orderToExport.paymentMethod ? (PAYMENT_METHODS[orderToExport.paymentMethod] || orderToExport.paymentMethod) : '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Livreur: {orderToExport.deliveryPerson || '-'}
                      </Typography>
                    </>
                  )}
                </Box>

                {/* Order Table */}
                <TableContainer component={Box} sx={{ border: 1, borderColor: receiptStyle.borderColor, borderRadius: 1, mb: 2 }}>
                  <Table size="small" sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: receiptStyle.tableHeaderBg }}>
                        <TableCell sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', fontSize: '0.7rem', p: 0.5 }}>ARTICLES</TableCell>
                        <TableCell align="center" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '30px', fontSize: '0.7rem', p: 0.5 }}>QTÉ</TableCell>
                        <TableCell align="right" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '65px', fontSize: '0.7rem', p: 0.5 }}>P.U</TableCell>
                        <TableCell align="right" sx={{ color: receiptStyle.tableHeaderText, fontWeight: 'bold', width: '75px', fontSize: '0.7rem', p: 0.5 }}>TOTAL</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orderToExport.items?.map((item, idx) => (
                        <TableRow key={idx} sx={{ bgcolor: idx % 2 === 0 ? 'background.paper' : receiptStyle.rowAltBg }}>
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
                          <TableCell align="right" sx={{ borderRight: 0, borderColor: receiptStyle.borderColor, fontSize: '0.7rem', p: 0.5, whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                            {(item.unitPrice * item.quantity).toLocaleString('fr-FR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Total Footer */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderTop: 2, borderColor: receiptStyle.totalColor, pt: 1, mt: 'auto' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Sous-total :</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>
                      {orderToExport.totalAmount.toLocaleString('fr-FR')} Ar
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Frais de livraison :</Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>
                      {DELIVERY_FEE.toLocaleString('fr-FR')} Ar
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: '0.9rem' }}>TOTAL À PAYER :</Typography>
                    <Typography variant="h5" fontWeight={800} sx={{ fontSize: '1.1rem', color: receiptStyle.totalColor }}>
                      {(orderToExport.totalAmount + DELIVERY_FEE).toLocaleString('fr-FR')} Ar
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right', mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    ({orderToExport.items ? orderToExport.items.reduce((acc, i) => acc + i.quantity, 0) : 0} articles)
                  </Typography>
                </Box>
              </Fragment>
            )}
          </Box>
        </div>
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
