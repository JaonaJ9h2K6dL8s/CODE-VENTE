const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const http = require('http');
const net = require('net');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// Global error handler
process.on('uncaughtException', (error) => {
  const logPath = path.join(app.getPath('userData'), 'logs', 'error.log');
  const errorMsg = `[${new Date().toISOString()}] Uncaught Exception:\n${error.stack || error.message}\n\n`;
  
  try {
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logPath, errorMsg);
    
    dialog.showErrorBox(
      'Erreur inattendue',
      `Une erreur est survenue :\n${error.message}\n\nUn rapport a été enregistré dans :\n${logPath}`
    );
  } catch (e) {
    console.error('Failed to log error:', e);
  }
});

let mainWindow;
let tray;
let nextProcess;
let db;
let nextPort = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Initialize DB for IPC
function getDb() {
  if (!db) {
    const userDataDir = app.getPath('userData');
    const dataDir = path.join(userDataDir, 'data');
    
    // Ensure data directory exists and copy from resources if needed
    if (!fs.existsSync(dataDir)) {
      if (!isDev) {
        try {
          // In production, copy default data if it doesn't exist in userData
          const resourceDataDir = path.join(process.resourcesPath, 'standalone', 'data');
          if (fs.existsSync(resourceDataDir)) {
            console.log('Copying data from resources to userData...');
            fs.mkdirSync(dataDir, { recursive: true });
            copyDirSync(resourceDataDir, dataDir);
          }
        } catch (err) {
          console.error('Failed to copy data files:', err);
        }
      } else {
        // In dev, just ensure dir exists
        fs.mkdirSync(dataDir, { recursive: true });
      }
    }

    const dbPath = path.join(dataDir, 'vente-en-ligne.db');
    console.log('Opening database at:', dbPath);
    
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('foreign_keys = ON');
      db.pragma('temp_store = MEMORY');
      db.pragma('cache_size = -32768');
      db.pragma('mmap_size = 268435456');
      db.pragma('busy_timeout = 5000');
      db.pragma('wal_autocheckpoint = 1000');
      
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
      if (adminCheck.count === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run('usr_admin', 'admin', hashedPassword, 'admin');
      }
      
    } catch (err) {
      console.error('Database initialization error:', err);
      throw err;
    }
  }
  return db;
}

// IPC Handlers
ipcMain.handle('auth:login', async (event, { username, password }) => {
  try {
    const database = getDb();
    const user = database.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      throw new Error('Identifiants invalides');
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      throw new Error('Identifiants invalides');
    }

    // Log activity
    try {
        database.prepare(
        'INSERT INTO activity_logs (id, userId, username, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(uuidv4(), user.id, user.username, 'login', 'auth', user.id, 'Connexion réussie (IPC)');
    } catch (e) {
        console.error('Log error', e);
    }

    return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
  } catch (error) {
    console.error('IPC Login error:', error);
    throw error;
  }
});

ipcMain.handle('auth:register', async (event, { username, password }) => {
  try {
    const database = getDb();
    
    if (!username || !password) throw new Error('Champs requis');
    if (password.length < 6) throw new Error('Mot de passe trop court');

    const existingUser = database.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new Error('Ce nom d\'utilisateur existe déjà');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = `usr_${uuidv4().replace(/-/g, '')}`;

    database.prepare(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
    ).run(id, username, hashedPassword, 'admin');

    return { id, username, role: 'admin' };
  } catch (error) {
    console.error('IPC Register error:', error);
    throw error;
  }
});

const PORT = 3010;

// Determine if we're in development or production
const isDev = !app.isPackaged;

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureUserDataDir() {
  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    const resourceDataDir = path.join(process.resourcesPath, 'standalone', 'data');
    copyDirSync(resourceDataDir, dataDir);
  }
  return dataDir;
}

function getResourcePath(...segments) {
  if (isDev) {
    return path.join(__dirname, '..', ...segments);
  }
  return path.join(process.resourcesPath, ...segments);
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

function waitForServer(port, retries = 60) {
  return new Promise((resolve, reject) => {
    const tryConnect = (attempt) => {
      if (attempt >= retries) {
        reject(new Error('Le serveur Next.js ne démarre pas'));
        return;
      }
      const client = new net.Socket();
      client.connect(port, '127.0.0.1', () => {
        client.destroy();
        resolve();
      });
      client.on('error', () => {
        client.destroy();
        setTimeout(() => tryConnect(attempt + 1), 1000);
      });
    };
    tryConnect(0);
  });
}

function waitForHealth(port, retries = 40) {
  return new Promise((resolve, reject) => {
    const tryRequest = (attempt) => {
      if (attempt >= retries) {
        reject(new Error('Le serveur Next.js ne répond pas sur /api/health'));
        return;
      }

      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/health',
          timeout: 1500,
        },
        (res) => {
          const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          res.resume();
          if (ok) {
            resolve();
            return;
          }
          setTimeout(() => tryRequest(attempt + 1), 500);
        }
      );

      req.on('timeout', () => {
        req.destroy();
        setTimeout(() => tryRequest(attempt + 1), 500);
      });

      req.on('error', () => {
        setTimeout(() => tryRequest(attempt + 1), 500);
      });
    };

    tryRequest(0);
  });
}

function getNextLogFilePath() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return path.join(logsDir, 'next-server.log');
}

function appendNextLog(message) {
  try {
    fs.appendFileSync(getNextLogFilePath(), message);
  } catch {
  }
}

