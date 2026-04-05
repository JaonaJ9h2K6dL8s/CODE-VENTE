import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

let DB_DIR: string;
if (process.env.APP_DATA_DIR) {
  DB_DIR = path.resolve(process.env.APP_DATA_DIR);
} else {
  DB_DIR = path.join(process.cwd(), 'data');
}

// In production, better-sqlite3 native module loading might fail if paths are weird.
// We should log this.
const logPath = path.join(DB_DIR, '..', 'logs', 'db.log');
function logDb(msg: string) {
    try {
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {}
}

let DB_PATH = path.join(DB_DIR, 'vente-en-ligne.db');

function getErrorInfo(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error), stack: undefined };
}

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (error: unknown) {
    const info = getErrorInfo(error);
    console.error('Failed to create DB directory:', error);
    logDb(`Failed to create DB directory: ${info.message}`);
    // Fallback to temp dir if write permission denied (e.g. in Program Files)
    if (!process.env.APP_DATA_DIR) {
        const tmpDir = path.join(os.tmpdir(), 'vente-en-ligne-data');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        DB_DIR = tmpDir;
        DB_PATH = path.join(DB_DIR, 'vente-en-ligne.db');
    }
  }
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    try {
        console.log(`Opening database at: ${DB_PATH}`);
        logDb(`Opening database at: ${DB_PATH}`);
        
        // Try to load better-sqlite3 explicitly to catch module errors
        try {
            db = new Database(DB_PATH, { verbose: (msg) => logDb(`[SQL] ${msg}`) });
        } catch (loadError: unknown) {
            const info = getErrorInfo(loadError);
            logDb(`Initial DB load failed: ${info.message}`);
            // If it's the module version mismatch, we can't do much but log it
            throw loadError;
        }
    } catch (e: unknown) {
        const info = getErrorInfo(e);
        console.error('Failed to open database:', e);
        logDb(`Failed to open database: ${info.message}\nStack: ${info.stack || ''}`);
        
        // Fallback for development or permission issues
        const fallbackPath = path.join(process.cwd(), 'vente-en-ligne.db');
        logDb(`Attempting fallback database at: ${fallbackPath}`);
        try {
            db = new Database(fallbackPath);
        } catch (fallbackError: unknown) {
             const fallbackInfo = getErrorInfo(fallbackError);
             logDb(`Fallback failed: ${fallbackInfo.message}`);
             throw new Error(`Critical: Could not open database at ${DB_PATH} or ${fallbackPath}. Original error: ${info.message}`);
        }
    }
    try {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
        db.pragma('temp_store = MEMORY');
        db.pragma('cache_size = -32768');
        db.pragma('mmap_size = 268435456');
        db.pragma('busy_timeout = 5000');
        db.pragma('wal_autocheckpoint = 1000');
        initializeDatabase(db);
        migrateDatabase(db);
    } catch (initError: unknown) {
        const info = getErrorInfo(initError);
        console.error('Database initialization failed:', initError);
        logDb(`Database initialization failed: ${info.message}`);
        throw new Error(`Database initialization failed: ${info.message}`);
    }
  }
  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Clients table
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      facebookPseudo TEXT DEFAULT '',
      nif TEXT DEFAULT '',
      stat TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      totalPurchases INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      code TEXT DEFAULT '',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      imageUrl TEXT DEFAULT '',
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Product variants table
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      size TEXT DEFAULT '',
      color TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      sku TEXT DEFAULT '',
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Live sessions table
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      isActive INTEGER DEFAULT 1,
      startedAt TEXT NOT NULL DEFAULT (datetime('now')),
      endedAt TEXT,
      totalOrders INTEGER DEFAULT 0,
      totalRevenue REAL DEFAULT 0
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      orderNumber TEXT DEFAULT '',
      clientId TEXT NOT NULL,
      clientName TEXT NOT NULL,
      clientFacebook TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      paymentMethod TEXT DEFAULT NULL,
      paymentReference TEXT DEFAULT '',
      deliveryPerson TEXT DEFAULT '',
      totalAmount REAL NOT NULL DEFAULT 0,
      isLiveOrder INTEGER DEFAULT 0,
      liveSessionId TEXT,
      notes TEXT DEFAULT '',
      shippingAddress TEXT DEFAULT '',
      clientPhone TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (liveSessionId) REFERENCES live_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_locations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      placeName TEXT NOT NULL,
      deliveryPerson TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      variantId TEXT NOT NULL,
      variantSize TEXT DEFAULT '',
      variantColor TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL DEFAULT 0,
      totalPrice REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id),
      FOREIGN KEY (variantId) REFERENCES product_variants(id)
    );

    -- Activity logs table
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      userId TEXT DEFAULT '',
      username TEXT DEFAULT 'system',
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entityId TEXT DEFAULT '',
      details TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Stock movements table
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      productId TEXT NOT NULL,
      variantId TEXT DEFAULT '',
      productCode TEXT DEFAULT '',
      productName TEXT NOT NULL,
      unit TEXT DEFAULT '',
      size TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      movementType TEXT NOT NULL DEFAULT 'in',
      reason TEXT DEFAULT '',
      createdBy TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES products(id),
      FOREIGN KEY (variantId) REFERENCES product_variants(id)
    );

    CREATE TABLE IF NOT EXISTS product_serials (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      productId TEXT NOT NULL,
      variantId TEXT NOT NULL,
      serialNumber TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_stock',
      movementId TEXT DEFAULT '',
      branchName TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES products(id),
      FOREIGN KEY (variantId) REFERENCES product_variants(id)
    );

    -- Purchase needs table
    CREATE TABLE IF NOT EXISTS purchase_needs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      requester TEXT DEFAULT '',
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Purchase invoices table
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      supplier TEXT DEFAULT '',
      invoiceNumber TEXT DEFAULT '',
      invoiceDate TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      productId TEXT NOT NULL,
      variantId TEXT NOT NULL,
      productName TEXT NOT NULL,
      variantSize TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      unitCost REAL NOT NULL DEFAULT 0,
      totalCost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id),
      FOREIGN KEY (variantId) REFERENCES product_variants(id)
    );

    -- Production needs table
    CREATE TABLE IF NOT EXISTS production_needs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      source TEXT DEFAULT '',
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      createdBy TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Production print orders (DTF)
    CREATE TABLE IF NOT EXISTS production_print_orders (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      requestDate TEXT DEFAULT '',
      requester TEXT DEFAULT '',
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_sewing_entries (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      productId TEXT NOT NULL,
      variantId TEXT NOT NULL,
      productName TEXT NOT NULL,
      variantSize TEXT DEFAULT '',
      productionNumber TEXT DEFAULT '',
      movementId TEXT DEFAULT '',
      chainName TEXT DEFAULT '',
      chiefName TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      createdBy TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES products(id),
      FOREIGN KEY (variantId) REFERENCES product_variants(id)
    );

    CREATE TABLE IF NOT EXISTS pending_deliveries (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL DEFAULT '',
      orderId TEXT NOT NULL,
      orderNumber TEXT DEFAULT '',
      clientName TEXT NOT NULL DEFAULT '',
      pendingQuantity INTEGER NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      paymentStatus TEXT NOT NULL DEFAULT 'unpaid',
      limitDate TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
    );

  `);

  // Seed default admin user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
    ).run('usr_admin', 'admin', hashedPassword, 'admin');
  }

  // Migrations: add new columns to existing tables
  const clientColumns = db.prepare("PRAGMA table_info(clients)").all() as Array<{ name: string }>;
  const clientColNames = clientColumns.map(c => c.name);
  if (!clientColNames.includes('userId')) {
    db.exec(`ALTER TABLE clients ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
  }
  if (!clientColNames.includes('nif')) {
    db.exec(`ALTER TABLE clients ADD COLUMN nif TEXT DEFAULT ''`);
  }
  if (!clientColNames.includes('stat')) {
    db.exec(`ALTER TABLE clients ADD COLUMN stat TEXT DEFAULT ''`);
  }
  if (!clientColNames.includes('createdAt')) {
    db.exec(`ALTER TABLE clients ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`);
  }
  if (!clientColNames.includes('updatedAt')) {
    db.exec(`ALTER TABLE clients ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''`);
  }

  const productColumns = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
  const productColNames = productColumns.map(c => c.name);
  if (!productColNames.includes('userId')) {
    db.exec(`ALTER TABLE products ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
  }
  if (!productColNames.includes('code')) {
    db.exec(`ALTER TABLE products ADD COLUMN code TEXT DEFAULT ''`);
  }
  if (!productColNames.includes('description')) {
    db.exec(`ALTER TABLE products ADD COLUMN description TEXT DEFAULT ''`);
  }
  if (!productColNames.includes('category')) {
    db.exec(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT ''`);
  }
  if (!productColNames.includes('unit')) {
    db.exec(`ALTER TABLE products ADD COLUMN unit TEXT DEFAULT ''`);
  }
  if (!productColNames.includes('imageUrl')) {
    db.exec(`ALTER TABLE products ADD COLUMN imageUrl TEXT DEFAULT ''`);
  }
  if (!productColNames.includes('isActive')) {
    db.exec(`ALTER TABLE products ADD COLUMN isActive INTEGER DEFAULT 1`);
  }
  if (!productColNames.includes('createdAt')) {
    db.exec(`ALTER TABLE products ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`);
  }
  if (!productColNames.includes('updatedAt')) {
    db.exec(`ALTER TABLE products ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''`);
  }

  const variantColumns = db.prepare("PRAGMA table_info(product_variants)").all() as Array<{ name: string }>;
  const variantColNames = variantColumns.map(c => c.name);
  if (!variantColNames.includes('size')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN size TEXT DEFAULT ''`);
  }
  if (!variantColNames.includes('color')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN color TEXT DEFAULT ''`);
  }
  if (!variantColNames.includes('price')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN price REAL NOT NULL DEFAULT 0`);
  }
  if (!variantColNames.includes('stock')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN stock INTEGER NOT NULL DEFAULT 0`);
  }
  if (!variantColNames.includes('sku')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN sku TEXT DEFAULT ''`);
  }

  const orderColumns = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
  const colNames = orderColumns.map(c => c.name);
  if (!colNames.includes('userId')) {
    db.exec(`ALTER TABLE orders ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.includes('orderNumber')) {
    db.exec(`ALTER TABLE orders ADD COLUMN orderNumber TEXT DEFAULT ''`);
  }
  if (!colNames.includes('clientName')) {
    db.exec(`ALTER TABLE orders ADD COLUMN clientName TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.includes('clientFacebook')) {
    db.exec(`ALTER TABLE orders ADD COLUMN clientFacebook TEXT DEFAULT ''`);
  }
  if (!colNames.includes('status')) {
    db.exec(`ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
  }
  if (!colNames.includes('paymentMethod')) {
    db.exec(`ALTER TABLE orders ADD COLUMN paymentMethod TEXT DEFAULT NULL`);
  }
  if (!colNames.includes('paymentReference')) {
    db.exec(`ALTER TABLE orders ADD COLUMN paymentReference TEXT DEFAULT ''`);
  }
  if (!colNames.includes('deliveryPerson')) {
    db.exec(`ALTER TABLE orders ADD COLUMN deliveryPerson TEXT DEFAULT ''`);
  }
  if (!colNames.includes('totalAmount')) {
    db.exec(`ALTER TABLE orders ADD COLUMN totalAmount REAL NOT NULL DEFAULT 0`);
  }
  if (!colNames.includes('isLiveOrder')) {
    db.exec(`ALTER TABLE orders ADD COLUMN isLiveOrder INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('liveSessionId')) {
    db.exec(`ALTER TABLE orders ADD COLUMN liveSessionId TEXT DEFAULT NULL`);
  }
  if (!colNames.includes('notes')) {
    db.exec(`ALTER TABLE orders ADD COLUMN notes TEXT DEFAULT ''`);
  }
  if (!colNames.includes('shippingAddress')) {
    db.exec(`ALTER TABLE orders ADD COLUMN shippingAddress TEXT DEFAULT ''`);
  }
  if (!colNames.includes('clientPhone')) {
    db.exec(`ALTER TABLE orders ADD COLUMN clientPhone TEXT DEFAULT ''`);
  }
  if (!colNames.includes('deliveryDate')) {
    db.exec(`ALTER TABLE orders ADD COLUMN deliveryDate TEXT DEFAULT NULL`);
  }
  if (!colNames.includes('createdAt')) {
    db.exec(`ALTER TABLE orders ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.includes('updatedAt')) {
    db.exec(`ALTER TABLE orders ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(orderNumber)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(deliveryDate)`);

  const orderItemColumns = db.prepare("PRAGMA table_info(order_items)").all() as Array<{ name: string }>;
  const orderItemNames = orderItemColumns.map(c => c.name);
  if (!orderItemNames.includes('productName')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN productName TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderItemNames.includes('variantSize')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN variantSize TEXT DEFAULT ''`);
  }
  if (!orderItemNames.includes('variantColor')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN variantColor TEXT DEFAULT ''`);
  }
  if (!orderItemNames.includes('unitPrice')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN unitPrice REAL NOT NULL DEFAULT 0`);
  }
  if (!orderItemNames.includes('totalPrice')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN totalPrice REAL NOT NULL DEFAULT 0`);
  }

  const productVariantColumns = db.prepare("PRAGMA table_info(product_variants)").all() as Array<{ name: string }>;
  const productVariantNames = productVariantColumns.map(c => c.name);
  if (!productVariantNames.includes('productId')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN productId TEXT NOT NULL DEFAULT ''`);
  }
  if (!productVariantNames.includes('size')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN size TEXT DEFAULT ''`);
  }
  if (!productVariantNames.includes('color')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN color TEXT DEFAULT ''`);
  }
  if (!productVariantNames.includes('price')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN price REAL NOT NULL DEFAULT 0`);
  }
  if (!productVariantNames.includes('stock')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN stock INTEGER NOT NULL DEFAULT 0`);
  }
  if (!productVariantNames.includes('sku')) {
    db.exec(`ALTER TABLE product_variants ADD COLUMN sku TEXT DEFAULT ''`);
  }

  const liveColumns = db.prepare("PRAGMA table_info(live_sessions)").all() as Array<{ name: string }>;
  const liveColNames = liveColumns.map(c => c.name);
  if (!liveColNames.includes('userId')) {
    db.exec(`ALTER TABLE live_sessions ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
  }
  if (!liveColNames.includes('createdAt')) {
    db.exec(`ALTER TABLE live_sessions ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`);
  }
  if (!liveColNames.includes('updatedAt')) {
    db.exec(`ALTER TABLE live_sessions ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''`);
  }

  const deliveryColumns = db.prepare("PRAGMA table_info(delivery_locations)").all() as Array<{ name: string }>;
  const deliveryColNames = deliveryColumns.map(c => c.name);
  if (!deliveryColNames.includes('userId')) {
    db.exec(`ALTER TABLE delivery_locations ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
  }
  if (!deliveryColNames.includes('deliveryPerson')) {
    db.exec(`ALTER TABLE delivery_locations ADD COLUMN deliveryPerson TEXT NOT NULL DEFAULT ''`);
  }
  if (!deliveryColNames.includes('createdAt')) {
    db.exec(`ALTER TABLE delivery_locations ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`);
  }
  if (!deliveryColNames.includes('updatedAt')) {
    db.exec(`ALTER TABLE delivery_locations ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`UPDATE clients SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);
  db.exec(`UPDATE clients SET createdAt = datetime('now') WHERE createdAt IS NULL OR createdAt = ''`);
  db.exec(`UPDATE clients SET updatedAt = datetime('now') WHERE updatedAt IS NULL OR updatedAt = ''`);
  db.exec(`UPDATE products SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);
  db.exec(`UPDATE products SET createdAt = datetime('now') WHERE createdAt IS NULL OR createdAt = ''`);
  db.exec(`UPDATE products SET updatedAt = datetime('now') WHERE updatedAt IS NULL OR updatedAt = ''`);
  db.exec(`UPDATE orders SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);
  db.exec(`UPDATE orders SET createdAt = datetime('now') WHERE createdAt IS NULL OR createdAt = ''`);
  db.exec(`UPDATE orders SET updatedAt = datetime('now') WHERE updatedAt IS NULL OR updatedAt = ''`);
  db.exec(`UPDATE live_sessions SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);
  db.exec(`UPDATE live_sessions SET createdAt = datetime('now') WHERE createdAt IS NULL OR createdAt = ''`);
  db.exec(`UPDATE live_sessions SET updatedAt = datetime('now') WHERE updatedAt IS NULL OR updatedAt = ''`);
  db.exec(`UPDATE delivery_locations SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);
  db.exec(`UPDATE delivery_locations SET createdAt = datetime('now') WHERE createdAt IS NULL OR createdAt = ''`);
  db.exec(`UPDATE delivery_locations SET updatedAt = datetime('now') WHERE updatedAt IS NULL OR updatedAt = ''`);
  db.exec(`UPDATE activity_logs SET userId = 'usr_admin' WHERE userId IS NULL OR userId = ''`);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clients_facebook ON clients(facebookPseudo);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
    CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(userId);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
    CREATE INDEX IF NOT EXISTS idx_products_user ON products(userId);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(productId);
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
    CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(clientId);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(createdAt);
    CREATE INDEX IF NOT EXISTS idx_orders_live ON orders(liveSessionId);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(userId);
    CREATE INDEX IF NOT EXISTS idx_delivery_locations_user ON delivery_locations(userId);
    CREATE INDEX IF NOT EXISTS idx_delivery_locations_place ON delivery_locations(placeName);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(orderId);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(createdAt);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity);
    CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, createdAt);
    CREATE INDEX IF NOT EXISTS idx_orders_live_session ON orders(isLiveOrder, liveSessionId);
    CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(productId);
    CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variantId);
    CREATE INDEX IF NOT EXISTS idx_variants_stock ON product_variants(stock) WHERE stock <= 5;
    CREATE INDEX IF NOT EXISTS idx_live_sessions_active ON live_sessions(isActive);
    CREATE INDEX IF NOT EXISTS idx_live_sessions_user ON live_sessions(userId);
  `);

  const stockMovementColumns = db.prepare("PRAGMA table_info(stock_movements)").all() as Array<{ name: string }>;
  if (stockMovementColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        productId TEXT NOT NULL,
        variantId TEXT DEFAULT '',
        productCode TEXT DEFAULT '',
        productName TEXT NOT NULL,
        unit TEXT DEFAULT '',
        size TEXT DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 0,
        movementType TEXT NOT NULL DEFAULT 'in',
        reason TEXT DEFAULT '',
        createdBy TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (productId) REFERENCES products(id),
        FOREIGN KEY (variantId) REFERENCES product_variants(id)
      );
    `);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(productId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON stock_movements(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(createdAt)`);

  const productSerialsColumns = db.prepare("PRAGMA table_info(product_serials)").all() as Array<{ name: string }>;
  if (productSerialsColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_serials (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        productId TEXT NOT NULL,
        variantId TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_stock',
        movementId TEXT DEFAULT '',
        branchName TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (productId) REFERENCES products(id),
        FOREIGN KEY (variantId) REFERENCES product_variants(id)
      );
    `);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_serials_user ON product_serials(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_serials_status ON product_serials(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_serials_product ON product_serials(productId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_serials_variant ON product_serials(variantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_product_serials_serial ON product_serials(serialNumber)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_serials_user_serial ON product_serials(userId, serialNumber)`);

  const purchaseNeedsColumns = db.prepare("PRAGMA table_info(purchase_needs)").all() as Array<{ name: string }>;
  if (purchaseNeedsColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_needs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        requester TEXT DEFAULT '',
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_needs_user ON purchase_needs(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_needs_date ON purchase_needs(createdAt)`);

  const purchaseInvoicesColumns = db.prepare("PRAGMA table_info(purchase_invoices)").all() as Array<{ name: string }>;
  if (purchaseInvoicesColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        supplier TEXT DEFAULT '',
        invoiceNumber TEXT DEFAULT '',
        invoiceDate TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        productId TEXT NOT NULL,
        variantId TEXT NOT NULL,
        productName TEXT NOT NULL,
        variantSize TEXT DEFAULT '',
        unit TEXT DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 0,
        unitCost REAL NOT NULL DEFAULT 0,
        totalCost REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (invoiceId) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id),
        FOREIGN KEY (variantId) REFERENCES product_variants(id)
      );
    `);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_invoices_user ON purchase_invoices(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(invoiceDate)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(invoiceId)`);

  const productionNeedsColumns = db.prepare("PRAGMA table_info(production_needs)").all() as Array<{ name: string }>;
  if (productionNeedsColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_needs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        source TEXT DEFAULT '',
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        createdBy TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_needs_user ON production_needs(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_needs_date ON production_needs(createdAt)`);

  const productionPrintColumns = db.prepare("PRAGMA table_info(production_print_orders)").all() as Array<{ name: string }>;
  if (productionPrintColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_print_orders (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        requestDate TEXT DEFAULT '',
        requester TEXT DEFAULT '',
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  const productionSewingColumns = db.prepare("PRAGMA table_info(production_sewing_entries)").all() as Array<{ name: string }>;
  if (productionSewingColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_sewing_entries (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        productId TEXT NOT NULL,
        variantId TEXT NOT NULL,
        productName TEXT NOT NULL,
        variantSize TEXT DEFAULT '',
        productionNumber TEXT DEFAULT '',
        movementId TEXT DEFAULT '',
        chainName TEXT DEFAULT '',
        chiefName TEXT DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        createdBy TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (productId) REFERENCES products(id),
        FOREIGN KEY (variantId) REFERENCES product_variants(id)
      );
    `);
  }
  const productionSewingColNames = productionSewingColumns.map(c => c.name);
  if (productionSewingColNames.length > 0 && !productionSewingColNames.includes('productionNumber')) {
    db.exec(`ALTER TABLE production_sewing_entries ADD COLUMN productionNumber TEXT DEFAULT ''`);
  }
  if (productionSewingColNames.length > 0 && !productionSewingColNames.includes('movementId')) {
    db.exec(`ALTER TABLE production_sewing_entries ADD COLUMN movementId TEXT DEFAULT ''`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_print_user ON production_print_orders(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_print_date ON production_print_orders(requestDate)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_sewing_user ON production_sewing_entries(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_production_sewing_date ON production_sewing_entries(createdAt)`);

  const pendingDeliveriesColumns = db.prepare("PRAGMA table_info(pending_deliveries)").all() as Array<{ name: string }>;
  if (pendingDeliveriesColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_deliveries (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL DEFAULT '',
        orderId TEXT NOT NULL,
        orderNumber TEXT DEFAULT '',
        clientName TEXT NOT NULL DEFAULT '',
        pendingQuantity INTEGER NOT NULL DEFAULT 0,
        paidAmount REAL NOT NULL DEFAULT 0,
        paymentStatus TEXT NOT NULL DEFAULT 'unpaid',
        limitDate TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      );
    `);
  }
  const pendingDeliveryColNames = pendingDeliveriesColumns.map(c => c.name);
  if (pendingDeliveryColNames.length > 0 && !pendingDeliveryColNames.includes('paidAmount')) {
    db.exec(`ALTER TABLE pending_deliveries ADD COLUMN paidAmount REAL NOT NULL DEFAULT 0`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_deliveries_user ON pending_deliveries(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_deliveries_order ON pending_deliveries(orderId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_deliveries_payment ON pending_deliveries(paymentStatus)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_deliveries_limit_date ON pending_deliveries(limitDate)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pending_deliveries_created ON pending_deliveries(createdAt)`);
}

function migrateDatabase(db: Database.Database) {
  const tables = ['clients', 'products', 'live_sessions', 'orders', 'activity_logs'];
  
  for (const table of tables) {
    try {
      // Check if userId column exists
      const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
      const hasUserId = columns.some(col => col.name === 'userId');
      
      if (!hasUserId) {
        console.log(`Migrating table ${table}: adding userId column`);
        db.exec(`ALTER TABLE ${table} ADD COLUMN userId TEXT NOT NULL DEFAULT ''`);
      }
    } catch (e) {
      console.error(`Migration error for table ${table}:`, e);
    }
  }

  // Specific column migrations
  try {
    const orderCols = db.pragma('table_info(orders)') as Array<{ name: string }>;
    if (!orderCols.some(col => col.name === 'clientName')) {
        db.exec("ALTER TABLE orders ADD COLUMN clientName TEXT NOT NULL DEFAULT ''");
    }
    if (!orderCols.some(col => col.name === 'clientFacebook')) {
        db.exec("ALTER TABLE orders ADD COLUMN clientFacebook TEXT DEFAULT ''");
    }
    if (!orderCols.some(col => col.name === 'status')) {
        db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    }
    if (!orderCols.some(col => col.name === 'totalAmount')) {
        db.exec("ALTER TABLE orders ADD COLUMN totalAmount REAL NOT NULL DEFAULT 0");
    }
    if (!orderCols.some(col => col.name === 'createdAt')) {
        db.exec("ALTER TABLE orders ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''");
    }
    if (!orderCols.some(col => col.name === 'updatedAt')) {
        db.exec("ALTER TABLE orders ADD COLUMN updatedAt TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) {
      console.error('Order migration error:', e);
  }

  try {
    const orderItemCols = db.pragma('table_info(order_items)') as Array<{ name: string }>;
    if (!orderItemCols.some(col => col.name === 'productName')) {
      db.exec("ALTER TABLE order_items ADD COLUMN productName TEXT NOT NULL DEFAULT ''");
    }
    if (!orderItemCols.some(col => col.name === 'quantity')) {
      db.exec("ALTER TABLE order_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
    }
    if (!orderItemCols.some(col => col.name === 'totalPrice')) {
      db.exec("ALTER TABLE order_items ADD COLUMN totalPrice REAL NOT NULL DEFAULT 0");
    }
  } catch (e) {
    console.error('Order items migration error:', e);
  }

  try {
    const productCols = db.pragma('table_info(products)') as Array<{ name: string }>;
    if (!productCols.some(col => col.name === 'isActive')) {
      db.exec("ALTER TABLE products ADD COLUMN isActive INTEGER DEFAULT 1");
    }
  } catch (e) {
    console.error('Products migration error:', e);
  }

  try {
    const variantCols = db.pragma('table_info(product_variants)') as Array<{ name: string }>;
    if (!variantCols.some(col => col.name === 'stock')) {
      db.exec("ALTER TABLE product_variants ADD COLUMN stock INTEGER NOT NULL DEFAULT 0");
    }
  } catch (e) {
    console.error('Variants migration error:', e);
  }
}

export function closeDb() {
  if (db) {
    db.close();
  }
}

export default getDb;
