import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    if (!userId) return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });

    const needs = db.prepare(
      'SELECT * FROM production_needs WHERE userId = ? ORDER BY createdAt DESC'
    ).all(userId);

    return NextResponse.json({ needs });
  } catch (error) {
    console.error('Get production needs error:', error);
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
    db.prepare(
      'INSERT INTO production_needs (id, userId, source, description, quantity, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run(id, userId, body.source || '', body.description, Number(body.quantity || 0), username);

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Create production need error:', error);
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

    db.prepare('DELETE FROM production_needs WHERE id = ? AND userId = ?').run(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete production need error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
