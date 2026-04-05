'use client';

import type { OrderStatus } from '@/types';
import { Chip } from '@mui/material';

const statusConfig: Record<OrderStatus, { label: string; color: 'success' | 'warning' | 'info' | 'error' }> = {
  confirmed: { label: 'Confirmée', color: 'success' },
  pending: { label: 'En attente', color: 'warning' },
  shipping: { label: 'En cours de livraison', color: 'info' },
  paid: { label: 'Payée', color: 'success' },
  delivered: { label: 'Livrée', color: 'info' },
  cancelled: { label: 'Annulée', color: 'error' },
};

export default function StatusChip({ status }: { status: OrderStatus }) {
  const config = statusConfig[status] || { label: status, color: 'info' as const };
  return (
    <Chip
      label={config.label}
      color={config.color}
      size="small"
      variant="filled"
      sx={{ fontWeight: 600, fontSize: '0.75rem' }}
    />
  );
}
