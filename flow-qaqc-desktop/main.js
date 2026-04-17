const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── Configuración ─────────────────────────────────────────────────────────────
const DEV_MODE = process.env.NODE_ENV === 'development';
const PORT = 3421;
const DEV_URL = 'http://localhost:3000';

// Directorio raíz local para planos (PDFs y DWGs)
// Estructura: D:\Flow-QAQC\{proyecto}\plans\   y   D:\Flow-QAQC\{proyecto}\plansdwg\
const LOCAL_BASE = 'D:\\Flow-QAQC';

let mainWindow = null;
let nextProcess = null;

// ── Helpers de rutas ──────────────────────────────────────────────────────────

/**
 * Convierte una s3_key a ruta local en D:\Flow-QAQC\
 *
 * s3_key format:  "projects/{proj}/plans/{name}.pdf"
 *                 "projects/{proj}/plansdwg/{name}.dwg"
 *
 * local format:   "D:\Flow-QAQC\{proj}\plans\{name}.pdf"
 *                 "D:\Flow-QAQC\{proj}\plansdwg\{name}.dwg"
 */
function s3KeyToLocalPath(s3Key) {
  // Quitar el prefijo "projects/" y convertir "/" a "\"
  const relative = s3Key.replace(/^projects\//, '').replace(/\//g, path.sep);
  return path.join(LOCAL_BASE, relative);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── IPC Handlers — Archivos locales (PDFs y DWGs) ────────────────────────────

/**
 * Verifica si un archivo ya existe en la ruta local.
 * Devuelve la ruta completa o null.
 */
ipcMain.handle('check-local-file', (_event, s3Key) => {
  const filePath = s3KeyToLocalPath(s3Key);
  return fs.existsSync(filePath) ? filePath : null;
});

/**
 * Guarda un ArrayBuffer en la ruta local correcta.
 * Crea las carpetas necesarias automáticamente.
 */
ipcMain.handle('save-local-file', (_event, s3Key, buffer) => {
  const filePath = s3KeyToLocalPath(s3Key);
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

/**
 * Devuelve la ruta local de un archivo (sin verificar si existe).
 */
ipcMain.handle('get-local-path', (_event, s3Key) => {
  return s3KeyToLocalPath(s3Key);
});

/**
 * Devuelve el directorio base D:\Flow-QAQC
 */
ipcMain.handle('get-local-base', () => LOCAL_BASE);

/**
 * Abre una carpeta de proyecto en el Explorador de Windows.
 */
ipcMain.handle('open-local-folder', (_event, s3Key) => {
  const filePath = s3KeyToLocalPath(s3Key);
  const dir = path.dirname(filePath);
  if (fs.existsSync(dir)) {
    shell.openPath(dir);
  } else {
    shell.openPath(LOCAL_BASE);
  }
});

/**
 * Elimina un archivo local.
 */
ipcMain.handle('delete-local-file', (_event, s3Key) => {
  const filePath = s3KeyToLocalPath(s3Key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
});

/**
 * Lista todos los archivos de una carpeta local (ej: plans/ o plansdwg/).
 * s3Prefix: "projects/{proj}/plans" o "projects/{proj}/plansdwg"
 */
ipcMain.handle('list-local-files', (_event, s3Prefix) => {
  const dir = path.join(LOCAL_BASE, s3Prefix.replace(/^projects\//, '').replace(/\//g, path.sep));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => !name.startsWith('.'))
    .map(name => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return { name, filePath, sizeBytes: stat.size };
    });
});

/**
 * Genera un PDF desde HTML usando printToPDF de Electron.
 * Crea una ventana oculta, renderiza el HTML, genera el PDF y lo guarda.
 */
/**
 * Genera un PDF buffer desde HTML (uso interno).
 */
async function htmlToPdfBuffer(html) {
  const tempHtml = path.join(app.getPath('temp'), `pdf-render-${Date.now()}.html`);
  fs.writeFileSync(tempHtml, html, 'utf-8');

  const win = new BrowserWindow({ show: false, width: 794, height: 1123 });
  await win.loadFile(tempHtml);
  await new Promise(r => setTimeout(r, 1000));
  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'none' },
  });
  win.close();

  try { fs.unlinkSync(tempHtml); } catch { /* ignore */ }
  return pdfBuffer;
}

/**
 * Guardar PDF: muestra diálogo "Guardar como" con nombre preestablecido.
 */
ipcMain.handle('print-to-pdf', async (_event, html, filename) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), filename),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  const pdfBuffer = await htmlToPdfBuffer(html);
  fs.writeFileSync(filePath, pdfBuffer);
  shell.showItemInFolder(filePath);
  return filePath;
});

/**
 * Compartir PDF: genera el PDF en temp, abre el diálogo de compartir del SO.
 */
ipcMain.handle('share-pdf', async (_event, html, filename) => {
  const pdfBuffer = await htmlToPdfBuffer(html);
  const tempPath = path.join(app.getPath('temp'), filename);
  fs.writeFileSync(tempPath, pdfBuffer);

  await shell.openPath(tempPath);
  return tempPath;
});

/**
 * Abre HTML en el navegador del sistema como archivo .html temporal.
 */
ipcMain.handle('open-html-in-browser', async (_event, html, filename) => {
  const htmlFilename = filename.replace(/\.pdf$/i, '.html');
  const tempPath = path.join(app.getPath('temp'), htmlFilename);
  fs.writeFileSync(tempPath, html, 'utf-8');
  await shell.openPath(tempPath);
  return tempPath;
});

// ── Next.js server ────────────────────────────────────────────────────────────

function getNextServerPath() {
  return path.join(process.resourcesPath, 'nextjs', 'server.js');
}

function waitForServer(url, maxMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve();
        else retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() - start > maxMs) return reject(new Error('Server timeout'));
      setTimeout(attempt, 500);
    }
    attempt();
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    if (DEV_MODE) {
      resolve();
      return;
    }

    const serverPath = getNextServerPath();
    if (!fs.existsSync(serverPath)) {
      reject(new Error(`Next.js server not found: ${serverPath}\nRun "npm run build" first.`));
      return;
    }

    const env = {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
    };

    nextProcess = spawn('node', [serverPath], {
      env,
      cwd: path.join(process.resourcesPath, 'nextjs'),
    });

    nextProcess.stdout?.on('data', (data) => console.log('[Next.js]', data.toString().trim()));
    nextProcess.stderr?.on('data', (data) => console.error('[Next.js ERR]', data.toString().trim()));
    nextProcess.on('error', reject);

    waitForServer(`http://127.0.0.1:${PORT}`).then(resolve).catch(reject);
  });
}

// ── Ventana principal ─────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'S-CUA — Control de Calidad',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // Permite cargar file:// para PDFs locales
    },
  });

  const appUrl = DEV_MODE ? DEV_URL : `http://127.0.0.1:${PORT}`;
  mainWindow.loadURL(appUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appUrl)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_MODE) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (err) {
    console.error('Error iniciando la app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('quit', () => {
  if (nextProcess) {
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }
});
