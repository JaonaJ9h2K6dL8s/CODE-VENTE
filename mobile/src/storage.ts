import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import pako from 'pako';
import { Buffer } from 'buffer';
import type { ClientItem, DeliveryStat, ImportHistoryItem, MobileExportData, MobileOrder, MobileOrderItem, PendingDeliveryItem } from './types';

const DB_NAME = 'mobile_data.db';
const ARCHIVE_DIR = `${FileSystem.documentDirectory}mobile-archives/`;
const KEEP_ARCHIVES_COUNT = 5;
const PARCEL_DISCOUNT = 4000;
const isCancelledStatus = (status?: string) => ['annuler', 'annulé', 'cancelled'].includes(String(status || '').trim().toLowerCase());

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

export async function initStorage() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      totalPurchases INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pending_deliveries (
      id TEXT PRIMARY KEY,
      orderId TEXT DEFAULT '',
      orderNumber TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      pendingQuantity INTEGER DEFAULT 0,
      paidAmount REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT '',
      limitDate TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS delivery_stats (
      date TEXT PRIMARY KEY,
      pendingCount INTEGER DEFAULT 0,
      paidAmount REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mobile_orders (
      id TEXT PRIMARY KEY,
      orderNumber TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      clientPhone TEXT DEFAULT '',
      deliveryDate TEXT DEFAULT '',
      shippingAddress TEXT DEFAULT '',
      status TEXT DEFAULT '',
      paymentMethod TEXT DEFAULT '',
      paymentReference TEXT DEFAULT '',
      deliveryPerson TEXT DEFAULT '',
      isPersonalTransportParcel INTEGER DEFAULT 0,
      proofImageUri TEXT DEFAULT '',
      totalAmount REAL DEFAULT 0,
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS mobile_order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT DEFAULT '',
      variantId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      variantSize TEXT DEFAULT '',
      variantColor TEXT DEFAULT '',
      quantity INTEGER DEFAULT 0,
      unitPrice REAL DEFAULT 0,
      totalPrice REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS import_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importedAt TEXT NOT NULL,
      archivePath TEXT NOT NULL,
      schemaVersion INTEGER DEFAULT 1,
      userId TEXT DEFAULT '',
      fileName TEXT DEFAULT '',
      deliveryPersonFilter TEXT DEFAULT '',
      totalAmount REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
    CREATE INDEX IF NOT EXISTS idx_pending_client ON pending_deliveries(clientName);
    CREATE INDEX IF NOT EXISTS idx_mobile_orders_client ON mobile_orders(clientName);
    CREATE INDEX IF NOT EXISTS idx_mobile_order_items_order ON mobile_order_items(orderId);
  `);
  // Migration for existing installs
  try { await db.execAsync('ALTER TABLE mobile_orders ADD COLUMN isPersonalTransportParcel INTEGER DEFAULT 0;'); } catch {}
  try { await db.execAsync('ALTER TABLE mobile_orders ADD COLUMN proofImageUri TEXT DEFAULT "";'); } catch {}
  try { await db.execAsync('ALTER TABLE import_meta ADD COLUMN fileName TEXT DEFAULT "";'); } catch {}
  try { await db.execAsync('ALTER TABLE import_meta ADD COLUMN deliveryPersonFilter TEXT DEFAULT "";'); } catch {}
  try { await db.execAsync('ALTER TABLE import_meta ADD COLUMN totalAmount REAL DEFAULT 0;'); } catch {}
}

function isGzipFile(fileName: string, bytes: Uint8Array) {
  return fileName.toLowerCase().endsWith('.gz') || (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

async function readPickedFileAsJson(uri: string, fileName: string): Promise<string> {
  const base64Content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = new Uint8Array(Buffer.from(base64Content, 'base64'));
  if (isGzipFile(fileName, bytes)) {
    return pako.ungzip(bytes, { to: 'string' }) as string;
  }
  return Buffer.from(bytes).toString('utf-8');
}

async function ensureArchiveDir() {
  const info = await FileSystem.getInfoAsync(ARCHIVE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ARCHIVE_DIR, { intermediates: true });
  }
}

async function cleanupOldArchives() {
  await ensureArchiveDir();
  const names = await FileSystem.readDirectoryAsync(ARCHIVE_DIR);
  const entries: Array<{ path: string; modified: number }> = [];
  for (const name of names) {
    const path = `${ARCHIVE_DIR}${name}`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      entries.push({ path, modified: info.modificationTime || 0 });
    }
  }
  entries.sort((a, b) => b.modified - a.modified);
  const toDelete = entries.slice(KEEP_ARCHIVES_COUNT);
  for (const entry of toDelete) {
    await FileSystem.deleteAsync(entry.path, { idempotent: true });
  }
}

async function archiveAsGzip(jsonText: string): Promise<string> {
  await ensureArchiveDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = `${ARCHIVE_DIR}import-${timestamp}.json.gz`;
  const gzBytes = pako.gzip(jsonText);
  const base64 = Buffer.from(gzBytes).toString('base64');
  await FileSystem.writeAsStringAsync(archivePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await cleanupOldArchives();
  return archivePath;
}

function requiredSpaceBytes(fileSizeBytes: number) {
  // x4 for decompression + SQLite overhead + safety margin (50 MB)
  return Math.max(fileSizeBytes * 4, 50 * 1024 * 1024);
}

export function getAvailableDiskSpace() {
  return Number(Paths.availableDiskSpace || 0);
}

async function assertEnoughDiskSpace(fileUri: string, fileSizeFromPicker?: number | null) {
  let fileSize = fileSizeFromPicker || 0;
  if (!fileSize) {
    const info = await FileSystem.getInfoAsync(fileUri);
    fileSize = info.exists && typeof info.size === 'number' ? info.size : 0;
  }
  const freeBytes = getAvailableDiskSpace();
  if (!freeBytes) return;
  if (freeBytes < requiredSpaceBytes(fileSize)) {
    throw new Error('Espace disque insuffisant pour importer ce fichier');
  }
}

async function importClientsInChunks(db: SQLite.SQLiteDatabase, clients: ClientItem[]) {
  const chunkSize = 500;
  for (let i = 0; i < clients.length; i += chunkSize) {
    const chunk = clients.slice(i, i + chunkSize);
    for (const c of chunk) {
      await db.runAsync(
        `INSERT INTO clients (id, name, phone, address, totalPurchases, totalSpent) VALUES (?, ?, ?, ?, ?, ?)`,
        c.id,
        c.name || '',
        c.phone || '',
        c.address || '',
        Number(c.totalPurchases || 0),
        Number(c.totalSpent || 0)
      );
    }
  }
}

async function importPendingInChunks(db: SQLite.SQLiteDatabase, items: PendingDeliveryItem[]) {
  const chunkSize = 500;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    for (const p of chunk) {
      await db.runAsync(
        `INSERT INTO pending_deliveries (
          id, orderId, orderNumber, clientName, pendingQuantity, paidAmount, paymentStatus, limitDate, notes, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.orderId || '',
        p.orderNumber || '',
        p.clientName || '',
        Number(p.pendingQuantity || 0),
        Number(p.paidAmount || 0),
        p.paymentStatus || '',
        p.limitDate || '',
        p.notes || '',
        p.updatedAt || ''
      );
    }
  }
}

