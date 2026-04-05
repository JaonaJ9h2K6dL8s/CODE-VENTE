import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type InvoiceItemInput = {
  productId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
};

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const invoices = db.prepare(
      'SELECT * FROM purchase_invoices WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId) as Array<Record<string, unknown>>;

    if (invoices.length === 0) {
      return NextResponse.json({ invoices: [] });
    }

    const invoiceIds = invoices.map((inv) => inv.id);
    const placeholders = invoiceIds.map(() => '?').join(',');
    const items = db.prepare(
      `SELECT * FROM purchase_invoice_items WHERE invoiceId IN (${placeholders})`
    ).all(...invoiceIds) as Array<Record<string, unknown>>;

    const itemsByInvoice = new Map<string, Array<Record<string, unknown>>>();
    for (const item of items) {
      const invoiceId = item.invoiceId as string;
      if (!itemsByInvoice.has(invoiceId)) itemsByInvoice.set(invoiceId, []);
      itemsByInvoice.get(invoiceId)!.push(item);
    }

    const result = invoices.map((inv) => ({
      ...inv,
      items: itemsByInvoice.get(inv.id as string) || [],
    }));

    return NextResponse.json({ invoices: result });
  } catch (error) {
    console.error('Get purchase invoices error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    const items: InvoiceItemInput[] = Array.isArray(body.items) ? body.items : [];

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'Articles requis' }, { status: 400 });
    }

    const invoiceId = uuidv4();
    const now = new Date().toISOString();

    const insertInvoice = db.prepare(
      'INSERT INTO purchase_invoices (id, userId, supplier, invoiceNumber, invoiceDate, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO purchase_invoice_items (id, invoiceId, productId, variantId, productName, variantSize, unit, quantity, unitCost, totalCost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const updateVariantStock = db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?');
    const insertMovement = db.prepare(
      'INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      insertInvoice.run(
        invoiceId,
        userId,
        body.supplier || '',
        body.invoiceNumber || '',
        body.invoiceDate || '',
        body.notes || '',
        now
      );

      for (const item of items) {
        const variant = db.prepare(
          'SELECT pv.*, p.name as productName, p.code as productCode, p.unit as unit FROM product_variants pv JOIN products p ON pv.productId = p.id WHERE pv.id = ? AND p.userId = ?'
        ).get(item.variantId, userId) as { id: string; productId: string; size: string; productName: string; productCode: string; unit: string } | undefined;

        if (!variant) continue;

        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCost || 0);
        const totalCost = quantity * unitCost;

        insertItem.run(
          uuidv4(),
          invoiceId,
          variant.productId,
          variant.id,
          variant.productName,
          variant.size || '',
          variant.unit || '',
          quantity,
          unitCost,
          totalCost
        );

        updateVariantStock.run(quantity, variant.id);
        insertMovement.run(
          uuidv4(),
          userId,
          variant.productId,
          variant.id,
          variant.productCode || '',
          variant.productName,
          variant.unit || '',
          variant.size || '',
          quantity,
          'in',
          'Achat',
          username,
          now
        );
      }
    });

    transaction();

    return NextResponse.json({ id: invoiceId }, { status: 201 });
  } catch (error) {
    console.error('Create purchase invoice error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
