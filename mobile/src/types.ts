export type MobileUser = {
  username: string;
  password: string;
};

export type DeliveryStat = {
  date: string;
  pendingCount: number;
  paidAmount: number;
};

export type ClientItem = {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalPurchases: number;
  totalSpent: number;
};

export type PendingDeliveryItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  pendingQuantity: number;
  paidAmount: number;
  paymentStatus: string;
  limitDate: string;
  notes: string;
  updatedAt: string;
};

export type MobileOrderItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantSize: string;
  variantColor: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type MobileOrder = {
  id: string;
  orderNumber: string;
  clientName: string;
  clientPhone: string;
  deliveryDate: string;
  shippingAddress: string;
  status: string;
  paymentMethod: string;
  paymentReference: string;
  deliveryPerson: string;
  isPersonalTransportParcel?: boolean;
  proofImageUri?: string;
  totalAmount: number;
  createdAt: string;
  items: MobileOrderItem[];
};

export type MobileExportData = {
  schemaVersion: number;
  exportedAt: string;
  userId: string;
  clients: ClientItem[];
  pendingDeliveries: PendingDeliveryItem[];
  deliveryDailyStats: DeliveryStat[];
  orders?: MobileOrder[];
  exportContext?: {
    source?: string;
    companyName?: string;
    dateFrom?: string;
    dateTo?: string;
    deliveryPersonFilter?: string;
    realizedStatusFilter?: string;
    clientSearch?: string;
  };
  topClients?: Array<{
    clientName: string;
    ordersCount: number;
    totalAmount: number;
  }>;
};

export type ImportHistoryItem = {
  id: number | string;
  importedAt: string;
  archivePath: string;
  schemaVersion: number;
  userId: string;
  fileName?: string;
  deliveryPersonFilter?: string;
  totalAmount?: number;
};
