import getDb from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as {
      id: string; username: string; password: string; role: string; createdAt: string;
    } | undefined;

    if (!user) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    // Log activity
    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), user.id, user.username, 'login', 'auth', user.id, 'Connexion réussie');

    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId, currentPassword, newPassword } = await request.json();
    const db = getDb();

    if (!userId || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
      id: string; username: string; password: string; role: string;
    } | undefined;

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password);
    if (!validPassword) {
      return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);

    db.prepare(
      'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), user.id, user.username, 'update', 'auth', user.id, 'Mot de passe modifié');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
