import AsyncStorage from '@react-native-async-storage/async-storage';
import pako from 'pako';
import { Buffer } from 'buffer';
import type { ClientItem, DeliveryStat, ImportHistoryItem, MobileExportData, MobileOrder } from './types';

const WEB_DATA_KEY = 'web_mobile_data_v1';
const WEB_META_KEY = 'web_mobile_meta_v1';
const WEB_HISTORY_KEY = 'web_mobile_import_history_v1';
const PARCEL_DISCOUNT = 4000;
const isCancelledStatus = (status?: string) => ['annuler', 'annulé', 'cancelled'].includes(String(status || '').trim().toLowerCase());

type WebStore = {
  clients: ClientItem[];
  deliveryStats: DeliveryStat[];
  orders: MobileOrder[];
};

function defaultStore(): WebStore {
  return { clients: [], deliveryStats: [], orders: [] };
}

async function loadStore(): Promise<WebStore> {
  const raw = await AsyncStorage.getItem(WEB_DATA_KEY);
  if (!raw) return defaultStore();
  try {
    const parsed = JSON.parse(raw) as WebStore;
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      deliveryStats: Array.isArray(parsed.deliveryStats) ? parsed.deliveryStats : [],
      orders: Array.isArray((parsed as Partial<WebStore>).orders) ? (parsed as WebStore).orders : [],
    };
  } catch {
    return defaultStore();
  }
}

async function saveStore(store: WebStore) {
  await AsyncStorage.setItem(WEB_DATA_KEY, JSON.stringify(store));
}

const normalizeOrderKeyPart = (value?: string) => String(value || '').trim().toLowerCase();

const buildOrderLookupKey = (order: { orderNumber?: string; clientName?: string }) => (
  `${normalizeOrderKeyPart(order.orderNumber)}||${normalizeOrderKeyPart(order.clientName)}`
);

function mergeOrdersPreservingProofImages(importedOrders: MobileOrder[], existingOrders: MobileOrder[]) {
  const existingById = new Map<string, MobileOrder>();
  const existingByKey = new Map<string, MobileOrder>();

  for (const order of existingOrders || []) {
    if (order.id) {
      existingById.set(order.id, order);
    }
    const key = buildOrderLookupKey(order);
    if (key !== '||') {
      existingByKey.set(key, order);
    }
  }

  return (importedOrders || []).map((order) => {
    const byId = existingById.get(order.id);
    const byKey = existingByKey.get(buildOrderLookupKey(order));
    const incomingProof = String(order.proofImageUri || '').trim();
    const preservedProof = String(byId?.proofImageUri || byKey?.proofImageUri || '').trim();
    return {
      ...order,
      proofImageUri: incomingProof || preservedProof || '',
      isPersonalTransportParcel: Boolean(order.isPersonalTransportParcel),
      items: Array.isArray(order.items) ? order.items : [],
    };
  });
}

function computeNetTotalFromOrders(orders: MobileOrder[]) {
  const activeOrders = orders.filter((o) => !isCancelledStatus(o.status));
  const gross = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const parcelCount = activeOrders.filter((o) => Boolean(o.isPersonalTransportParcel)).length;
  return Math.max(0, gross - (parcelCount * PARCEL_DISCOUNT));
}

