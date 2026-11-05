'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1100, height: 780, minWidth: 640, minHeight: 480,
    title: 'Blind Hub', backgroundColor: '#101418', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

// सर्वर की बात मुख्य प्रक्रिया से होती है, ताकि CORS की रुकावट न आए.
ipcMain.handle('hub:request', async (_e, o) => {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Math.min(Number(o.timeout) || 20000, 120000));
    const res = await fetch(String(o.url), {
      method: o.method || 'GET',
      headers: o.headers || {},
      body: o.body == null ? undefined : String(o.body),
      signal: ctl.signal,
    });
    clearTimeout(t);
    return { code: res.status, text: await res.text() };
  } catch (e) {
    return { code: -1, text: '' };
  }
});
ipcMain.handle('hub:open', (_e, url) => { if (/^(https?|mailto):/i.test(String(url))) shell.openExternal(String(url)); });

app.whenReady().then(createWindow);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
