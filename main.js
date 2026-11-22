// Blitz Klastry – blokowanie wybranych klastrów WoT Blitz przez plik hosts (Windows)
'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const dns = require('dns').promises;
const { execFile } = require('child_process');
const { blockedDomains, buildHosts, parsePing } = require('./hosts');

const HOSTS = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  : '/etc/hosts';
const backupFile = () => path.join(app.getPath('userData'), 'hosts.kopia');

let win = null;

// Brak pliku hosts to nie błąd – Windows działa i bez niego. Traktujemy go jak pusty.
async function readHosts() {
  try {
    return await fs.readFile(HOSTS, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return '';
    throw e;
  }
}

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}` }));
  });
}

function friendlyError(e) {
  if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
    return 'Brak dostępu do pliku hosts. Uruchom aplikację jako administrator. Jeśli to nie pomoże, antywirus może blokować zmiany w pliku hosts.';
  }
  if (e && e.code === 'EBUSY') return 'Plik hosts jest używany przez inny program. Spróbuj ponownie za chwilę.';
  return `Nie udało się zmienić pliku hosts: ${e?.message || e}`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: 'Blitz Klastry',
    autoHideMenuBar: true,
    backgroundColor: '#15191d',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Które z podanych domen są teraz zablokowane
ipcMain.handle('state', async (_e, domains) => {
  try {
    const text = await readHosts();
    let hasBackup = false;
    try { await fs.access(backupFile()); hasBackup = true; } catch { /* brak kopii */ }
    return { ok: true, blocked: [...blockedDomains(text, domains)], hosts: HOSTS, hasBackup };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
});

// Zapisuje nowy stan blokad
ipcMain.handle('apply', async (_e, { managed, block }) => {
  try {
    const text = await readHosts();
    // Kopia oryginału przy pierwszej zmianie
    try { await fs.access(backupFile()); } catch { await fs.writeFile(backupFile(), text, 'utf8'); }
    const next = buildHosts(text, managed, block);
    if (next !== text) {
      try { await fs.chmod(HOSTS, 0o666); } catch { /* atrybut tylko do odczytu – spróbuj mimo to */ }
      await fs.writeFile(HOSTS, next, 'utf8');
    }
    if (process.platform === 'win32') await run('ipconfig', ['/flushdns']);
    const check = blockedDomains(await readHosts(), managed);
    const missing = block.filter((d) => !check.has(d.toLowerCase()));
    if (missing.length) return { ok: false, error: 'Antywirus cofnął zmiany w pliku hosts. Dodaj wyjątek dla Blitz Klastry albo dla pliku hosts.' };
    return { ok: true, blocked: [...check] };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
});

ipcMain.handle('restore', async () => {
  try {
    const text = await fs.readFile(backupFile(), 'utf8');
    try { await fs.chmod(HOSTS, 0o666); } catch { /* ignoruj */ }
    await fs.writeFile(HOSTS, text, 'utf8');
    if (process.platform === 'win32') await run('ipconfig', ['/flushdns']);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.code === 'ENOENT' ? 'Nie ma jeszcze kopii pliku hosts.' : friendlyError(e) };
  }
});

// Ping do klastra: adres sprawdzany bezpośrednio w DNS, więc działa także dla zablokowanych
ipcMain.handle('ping', async (_e, domain) => {
  let ip;
  try { [ip] = await dns.resolve4(domain); } catch { return { ok: false, error: 'Adres nie istnieje' }; }
  const args = process.platform === 'win32' ? ['-n', '3', '-w', '1500', ip] : ['-c', '3', '-W', '2', ip];
  const res = await run('ping', args, 12000);
  const ms = parsePing(res.out);
  return ms == null ? { ok: false, ip, error: 'Brak odpowiedzi' } : { ok: true, ip, ms };
});

ipcMain.on('open-hosts', () => {
  if (process.platform === 'win32') execFile('notepad.exe', [HOSTS]);
  else shell.openPath(HOSTS);
});

ipcMain.handle('confirm', async (_e, { title, message, ok }) => {
  const r = await dialog.showMessageBox(win, { type: 'question', title, message, buttons: [ok, 'Anuluj'], defaultId: 0, cancelId: 1 });
  return r.response === 0;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
