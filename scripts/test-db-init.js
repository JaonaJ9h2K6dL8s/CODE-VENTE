const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Mock variables
const isDev = true; // Simulating dev environment for test
const tempDir = path.join(__dirname, 'temp-data');
let db;

function getDb() {
  if (!db) {
    // Simulate userData directory
    const userDataDir = tempDir;
    const dataDir = path.join(userDataDir, 'data');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('Creating data directory:', dataDir);
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'vente-en-ligne.db');
    console.log('Opening database at:', dbPath);
    
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      
      console.log('Creating tables...');
      // Initialize tables if new DB
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'seller',
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          userId TEXT DEFAULT '',
          username TEXT DEFAULT 'system',
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entityId TEXT DEFAULT '',
          details TEXT DEFAULT '',
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      
      // Check if admin exists, if not create default
      const adminCheck = db.prepare('SELECT count(*) as count FROM users WHERE role = ?').get('admin');
      console.log('Admin count:', adminCheck.count);
      
      if (adminCheck.count === 0) {
        console.log('Creating admin user...');
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run('usr_admin', 'admin', hashedPassword, 'admin');
        console.log('Admin user created.');
      } else {
        console.log('Admin user already exists.');
      }
      
    } catch (err) {
      console.error('Database initialization error:', err);
      throw err;
    }
  }
  return db;
}

// Clean up previous run
if (fs.existsSync(tempDir)) {
  console.log('Cleaning up previous test run...');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

try {
  console.log('Starting DB init test...');
  const database = getDb();
  
  // Verify tables
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables created:', tables.map(t => t.name));
  
  // Verify admin user
  const admin = database.prepare("SELECT * FROM users WHERE username = ?").get('admin');
  console.log('Admin user found:', admin ? 'Yes' : 'No');
  if (admin) {
    console.log('Admin ID:', admin.id);
    console.log('Admin Role:', admin.role);
    const validPass = bcrypt.compareSync('admin123', admin.password);
    console.log('Password valid:', validPass);
  }

  console.log('Test completed successfully.');
} catch (error) {
  console.error('Test failed:', error);
}
