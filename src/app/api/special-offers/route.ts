import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type OfferItemInput = {
  productId: string;
  variantId: string;
  quantity: number;
};

function generateOfferCode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const shortId = uuidv4().slice(0, 6).toUpperCase();
  return `OFF-${y}${m}${d}-${shortId}`;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const mode = searchParams.get('mode') || 'offers';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    if (mode === 'articles') {
      const products = db.prepare(
        `SELECT p.*
         FROM products p
         WHERE p.userId = ? AND p.isActive = 1 AND COALESCE(p.isSpecialOffer, 0) = 0
         ORDER BY p.name ASC`
      ).all(userId) as Array<Record<string, unknown>>;

      if (products.length === 0) {
        return NextResponse.json({ products: [] });
      }

      const productIds = products.map((product) => product.id as string);
      const placeholders = productIds.map(() => '?').join(',');
      const variants = db.prepare(
        `SELECT * FROM product_variants WHERE productId IN (${placeholders}) ORDER BY size ASC, color ASC`
      ).all(...productIds) as Array<Record<string, unknown>>;

      const variantsByProduct = new Map<string, Array<Record<string, unknown>>>();
      for (const variant of variants) {
        const productId = variant.productId as string;
        if (!variantsByProduct.has(productId)) {
          variantsByProduct.set(productId, []);
        }
        variantsByProduct.get(productId)?.push(variant);
      }

      const hydrated = products.map((product) => ({
        ...product,
        variants: variantsByProduct.get(product.id as string) || [],
      }));

      return NextResponse.json({ products: hydrated });
    }

    const offers = db.prepare(
      `SELECT so.*, p.code as offerCode, p.name as offerProductName, pv.stock as offerStock
       FROM special_offers so
       JOIN products p ON p.id = so.productId
       JOIN product_variants pv ON pv.id = so.variantId
       WHERE so.userId = ?
       ORDER BY so.createdAt DESC`
    ).all(userId) as Array<Record<string, unknown>>;

    const offerIds = offers.map((offer) => offer.id as string);
    if (offerIds.length === 0) {
      return NextResponse.json({ offers: [] });
    }

    const placeholders = offerIds.map(() => '?').join(',');
    const items = db.prepare(
      `SELECT * FROM special_offer_items WHERE offerId IN (${placeholders}) ORDER BY rowid ASC`
    ).all(...offerIds) as Array<Record<string, unknown>>;

    const itemsByOfferId = new Map<string, Array<Record<string, unknown>>>();
    for (const item of items) {
      const offerId = item.offerId as string;
      if (!itemsByOfferId.has(offerId)) {
        itemsByOfferId.set(offerId, []);
      }
      itemsByOfferId.get(offerId)?.push(item);
    }

    const hydratedOffers = offers.map((offer) => {
      const details = itemsByOfferId.get(offer.id as string) || [];
      const bundleQuantity = details.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      return {
        ...offer,
        bundleQuantity,
        items: details,
      };
    });

    return NextResponse.json({ offers: hydratedOffers });
  } catch (error) {
    console.error('Get special offers error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    const offerName = String(body.offerName || '').trim();
    const discountAmount = Number(body.discountAmount || 0);
    const stockQuantity = Math.max(1, Number(body.stockQuantity || 1));
    const inputItems = Array.isArray(body.items) ? (body.items as OfferItemInput[]) : [];

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }
    if (!offerName) {
      return NextResponse.json({ error: "Nom de l'offre requis" }, { status: 400 });
    }
    if (inputItems.length === 0) {
      return NextResponse.json({ error: 'Ajoutez au moins un article' }, { status: 400 });
    }

    const itemDetails: Array<{
      id: string;
      productId: string;
      productName: string;
      variantId: string;
      variantSize: string;
      variantColor: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    let subtotalAmount = 0;
    for (const item of inputItems) {
      if (!item.productId || !item.variantId || Number(item.quantity) <= 0) {
        continue;
      }
      const variant = db.prepare(
        `SELECT pv.*, p.name as productName, p.userId as productUserId, COALESCE(p.isSpecialOffer, 0) as isSpecialOffer
         FROM product_variants pv
         JOIN products p ON p.id = pv.productId
         WHERE pv.id = ? AND pv.productId = ?`
      ).get(item.variantId, item.productId) as
        | {
            id: string;
            productId: string;
            size: string;
            color: string;
            price: number;
            productName: string;
            productUserId: string;
            isSpecialOffer: number;
          }
        | undefined;

      if (!variant || variant.productUserId !== userId || variant.isSpecialOffer === 1) {
        continue;
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Number(variant.price || 0);
      const totalPrice = unitPrice * quantity;
      subtotalAmount += totalPrice;

      itemDetails.push({
        id: uuidv4(),
        productId: variant.productId,
        productName: variant.productName,
        variantId: variant.id,
        variantSize: variant.size || '',
        variantColor: variant.color || '',
        quantity,
        unitPrice,
        totalPrice,
      });
    }

    if (itemDetails.length === 0) {
      return NextResponse.json({ error: 'Aucun article valide' }, { status: 400 });
    }
    if (discountAmount < 0) {
      return NextResponse.json({ error: 'La remise ne peut pas être négative' }, { status: 400 });
    }
    if (discountAmount > subtotalAmount) {
      return NextResponse.json({ error: 'La remise dépasse le total des articles' }, { status: 400 });
    }

    const finalAmount = subtotalAmount - discountAmount;
    const now = new Date().toISOString();
    const offerId = uuidv4();
    const offerProductId = uuidv4();
    const offerVariantId = uuidv4();
    const offerCode = generateOfferCode();

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO products (id, userId, code, name, description, category, unit, imageUrl, isActive, isSpecialOffer, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        offerProductId,
        userId,
        offerCode,
        offerName,
        `Offre spéciale: ${offerName}`,
        'Offre spéciale',
        'offre',
        '',
        1,
        1,
        now,
        now
      );

      db.prepare(
        `INSERT INTO product_variants (id, productId, size, color, price, stock, sku)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        offerVariantId,
        offerProductId,
        'Pack',
        '',
        finalAmount,
        stockQuantity,
        `${offerCode}-PACK`
      );

      db.prepare(
        `INSERT INTO special_offers (id, userId, productId, variantId, name, subtotalAmount, discountAmount, finalAmount, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        offerId,
        userId,
        offerProductId,
        offerVariantId,
        offerName,
        subtotalAmount,
        discountAmount,
        finalAmount,
        username,
        now,
        now
      );

      const insertOfferItem = db.prepare(
        `INSERT INTO special_offer_items (id, offerId, productId, productName, variantId, variantSize, variantColor, quantity, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of itemDetails) {
        insertOfferItem.run(
          item.id,
          offerId,
          item.productId,
          item.productName,
          item.variantId,
          item.variantSize,
          item.variantColor,
          item.quantity,
          item.unitPrice,
          item.totalPrice
        );
      }

      db.prepare(
        `INSERT INTO stock_movements (id, userId, productId, variantId, productCode, productName, unit, size, quantity, movementType, reason, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        userId,
        offerProductId,
        offerVariantId,
        offerCode,
        offerName,
        'offre',
        'Pack',
        stockQuantity,
        'in',
        'Création offre spéciale',
        username,
        now
      );

      db.prepare(
        'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        uuidv4(),
        userId,
        username,
        'create',
        'special_offer',
        offerId,
        `Offre spéciale créée: ${offerName} (${finalAmount.toLocaleString('fr-FR')} MGA)`
      );
    });

    transaction();

    return NextResponse.json(
      {
        id: offerId,
        offerName,
        offerCode,
        subtotalAmount,
        discountAmount,
        finalAmount,
        stockQuantity,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create special offer error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
