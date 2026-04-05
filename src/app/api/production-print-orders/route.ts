import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    const orders = db.prepare(
      'SELECT * FROM production_print_orders WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Get production print orders error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    const username = body.username || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!body.description) return NextResponse.json({ error: 'Description requise' }, { status: 400 });

    const id = uuidv4();
    const requestDate = body.requestDate || new Date().toISOString().split('T')[0];
    const status = body.status || 'En attente';

    db.prepare(
      'INSERT INTO production_print_orders (id, userId, requestDate, requester, description, quantity, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run(id, userId, requestDate, username, body.description, Number(body.quantity || 0), status);

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Create production print order error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    if (!body.id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    db.prepare(
      'UPDATE production_print_orders SET status = ? WHERE id = ? AND userId = ?'
    ).run(body.status || 'En attente', body.id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update production print order error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId') || '';
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    db.prepare('DELETE FROM production_print_orders WHERE id = ? AND userId = ?').run(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete production print order error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