async function startNextServer() {
  if (nextProcess && !nextProcess.killed) {
    throw new Error('Le serveur Next.js est déjà en cours d’exécution');
  }
  const port = await findAvailablePort(PORT);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let outputBuffer = '';

    // Set environment variables
    const env = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
    };

    if (isDev) {
      const nodeBinary = process.env.NODE_BINARY || 'node';
      const nextCli = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
      nextProcess = spawn(nodeBinary, [nextCli, 'start', '-p', String(port)], {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: 'pipe',
        shell: false,
      });
    } else {
      // In production, use the standalone server
      const serverFile = path.join(process.resourcesPath, 'standalone', 'server.js');
      if (!fs.existsSync(serverFile)) {
        const error = new Error(`Fichier Next.js introuvable: ${serverFile}`);
        appendNextLog(`[bootstrap] ${error.message}\n`);
        reject(error);
        return;
      }
      const appDataDir = ensureUserDataDir();
      appendNextLog(`[bootstrap] server=${serverFile}\n`);
      appendNextLog(`[bootstrap] dataDir=${appDataDir}\n`);
      const embeddedNodeBinary = path.join(process.resourcesPath, 'standalone', 'node', 'node.exe');
      const nodeBinary = fs.existsSync(embeddedNodeBinary) ? embeddedNodeBinary : process.execPath;
      const runtimeModulesPath = path.join(process.resourcesPath, 'standalone', 'node_modules');
      nextProcess = spawn(nodeBinary, [serverFile], {
        cwd: path.join(process.resourcesPath, 'standalone'),
        env: {
          ...env,
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
          ...(nodeBinary === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
          APP_DATA_DIR: appDataDir,
          NODE_PATH: runtimeModulesPath,
        },
        stdio: 'pipe',
        shell: false,
      });
    }

    nextProcess.stdout?.on('data', (data) => {
      console.log(`[Next.js] ${data}`);
      outputBuffer = `${outputBuffer}${data}`.slice(-4000);
      appendNextLog(`[stdout] ${data}`);
    });

    nextProcess.stderr?.on('data', (data) => {
      console.error(`[Next.js Error] ${data}`);
      outputBuffer = `${outputBuffer}${data}`.slice(-4000);
      appendNextLog(`[stderr] ${data}`);
    });

    nextProcess.on('error', (err) => {
      console.error('Erreur de lancement Next.js:', err);
      appendNextLog(`[error] ${err.message}\n`);
      reject(err);
    });

    nextProcess.on('close', (code) => {
      console.log(`Next.js process exited with code ${code}`);
      if (!resolved) {
        const detail = outputBuffer.trim();
        const error = new Error(`Le serveur Next.js s'est arrêté (code ${code}).${detail ? `\n\n${detail}` : ''}`);
        appendNextLog(`[close] ${error.message}\n`);
        reject(error);
      }
    });

    // Wait for the server to be ready
    waitForServer(port, 120)
      .then(() => waitForHealth(port, 80))
      .then(() => {
        resolved = true;
        nextPort = port;
        resolve(port);
      })
      .catch(reject);
  });
}

function stopNextServer() {
  return new Promise((resolve) => {
    if (!nextProcess) {
      resolve();
      return;
    }

    const pid = nextProcess.pid;
    nextProcess.kill('SIGTERM');

    const finalize = () => {
      nextProcess = null;
      nextPort = null;
      resolve();
    };

    setTimeout(() => {
      if (!pid || nextProcess?.killed) {
        finalize();
        return;
      }
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => finalize());
    }, 1200);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Vente en Ligne - Gestion des Ventes',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#1a1a2e',
  });

  // Remove default menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        { label: 'Rafraîchir', accelerator: 'F5', click: () => mainWindow.reload() },
        { type: 'separator' },
        { label: 'Ouvrir les logs', click: () => {
          const logsDir = path.join(app.getPath('userData'), 'logs');
          shell.openPath(logsDir);
        }},
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Plein écran', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5) },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5) },
        { label: 'Zoom Normal', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.setZoomLevel(0) },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Outils développeur', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { label: 'À propos', click: () => {
          const { dialog } = require('electron');
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'À propos',
            message: 'Vente en Ligne',
            detail: 'Application de gestion des ventes en ligne\nVersion 1.0.0\n\n© 2026 - Tous droits réservés',
          });
        }},
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 450,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  return splash;
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    return;
  }
  const splash = createSplashWindow();

  try {
    console.log('Démarrage du serveur Next.js...');
    let port;
    try {
      port = await startNextServer();
    } catch (firstError) {
      appendNextLog(`[restart] premier démarrage échoué: ${firstError.message}\n`);
      await stopNextServer();
      port = await startNextServer();
    }
    console.log(`Serveur Next.js démarré sur le port ${port}`);

    createWindow(port);

    // Close splash when main window is ready
    mainWindow.once('ready-to-show', () => {
      setTimeout(() => {
        splash.destroy();
      }, 500);
    });
  } catch (error) {
    console.error('Erreur fatale:', error);
    splash.destroy();
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Erreur de démarrage',
      `L'application n'a pas pu démarrer.\n\nErreur: ${error.message}\n\nVeuillez réessayer.`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopNextServer().finally(() => {
    app.quit();
  });
});

app.on('before-quit', () => {
  stopNextServer();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } else if (nextPort) {
    createWindow(nextPort);
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    // Re-create window if needed (macOS)
  }
});
