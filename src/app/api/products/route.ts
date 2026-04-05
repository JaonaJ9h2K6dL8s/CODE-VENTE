import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type VariantInput = {
  id?: string;
  size?: string;
  color?: string;
  price?: number;
  stock?: number;
  sku?: string;
};

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const userId = searchParams.get('userId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    let whereClause = 'WHERE p.userId = ?';
    const params: (string | number)[] = [userId];

    if (search) {
      whereClause += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      whereClause += ' AND p.category = ?';
      params.push(category);
    }

    // Single query with JOIN instead of N+1 queries
    const products = db.prepare(
      `SELECT p.* FROM products p ${whereClause} ORDER BY p.updatedAt DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Array<Record<string, unknown>>;

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM products p ${whereClause}`
    ).get(...params) as { count: number };

    // Batch load all variants for the fetched products in ONE query
    if (products.length > 0) {
      const productIds = products.map(p => p.id as string);
      const placeholders = productIds.map(() => '?').join(',');
      const allVariants = db.prepare(
        `SELECT * FROM product_variants WHERE productId IN (${placeholders})`
      ).all(...productIds) as Array<Record<string, unknown>>;

      // Group variants by productId
      const variantsByProduct = new Map<string, Array<Record<string, unknown>>>();
      for (const v of allVariants) {
        const pid = v.productId as string;
        if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
        variantsByProduct.get(pid)!.push(v);
      }

      for (const product of products) {
        (product as Record<string, unknown>).variants = variantsByProduct.get(product.id as string) || [];
      }
    }

    const categories = db.prepare(
      "SELECT DISTINCT category FROM products WHERE userId = ? AND category != '' ORDER BY category"
    ).all(userId) as Array<{ category: string }>;

    return NextResponse.json({
      products,
      total: total.count,
      page,
      limit,
      categories: categories.map((c) => c.category),
    });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const productId = uuidv4();
    const now = new Date().toISOString();
    const userId = body.userId;
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const insertProduct = db.prepare(
      'INSERT INTO products (id, userId, code, name, description, category, unit, imageUrl, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertVariant = db.prepare(
      'INSERT INTO product_variants (id, productId, size, color, price, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      insertProduct.run(productId, userId, body.code || '', body.name, body.description || '', body.category || '', body.unit || '', body.imageUrl || '', 1, now, now);

      if (body.variants && body.variants.length > 0) {
        for (const variant of body.variants) {
          insertVariant.run(
            uuidv4(), productId, variant.size || '', variant.color || '',
            variant.price || 0, variant.stock || 0, variant.sku || ''
          );
        }
      }
    });

    transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'create', 'product', productId, `Produit créé: ${body.name}`);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    const variants = db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(productId);

    return NextResponse.json({ ...product as object, variants }, { status: 201 });
  } catch (error) {
    console.error('Create product error:', error);
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

    const existing = db.prepare('SELECT id FROM products WHERE id = ? AND userId = ?').get(body.id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 });
    }

    const variants: VariantInput[] = Array.isArray(body.variants) ? body.variants : [];

    const transaction = db.transaction(() => {
      db.prepare(
        'UPDATE products SET code = ?, name = ?, description = ?, category = ?, unit = ?, imageUrl = ?, isActive = ?, updatedAt = ? WHERE id = ? AND userId = ?'
      ).run(body.code || '', body.name, body.description || '', body.category || '', body.unit || '', body.imageUrl || '', body.isActive ? 1 : 0, now, body.id, userId);

      // Handle variants update intelligently to preserve foreign keys
      const currentVariantIds = variants.map((v) => v.id).filter(Boolean) as string[];
      
      // Delete removed variants (only if they are not used in orders - otherwise this might fail, but that's expected for data integrity)
      // If a variant is used in an order, we CANNOT delete it.
      // Strategy: Try to delete. If it fails, ignore (it means it's used).
      // But wait, if we ignore, it stays in the product but user wanted to remove it?
      // Better: We only delete if we can. If we can't, we keep it but maybe set stock to 0 or inactive?
      // For now, let's try to delete. If it fails, the transaction aborts, which is safer than corruption.
      // But user wants to update STOCK of an existing variant.
      
      if (currentVariantIds.length > 0) {
        // Delete variants not in the list
        const placeholders = currentVariantIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM product_variants WHERE productId = ? AND id NOT IN (${placeholders})`).run(body.id, ...currentVariantIds);
      } else {
        // If no variants provided or all new, try to delete all old ones?
        // If we are adding new ones, we shouldn't delete all if we didn't pass IDs.
        // But the frontend now passes IDs.
        // If the list is empty, we delete all.
        if (Array.isArray(body.variants) && body.variants.length === 0) {
           db.prepare('DELETE FROM product_variants WHERE productId = ?').run(body.id);
        }
      }

      if (variants.length > 0) {
        const updateVariant = db.prepare(
          'UPDATE product_variants SET size = ?, color = ?, price = ?, stock = ?, sku = ? WHERE id = ? AND productId = ?'
        );
        const insertVariant = db.prepare(
          'INSERT INTO product_variants (id, productId, size, color, price, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        for (const variant of variants) {
          if (variant.id) {
            // Try update
            const res = updateVariant.run(
              variant.size || '', variant.color || '', variant.price || 0, variant.stock || 0, variant.sku || '',
              variant.id, body.id
            );
            if (res.changes === 0) {
              // ID provided but not found? Insert it.
              insertVariant.run(
                variant.id, body.id, variant.size || '', variant.color || '',
                variant.price || 0, variant.stock || 0, variant.sku || ''
              );
            }
          } else {
            // Insert new
            insertVariant.run(
              uuidv4(), body.id, variant.size || '', variant.color || '',
              variant.price || 0, variant.stock || 0, variant.sku || ''
            );
          }
        }
      }
    });

    transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'update', 'product', body.id, `Produit modifié: ${body.name}`);

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND userId = ?').get(body.id, userId);
    const productVariants = db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(body.id);

    return NextResponse.json({ ...product as object, variants: productVariants });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
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

    const product = db.prepare('SELECT name FROM products WHERE id = ? AND userId = ?').get(id, userId) as { name: string } | undefined;
    if (!product) return NextResponse.json({ error: 'Produit non trouvé' }, { status: 404 });

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM product_variants WHERE productId = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ? AND userId = ?').run(id, userId);
    });
    transaction();

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'delete', 'product', id, `Produit supprimé: ${product?.name || id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
