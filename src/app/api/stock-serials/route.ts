import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const productId = searchParams.get('productId') || '';
    const variantId = searchParams.get('variantId') || '';
    const status = searchParams.get('status') || '';

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    let whereClause = 'WHERE userId = ?';
    const params: (string | number)[] = [userId];
    if (productId) {
      whereClause += ' AND productId = ?';
      params.push(productId);
    }
    if (variantId) {
      whereClause += ' AND variantId = ?';
      params.push(variantId);
    }
    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const serials = db.prepare(
      `SELECT * FROM product_serials ${whereClause} ORDER BY createdAt DESC`
    ).all(...params);

    return NextResponse.json({ serials });
  } catch (error) {
    console.error('Get stock serials error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    const productId = body.productId || '';
    const variantId = body.variantId || '';
    const branchName = String(body.branchName || '').trim();
    const rawSerials = Array.isArray(body.serialNumbers) ? body.serialNumbers : [];
    const serialNumbers: string[] = Array.from(
      new Set<string>(rawSerials.map((s: unknown) => String(s || '').trim()).filter(Boolean))
    );

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!productId || !variantId || serialNumbers.length === 0) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }
    if (!branchName) {
      return NextResponse.json({ error: 'Nom de boutique requis' }, { status: 400 });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined;
    if (!product) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
    }

    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
    if (!variant) {
      return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
    }

    const placeholders = serialNumbers.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT id, serialNumber, status FROM product_serials WHERE userId = ? AND productId = ? AND variantId = ? AND serialNumber IN (${placeholders})`
    ).all(userId, productId, variantId, ...serialNumbers) as Array<{ id: string; serialNumber: string; status: string }>;

    const foundSerials = new Set(rows.map((r) => r.serialNumber));
    const missing = serialNumbers.filter((s) => !foundSerials.has(s));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Séries introuvables: ${missing.join(', ')}` }, { status: 400 });
    }
    const notAvailable = rows.filter((r) => r.status !== 'in_stock').map((r) => r.serialNumber);
    if (notAvailable.length > 0) {
      return NextResponse.json({ error: `Séries non disponibles: ${notAvailable.join(', ')}` }, { status: 400 });
    }

    const quantity = serialNumbers.length;
    const currentStock = Number(variant.stock || 0);
    const nextStock = currentStock - quantity;
    if (nextStock < 0) {
      return NextResponse.json({ error: 'Stock insuffisant' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const movementId = uuidv4();

    const transaction = db.transaction(() => {
      db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);

      db.prepare(
        'INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        movementId,
        userId,
        productId,
        variantId,
        product.code || '',
        product.name || '',
        product.unit || '',
        variant.size || '',
        quantity,
        'out',
        `Sortie boutique - ${branchName}`,
        username,
        now
      );

      db.prepare(
        `UPDATE product_serials
         SET status = 'out', movementId = ?, branchName = ?, updatedAt = ?
         WHERE userId = ? AND productId = ? AND variantId = ? AND serialNumber IN (${placeholders})`
      ).run(movementId, branchName, now, userId, productId, variantId, ...serialNumbers);
    });

    transaction();

    return NextResponse.json({ ok: true, movementId });
  } catch (error) {
    console.error('Stock serials out error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
