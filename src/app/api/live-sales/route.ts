import getDb from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active');
    const id = searchParams.get('id');
    const userId = searchParams.get('userId') || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    if (id) {
      const session = db.prepare('SELECT * FROM live_sessions WHERE id = ? AND userId = ?').get(id, userId);
      if (!session) {
        return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
      }
      const orders = db.prepare(
        `SELECT o.*, 
          (SELECT json_group_array(json_object('id', oi.id, 'productName', oi.productName, 'variantSize', oi.variantSize, 'variantColor', oi.variantColor, 'quantity', oi.quantity, 'unitPrice', oi.unitPrice, 'totalPrice', oi.totalPrice))
           FROM order_items oi WHERE oi.orderId = o.id) as items
         FROM orders o WHERE o.liveSessionId = ? AND o.userId = ? ORDER BY o.createdAt DESC`
      ).all(id, userId);
      return NextResponse.json({ session, orders });
    }

    let query = 'SELECT * FROM live_sessions';
    const params: (string | number)[] = [userId];

    query += ' WHERE userId = ?';
    if (activeOnly === 'true') {
      query += ' AND isActive = 1';
    }

    query += ' ORDER BY startedAt DESC';

    const sessions = db.prepare(query).all(...params);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Get live sessions error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const id = uuidv4();
    const now = new Date().toISOString();
    const userId = body.userId;
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const todayCount = db.prepare(
      `SELECT COUNT(*) as count FROM live_sessions WHERE userId = ? AND date(startedAt) = date('now')`
    ).get(userId) as { count: number };
    const dateLabel = new Date().toLocaleDateString('fr-FR');
    const sequence = todayCount.count + 1;
    const generatedTitle = `Live du ${dateLabel}${sequence > 1 ? ` #${sequence}` : ''}`;

    db.prepare(
      `INSERT INTO live_sessions (id, title, isActive, startedAt, totalOrders, totalRevenue)
       VALUES (?, ?, 1, ?, 0, 0)`
    ).run(id, generatedTitle, now);

    db.prepare('UPDATE live_sessions SET userId = ? WHERE id = ?').run(userId, id);

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'create', 'live_session', id, `Session live créée: ${generatedTitle}`);

    const session = db.prepare('SELECT * FROM live_sessions WHERE id = ? AND userId = ?').get(id, userId);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Create live session error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const userId = body.userId;
    const username = body.username || '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM live_sessions WHERE id = ? AND userId = ?').get(body.id, userId) as { title: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    if (body.isActive === false) {
      const now = new Date().toISOString();
      db.prepare('UPDATE live_sessions SET isActive = 0, endedAt = ? WHERE id = ? AND userId = ?').run(now, body.id, userId);

      db.prepare(
        'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), userId, username, 'update', 'live_session', body.id, 'Session live terminée');
    } else if (body.isActive === true) {
      const now = new Date().toISOString();
      db.prepare('UPDATE live_sessions SET isActive = 0, endedAt = ? WHERE userId = ? AND id != ? AND isActive = 1').run(now, userId, body.id);
      db.prepare('UPDATE live_sessions SET isActive = 1, endedAt = NULL, startedAt = ? WHERE id = ? AND userId = ?').run(now, body.id, userId);
      db.prepare(
        'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uuidv4(), userId, username, 'update', 'live_session', body.id, 'Session live reprise');
    } else {
      const existingTitle = (existing as { title: string }).title;
      db.prepare('UPDATE live_sessions SET title = ? WHERE id = ? AND userId = ?').run(body.title || existingTitle, body.id, userId);
    }

    const session = db.prepare('SELECT * FROM live_sessions WHERE id = ? AND userId = ?').get(body.id, userId);
    return NextResponse.json(session);
  } catch (error) {
    console.error('Update live session error:', error);
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

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }

    const session = db.prepare('SELECT * FROM live_sessions WHERE id = ? AND userId = ?').get(id, userId) as { id: string; isActive: number } | undefined;
    if (!session) {
      return NextResponse.json({ error: 'Session non trouvée' }, { status: 404 });
    }

    if (session.isActive) {
      return NextResponse.json({ error: 'Impossible de supprimer une session active. Terminez-la d\'abord.' }, { status: 400 });
    }

    // Nullify liveSessionId on associated orders (don't delete them)
    db.prepare('UPDATE orders SET liveSessionId = NULL, isLiveOrder = 0 WHERE liveSessionId = ? AND userId = ?').run(id, userId);
    db.prepare('DELETE FROM live_sessions WHERE id = ? AND userId = ?').run(id, userId);

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, username, 'delete', 'live_session', id, `Session live supprimée: ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete live session error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
