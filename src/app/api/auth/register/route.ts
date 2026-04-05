import getDb from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const db = getDb();

    if (!username || !password) {
        return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    if (password.length < 6) {
        return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return NextResponse.json({ error: 'Ce nom d\'utilisateur existe déjà' }, { status: 400 });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    // Remove hyphens to keep IDs cleaner if desired, or keep standard UUID
    const id = `usr_${uuidv4().replace(/-/g, '')}`;

    db.prepare(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
    ).run(id, username, hashedPassword, 'admin');

    // Log activity
    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), id, username, 'register', 'auth', id, 'Inscription nouvel admin');

    return NextResponse.json({
      user: { id, username, role: 'admin' },
    });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
