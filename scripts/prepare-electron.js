const fs = require('fs');
const path = require('path');

console.log('📦 Préparation du build Electron...');

const standalonePath = path.join(__dirname, '..', '.next', 'standalone');
const staticSrc = path.join(__dirname, '..', '.next', 'static');
const staticDest = path.join(standalonePath, '.next', 'static');
const publicSrc = path.join(__dirname, '..', 'public');
const publicDest = path.join(standalonePath, 'public');
const dataSrc = path.join(__dirname, '..', 'data');
const dataDest = path.join(standalonePath, 'data');
const buildStandalonePath = path.join(__dirname, '..', 'build', 'standalone');
const embeddedNodeDir = path.join(buildStandalonePath, 'node');
const embeddedNodePath = path.join(embeddedNodeDir, 'node.exe');
const rootNodeModulesPath = path.join(__dirname, '..', 'node_modules');
const standaloneNodeModulesPath = path.join(standalonePath, 'node_modules');

// Check if standalone build exists
if (!fs.existsSync(standalonePath)) {
  console.error('❌ Le dossier .next/standalone n\'existe pas. Exécutez d\'abord: npm run build');
  process.exit(1);
}

// Copy helper
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️ Source n'existe pas: ${src}`);
    return;
  }
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(srcPath);
      copyDirSync(realPath, destPath);
      continue;
    }
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

console.log('📁 Copie des fichiers statiques...');
copyDirSync(staticSrc, staticDest);

console.log('📁 Copie des fichiers publics...');
copyDirSync(publicSrc, publicDest);

console.log('📁 Copie de la base de données...');
copyDirSync(dataSrc, dataDest);

// Ensure standalone node_modules exists
if (!fs.existsSync(standaloneNodeModulesPath)) {
  fs.mkdirSync(standaloneNodeModulesPath, { recursive: true });
}

// Copy native modules and critical dependencies to standalone/node_modules
// This mimics standard Node.js resolution better than runtime_modules
const dependenciesToCopy = [
  'better-sqlite3',
  'bindings',
  'prebuild-install',
  'file-uri-to-path',
  'bcryptjs',
  'client-only',
  'uuid',
  'react-is',
  'use-sync-external-store',
  // Next.js dependencies usually handled by standalone, but we force these just in case
  'styled-jsx'
];

console.log('📁 Copie des dépendances critiques vers node_modules...');
for (const mod of dependenciesToCopy) {
  const src = path.join(rootNodeModulesPath, mod);
  const dest = path.join(standaloneNodeModulesPath, mod);
  if (fs.existsSync(src)) {
    console.log(`   - ${mod}`);
    // Remove existing destination if it exists (e.g. symlink) to ensure clean copy
    if (fs.existsSync(dest)) {
      try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
    }
    copyDirSync(src, dest);
  } else {
    console.warn(`   ⚠️ Module introuvable: ${mod}`);
  }
}

if (fs.existsSync(buildStandalonePath)) {
  try {
    fs.rmSync(buildStandalonePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (error) {
    console.warn(`⚠️ Suppression impossible: ${buildStandalonePath}`);
  }
}

console.log('📁 Préparation du dossier standalone pour Electron...');
copyDirSync(standalonePath, buildStandalonePath);

if (!fs.existsSync(embeddedNodeDir)) {
  fs.mkdirSync(embeddedNodeDir, { recursive: true });
}
console.log('📁 Copie de node.exe...');
fs.copyFileSync(process.execPath, embeddedNodePath);

// No need to patch server.js for runtime_modules if we use standard node_modules
// But we verify if we need to set NODE_PATH
// The standard resolution should find modules in ./node_modules relative to server.js

console.log('✅ Préparation terminée avec succès!');