function isGzipFile(fileName: string, bytes: Uint8Array) {
  return fileName.toLowerCase().endsWith('.gz') || (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

async function readPickedFileAsJson(uri: string, fileName: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (isGzipFile(fileName, bytes)) {
    return pako.ungzip(bytes, { to: 'string' }) as string;
  }
  return Buffer.from(bytes).toString('utf-8');
}

export async function initStorage() {
  const store = await loadStore();
  await saveStore(store);
}

export function getAvailableDiskSpace() {
  // Web can't reliably expose local disk free space.
  // Return 0 to skip hard rejection on web testing.
  return 0;
}

export async function importMobileFile(options: {
  uri: string;
  fileName: string;
  fileSize?: number | null;
}) {
  const jsonText = await readPickedFileAsJson(options.uri, options.fileName);
  const parsed = JSON.parse(jsonText) as MobileExportData;
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.deliveryDailyStats)) {
    throw new Error('Fichier mobile invalide');
  }

  const existingStore = await loadStore();
  const mergedOrders = mergeOrdersPreservingProofImages(parsed.orders || [], existingStore.orders || []);
  const store: WebStore = {
    clients: parsed.clients,
    deliveryStats: parsed.deliveryDailyStats,
    orders: mergedOrders,
  };
  await saveStore(store);

  const importedAt = parsed.exportedAt || new Date().toISOString();
  const totalAmount = computeNetTotalFromOrders(mergedOrders);
  const currentImportId = Date.now();
  const currentMeta = {
    id: currentImportId,
    importedAt,
    archivePath: `web-memory://${options.fileName}`,
    schemaVersion: Number(parsed.schemaVersion || 1),
    userId: parsed.userId || '',
    fileName: options.fileName,
    deliveryPersonFilter: parsed.exportContext?.deliveryPersonFilter || '',
    totalAmount,
  };
  await AsyncStorage.setItem(
    WEB_META_KEY,
    JSON.stringify(currentMeta)
  );
  const historyRaw = await AsyncStorage.getItem(WEB_HISTORY_KEY);
  const history = historyRaw ? (JSON.parse(historyRaw) as Array<ImportHistoryItem & { data: MobileExportData }>) : [];
  const item: ImportHistoryItem & { data: MobileExportData } = {
    ...currentMeta,
    data: parsed,
  };
  const next = [item, ...history].slice(0, 20);
  await AsyncStorage.setItem(WEB_HISTORY_KEY, JSON.stringify(next));

  return {
    archivePath: `web-memory://${options.fileName}`,
    importedAt,
    clientsCount: parsed.clients.length,
    statsCount: (parsed.deliveryDailyStats || []).length,
    pendingCount: (parsed.pendingDeliveries || []).length,
    ordersCount: mergedOrders.length,
    totalAmount,
    deliveryPersonFilter: parsed.exportContext?.deliveryPersonFilter || '',
    currentImportId,
  };
}

export async function getLastImportMeta() {
  const raw = await AsyncStorage.getItem(WEB_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      id: number;
      importedAt: string;
      archivePath: string;
      schemaVersion: number;
      userId: string;
      fileName: string;
      deliveryPersonFilter: string;
      totalAmount: number;
    };
  } catch {
    return null;
  }
}

export async function listImportHistory(): Promise<ImportHistoryItem[]> {
  const historyRaw = await AsyncStorage.getItem(WEB_HISTORY_KEY);
  if (!historyRaw) return [];
  try {
    const history = JSON.parse(historyRaw) as Array<ImportHistoryItem & { data: MobileExportData }>;
    const metaRaw = await AsyncStorage.getItem(WEB_META_KEY);
    const currentMeta = metaRaw ? (JSON.parse(metaRaw) as { id?: number; importedAt?: string }) : null;
    const store = await loadStore();
    const currentTotal = computeNetTotalFromOrders(store.orders || []);
    const currentId = Number(currentMeta?.id || 0);
    if (currentId) {
      const idx = history.findIndex((h) => Number(h.id) === currentId);
      if (idx >= 0) {
        const maybeUpdatedAt = currentMeta?.importedAt || history[idx].importedAt;
        if (Number(history[idx].totalAmount || 0) !== currentTotal || history[idx].importedAt !== maybeUpdatedAt) {
          history[idx] = {
            ...history[idx],
            totalAmount: currentTotal,
            importedAt: maybeUpdatedAt,
          };
          await AsyncStorage.setItem(WEB_HISTORY_KEY, JSON.stringify(history));
        }
      }
    }
    return history.map(({ data: _data, ...meta }) => meta);
  } catch {
    return [];
  }
}

export async function reimportByHistoryId(historyId: number) {
  const historyRaw = await AsyncStorage.getItem(WEB_HISTORY_KEY);
  if (!historyRaw) throw new Error('Historique vide');
  const history = JSON.parse(historyRaw) as Array<ImportHistoryItem & { data: MobileExportData }>;
  const target = history.find((h) => Number(h.id) === Number(historyId));
  if (!target?.data) throw new Error('Archive introuvable');

  const existingStore = await loadStore();
  const mergedOrders = mergeOrdersPreservingProofImages(target.data.orders || [], existingStore.orders || []);
  const store: WebStore = {
    clients: target.data.clients || [],
    deliveryStats: target.data.deliveryDailyStats || [],
    orders: mergedOrders,
  };
  await saveStore(store);
  await AsyncStorage.setItem(
    WEB_META_KEY,
    JSON.stringify({
      id: Number(target.id),
      importedAt: target.importedAt,
      archivePath: target.archivePath,
      schemaVersion: target.schemaVersion || 1,
      userId: target.userId || '',
      fileName: target.fileName || '',
      deliveryPersonFilter: target.deliveryPersonFilter || '',
      totalAmount: Number(target.totalAmount || 0),
    })
  );
  return {
    archivePath: target.archivePath,
    importedAt: target.importedAt,
    clientsCount: target.data.clients?.length || 0,
    statsCount: target.data.deliveryDailyStats?.length || 0,
    pendingCount: target.data.pendingDeliveries?.length || 0,
    ordersCount: mergedOrders.length,
    totalAmount: Number(target.totalAmount || 0),
    deliveryPersonFilter: target.deliveryPersonFilter || '',
    currentImportId: Number(target.id),
  };
}

