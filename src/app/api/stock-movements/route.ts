import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type MovementRow = {
  code?: string;
  designation?: string;
  quantity?: number;
};

type ProductRow = {
  id: string;
  code?: string;
  name: string;
  unit?: string;
};

type VariantRow = {
  id: string;
  size?: string;
  stock?: number;
};

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const reasonPrefix = searchParams.get('reasonPrefix') || '';
    const movementType = searchParams.get('movementType') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const offset = (page - 1) * limit;

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    let whereClause = 'WHERE userId = ?';
    const params: (string | number)[] = [userId];
    if (reasonPrefix) {
      whereClause += ' AND reason LIKE ?';
      params.push(`${reasonPrefix}%`);
    }
    if (movementType === 'in' || movementType === 'out') {
      whereClause += ' AND movementType = ?';
      params.push(movementType);
    }
    if (dateFrom) {
      whereClause += ' AND date(createdAt) >= date(?)';
      params.push(dateFrom);
    }
    if (dateTo) {
      whereClause += ' AND date(createdAt) <= date(?)';
      params.push(dateTo);
    }

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM stock_movements ${whereClause}`
    ).get(...params) as { count: number };

    const movements = db.prepare(
      `SELECT * FROM stock_movements ${whereClause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return NextResponse.json({ movements, total: total.count });
  } catch (error) {
    console.error('Get stock movements error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    if (body.action === 'import') {
      const rows: MovementRow[] = Array.isArray(body.rows) ? body.rows : [];
      const movementType = body.movementType === 'out' ? 'out' : 'in';
      let updated = 0;
      let skipped = 0;

      const findProductByCode = db.prepare('SELECT * FROM products WHERE userId = ? AND code = ?');
      const findProductByName = db.prepare('SELECT * FROM products WHERE userId = ? AND name = ?');
      const findFirstVariant = db.prepare('SELECT * FROM product_variants WHERE productId = ? ORDER BY rowid ASC LIMIT 1');
      const insertVariant = db.prepare('INSERT INTO product_variants (id, productId, size, color, price, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const updateVariantStock = db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?');
      const insertMovement = db.prepare(
        'INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      const now = new Date().toISOString();

      const transaction = db.transaction(() => {
        for (const row of rows) {
          const quantity = Number(row.quantity || 0);
          if (quantity <= 0) { skipped++; continue; }
          let product = (row.code ? findProductByCode.get(userId, row.code) : undefined) as ProductRow | undefined;
          if (!product && row.designation) {
            product = findProductByName.get(userId, row.designation) as ProductRow | undefined;
          }
          if (!product) { skipped++; continue; }
          let variant = findFirstVariant.get(product.id) as VariantRow | undefined;
          if (!variant) {
            const variantId = uuidv4();
            insertVariant.run(variantId, product.id, 'Standard', '', 0, 0, '');
            variant = { id: variantId, size: 'Standard', stock: 0 };
          }
          const currentStock = Number(variant.stock || 0);
          const nextStock = movementType === 'out' ? currentStock - quantity : currentStock + quantity;
          if (nextStock < 0) { skipped++; continue; }
          updateVariantStock.run(nextStock, variant.id);
          insertMovement.run(
            uuidv4(),
            userId,
            product.id,
            variant.id,
            product.code || '',
            product.name,
            product.unit || '',
            variant.size || '',
            quantity,
            movementType,
            movementType === 'out' ? 'Sortie stock' : 'Entrée stock',
            username,
            now
          );
          updated++;
        }
      });

      transaction();

      return NextResponse.json({ updated, skipped });
    }

    const productId = body.productId || '';
    const variantId = body.variantId || '';
    const movementType = body.movementType === 'out' ? 'out' : 'in';
    const quantity = Number(body.quantity || 0);
    const reason = body.reason || '';

    if (!productId || !variantId || quantity <= 0) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as ProductRow | undefined;
    if (!product) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
    }

    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as VariantRow | undefined;
    if (!variant) {
      return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
    }

    const currentStock = Number(variant.stock || 0);
    const nextStock = movementType === 'out' ? currentStock - quantity : currentStock + quantity;
    if (nextStock < 0) {
      return NextResponse.json({ error: 'Stock insuffisant' }, { status: 400 });
    }

    if (movementType === 'out' && String(reason || '').startsWith('Sortie boutique')) {
      const sewingIn = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) as total
         FROM stock_movements
         WHERE userId = ? AND productId = ? AND variantId = ? AND movementType = 'in' AND reason LIKE 'Production couture%'`
      ).get(userId, productId, variantId) as { total: number };
      const sewingOut = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) as total
         FROM stock_movements
         WHERE userId = ? AND productId = ? AND variantId = ? AND movementType = 'out' AND reason LIKE 'Sortie boutique%'`
      ).get(userId, productId, variantId) as { total: number };
      const available = Number(sewingIn.total || 0) - Number(sewingOut.total || 0);
      if (available < quantity) {
        return NextResponse.json({ error: 'Stock couture insuffisant' }, { status: 400 });
      }
    }

    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);
      db.prepare(
        'INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        uuidv4(),
        userId,
        productId,
        variantId,
        product.code || '',
        product.name,
        product.unit || '',
        variant.size || '',
        quantity,
        movementType,
        reason,
        username,
        now
      );
    });

    transaction();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Stock movement error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const id = body.id || '';
    const username = body.username || '';

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const movement = db.prepare('SELECT * FROM stock_movements WHERE id = ? AND userId = ?').get(id, userId) as Record<string, unknown> | undefined;
    if (!movement) {
      return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 });
    }

    const oldProductId = String(movement.productId || '');
    const oldVariantId = String(movement.variantId || '');
    const oldQuantity = Number(movement.quantity || 0);
    const oldType = movement.movementType === 'out' ? 'out' : 'in';

    const productId = body.productId || oldProductId;
    const variantId = body.variantId || oldVariantId;
    const quantity = Number(body.quantity || oldQuantity);
    const movementType = body.movementType === 'out' || body.movementType === 'in' ? body.movementType : oldType;
    const reason = body.reason !== undefined ? String(body.reason || '') : String(movement.reason || '');

    if (!productId || !variantId || quantity <= 0) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined;
    if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
    if (!variant) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });

    const oldEffect = oldType === 'in' ? oldQuantity : -oldQuantity;
    const newEffect = movementType === 'in' ? quantity : -quantity;

    const transaction = db.transaction(() => {
      if (oldVariantId === variantId) {
        const currentStock = Number(variant.stock || 0);
        const nextStock = currentStock + (newEffect - oldEffect);
        if (nextStock < 0) throw new Error('Stock insuffisant');
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);
      } else {
        const oldVariant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(oldVariantId, oldProductId) as Record<string, unknown> | undefined;
        if (!oldVariant) throw new Error('Taille introuvable');
        const oldCurrent = Number(oldVariant.stock || 0);
        const nextOld = oldCurrent - oldEffect;
        if (nextOld < 0) throw new Error('Stock insuffisant');
        const newCurrent = Number(variant.stock || 0);
        const nextNew = newCurrent + newEffect;
        if (nextNew < 0) throw new Error('Stock insuffisant');
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextOld, oldVariantId);
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextNew, variantId);
      }

      db.prepare(
        'UPDATE stock_movements SET productId = ?, variantId = ?, productCode = ?, productName = ?, unit = ?, size = ?, quantity = ?, movementType = ?, reason = ?, createdBy = ? WHERE id = ? AND userId = ?'
      ).run(
        productId,
        variantId,
        product.code || '',
        product.name || '',
        product.unit || '',
        variant.size || '',
        quantity,
        movementType,
        reason,
        username,
        id,
        userId
      );
    });

    if (movementType === 'out' && String(reason || '').startsWith('Sortie boutique')) {
      const sewingIn = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) as total
         FROM stock_movements
         WHERE userId = ? AND productId = ? AND variantId = ? AND movementType = 'in' AND reason LIKE 'Production couture%'`
      ).get(userId, productId, variantId) as { total: number };
      const sewingOut = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) as total
         FROM stock_movements
         WHERE userId = ? AND productId = ? AND variantId = ? AND movementType = 'out' AND reason LIKE 'Sortie boutique%' AND id != ?`
      ).get(userId, productId, variantId, id) as { total: number };
      const available = Number(sewingIn.total || 0) - Number(sewingOut.total || 0);
      if (available < quantity) {
        return NextResponse.json({ error: 'Stock couture insuffisant' }, { status: 400 });
      }
    }

    transaction();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: message === 'Stock insuffisant' ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    const userId = searchParams.get('userId') || '';
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    const movement = db.prepare('SELECT * FROM stock_movements WHERE id = ? AND userId = ?').get(id, userId) as Record<string, unknown> | undefined;
    if (!movement) return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 });

    const productId = String(movement.productId || '');
    const variantId = String(movement.variantId || '');
    const quantity = Number(movement.quantity || 0);
    const movementType = movement.movementType === 'out' ? 'out' : 'in';

    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
    if (!variant) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });

    const currentStock = Number(variant.stock || 0);
    const nextStock = movementType === 'in' ? currentStock - quantity : currentStock + quantity;
    if (nextStock < 0) {
      return NextResponse.json({ error: 'Stock insuffisant' }, { status: 400 });
    }

    const transaction = db.transaction(() => {
      db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);
      db.prepare('DELETE FROM stock_movements WHERE id = ? AND userId = ?').run(id, userId);
    });

    transaction();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