async function importStatsInChunks(db: SQLite.SQLiteDatabase, stats: DeliveryStat[]) {
  const chunkSize = 500;
  for (let i = 0; i < stats.length; i += chunkSize) {
    const chunk = stats.slice(i, i + chunkSize);
    for (const s of chunk) {
      await db.runAsync(
        `INSERT INTO delivery_stats (date, pendingCount, paidAmount) VALUES (?, ?, ?)`,
        s.date,
        Number(s.pendingCount || 0),
        Number(s.paidAmount || 0)
      );
    }
  }
}

const normalizeOrderKeyPart = (value?: string) => String(value || '').trim().toLowerCase();

const buildOrderLookupKey = (order: { orderNumber?: string; clientName?: string }) => (
  `${normalizeOrderKeyPart(order.orderNumber)}||${normalizeOrderKeyPart(order.clientName)}`
);

type ExistingProofMaps = {
  byId: Map<string, string>;
  byKey: Map<string, string>;
};

async function importOrdersInChunks(
  db: SQLite.SQLiteDatabase,
  orders: MobileOrder[],
  existingProofMaps?: ExistingProofMaps
) {
  const chunkSize = 200;
  for (let i = 0; i < orders.length; i += chunkSize) {
    const chunk = orders.slice(i, i + chunkSize);
    for (const order of chunk) {
      const incomingProof = String(order.proofImageUri || '').trim();
      const preservedProofById = existingProofMaps?.byId.get(String(order.id || '')) || '';
      const preservedProofByKey = existingProofMaps?.byKey.get(buildOrderLookupKey(order)) || '';
      const proofImageUri = incomingProof || preservedProofById || preservedProofByKey || '';
      await db.runAsync(
        `INSERT INTO mobile_orders (
          id, orderNumber, clientName, clientPhone, deliveryDate, shippingAddress, status,
          paymentMethod, paymentReference, deliveryPerson, isPersonalTransportParcel, proofImageUri, totalAmount, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        order.id,
        order.orderNumber || '',
        order.clientName || '',
        order.clientPhone || '',
        order.deliveryDate || '',
        order.shippingAddress || '',
        order.status || '',
        order.paymentMethod || '',
        order.paymentReference || '',
        order.deliveryPerson || '',
        order.isPersonalTransportParcel ? 1 : 0,
        proofImageUri,
        Number(order.totalAmount || 0),
        order.createdAt || ''
      );
      const items: MobileOrderItem[] = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        await db.runAsync(
          `INSERT INTO mobile_order_items (
            id, orderId, productId, variantId, productName, variantSize, variantColor, quantity, unitPrice, totalPrice
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.id || `${order.id}-${item.productId || 'item'}-${item.variantId || 'v'}`,
          order.id,
          item.productId || '',
          item.variantId || '',
          item.productName || '',
          item.variantSize || '',
          item.variantColor || '',
          Number(item.quantity || 0),
          Number(item.unitPrice || 0),
          Number(item.totalPrice || 0)
        );
      }
    }
  }
}