export async function saveCurrentImportSnapshot(importId?: number) {
  const metaRaw = await AsyncStorage.getItem(WEB_META_KEY);
  const meta = metaRaw ? (JSON.parse(metaRaw) as { id?: number }) : null;
  const targetId = Number(importId || meta?.id || 0);
  if (!targetId) throw new Error('Aucun fichier importé à enregistrer');

  const store = await loadStore();
  const historyRaw = await AsyncStorage.getItem(WEB_HISTORY_KEY);
  const history = historyRaw ? (JSON.parse(historyRaw) as Array<ImportHistoryItem & { data: MobileExportData }>) : [];
  const idx = history.findIndex((h) => Number(h.id) === targetId);
  if (idx < 0) throw new Error('Fichier importé introuvable');

  const totalAmount = computeNetTotalFromOrders(store.orders);
  const updatedData: MobileExportData = {
    ...(history[idx].data || ({} as MobileExportData)),
    exportedAt: new Date().toISOString(),
    clients: store.clients,
    deliveryDailyStats: store.deliveryStats,
    orders: store.orders,
  };
  history[idx] = {
    ...history[idx],
    totalAmount,
    importedAt: new Date().toISOString(),
    data: updatedData,
  };
  await AsyncStorage.setItem(WEB_HISTORY_KEY, JSON.stringify(history));

  const currentMetaRaw = await AsyncStorage.getItem(WEB_META_KEY);
  if (currentMetaRaw) {
    const currentMeta = JSON.parse(currentMetaRaw) as Record<string, unknown>;
    if (Number(currentMeta.id || 0) === targetId) {
      currentMeta.totalAmount = totalAmount;
      currentMeta.importedAt = new Date().toISOString();
      await AsyncStorage.setItem(WEB_META_KEY, JSON.stringify(currentMeta));
    }
  }
  return {
    importId: targetId,
    totalAmount,
    ordersCount: store.orders.length,
    clientsCount: store.clients.length,
  };
}

export async function getClients(search?: string) {
  const store = await loadStore();
  if (!search?.trim()) {
    return [...store.clients].sort((a, b) => a.name.localeCompare(b.name));
  }
  const q = search.trim().toLowerCase();
  return store.clients
    .filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDeliveryStats() {
  const store = await loadStore();
  return [...store.deliveryStats].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 120);
}

export async function getOrders(search?: string) {
  const store = await loadStore();
  if (!search?.trim()) {
    return [...store.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const q = search.trim().toLowerCase();
  return store.orders
    .filter((o) => (o.clientName || '').toLowerCase().includes(q) || (o.orderNumber || '').toLowerCase().includes(q))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function updateClient(client: ClientItem) {
  const store = await loadStore();
  const next = {
    ...store,
    clients: store.clients.map((c) => (c.id === client.id ? { ...c, ...client } : c)),
  };
  await saveStore(next);
}

export async function deleteClient(clientId: string) {
  const store = await loadStore();
  const next = {
    ...store,
    clients: store.clients.filter((c) => c.id !== clientId),
  };
  await saveStore(next);
}

export async function updateOrder(order: MobileOrder) {
  const store = await loadStore();
  const next = {
    ...store,
    orders: store.orders.map((o) => (
      o.id === order.id
        ? {
          ...o,
          ...order,
          isPersonalTransportParcel: Boolean(order.isPersonalTransportParcel),
        }
        : o
    )),
  };
  await saveStore(next);
}

export async function deleteOrder(orderId: string) {
  const store = await loadStore();
  const next = {
    ...store,
    orders: store.orders.filter((o) => o.id !== orderId),
  };
  await saveStore(next);
}

export async function createOrder(order: Omit<MobileOrder, 'id' | 'createdAt'>) {
  const store = await loadStore();
  const id = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const autoDeliveryDate = order.deliveryDate || createdAt.slice(0, 10);
  const nextOrder: MobileOrder = {
    ...order,
    id,
    createdAt,
    deliveryDate: autoDeliveryDate,
    items: order.items || [],
    isPersonalTransportParcel: Boolean(order.isPersonalTransportParcel),
  };
  const next = {
    ...store,
    orders: [nextOrder, ...store.orders],
  };
  await saveStore(next);
  return { id, createdAt };
}
