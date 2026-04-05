import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    const rows = db.prepare(
      `
      WITH out_qty AS (
        SELECT productId, variantId, MIN(createdAt) as firstOut, SUM(quantity) as total
        FROM stock_movements
        WHERE userId = ? AND movementType = 'out' AND reason LIKE 'Sortie boutique%'
        GROUP BY productId, variantId
      ),
      sold_qty AS (
        SELECT oi.variantId as variantId, SUM(oi.quantity) as total
        FROM order_items oi
        JOIN orders o ON o.id = oi.orderId
        JOIN out_qty oq ON oq.variantId = oi.variantId
        WHERE o.userId = ? AND o.status != 'cancelled' AND datetime(o.createdAt) >= datetime(oq.firstOut)
        GROUP BY oi.variantId
      )
      SELECT
        p.id as productId,
        p.name as productName,
        pv.id as variantId,
        pv.size as size,
        pv.color as color,
        pv.price as price,
        COALESCE(oq.total, 0) as outQty,
        COALESCE(sq.total, 0) as soldQty,
        CASE
          WHEN COALESCE(oq.total, 0) - COALESCE(sq.total, 0) < 0 THEN 0
          ELSE COALESCE(oq.total, 0) - COALESCE(sq.total, 0)
        END as available
      FROM product_variants pv
      JOIN products p ON p.id = pv.productId
      LEFT JOIN out_qty oq ON oq.variantId = pv.id AND oq.productId = p.id
      LEFT JOIN sold_qty sq ON sq.variantId = pv.id
      WHERE p.userId = ?
      ORDER BY p.name ASC
      `
    ).all(userId, userId, userId);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('Get boutique stock error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const variantId = body.variantId || '';
    const price = Number(body.price);

    if (!userId || !variantId || !Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const variant = db.prepare(
      `SELECT pv.id
       FROM product_variants pv
       JOIN products p ON p.id = pv.productId
       WHERE pv.id = ? AND p.userId = ?`
    ).get(variantId, userId) as { id: string } | undefined;

    if (!variant) {
      return NextResponse.json({ error: 'Variante introuvable' }, { status: 404 });
    }

    db.prepare('UPDATE product_variants SET price = ? WHERE id = ?').run(price, variantId);

    return NextResponse.json({ success: true, price });
  } catch (error) {
    console.error('Update boutique stock price error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || 'system';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const variants = db.prepare(
      `
      SELECT
        pv.id as variantId,
        pv.stock as stock,
        pv.size as size,
        pv.color as color,
        p.id as productId,
        p.name as productName,
        p.code as productCode,
        p.unit as unit
      FROM product_variants pv
      JOIN products p ON p.id = pv.productId
      WHERE p.userId = ?
      `
    ).all(userId) as Array<{
      variantId: string;
      stock: number;
      size?: string;
      color?: string;
      productId: string;
      productName: string;
      productCode?: string;
      unit?: string;
    }>;

    const outRows = db.prepare(
      `
      SELECT variantId, SUM(quantity) as total
      FROM stock_movements
      WHERE userId = ? AND movementType = 'out' AND reason LIKE 'Sortie boutique%'
      GROUP BY variantId
      `
    ).all(userId) as Array<{ variantId: string; total: number }>;

    const outMap = new Map(outRows.map((row) => [row.variantId, Number(row.total || 0)]));
    const insert = db.prepare(
      `INSERT INTO stock_movements
        (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let movedVariants = 0;
    let movedTotal = 0;

    const transaction = db.transaction(() => {
      variants.forEach((variant) => {
        const stock = Number(variant.stock || 0);
        const alreadyOut = outMap.get(variant.variantId) || 0;
        const toMove = stock - alreadyOut;
        if (toMove <= 0) return;
        insert.run(
          uuidv4(),
          userId,
          variant.productId,
          variant.variantId,
          variant.productCode || '',
          variant.productName,
          variant.unit || '',
          variant.size || '',
          toMove,
          'out',
          'Sortie boutique (migration)',
          username
        );
        movedVariants += 1;
        movedTotal += toMove;
      });
    });

    transaction();

    return NextResponse.json({ success: true, movedVariants, movedTotal });
  } catch (error) {
    console.error('Migrate boutique stock error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
