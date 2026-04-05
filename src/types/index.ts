// ==================== GLOBAL TYPES ====================
declare global {
  interface Window {
    electron?: {
      auth: {
        login: (credentials: LoginCredentials) => Promise<User>;
        register: (credentials: LoginCredentials) => Promise<User>;
      };
    };
  }
}

// ==================== CLIENT TYPES ====================
export interface Client {
  id: string;
  name: string;
  facebookPseudo: string;
  nif: string;
  stat: string;
  phone: string;
  address: string;
  notes: string;
  totalPurchases: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFormData {
  name: string;
  facebookPseudo: string;
  nif: string;
  stat: string;
  phone: string;
  address: string;
  notes: string;
}

// ==================== PRODUCT TYPES ====================
export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string;
  color: string;
  price: number;
  stock: number;
  sku: string;
}

export interface ProductFormData {
  code: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  imageUrl: string;
  variants: Omit<ProductVariant, 'id' | 'productId'>[];
}

export interface StockMovement {
  id: string;
  productId: string;
  variantId: string;
  productCode: string;
  productName: string;
  unit: string;
  size: string;
  quantity: number;
  movementType: 'in' | 'out';
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ProductSerial {
  id: string;
  userId: string;
  productId: string;
  variantId: string;
  serialNumber: string;
  status: 'in_stock' | 'out';
  movementId: string;
  branchName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseNeed {
  id: string;
  userId: string;
  requester: string;
  description: string;
  quantity: number;
  createdAt: string;
}

export interface PurchaseInvoice {
  id: string;
  userId: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  notes: string;
  createdAt: string;
  items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantSize: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ProductionNeed {
  id: string;
  userId: string;
  source: string;
  description: string;
  quantity: number;
  createdBy: string;
  createdAt: string;
}

export interface ProductionPrintOrder {
  id: string;
  userId: string;
  requestDate: string;
  requester: string;
  description: string;
  quantity: number;
  status: string;
  createdAt: string;
}

export interface ProductionSewingEntry {
  id: string;
  userId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantSize: string;
  productionNumber: string;
  movementId: string;
  chainName: string;
  chiefName: string;
  quantity: number;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface PendingDelivery {
  id: string;
  userId: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  pendingQuantity: number;
  paidAmount: number;
  paymentStatus: 'paid' | 'unpaid';
  limitDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  orderCreatedAt: string | null;
  totalAmount: number;
  isLiveOrder: boolean;
  liveSessionId: string | null;
  liveStartedAt: string | null;
  orderTotalQuantity: number;
}

// ==================== ORDER TYPES ====================
export type OrderStatus = 'confirmed' | 'pending' | 'shipping' | 'delivered' | 'cancelled' | 'paid';
export type PaymentMethod = 'airtel_money' | 'mvola' | 'orange_money' | 'espece';

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  clientFacebook: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentReference: string;
  deliveryPerson: string;
  totalAmount: number;
  isLiveOrder: boolean;
  liveSessionId: string | null;
  notes: string;
  shippingAddress: string;
  clientPhone: string;
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  variantColor: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderFormData {
  clientId: string;
  status: OrderStatus;
  notes: string;
  items: {
    productId: string;
    variantId: string;
    quantity: number;
  }[];
}

// ==================== STATS TYPES ====================
export interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  todayRevenue: number;
  monthlyRevenue: number;
  monthlyOrders: number;
  totalClients: number;
  topProducts: TopProduct[];
  revenueByDay: RevenueByDay[];
  ordersByStatus: OrdersByStatus[];
  lowStockProducts: LowStockProduct[];
}

export interface TopProduct {
  productName: string;
  totalSold: number;
  revenue: number;
}

export interface RevenueByDay {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrdersByStatus {
  status: OrderStatus;
  count: number;
}

export interface LowStockProduct {
  productName: string;
  variantInfo: string;
  stock: number;
}

// ==================== AUTH TYPES ====================
export type UserRole = 'admin' | 'seller';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// ==================== LOG TYPES ====================
export interface ActivityLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

// ==================== UI TYPES ====================
export interface SidebarItem {
  title: string;
  path: string;
  icon: string;
  badge?: number;
}

export interface TabItem {
  label: string;
  value: string;
}
