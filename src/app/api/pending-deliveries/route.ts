import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type PendingDeliveryRow = {
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
  isLiveOrder: number;
  liveSessionId: string | null;
  liveStartedAt: string | null;
  orderTotalQuantity: number;
};

function getPendingDeliveryById(db: ReturnType<typeof getDb>, id: string, userId: string) {
  return db.prepare(
    `SELECT
      pd.*,
      COALESCE(o.isLiveOrder, 0) as isLiveOrder,
      o.liveSessionId as liveSessionId,
      ls.startedAt as liveStartedAt,
      o.createdAt as orderCreatedAt,
      COALESCE(o.totalAmount, 0) as totalAmount,
      COALESCE(SUM(oi.quantity), 0) as orderTotalQuantity
     FROM pending_deliveries pd
     LEFT JOIN orders o ON o.id = pd.orderId AND o.userId = pd.userId
     LEFT JOIN live_sessions ls ON ls.id = o.liveSessionId AND ls.userId = o.userId
     LEFT JOIN order_items oi ON oi.orderId = o.id
     WHERE pd.id = ? AND pd.userId = ?
     GROUP BY pd.id`
  ).get(id, userId) as PendingDeliveryRow | undefined;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const paymentStatus = searchParams.get('paymentStatus') || '';
    const source = searchParams.get('source') || '';
    const search = searchParams.get('search') || '';
    const createdDateFrom = searchParams.get('createdDateFrom') || '';
    const createdDateTo = searchParams.get('createdDateTo') || '';
    const limitDateFrom = searchParams.get('limitDateFrom') || '';
    const limitDateTo = searchParams.get('limitDateTo') || '';

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    let whereClause = 'WHERE pd.userId = ?';
    const params: (string | number)[] = [userId];

    if (paymentStatus === 'paid' || paymentStatus === 'unpaid') {
      whereClause += ' AND pd.paymentStatus = ?';
      params.push(paymentStatus);
    }
    if (source === 'live') {
      whereClause += ' AND COALESCE(o.isLiveOrder, 0) = 1';
    } else if (source === 'manual') {
      whereClause += ' AND COALESCE(o.isLiveOrder, 0) = 0';
    }
    if (search) {
      whereClause += ' AND (pd.orderNumber LIKE ? OR pd.clientName LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (createdDateFrom) {
      whereClause += ' AND date(pd.createdAt) >= date(?)';
      params.push(createdDateFrom);
    }
    if (createdDateTo) {
      whereClause += ' AND date(pd.createdAt) <= date(?)';
      params.push(createdDateTo);
    }
    if (limitDateFrom) {
      whereClause += ' AND date(pd.limitDate) >= date(?)';
      params.push(limitDateFrom);
    }
    if (limitDateTo) {
      whereClause += ' AND date(pd.limitDate) <= date(?)';
      params.push(limitDateTo);
    }

    const rows = db.prepare(
      `SELECT
        pd.*,
        COALESCE(o.isLiveOrder, 0) as isLiveOrder,
        o.liveSessionId as liveSessionId,
        ls.startedAt as liveStartedAt,
        o.createdAt as orderCreatedAt,
        COALESCE(o.totalAmount, 0) as totalAmount,
        COALESCE(SUM(oi.quantity), 0) as orderTotalQuantity
       FROM pending_deliveries pd
       LEFT JOIN orders o ON o.id = pd.orderId AND o.userId = pd.userId
       LEFT JOIN live_sessions ls ON ls.id = o.liveSessionId AND ls.userId = o.userId
       LEFT JOIN order_items oi ON oi.orderId = o.id
       ${whereClause}
       GROUP BY pd.id
       ORDER BY pd.createdAt DESC`
    ).all(...params) as PendingDeliveryRow[];

    const stats = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.totalPendingQuantity += Number(row.pendingQuantity || 0);
        if (row.paymentStatus === 'paid') {
          acc.paid += 1;
        } else {
          acc.unpaid += 1;
        }
        if (Number(row.isLiveOrder || 0) === 1) {
          acc.live += 1;
          acc.liveOrderQuantity += Number(row.orderTotalQuantity || 0);
        }
        const isLate = row.limitDate && new Date(row.limitDate) < new Date() && row.paymentStatus === 'unpaid';
        if (isLate) {
          acc.overdue += 1;
        }
        return acc;
      },
      { total: 0, paid: 0, unpaid: 0, live: 0, overdue: 0, totalPendingQuantity: 0, liveOrderQuantity: 0 }
    );

    return NextResponse.json({ rows, stats });
  } catch (error) {
    console.error('Get pending deliveries error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    const orderId = body.orderId || '';
    const paymentStatus = body.paymentStatus === 'paid' ? 'paid' : 'unpaid';
    const limitDate = String(body.limitDate || '').trim();
    const notes = String(body.notes || '').trim();

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!orderId) return NextResponse.json({ error: 'Commande requise' }, { status: 400 });

    const order = db.prepare(
      'SELECT id, orderNumber, clientName, status, totalAmount FROM orders WHERE id = ? AND userId = ?'
    ).get(orderId, userId) as { id: string; orderNumber: string; clientName: string; status: string; totalAmount: number } | undefined;

    if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return NextResponse.json({ error: 'La commande est déjà livrée ou annulée' }, { status: 400 });
    }

    const quantityRow = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) as total FROM order_items WHERE orderId = ?'
    ).get(orderId) as { total: number };
    const orderTotalQuantity = Number(quantityRow.total || 0);

    const pendingQuantity = Number(body.pendingQuantity ?? orderTotalQuantity);
    if (!Number.isFinite(pendingQuantity) || pendingQuantity <= 0) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 });
    }
    if (orderTotalQuantity > 0 && pendingQuantity > orderTotalQuantity) {
      return NextResponse.json({ error: 'Quantité en attente supérieure à la quantité commandée' }, { status: 400 });
    }
    const paidAmount = Number(body.paidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: 'Montant payé invalide' }, { status: 400 });
    }
    const orderTotalAmount = Number(order.totalAmount || 0);
    if (orderTotalAmount > 0 && paidAmount > orderTotalAmount) {
      return NextResponse.json({ error: 'Montant payé supérieur au montant de la commande' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO pending_deliveries
      (id, userId, orderId, orderNumber, clientName, pendingQuantity, paidAmount, paymentStatus, limitDate, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      order.id,
      order.orderNumber || order.id.slice(0, 8),
      order.clientName,
      pendingQuantity,
      paidAmount,
      paymentStatus,
      limitDate,
      notes,
      now,
      now
    );

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'create', 'pending_delivery', id, `Livraison en attente créée: ${order.orderNumber || order.id.slice(0, 8)}`);

    const created = getPendingDeliveryById(db, id, userId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Create pending delivery error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    const id = body.id || '';

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const existing = db.prepare(
      'SELECT id, orderId, pendingQuantity, paidAmount FROM pending_deliveries WHERE id = ? AND userId = ?'
    ).get(id, userId) as { id: string; orderId: string; pendingQuantity: number; paidAmount: number } | undefined;

    if (!existing) return NextResponse.json({ error: 'Livraison en attente introuvable' }, { status: 404 });

    const quantityRow = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) as total FROM order_items WHERE orderId = ?'
    ).get(existing.orderId) as { total: number };
    const orderTotalQuantity = Number(quantityRow.total || 0);
    const orderRow = db.prepare(
      'SELECT totalAmount, status FROM orders WHERE id = ? AND userId = ?'
    ).get(existing.orderId, userId) as { totalAmount: number; status: string } | undefined;
    if (!orderRow) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (orderRow.status === 'delivered' || orderRow.status === 'cancelled') {
      return NextResponse.json({ error: 'La commande est déjà livrée ou annulée' }, { status: 400 });
    }

    const pendingQuantity = body.pendingQuantity !== undefined
      ? Number(body.pendingQuantity)
      : Number(existing.pendingQuantity || 0);
    if (!Number.isFinite(pendingQuantity) || pendingQuantity <= 0) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 });
    }
    if (orderTotalQuantity > 0 && pendingQuantity > orderTotalQuantity) {
      return NextResponse.json({ error: 'Quantité en attente supérieure à la quantité commandée' }, { status: 400 });
    }
    const paidAmount = body.paidAmount !== undefined ? Number(body.paidAmount) : Number(existing.paidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: 'Montant payé invalide' }, { status: 400 });
    }
    const orderTotalAmount = Number(orderRow.totalAmount || 0);
    if (orderTotalAmount > 0 && paidAmount > orderTotalAmount) {
      return NextResponse.json({ error: 'Montant payé supérieur au montant de la commande' }, { status: 400 });
    }

    const paymentStatus = body.paymentStatus === 'paid' ? 'paid' : 'unpaid';
    const limitDate = String(body.limitDate || '').trim();
    const notes = String(body.notes || '').trim();
    const now = new Date().toISOString();

    db.prepare(
      'UPDATE pending_deliveries SET pendingQuantity = ?, paidAmount = ?, paymentStatus = ?, limitDate = ?, notes = ?, updatedAt = ? WHERE id = ? AND userId = ?'
    ).run(pendingQuantity, paidAmount, paymentStatus, limitDate, notes, now, id, userId);

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'update', 'pending_delivery', id, `Livraison en attente mise à jour: ${id}`);

    const updated = getPendingDeliveryById(db, id, userId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update pending delivery error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const id = searchParams.get('id') || '';
    const username = searchParams.get('username') || '';

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const row = db.prepare(
      'SELECT orderNumber FROM pending_deliveries WHERE id = ? AND userId = ?'
    ).get(id, userId) as { orderNumber: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Livraison en attente introuvable' }, { status: 404 });

    db.prepare('DELETE FROM pending_deliveries WHERE id = ? AND userId = ?').run(id, userId);
    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'delete', 'pending_delivery', id, `Livraison en attente supprimée: ${row.orderNumber || id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete pending delivery error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