export async function importMobileFile(options: {
  uri: string;
  fileName: string;
  fileSize?: number | null;
}) {
  await assertEnoughDiskSpace(options.uri, options.fileSize);
  const jsonText = await readPickedFileAsJson(options.uri, options.fileName);
  const parsed = JSON.parse(jsonText) as MobileExportData;
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.deliveryDailyStats)) {
    throw new Error('Fichier mobile invalide');
  }

  const archivePath = await archiveAsGzip(jsonText);
  return await importParsedData(parsed, {
    archivePath,
    fileName: options.fileName,
  });
}

async function importParsedData(
  parsed: MobileExportData,
  options: { archivePath: string; fileName?: string }
) {
  const computeNetTotal = (orders: MobileOrder[]) => {
    const activeOrders = orders.filter((o) => !isCancelledStatus(o.status));
    const gross = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const parcelCount = activeOrders.filter((o) => Boolean(o.isPersonalTransportParcel)).length;
    return Math.max(0, gross - (parcelCount * PARCEL_DISCOUNT));
  };
  const db = await getDb();
  const existingOrderRows = await db.getAllAsync<{
    id: string;
    orderNumber: string;
    clientName: string;
    proofImageUri: string;
  }>(
    `SELECT id, orderNumber, clientName, proofImageUri
     FROM mobile_orders
     WHERE TRIM(COALESCE(proofImageUri, '')) != ''`
  );
  const existingProofMaps: ExistingProofMaps = {
    byId: new Map<string, string>(),
    byKey: new Map<string, string>(),
  };
  for (const row of existingOrderRows) {
    const proof = String(row.proofImageUri || '').trim();
    if (!proof) continue;
    if (row.id) {
      existingProofMaps.byId.set(String(row.id), proof);
    }
    const key = buildOrderLookupKey(row);
    if (key !== '||') {
      existingProofMaps.byKey.set(key, proof);
    }
  }
  await db.execAsync('BEGIN');
  try {
    await db.execAsync('DELETE FROM clients; DELETE FROM pending_deliveries; DELETE FROM delivery_stats; DELETE FROM mobile_order_items; DELETE FROM mobile_orders;');
    await importClientsInChunks(db, parsed.clients);
    await importPendingInChunks(db, parsed.pendingDeliveries || []);
    await importStatsInChunks(db, parsed.deliveryDailyStats || []);
    await importOrdersInChunks(db, parsed.orders || [], existingProofMaps);
    const totalAmount = computeNetTotal(parsed.orders || []);
    const insertMeta = await db.runAsync(
      `INSERT INTO import_meta (importedAt, archivePath, schemaVersion, userId, fileName, deliveryPersonFilter, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      new Date().toISOString(),
      options.archivePath,
      Number(parsed.schemaVersion || 1),
      parsed.userId || '',
      options.fileName || '',
      parsed.exportContext?.deliveryPersonFilter || '',
      totalAmount
    );
    await db.execAsync('COMMIT');
    const currentImportId = Number(insertMeta.lastInsertRowId || 0);
    return {
      archivePath: options.archivePath,
      importedAt: parsed.exportedAt || new Date().toISOString(),
      clientsCount: parsed.clients.length,
      statsCount: (parsed.deliveryDailyStats || []).length,
      pendingCount: (parsed.pendingDeliveries || []).length,
      ordersCount: (parsed.orders || []).length,
      totalAmount: computeNetTotal(parsed.orders || []),
      deliveryPersonFilter: parsed.exportContext?.deliveryPersonFilter || '',
      currentImportId,
    };
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function getLastImportMeta() {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: number;
    importedAt: string;
    archivePath: string;
    schemaVersion: number;
    userId: string;
    fileName: string;
    deliveryPersonFilter: string;
    totalAmount: number;
  }>(
    `SELECT id, importedAt, archivePath, schemaVersion, userId, fileName, deliveryPersonFilter, totalAmount
     FROM import_meta
     ORDER BY id DESC
     LIMIT 1`
  );
  return row || null;
}

export async function listImportHistory(): Promise<ImportHistoryItem[]> {
  const db = await getDb();
  const latest = await db.getFirstAsync<{ id: number }>(
    `SELECT id
     FROM import_meta
     ORDER BY id DESC
     LIMIT 1`
  );
  if (latest?.id) {
    const orders = await getOrders();
    const activeOrders = orders.filter((o) => !isCancelledStatus(o.status));
    const gross = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const parcelCount = activeOrders.filter((o) => Boolean(o.isPersonalTransportParcel)).length;
    const net = Math.max(0, gross - (parcelCount * PARCEL_DISCOUNT));
    await db.runAsync(
      `UPDATE import_meta
       SET totalAmount = ?
       WHERE id = ?`,
      net,
      latest.id
    );
  }
  return await db.getAllAsync<ImportHistoryItem>(
    `SELECT id, importedAt, archivePath, schemaVersion, userId, fileName, deliveryPersonFilter, totalAmount
     FROM import_meta
     ORDER BY id DESC
     LIMIT 50`
  );
}

export async function reimportByHistoryId(historyId: number) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ archivePath: string; fileName: string }>(
    `SELECT archivePath, fileName
     FROM import_meta
     WHERE id = ?`,
    historyId
  );
  if (!row?.archivePath) {
    throw new Error('Archive introuvable');
  }
  const base64 = await FileSystem.readAsStringAsync(row.archivePath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  const jsonText = pako.ungzip(bytes, { to: 'string' }) as string;
  const parsed = JSON.parse(jsonText) as MobileExportData;
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.deliveryDailyStats)) {
    throw new Error('Archive invalide');
  }
  return await importParsedData(parsed, {
    archivePath: row.archivePath,
    fileName: row.fileName || '',
  });
}

export async function saveCurrentImportSnapshot(importId?: number) {
  const db = await getDb();
  const target = importId
    ? await db.getFirstAsync<{
      id: number;
      archivePath: string;
      schemaVersion: number;
      userId: string;
      fileName: string;
      deliveryPersonFilter: string;
    }>(
      `SELECT id, archivePath, schemaVersion, userId, fileName, deliveryPersonFilter
       FROM import_meta
       WHERE id = ?
       LIMIT 1`,
      importId
    )
    : await db.getFirstAsync<{
      id: number;
      archivePath: string;
      schemaVersion: number;
      userId: string;
      fileName: string;
      deliveryPersonFilter: string;
    }>(
      `SELECT id, archivePath, schemaVersion, userId, fileName, deliveryPersonFilter
       FROM import_meta
       ORDER BY id DESC
       LIMIT 1`
    );

  if (!target?.archivePath) {
    throw new Error('Aucun fichier importé à enregistrer');
  }

  const clients = await db.getAllAsync<ClientItem>(
    `SELECT id, name, phone, address, totalPurchases, totalSpent
     FROM clients
     ORDER BY name ASC`
  );
  const pendingDeliveries = await db.getAllAsync<PendingDeliveryItem>(
    `SELECT id, orderId, orderNumber, clientName, pendingQuantity, paidAmount, paymentStatus, limitDate, notes, updatedAt
     FROM pending_deliveries
     ORDER BY updatedAt DESC`
  );
  const deliveryDailyStats = await db.getAllAsync<DeliveryStat>(
    `SELECT date, pendingCount, paidAmount
     FROM delivery_stats
     ORDER BY date DESC`
  );
  const orders = await getOrders();
  const activeOrders = orders.filter((o) => !isCancelledStatus(o.status));
  const gross = activeOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const parcelCount = activeOrders.filter((o) => Boolean(o.isPersonalTransportParcel)).length;
  const totalAmount = Math.max(0, gross - (parcelCount * PARCEL_DISCOUNT));

  const payload: MobileExportData = {
    schemaVersion: Number(target.schemaVersion || 1),
    exportedAt: new Date().toISOString(),
    userId: target.userId || '',
    clients,
    pendingDeliveries,
    deliveryDailyStats,
    orders,
    exportContext: {
      source: 'mobile-local-save',
      deliveryPersonFilter: target.deliveryPersonFilter || '',
    },
  };

  const gzBytes = pako.gzip(JSON.stringify(payload));
  const base64 = Buffer.from(gzBytes).toString('base64');
  await FileSystem.writeAsStringAsync(target.archivePath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await db.runAsync(
    `UPDATE import_meta
     SET totalAmount = ?, importedAt = ?
     WHERE id = ?`,
    totalAmount,
    new Date().toISOString(),
    target.id
  );

  return {
    importId: target.id,
    archivePath: target.archivePath,
    totalAmount,
    ordersCount: orders.length,
    clientsCount: clients.length,
  };
}

export async function getClients(search?: string) {
  const db = await getDb();
  if (!search?.trim()) {
    return await db.getAllAsync<ClientItem>(
      `SELECT id, name, phone, address, totalPurchases, totalSpent
       FROM clients
       ORDER BY name ASC`
    );
  }
  const query = `%${search.trim().toLowerCase()}%`;
  return await db.getAllAsync<ClientItem>(
    `SELECT id, name, phone, address, totalPurchases, totalSpent
     FROM clients
     WHERE LOWER(name) LIKE ? OR LOWER(phone) LIKE ?
     ORDER BY name ASC`,
    query,
    query
  );
}

export async function getDeliveryStats() {
  const db = await getDb();
  return await db.getAllAsync<DeliveryStat>(
    `SELECT date, pendingCount, paidAmount
     FROM delivery_stats
     ORDER BY date DESC
     LIMIT 120`
  );
}

export async function getOrders(search?: string) {
  const db = await getDb();
  const orders = !search?.trim()
    ? await db.getAllAsync<Omit<MobileOrder, 'items'>>(
      `SELECT id, orderNumber, clientName, clientPhone, deliveryDate, shippingAddress, status, paymentMethod, paymentReference, deliveryPerson, totalAmount, createdAt, proofImageUri
       , isPersonalTransportParcel
       FROM mobile_orders
       ORDER BY createdAt DESC`
    )
    : await db.getAllAsync<Omit<MobileOrder, 'items'>>(
      `SELECT id, orderNumber, clientName, clientPhone, deliveryDate, shippingAddress, status, paymentMethod, paymentReference, deliveryPerson, totalAmount, createdAt, proofImageUri
       , isPersonalTransportParcel
       FROM mobile_orders
       WHERE LOWER(clientName) LIKE ? OR LOWER(orderNumber) LIKE ?
       ORDER BY createdAt DESC`,
      `%${search.trim().toLowerCase()}%`,
      `%${search.trim().toLowerCase()}%`
    );

  const result: MobileOrder[] = [];
  for (const order of orders) {
    const items = await db.getAllAsync<MobileOrderItem>(
      `SELECT id, productId, variantId, productName, variantSize, variantColor, quantity, unitPrice, totalPrice
       FROM mobile_order_items
       WHERE orderId = ?`,
      order.id
    );
    result.push({ ...order, isPersonalTransportParcel: Boolean((order as unknown as { isPersonalTransportParcel?: number }).isPersonalTransportParcel), items });
  }
  return result;
}

export async function updateClient(client: ClientItem) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE clients
     SET name = ?, phone = ?, address = ?, totalPurchases = ?, totalSpent = ?
     WHERE id = ?`,
    client.name || '',
    client.phone || '',
    client.address || '',
    Number(client.totalPurchases || 0),
    Number(client.totalSpent || 0),
    client.id
  );
}

export async function deleteClient(clientId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM clients WHERE id = ?', clientId);
}

export async function updateOrder(order: MobileOrder) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE mobile_orders
     SET clientName = ?, clientPhone = ?, shippingAddress = ?, status = ?, totalAmount = ?, paymentMethod = ?, paymentReference = ?, deliveryPerson = ?, deliveryDate = ?, isPersonalTransportParcel = ?, proofImageUri = ?
     WHERE id = ?`,
    order.clientName || '',
    order.clientPhone || '',
    order.shippingAddress || '',
    order.status || '',
    Number(order.totalAmount || 0),
    order.paymentMethod || '',
    order.paymentReference || '',
    order.deliveryPerson || '',
    order.deliveryDate || '',
    order.isPersonalTransportParcel ? 1 : 0,
    order.proofImageUri || '',
    order.id
  );
}

export async function deleteOrder(orderId: string) {
  const db = await getDb();
  await db.execAsync('BEGIN');
  try {
    await db.runAsync('DELETE FROM mobile_order_items WHERE orderId = ?', orderId);
    await db.runAsync('DELETE FROM mobile_orders WHERE id = ?', orderId);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function createOrder(order: Omit<MobileOrder, 'id' | 'createdAt'>) {
  const db = await getDb();
  const id = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const autoDeliveryDate = order.deliveryDate || createdAt.slice(0, 10);
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      `INSERT INTO mobile_orders (
        id, orderNumber, clientName, clientPhone, deliveryDate, shippingAddress, status,
        paymentMethod, paymentReference, deliveryPerson, isPersonalTransportParcel, proofImageUri, totalAmount, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      order.orderNumber || '',
      order.clientName || '',
      order.clientPhone || '',
      autoDeliveryDate,
      order.shippingAddress || '',
      order.status || '',
      order.paymentMethod || '',
      order.paymentReference || '',
      order.deliveryPerson || '',
      order.isPersonalTransportParcel ? 1 : 0,
      order.proofImageUri || '',
      Number(order.totalAmount || 0),
      createdAt
    );
    for (const item of order.items || []) {
      await db.runAsync(
        `INSERT INTO mobile_order_items (
          id, orderId, productId, variantId, productName, variantSize, variantColor, quantity, unitPrice, totalPrice
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id || `${id}-${Math.random().toString(36).slice(2, 7)}`,
        id,
        item.productId || '',
        item.variantId || '',
        item.productName || '',
        item.variantSize || '',
        item.variantColor || '',
        Number(item.quantity || 0),
        Number(item.unitPrice || 0),
        Number(item.totalPrice || 0)
      );
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
  return { id, createdAt };
}
