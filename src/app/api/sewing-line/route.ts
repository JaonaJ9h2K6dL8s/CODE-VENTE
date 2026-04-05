import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    const entries = db.prepare(
      'SELECT * FROM production_sewing_entries WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Get sewing entries error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    let productId = body.productId || '';
    let variantId = body.variantId || '';
    const productName = String(body.productName || '').trim();
    const variantSize = String(body.variantSize || '').trim();
    const chainName = String(body.chainName || '').trim();
    const chiefName = String(body.chiefName || '').trim();
    const notes = String(body.notes || '').trim();
    const quantity = Number(body.quantity || 0);

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if ((!productName || !variantSize) && (!productId || !variantId)) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }
    if (!chainName || !chiefName) {
      return NextResponse.json({ error: 'Chaîne et chef requis' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const entryId = uuidv4();
    const movementId = uuidv4();

    const resolveOrCreate = db.transaction(() => {
      let product = productId
        ? db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined
        : undefined;

      if (!product && productName) {
        product = db.prepare('SELECT * FROM products WHERE userId = ? AND LOWER(name) = LOWER(?)').get(userId, productName) as Record<string, unknown> | undefined;
      }
      if (!product) {
        productId = uuidv4();
        db.prepare(
          'INSERT INTO products (id, userId, code, name, description, category, unit, imageUrl, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(productId, userId, '', productName, '', '', '', '', 1, now, now);
        product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined;
      } else {
        productId = String(product.id);
      }

      let variant = variantId
        ? db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined
        : undefined;
      if (!variant && variantSize) {
        variant = db.prepare('SELECT * FROM product_variants WHERE productId = ? AND LOWER(size) = LOWER(?)').get(productId, variantSize) as Record<string, unknown> | undefined;
      }
      if (!variant) {
        variantId = uuidv4();
        db.prepare('INSERT INTO product_variants (id, productId, size, color, price, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(variantId, productId, variantSize, '', 0, 0, '');
        variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
      } else {
        variantId = String(variant.id);
      }

      return { product, variant };
    });

    const resolved = resolveOrCreate();
    if (!resolved.product || !resolved.variant) {
      return NextResponse.json({ error: 'Produit ou taille introuvable' }, { status: 404 });
    }
    const product = resolved.product;
    const variant = resolved.variant;
    const nextStock = Number(variant.stock || 0) + quantity;
    const dateKey = now.slice(0, 10).replace(/-/g, '');
    const countToday = db.prepare(
      `SELECT COUNT(*) as count FROM production_sewing_entries WHERE userId = ? AND date(createdAt) = date(?)`
    ).get(userId, now) as { count: number };
    const productionNumber = `CMD-${dateKey}-${String(countToday.count + 1).padStart(4, '0')}`;

    const transaction = db.transaction(() => {
      db.prepare(
        'INSERT INTO production_sewing_entries (id, userId, productId, variantId, productName, variantSize, productionNumber, movementId, chainName, chiefName, quantity, notes, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        entryId,
        userId,
        productId,
        variantId,
        product.name || '',
        variant.size || '',
        productionNumber,
        movementId,
        chainName,
        chiefName,
        quantity,
        notes,
        username,
        now
      );

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
        'in',
        `Production couture - ${chainName} - ${productionNumber}`,
        username,
        now
      );
    });

    transaction();

    return NextResponse.json({ id: entryId }, { status: 201 });
  } catch (error) {
    console.error('Create sewing entry error:', error);
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
    const chainName = String(body.chainName || '').trim();
    const chiefName = String(body.chiefName || '').trim();
    const notes = String(body.notes || '').trim();
    const quantity = Number(body.quantity || 0);
    let productId = body.productId || '';
    let variantId = body.variantId || '';
    const productName = String(body.productName || '').trim();
    const variantSize = String(body.variantSize || '').trim();

    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    if ((!productName || !variantSize) && (!productId || !variantId)) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }
    if (quantity <= 0 || !chainName || !chiefName) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }

    const entry = db.prepare(
      'SELECT * FROM production_sewing_entries WHERE id = ? AND userId = ?'
    ).get(id, userId) as Record<string, unknown> | undefined;
    if (!entry) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }

    const oldVariantId = String(entry.variantId || '');
    const oldProductId = String(entry.productId || '');
    const oldQuantity = Number(entry.quantity || 0);
    const productionNumber = String(entry.productionNumber || '');
    let movementId = String(entry.movementId || '');

    const now = new Date().toISOString();
    const resolveOrCreate = db.transaction(() => {
      let product = productId
        ? db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined
        : undefined;
      if (!product && productName) {
        product = db.prepare('SELECT * FROM products WHERE userId = ? AND LOWER(name) = LOWER(?)').get(userId, productName) as Record<string, unknown> | undefined;
      }
      if (!product) {
        productId = uuidv4();
        db.prepare(
          'INSERT INTO products (id, userId, code, name, description, category, unit, imageUrl, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(productId, userId, '', productName, '', '', '', '', 1, now, now);
        product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(productId, userId) as Record<string, unknown> | undefined;
      } else {
        productId = String(product.id);
      }

      let variant = variantId
        ? db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined
        : undefined;
      if (!variant && variantSize) {
        variant = db.prepare('SELECT * FROM product_variants WHERE productId = ? AND LOWER(size) = LOWER(?)').get(productId, variantSize) as Record<string, unknown> | undefined;
      }
      if (!variant) {
        variantId = uuidv4();
        db.prepare('INSERT INTO product_variants (id, productId, size, color, price, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(variantId, productId, variantSize, '', 0, 0, '');
        variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
      } else {
        variantId = String(variant.id);
      }

      return { product, variant };
    });

    const resolved = resolveOrCreate();
    if (!resolved.product || !resolved.variant) {
      return NextResponse.json({ error: 'Produit ou taille introuvable' }, { status: 404 });
    }
    const product = resolved.product;
    const variant = resolved.variant;

    if (!movementId) {
      const movement = db.prepare(
        `SELECT id FROM stock_movements WHERE userId = ? AND movementType = 'in' AND reason LIKE ? AND productId = ? AND variantId = ? ORDER BY createdAt DESC LIMIT 1`
      ).get(userId, `%${productionNumber}%`, oldProductId, oldVariantId) as { id: string } | undefined;
      movementId = movement?.id || '';
    }

    const nextReason = `Production couture - ${chainName} - ${productionNumber}`;

    const transaction = db.transaction(() => {
      if (oldVariantId === variantId) {
        const currentStock = Number(variant.stock || 0);
        const delta = quantity - oldQuantity;
        const nextStock = currentStock + delta;
        if (nextStock < 0) throw new Error('Stock insuffisant');
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);
      } else {
        const oldVariant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(oldVariantId, oldProductId) as Record<string, unknown> | undefined;
        if (!oldVariant) throw new Error('Taille introuvable');
        const oldCurrent = Number(oldVariant.stock || 0);
        const nextOld = oldCurrent - oldQuantity;
        if (nextOld < 0) throw new Error('Stock insuffisant');
        const newCurrent = Number(variant.stock || 0);
        const nextNew = newCurrent + quantity;
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextOld, oldVariantId);
        db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextNew, variantId);
      }

      db.prepare(
        'UPDATE production_sewing_entries SET productId = ?, variantId = ?, productName = ?, variantSize = ?, chainName = ?, chiefName = ?, quantity = ?, notes = ?, createdBy = ?, movementId = ?, createdAt = createdAt WHERE id = ? AND userId = ?'
      ).run(
        productId,
        variantId,
        product.name || '',
        variant.size || '',
        chainName,
        chiefName,
        quantity,
        notes,
        username,
        movementId,
        id,
        userId
      );

      if (movementId) {
        db.prepare(
          'UPDATE stock_movements SET productId = ?, variantId = ?, productCode = ?, productName = ?, unit = ?, size = ?, quantity = ?, reason = ?, createdBy = ? WHERE id = ? AND userId = ?'
        ).run(
          productId,
          variantId,
          product.code || '',
          product.name || '',
          product.unit || '',
          variant.size || '',
          quantity,
          nextReason,
          username,
          movementId,
          userId
        );
      } else {
        const newMovementId = uuidv4();
        db.prepare(
          'INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          newMovementId,
          userId,
          productId,
          variantId,
          product.code || '',
          product.name || '',
          product.unit || '',
          variant.size || '',
          quantity,
          'in',
          nextReason,
          username,
          now
        );
        db.prepare('UPDATE production_sewing_entries SET movementId = ? WHERE id = ? AND userId = ?')
          .run(newMovementId, id, userId);
      }
    });

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

    const entry = db.prepare(
      'SELECT * FROM production_sewing_entries WHERE id = ? AND userId = ?'
    ).get(id, userId) as Record<string, unknown> | undefined;
    if (!entry) return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });

    const productId = String(entry.productId || '');
    const variantId = String(entry.variantId || '');
    const quantity = Number(entry.quantity || 0);
    const productionNumber = String(entry.productionNumber || '');
    let movementId = String(entry.movementId || '');

    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND productId = ?').get(variantId, productId) as Record<string, unknown> | undefined;
    if (!variant) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });

    if (!movementId) {
      const movement = db.prepare(
        `SELECT id FROM stock_movements WHERE userId = ? AND movementType = 'in' AND reason LIKE ? AND productId = ? AND variantId = ? ORDER BY createdAt DESC LIMIT 1`
      ).get(userId, `%${productionNumber}%`, productId, variantId) as { id: string } | undefined;
      movementId = movement?.id || '';
    }

    const currentStock = Number(variant.stock || 0);
    const nextStock = currentStock - quantity;
    if (nextStock < 0) {
      return NextResponse.json({ error: 'Stock insuffisant' }, { status: 400 });
    }

    const transaction = db.transaction(() => {
      db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(nextStock, variantId);
      db.prepare('DELETE FROM production_sewing_entries WHERE id = ? AND userId = ?').run(id, userId);
      if (movementId) {
        db.prepare('DELETE FROM stock_movements WHERE id = ? AND userId = ?').run(movementId, userId);
      }
    });

    transaction();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
