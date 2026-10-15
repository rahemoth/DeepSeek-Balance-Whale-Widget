const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('whaleDesktop', {
  standalone: true,
  setInteractive: value => ipcRenderer.send('desktop:interactive', !!value),
  frame: () => ipcRenderer.send('desktop:frame'),
  focus: () => ipcRenderer.send('desktop:focus'),
  settings: () => ipcRenderer.invoke('desktop:settings'),
  saveLayout: value => ipcRenderer.invoke('desktop:save-layout', value),
  saveSettings: values => ipcRenderer.invoke('desktop:save-settings', values),
  importLegacy: () => ipcRenderer.invoke('desktop:import-legacy'),
  onCursor: callback => { ipcRenderer.on('desktop:cursor', (_event, point) => callback(point)) },
  onAction: callback => { ipcRenderer.on('desktop:action', (_event, action) => callback(action)) }
})
