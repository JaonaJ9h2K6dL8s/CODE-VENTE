import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Generate a readable order number like CMD-20260215-0042
function generateOrderNumber(db: ReturnType<typeof getDb>, userId: string): string {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const countToday = db.prepare(
    `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND date(createdAt) = date(?)`
  ).get(userId, today.toISOString()) as { count: number };
  const seq = String(countToday.count + 1).padStart(4, '0');
  return `CMD-${dateStr}-${seq}`;
}


export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const type = searchParams.get('type') || ''; // 'live' or 'manual'
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const deliveryDateFrom = searchParams.get('deliveryDateFrom') || '';
    const deliveryDateTo = searchParams.get('deliveryDateTo') || '';
    const deliveryDateExact = searchParams.get('deliveryDate') || '';
    const deliveryPerson = searchParams.get('deliveryPerson') || '';
    const liveSessionId = searchParams.get('liveSessionId') || '';
    const userId = searchParams.get('userId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    // Stats endpoint
    if (searchParams.get('stats') === 'true') {
      const stats = db.transaction(() => {
        // Base stats (global)
        const totalOrders = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ?`
        ).get(userId) as { count: number };
        const totalRevenue = db.prepare(
          `SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE userId = ? AND status != 'cancelled'`
        ).get(userId) as { total: number };
        const pendingOrders = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'pending'`
        ).get(userId) as { count: number };
        const pendingRevenue = db.prepare(
          `SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE userId = ? AND status = 'pending'`
        ).get(userId) as { total: number };
        const confirmedOrders = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'confirmed'`
        ).get(userId) as { count: number };
        const deliveredOrders = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'delivered'`
        ).get(userId) as { count: number };
        const deliveredRevenue = db.prepare(
          `SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE userId = ? AND status = 'delivered'`
        ).get(userId) as { total: number };
        const cancelledOrders = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'cancelled'`
        ).get(userId) as { count: number };
        const todayOrders = db.prepare(
          `SELECT COUNT(*) as count, COALESCE(SUM(totalAmount), 0) as revenue FROM orders WHERE userId = ? AND date(createdAt) = date('now') AND status != 'cancelled'`
        ).get(userId) as { count: number; revenue: number };
        const todayDeliveries = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND date(deliveryDate) = date('now') AND status != 'cancelled' AND status != 'delivered'`
        ).get(userId) as { count: number };
        const upcomingDeliveries = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND date(deliveryDate) >= date('now') AND status != 'cancelled' AND status != 'delivered'`
        ).get(userId) as { count: number };
        const overdueDeliveries = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND deliveryDate IS NOT NULL AND date(deliveryDate) < date('now') AND status != 'cancelled' AND status != 'delivered'`
        ).get(userId) as { count: number };

        // Filtered stats (products sold)
        let productSoldQuery = `
          SELECT COALESCE(SUM(oi.quantity), 0) as total 
          FROM order_items oi 
          JOIN orders o ON oi.orderId = o.id 
          WHERE o.userId = ? AND o.status != 'cancelled'
        `;
        const productSoldParams: (string | number)[] = [userId];

        if (dateFrom) {
          productSoldQuery += ' AND date(o.createdAt) >= date(?)';
          productSoldParams.push(dateFrom);
        }
        if (dateTo) {
          productSoldQuery += ' AND date(o.createdAt) <= date(?)';
          productSoldParams.push(dateTo);
        }

        const totalProductsSold = db.prepare(productSoldQuery).get(...productSoldParams) as { total: number };

        return {
          totalOrders: totalOrders.count,
          totalRevenue: totalRevenue.total,
          pendingOrders: pendingOrders.count,
          pendingRevenue: pendingRevenue.total,
          confirmedOrders: confirmedOrders.count,
          deliveredOrders: deliveredOrders.count,
          deliveredRevenue: deliveredRevenue.total,
          cancelledOrders: cancelledOrders.count,
          todayOrders: todayOrders.count,
          todayRevenue: todayOrders.revenue,
          todayDeliveries: todayDeliveries.count,
          upcomingDeliveries: upcomingDeliveries.count,
          overdueDeliveries: overdueDeliveries.count,
          totalProductsSold: totalProductsSold.total,
        };
      })();
      return NextResponse.json(stats);
    }

    if (searchParams.get('mergeLive') === 'true') {
      const now = new Date().toISOString();
      const mergeLiveOrders = db.transaction(() => {
        const groups = db.prepare(
          `SELECT LOWER(clientName) as clientKey, liveSessionId, COUNT(*) as count
           FROM orders
           WHERE userId = ? AND isLiveOrder = 1 AND status != 'cancelled' AND liveSessionId IS NOT NULL
           GROUP BY clientKey, liveSessionId
           HAVING count > 1`
        ).all(userId) as Array<{ clientKey: string; liveSessionId: string; count: number }>;

        for (const group of groups) {
          const orders = db.prepare(
            `SELECT id, totalAmount, clientId, clientName FROM orders
             WHERE userId = ? AND liveSessionId = ? AND status != 'cancelled' AND LOWER(clientName) = ?
             ORDER BY createdAt ASC`
          ).all(userId, group.liveSessionId, group.clientKey) as Array<{ id: string; totalAmount: number; clientId: string | null; clientName: string }>;

          if (orders.length < 2) continue;

          const primary = orders[0];
          const extraOrders = orders.slice(1);

          for (const extra of extraOrders) {
            const items = db.prepare(
              'SELECT * FROM order_items WHERE orderId = ?'
            ).all(extra.id) as Array<Record<string, unknown>>;

            for (const item of items) {
              const variantId = item.variantId as string;
              const existingItem = db.prepare(
                'SELECT id FROM order_items WHERE orderId = ? AND variantId = ?'
              ).get(primary.id, variantId) as { id: string } | undefined;

              if (existingItem) {
                db.prepare(
                  'UPDATE order_items SET quantity = quantity + ?, totalPrice = totalPrice + ? WHERE id = ?'
                ).run(item.quantity as number, item.totalPrice as number, existingItem.id);
              } else {
                db.prepare(
                  `INSERT INTO order_items (id, orderId, productId, productName, variantId, variantSize, variantColor, quantity, unitPrice, totalPrice)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  uuidv4(),
                  primary.id,
                  item.productId as string,
                  item.productName as string,
                  item.variantId as string,
                  item.variantSize as string,
                  item.variantColor as string,
                  item.quantity as number,
                  item.unitPrice as number,
                  item.totalPrice as number
                );
              }
            }

            db.prepare(
              'UPDATE orders SET totalAmount = totalAmount + ?, updatedAt = ? WHERE id = ? AND userId = ?'
            ).run(extra.totalAmount, now, primary.id, userId);

            db.prepare('DELETE FROM order_items WHERE orderId = ?').run(extra.id);
            db.prepare('DELETE FROM orders WHERE id = ? AND userId = ?').run(extra.id, userId);
          }

          for (const extra of extraOrders) {
            if (extra.clientId) {
              db.prepare(
                'UPDATE clients SET totalPurchases = totalPurchases - 1, updatedAt = ? WHERE id = ? AND userId = ?'
              ).run(now, extra.clientId, userId);
            }
          }

          db.prepare(
            'UPDATE live_sessions SET totalOrders = totalOrders - ? WHERE id = ? AND userId = ?'
          ).run(extraOrders.length, group.liveSessionId, userId);
        }
      });

      mergeLiveOrders();
    }

    let whereClause = 'WHERE o.userId = ?';
    const params: (string | number)[] = [userId];

    if (search) {
      whereClause += ' AND (o.clientName LIKE ? OR o.clientFacebook LIKE ? OR o.id LIKE ? OR o.orderNumber LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }
    if (type === 'live') {
      whereClause += ' AND o.isLiveOrder = 1';
    } else if (type === 'manual') {
      whereClause += ' AND o.isLiveOrder = 0';
    }
    if (dateFrom) {
      whereClause += ' AND date(o.createdAt) >= date(?)';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND date(o.createdAt) <= date(?)';
      params.push(dateTo);
    }
    if (deliveryDateExact) {
      whereClause += ' AND date(o.deliveryDate) = date(?)';
      params.push(deliveryDateExact);
    }
    if (deliveryDateFrom) {
      whereClause += ' AND date(o.deliveryDate) >= date(?)';
      params.push(deliveryDateFrom);
    }
    if (deliveryDateTo) {
      whereClause += ' AND date(o.deliveryDate) <= date(?)';
      params.push(deliveryDateTo);
    }
    if (deliveryPerson) {
      whereClause += ' AND o.deliveryPerson = ?';
      params.push(deliveryPerson);
    }
    if (liveSessionId) {
      whereClause += ' AND o.liveSessionId = ?';
      params.push(liveSessionId);
    }

    const orders = db.prepare(
      `SELECT o.* FROM orders o ${whereClause} ORDER BY o.createdAt DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Array<Record<string, unknown>>;

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM orders o ${whereClause}`
    ).get(...params) as { count: number };

    // Batch load all order items in ONE query instead of N+1
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id as string);
      const placeholders = orderIds.map(() => '?').join(',');
      const allItems = db.prepare(
        `SELECT * FROM order_items WHERE orderId IN (${placeholders})`
      ).all(...orderIds) as Array<Record<string, unknown>>;

      const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
      for (const item of allItems) {
        const oid = item.orderId as string;
        if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
        itemsByOrder.get(oid)!.push(item);
      }

      for (const order of orders) {
        (order as Record<string, unknown>).items = itemsByOrder.get(order.id as string) || [];
      }
    }

    return NextResponse.json({ orders, total: total.count, page, limit });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const orderId = uuidv4();
    const now = new Date().toISOString();
    const userId = body.userId;
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const orderNumber = generateOrderNumber(db, userId);

    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND userId = ?').get(body.clientId, userId) as {
      id: string; name: string; facebookPseudo: string; phone: string; address: string; totalPurchases: number; totalSpent: number;
    } | undefined;

    if (!client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    let totalAmount = 0;
    const orderItems: Array<{
      id: string; orderId: string; productId: string; productName: string;
      variantId: string; variantSize: string; variantColor: string;
      quantity: number; unitPrice: number; totalPrice: number;
    }> = [];

    for (const item of body.items) {
      const variant = db.prepare(
        `SELECT pv.* FROM product_variants pv
         JOIN products p ON pv.productId = p.id
         WHERE pv.id = ? AND p.userId = ?`
      ).get(item.variantId, userId) as {
        id: string; productId: string; size: string; color: string; price: number; stock: number;
      } | undefined;
      const product = db.prepare('SELECT name FROM products WHERE id = ? AND userId = ?').get(item.productId, userId) as { name: string } | undefined;

      if (!variant || !product) continue;

      if (variant.stock < item.quantity) {
        return NextResponse.json({ error: `Stock insuffisant pour ${product.name} (${variant.size} ${variant.color}): ${variant.stock} restant(s)` }, { status: 400 });
      }

      const itemTotal = variant.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        id: uuidv4(), orderId, productId: item.productId, productName: product.name,
        variantId: item.variantId, variantSize: variant.size, variantColor: variant.color,
        quantity: item.quantity, unitPrice: variant.price, totalPrice: itemTotal,
      });
    }

    if (orderItems.length === 0) {
      return NextResponse.json({ error: 'Aucun article valide dans la commande' }, { status: 400 });
    }

    // Check if an existing active order for this client in this live session exists to group them
    let existingOrderId: string | null = null;
    let existingOrderNumber: string | null = null;
    if (body.isLiveOrder && body.liveSessionId && body.clientId) {
      const existingOrder = db.prepare(
        "SELECT id, orderNumber FROM orders WHERE clientId = ? AND liveSessionId = ? AND status != 'cancelled' LIMIT 1"
      ).get(body.clientId, body.liveSessionId) as { id: string; orderNumber: string } | undefined;
      
      if (existingOrder) {
        existingOrderId = existingOrder.id;
        existingOrderNumber = existingOrder.orderNumber;
      }
    }

    const transaction = db.transaction(() => {
      const targetOrderId = existingOrderId || orderId;
      const targetOrderNumber = existingOrderNumber || orderNumber;

      if (existingOrderId) {
        // Update existing order
        db.prepare(
          `UPDATE orders SET totalAmount = totalAmount + ?, updatedAt = ? WHERE id = ? AND userId = ?`
        ).run(totalAmount, now, existingOrderId, userId);
      } else {
        // Create new order
        db.prepare(
          `INSERT INTO orders (id, userId, orderNumber, clientId, clientName, clientFacebook, status, paymentMethod, paymentReference, deliveryPerson, totalAmount, isLiveOrder, liveSessionId, notes, shippingAddress, clientPhone, deliveryDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(orderId, userId, orderNumber, body.clientId, client.name, client.facebookPseudo, body.status || 'pending',
          body.paymentMethod || null, body.paymentReference || '', body.deliveryPerson || '',
          totalAmount, body.isLiveOrder ? 1 : 0, body.liveSessionId || null, body.notes || '',
          body.shippingAddress || client.address || '', client.phone || '', body.deliveryDate || null, now, now);
      }

      const insertItem = db.prepare(
        `INSERT INTO order_items (id, orderId, productId, productName, variantId, variantSize, variantColor, quantity, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      
      const updateItem = db.prepare(
        `UPDATE order_items SET quantity = quantity + ?, totalPrice = totalPrice + ? WHERE orderId = ? AND variantId = ?`
      );

      for (const item of orderItems) {
        // Check if item variant already exists in this order to merge them too
        const existingItem = db.prepare(
          'SELECT id FROM order_items WHERE orderId = ? AND variantId = ?'
        ).get(targetOrderId, item.variantId) as { id: string } | undefined;

        if (existingItem) {
          updateItem.run(item.quantity, item.totalPrice, targetOrderId, item.variantId);
        } else {
          insertItem.run(item.id, targetOrderId, item.productId, item.productName,
            item.variantId, item.variantSize, item.variantColor,
            item.quantity, item.unitPrice, item.totalPrice);
        }
      }

      // Update stock
      for (const item of body.items) {
        db.prepare(
          `UPDATE product_variants
           SET stock = stock - ?
           WHERE id = ? AND stock >= ?
             AND id IN (
               SELECT pv.id FROM product_variants pv
               JOIN products p ON pv.productId = p.id
               WHERE p.userId = ?
             )`
        ).run(item.quantity, item.variantId, item.quantity, userId);
      }

      // Update client stats
      if (existingOrderId) {
        // Only update totalSpent if it's an update to an existing order
        db.prepare('UPDATE clients SET totalSpent = totalSpent + ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .run(totalAmount, now, body.clientId, userId);
      } else {
        // Update both if it's a new order
        db.prepare('UPDATE clients SET totalPurchases = totalPurchases + 1, totalSpent = totalSpent + ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .run(totalAmount, now, body.clientId, userId);
      }

      // Update live session if applicable
      if (body.liveSessionId) {
        if (existingOrderId) {
          // Only update revenue if grouping
          db.prepare('UPDATE live_sessions SET totalRevenue = totalRevenue + ? WHERE id = ? AND userId = ?')
            .run(totalAmount, body.liveSessionId, userId);
        } else {
          // Update both for new order
          db.prepare('UPDATE live_sessions SET totalOrders = totalOrders + 1, totalRevenue = totalRevenue + ? WHERE id = ? AND userId = ?')
            .run(totalAmount, body.liveSessionId, userId);
        }
      }

      return { targetOrderId, targetOrderNumber };
    });

    const { targetOrderId, targetOrderNumber } = transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, existingOrderId ? 'update' : 'create', 'order', targetOrderId, 
      existingOrderId 
        ? `Commande ${targetOrderNumber} mise à jour (regroupement): ${client.name} - +${totalAmount} MGA`
        : `Commande ${targetOrderNumber} créée: ${client.name} - ${totalAmount} MGA`);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(targetOrderId);
    const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(targetOrderId);

    return NextResponse.json({ ...order as object, items }, { status: existingOrderId ? 200 : 201 });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const now = new Date().toISOString();
    const userId = body.userId;
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    // deliveryDate can be a string or null (to clear it)
    const deliveryDate = body.deliveryDate !== undefined ? (body.deliveryDate || null) : undefined;

    if (body.items && Array.isArray(body.items)) {
      const existingItems = db.prepare('SELECT variantId, quantity FROM order_items WHERE orderId = ?').all(body.id) as Array<{ variantId: string; quantity: number }>;
      const oldQtyMap = existingItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.variantId] = (acc[item.variantId] || 0) + item.quantity;
        return acc;
      }, {});

      for (const item of body.items) {
        const variant = db.prepare(
          `SELECT pv.* FROM product_variants pv
           JOIN products p ON pv.productId = p.id
           WHERE pv.id = ? AND p.userId = ?`
        ).get(item.variantId, userId) as { id: string; productId: string; size: string; color: string; price: number; stock: number } | undefined;
        const product = db.prepare('SELECT name FROM products WHERE id = ? AND userId = ?').get(item.productId, userId) as { name: string } | undefined;
        if (!variant || !product) continue;

        const available = variant.stock + (oldQtyMap[item.variantId] || 0);
        if (available < item.quantity) {
          return NextResponse.json({ error: `Stock insuffisant pour ${product.name} (${variant.size} ${variant.color}): ${available} restant(s)` }, { status: 400 });
        }
      }
    }

    // Start transaction for update
    const transaction = db.transaction(() => {
      // 1. Update Order main info
      if (deliveryDate !== undefined) {
        const result = db.prepare('UPDATE orders SET status = ?, paymentMethod = ?, paymentReference = ?, deliveryPerson = ?, notes = ?, shippingAddress = ?, deliveryDate = ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .run(body.status, body.paymentMethod || null, body.paymentReference || '', body.deliveryPerson || '', body.notes || '', body.shippingAddress || '', deliveryDate, now, body.id, userId);
        if (result.changes === 0) throw new Error('Commande non trouvée');
      } else {
        const result = db.prepare('UPDATE orders SET status = ?, paymentMethod = ?, paymentReference = ?, deliveryPerson = ?, notes = ?, shippingAddress = ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .run(body.status, body.paymentMethod || null, body.paymentReference || '', body.deliveryPerson || '', body.notes || '', body.shippingAddress || '', now, body.id, userId);
        if (result.changes === 0) throw new Error('Commande non trouvée');
      }

      // 2. Handle Items Update if provided
      if (body.items && Array.isArray(body.items)) {
        // A. Restore stock for existing items
        const existingItems = db.prepare('SELECT variantId, quantity, totalPrice FROM order_items WHERE orderId = ?').all(body.id) as Array<{ variantId: string; quantity: number; totalPrice: number }>;
        let oldTotal = 0;
        for (const item of existingItems) {
          oldTotal += item.totalPrice;
          db.prepare(
            `UPDATE product_variants SET stock = stock + ? WHERE id = ? AND id IN (SELECT pv.id FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE p.userId = ?)`
          ).run(item.quantity, item.variantId, userId);
        }

        // B. Delete existing items
        db.prepare('DELETE FROM order_items WHERE orderId = ?').run(body.id);

        // C. Insert new items and calculate new total
        let newTotal = 0;
        const insertItem = db.prepare(
          `INSERT INTO order_items (id, orderId, productId, productName, variantId, variantSize, variantColor, quantity, unitPrice, totalPrice)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const item of body.items) {
          const variant = db.prepare(
            `SELECT pv.* FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE pv.id = ? AND p.userId = ?`
          ).get(item.variantId, userId) as { id: string; productId: string; size: string; color: string; price: number; stock: number; } | undefined;
          
          const product = db.prepare('SELECT name FROM products WHERE id = ? AND userId = ?').get(item.productId, userId) as { name: string } | undefined;

          if (!variant || !product) continue;

          // Check stock (considering we just restored the old stock, so we are checking against available stock including what was reserved for this order)
          if (variant.stock < item.quantity) {
            throw new Error(`Stock insuffisant pour ${product.name} (${variant.size} ${variant.color}): ${variant.stock} restant(s)`);
          }

          const itemTotal = variant.price * item.quantity;
          newTotal += itemTotal;

          insertItem.run(uuidv4(), body.id, item.productId, product.name, item.variantId, variant.size, variant.color, item.quantity, variant.price, itemTotal);

          // Deduct new stock
          db.prepare(
            `UPDATE product_variants SET stock = stock - ? WHERE id = ? AND id IN (SELECT pv.id FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE p.userId = ?)`
          ).run(item.quantity, item.variantId, userId);
        }

        // D. Update Order Total Amount
        db.prepare('UPDATE orders SET totalAmount = ? WHERE id = ?').run(newTotal, body.id);

        // E. Update Client Stats (remove old total, add new total)
        const order = db.prepare('SELECT clientId, isLiveOrder, liveSessionId FROM orders WHERE id = ?').get(body.id) as { clientId: string; isLiveOrder: number; liveSessionId: string | null };
        db.prepare('UPDATE clients SET totalSpent = totalSpent - ? + ?, updatedAt = ? WHERE id = ? AND userId = ?')
          .run(oldTotal, newTotal, now, order.clientId, userId);

        // F. Update Live Session if needed
        if (order.isLiveOrder && order.liveSessionId) {
          db.prepare('UPDATE live_sessions SET totalRevenue = totalRevenue - ? + ? WHERE id = ? AND userId = ?')
            .run(oldTotal, newTotal, order.liveSessionId, userId);
        }
      }
    });

    transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'update', 'order', body.id, `Commande mise à jour: statut → ${body.status}`);

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(body.id, userId);
    const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(body.id);

    return NextResponse.json({ ...order as object, items });
  } catch (error) {
    console.error('Update order error:', error);
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: message === 'Commande non trouvée' ? 404 : 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId') || '';
    const username = searchParams.get('username') || '';
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    // Fetch order before deleting so we can revert client & session stats
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(id, userId) as {
      id: string; clientId: string; totalAmount: number; isLiveOrder: number; liveSessionId: string | null;
    } | undefined;

    if (!order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 });

    const transaction = db.transaction(() => {
      // Restore stock
      const items = db.prepare('SELECT variantId, quantity FROM order_items WHERE orderId = ?').all(id) as Array<{ variantId: string; quantity: number }>;
      for (const item of items) {
        db.prepare(
          `UPDATE product_variants
           SET stock = stock + ?
           WHERE id = ?
             AND id IN (
               SELECT pv.id FROM product_variants pv
               JOIN products p ON pv.productId = p.id
               WHERE p.userId = ?
             )`
        ).run(item.quantity, item.variantId, userId);
      }

      // Revert client stats
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE clients SET totalPurchases = MAX(totalPurchases - 1, 0), totalSpent = MAX(totalSpent - ?, 0), updatedAt = ? WHERE id = ? AND userId = ?'
      ).run(order.totalAmount, now, order.clientId, userId);

      // Revert live session stats if applicable
      if (order.isLiveOrder && order.liveSessionId) {
        db.prepare(
          'UPDATE live_sessions SET totalOrders = MAX(totalOrders - 1, 0), totalRevenue = MAX(totalRevenue - ?, 0) WHERE id = ? AND userId = ?'
        ).run(order.totalAmount, order.liveSessionId, userId);
      }

      db.prepare('DELETE FROM order_items WHERE orderId = ?').run(id);
      db.prepare('DELETE FROM orders WHERE id = ? AND userId = ?').run(id, userId);
    });
    transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'delete', 'order', id, `Commande supprimée: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete order error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
