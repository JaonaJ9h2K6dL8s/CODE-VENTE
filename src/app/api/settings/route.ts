import getDb from '@/lib/db';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'system';
    const userId = searchParams.get('userId') || '';

    if (type === 'system') {
      const data = db.transaction(() => {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        const users = db.prepare('SELECT id, username, role, createdAt FROM users ORDER BY createdAt').all();
        const totalClients = userId
          ? db.prepare('SELECT COUNT(*) as count FROM clients WHERE userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM clients').get() as { count: number };
        const totalProducts = userId
          ? db.prepare('SELECT COUNT(*) as count FROM products WHERE userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
        const activeProducts = userId
          ? db.prepare('SELECT COUNT(*) as count FROM products WHERE userId = ? AND isActive = 1').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM products WHERE isActive = 1').get() as { count: number };
        const totalVariants = userId
          ? db.prepare('SELECT COUNT(*) as count FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE p.userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM product_variants').get() as { count: number };
        const totalOrders = userId
          ? db.prepare('SELECT COUNT(*) as count FROM orders WHERE userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
        const totalRevenue = userId
          ? db.prepare("SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE userId = ? AND status != 'cancelled'").get(userId) as { total: number }
          : db.prepare("SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE status != 'cancelled'").get() as { total: number };
        const totalOrderItems = userId
          ? db.prepare('SELECT COUNT(*) as count FROM order_items oi JOIN orders o ON oi.orderId = o.id WHERE o.userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM order_items').get() as { count: number };
        const totalLogs = userId
          ? db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE userId = ?').get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM activity_logs').get() as { count: number };
        const lowStockCount = userId
          ? db.prepare(
            'SELECT COUNT(*) as count FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE p.userId = ? AND pv.stock <= 5 AND pv.stock > 0'
          ).get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM product_variants WHERE stock <= 5 AND stock > 0').get() as { count: number };
        const outOfStockCount = userId
          ? db.prepare(
            'SELECT COUNT(*) as count FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE p.userId = ? AND pv.stock = 0'
          ).get(userId) as { count: number }
          : db.prepare('SELECT COUNT(*) as count FROM product_variants WHERE stock = 0').get() as { count: number };
        const pendingOrders = userId
          ? db.prepare("SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'pending'").get(userId) as { count: number }
          : db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get() as { count: number };
        const confirmedOrders = userId
          ? db.prepare("SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'confirmed'").get(userId) as { count: number }
          : db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'confirmed'").get() as { count: number };
        const deliveredOrders = userId
          ? db.prepare("SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'delivered'").get(userId) as { count: number }
          : db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'delivered'").get() as { count: number };
        const cancelledOrders = userId
          ? db.prepare("SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status = 'cancelled'").get(userId) as { count: number }
          : db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'").get() as { count: number };
        const avgOrderAmount = userId
          ? db.prepare("SELECT COALESCE(AVG(totalAmount), 0) as avg FROM orders WHERE userId = ? AND status != 'cancelled'").get(userId) as { avg: number }
          : db.prepare("SELECT COALESCE(AVG(totalAmount), 0) as avg FROM orders WHERE status != 'cancelled'").get() as { avg: number };
        const recentLogs = userId
          ? db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT 20').all(userId)
          : db.prepare('SELECT * FROM activity_logs ORDER BY createdAt DESC LIMIT 20').all();
        const oldestOrder = userId
          ? db.prepare('SELECT createdAt FROM orders WHERE userId = ? ORDER BY createdAt ASC LIMIT 1').get(userId) as { createdAt: string } | undefined
          : db.prepare('SELECT createdAt FROM orders ORDER BY createdAt ASC LIMIT 1').get() as { createdAt: string } | undefined;
        const newestOrder = userId
          ? db.prepare('SELECT createdAt FROM orders WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(userId) as { createdAt: string } | undefined
          : db.prepare('SELECT createdAt FROM orders ORDER BY createdAt DESC LIMIT 1').get() as { createdAt: string } | undefined;
        const topCategories = userId
          ? db.prepare(
            "SELECT category, COUNT(*) as count FROM products WHERE userId = ? AND category != '' GROUP BY category ORDER BY count DESC LIMIT 10"
          ).all(userId)
          : db.prepare(
            "SELECT category, COUNT(*) as count FROM products WHERE category != '' GROUP BY category ORDER BY count DESC LIMIT 10"
          ).all();

        return {
          users,
          totalUsers: totalUsers.count,
          totalClients: totalClients.count,
          totalProducts: totalProducts.count,
          activeProducts: activeProducts.count,
          totalVariants: totalVariants.count,
          totalOrders: totalOrders.count,
          totalRevenue: totalRevenue.total,
          totalOrderItems: totalOrderItems.count,
          totalLogs: totalLogs.count,
          lowStockCount: lowStockCount.count,
          outOfStockCount: outOfStockCount.count,
          pendingOrders: pendingOrders.count,
          confirmedOrders: confirmedOrders.count,
          deliveredOrders: deliveredOrders.count,
          cancelledOrders: cancelledOrders.count,
          avgOrderAmount: Math.round(avgOrderAmount.avg),
          recentLogs,
          oldestOrder: oldestOrder?.createdAt || null,
          newestOrder: newestOrder?.createdAt || null,
          topCategories,
        };
      })();

      // DB file size
      const dbPath = path.join(process.cwd(), 'data', 'vente-en-ligne.db');
      let dbSizeBytes = 0;
      try {
        const stat = fs.statSync(dbPath);
        dbSizeBytes = stat.size;
      } catch { /* file might not exist */ }

      return NextResponse.json({ ...data, dbSizeBytes });
    }

    if (type === 'export') {
      const data = db.transaction(() => {
        const clients = userId
          ? db.prepare('SELECT * FROM clients WHERE userId = ?').all(userId)
          : db.prepare('SELECT * FROM clients').all();
        const products = userId
          ? db.prepare('SELECT * FROM products WHERE userId = ?').all(userId)
          : db.prepare('SELECT * FROM products').all();
        const variants = userId
          ? db.prepare(
            `SELECT pv.* FROM product_variants pv
             JOIN products p ON pv.productId = p.id
             WHERE p.userId = ?`
          ).all(userId)
          : db.prepare('SELECT * FROM product_variants').all();
        const orders = userId
          ? db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId)
          : db.prepare('SELECT * FROM orders').all();
        const orderItems = userId
          ? db.prepare(
            `SELECT oi.* FROM order_items oi
             JOIN orders o ON oi.orderId = o.id
             WHERE o.userId = ?`
          ).all(userId)
          : db.prepare('SELECT * FROM order_items').all();
        return { clients, products, variants, orders, orderItems, exportDate: new Date().toISOString() };
      })();
      return NextResponse.json(data);
    }

    if (type === 'deliveryLocations') {
      if (!userId) {
        return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
      }
      const locations = db.prepare(
        'SELECT id, placeName, deliveryPerson, createdAt, updatedAt FROM delivery_locations WHERE userId = ? ORDER BY updatedAt DESC'
      ).all(userId);
      return NextResponse.json({ locations });
    }

    return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { action } = body;
    const userId = body.userId || '';
    const username = body.username || '';

    // Create a new user
    if (action === 'createUser') {
      const { username, password, role } = body;
      if (!username || !password) {
        return NextResponse.json({ error: 'Nom d\'utilisateur et mot de passe requis' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return NextResponse.json({ error: 'Ce nom d\'utilisateur existe déjà' }, { status: 409 });
      }
      const hashedPassword = bcrypt.hashSync(password, 10);
      const userId = uuidv4();
      db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(userId, username, hashedPassword, role || 'seller');
      db.prepare('INSERT INTO activity_logs (id, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?)').run(
        uuidv4(), 'create', 'user', userId, `Utilisateur "${username}" créé (rôle: ${role || 'seller'})`
      );
      return NextResponse.json({ success: true, user: { id: userId, username, role: role || 'seller' } }, { status: 201 });
    }

    // Delete a user
    if (action === 'deleteUser') {
      const { userId } = body;
      if (!userId) return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 });
      const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(userId) as { username: string; role: string } | undefined;
      if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
      if (user.role === 'admin' && adminCount.count <= 1) {
        return NextResponse.json({ error: 'Impossible de supprimer le dernier administrateur' }, { status: 400 });
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      db.prepare('INSERT INTO activity_logs (id, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?)').run(
        uuidv4(), 'delete', 'user', userId, `Utilisateur "${user.username}" supprimé`
      );
      return NextResponse.json({ success: true });
    }

    // Clean old logs
    if (action === 'cleanLogs') {
      const days = body.days || 90;
      const result = userId
        ? db.prepare(`DELETE FROM activity_logs WHERE userId = ? AND createdAt < datetime('now', '-${days} days')`).run(userId)
        : db.prepare(`DELETE FROM activity_logs WHERE createdAt < datetime('now', '-${days} days')`).run();
      return NextResponse.json({ success: true, deleted: result.changes });
    }

    // Purge cancelled orders
    if (action === 'purgeCancelled') {
      const result = db.transaction(() => {
        const cancelled = userId
          ? db.prepare("SELECT id FROM orders WHERE userId = ? AND status = 'cancelled'").all(userId) as Array<{ id: string }>
          : db.prepare("SELECT id FROM orders WHERE status = 'cancelled'").all() as Array<{ id: string }>;
        for (const order of cancelled) {
          db.prepare('DELETE FROM order_items WHERE orderId = ?').run(order.id);
        }
        const del = userId
          ? db.prepare("DELETE FROM orders WHERE userId = ? AND status = 'cancelled'").run(userId)
          : db.prepare("DELETE FROM orders WHERE status = 'cancelled'").run();
        return del.changes;
      })();
      db.prepare('INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        uuidv4(), userId, username, 'delete', 'order', '', `${result} commande(s) annulée(s) purgée(s)`
      );
      return NextResponse.json({ success: true, deleted: result });
    }

    if (action === 'clearAllData') {
      db.transaction(() => {
        db.exec('DELETE FROM order_items');
        db.exec('DELETE FROM orders');
        db.exec('DELETE FROM stock_movements');
        db.exec('DELETE FROM production_sewing_entries');
        db.exec('DELETE FROM product_serials');
        db.exec('DELETE FROM purchase_invoice_items');
        db.exec('DELETE FROM purchase_invoices');
        db.exec('DELETE FROM purchase_needs');
        db.exec('DELETE FROM production_needs');
        db.exec('DELETE FROM production_print_orders');
        db.exec('DELETE FROM live_sessions');
        db.exec('DELETE FROM activity_logs');
        db.exec('DELETE FROM clients');
        db.exec('DELETE FROM product_variants');
        db.exec('DELETE FROM products');
      })();
      return NextResponse.json({ success: true });
    }

    if (action === 'addDeliveryLocation') {
      const placeName = (body.placeName || '').trim();
      const deliveryPerson = (body.deliveryPerson || '').trim();
      if (!userId) {
        return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
      }
      if (!placeName) {
        return NextResponse.json({ error: 'Lieu de livraison requis' }, { status: 400 });
      }
      if (!deliveryPerson) {
        return NextResponse.json({ error: 'Livreur requis' }, { status: 400 });
      }
      const now = new Date().toISOString();
      const existing = db.prepare(
        'SELECT id FROM delivery_locations WHERE userId = ? AND LOWER(placeName) = LOWER(?)'
      ).get(userId, placeName) as { id: string } | undefined;
      if (existing) {
        db.prepare(
          'UPDATE delivery_locations SET deliveryPerson = ?, updatedAt = ? WHERE id = ?'
        ).run(deliveryPerson, now, existing.id);
      } else {
        db.prepare(
          'INSERT INTO delivery_locations (id, userId, placeName, deliveryPerson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(uuidv4(), userId, placeName, deliveryPerson, now, now);
      }
      const locations = db.prepare(
        'SELECT id, placeName, deliveryPerson, createdAt, updatedAt FROM delivery_locations WHERE userId = ? ORDER BY updatedAt DESC'
      ).all(userId);
      return NextResponse.json({ success: true, locations });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
