'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hubNative', {
  request: (o) => ipcRenderer.invoke('hub:request', o),
  open: (url) => ipcRenderer.invoke('hub:open', url),
  platform: process.platform,
});
