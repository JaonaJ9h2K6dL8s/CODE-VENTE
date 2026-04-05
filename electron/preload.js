const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    register: (credentials) => ipcRenderer.invoke('auth:register', credentials),
  },
});
