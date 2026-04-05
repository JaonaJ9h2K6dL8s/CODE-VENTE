import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'dashboard';
    const userId = searchParams.get('userId') || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    if (type === 'dashboard') {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');

      // Run all read queries in a single transaction for consistency & speed
      const getDashboardData = db.transaction(() => {
        const todayStats = db.prepare(
          `SELECT COUNT(*) as orders, COALESCE(SUM(totalAmount), 0) as revenue
           FROM orders WHERE userId = ? AND date(createdAt) = date(?) AND status != 'cancelled'`
        ).get(userId, today) as { orders: number; revenue: number };

        const monthlyStats = db.prepare(
          `SELECT COUNT(*) as orders, COALESCE(SUM(totalAmount), 0) as revenue
           FROM orders WHERE userId = ? AND date(createdAt) >= date(?) AND status != 'cancelled'`
        ).get(userId, monthStart) as { orders: number; revenue: number };

        const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE userId = ?').get(userId) as { count: number };

        const topProducts = db.prepare(
          `SELECT oi.productName, SUM(oi.quantity) as totalSold, SUM(oi.totalPrice) as revenue
           FROM order_items oi
           JOIN orders o ON oi.orderId = o.id
           WHERE o.userId = ? AND o.status != 'cancelled'
           GROUP BY oi.productName
           ORDER BY totalSold DESC LIMIT 10`
        ).all(userId) as Array<{ productName: string; totalSold: number; revenue: number }>;

        const revenueByDay = db.prepare(
          `SELECT date(createdAt) as date, COUNT(*) as orders, COALESCE(SUM(totalAmount), 0) as revenue
           FROM orders WHERE userId = ? AND date(createdAt) >= date(?, '-30 days') AND status != 'cancelled'
           GROUP BY date(createdAt) ORDER BY date(createdAt)`
        ).all(userId, today) as Array<{ date: string; orders: number; revenue: number }>;

        const ordersByStatus = db.prepare(
          `SELECT status, COUNT(*) as count FROM orders WHERE userId = ? GROUP BY status`
        ).all(userId) as Array<{ status: string; count: number }>;

        const lowStockProducts = db.prepare(
          `SELECT p.name as productName, pv.size || ' - ' || pv.color as variantInfo, pv.stock
           FROM product_variants pv
           JOIN products p ON pv.productId = p.id
           WHERE p.userId = ? AND pv.stock <= 5 AND p.isActive = 1
           ORDER BY pv.stock ASC LIMIT 20`
        ).all(userId) as Array<{ productName: string; variantInfo: string; stock: number }>;

        // Simple stats for new page with date filtering
        let productSoldQuery = `
          SELECT COALESCE(SUM(quantity), 0) as total FROM order_items oi
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

        const totalProductSold = db.prepare(productSoldQuery).get(...productSoldParams) as { total: number };

        const totalOrdersCount = db.prepare(
          `SELECT COUNT(*) as count FROM orders WHERE userId = ? AND status != 'cancelled'`
        ).get(userId) as { count: number };

        // Recettes Prévues (Total amount of all confirmed/pending orders that are not yet paid)
        // Or strictly future revenue from stock? 
        // Based on request "Recettes Prévues", usually means potential revenue from current stock OR pending orders.
        // Let's interpret as "Total revenue of orders not yet cancelled" (Actual + Potential) OR "Total value of stock".
        // Given the context of "Volume commandes", it likely means revenue from orders.
        // Let's assume "Recettes Prévues" = Total Revenue of all active orders (not cancelled).
        const expectedRevenue = db.prepare(
          `SELECT COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE userId = ? AND status != 'cancelled'`
        ).get(userId) as { total: number };

        return { todayStats, monthlyStats, totalClients, topProducts, revenueByDay, ordersByStatus, lowStockProducts, totalProductSold, totalOrdersCount, expectedRevenue };
      });

      const data = getDashboardData();

      const response = NextResponse.json({
        todaySales: data.todayStats.orders,
        todayOrders: data.todayStats.orders,
        todayRevenue: data.todayStats.revenue,
        monthlyRevenue: data.monthlyStats.revenue,
        monthlyOrders: data.monthlyStats.orders,
        totalClients: data.totalClients.count,
        topProducts: data.topProducts,
        revenueByDay: data.revenueByDay,
        ordersByStatus: data.ordersByStatus,
        lowStockProducts: data.lowStockProducts,
        // New simple stats
        totalProductSold: data.totalProductSold.total,
        totalOrdersCount: data.totalOrdersCount.count,
        expectedRevenue: data.expectedRevenue.total,
      });

      // Cache dashboard data for 30 seconds to avoid hammering the DB
      response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
      return response;
    }

    if (type === 'logs') {
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '100');
      const offset = (page - 1) * limit;

      const logs = db.prepare(
        'SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?'
      ).all(userId, limit, offset);

      const total = db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE userId = ?').get(userId) as { count: number };

      return NextResponse.json({ logs, total: total.count, page, limit });
    }

    return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
