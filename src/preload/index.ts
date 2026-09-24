import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, AppState } from '../shared/types';

const api: DesktopAPI = {
  state: () => ipcRenderer.invoke('gwm:state'),
  sources: () => ipcRenderer.invoke('gwm:sources'),
  selectSource: id => ipcRenderer.invoke('gwm:select-source', id),
  captureState: (state, epoch, error) => ipcRenderer.invoke('gwm:capture-state', state, epoch, error),
  frame: epoch => ipcRenderer.invoke('gwm:frame', epoch),
  importImage: () => ipcRenderer.invoke('gwm:import-image'),
  overlay: action => ipcRenderer.invoke('gwm:overlay', action),
  opacity: value => ipcRenderer.invoke('gwm:opacity', value),
  syncCatalog: () => ipcRenderer.invoke('gwm:sync-catalog'),
  search: query => ipcRenderer.invoke('gwm:search', query),
  selectEntry: id => ipcRenderer.invoke('gwm:select-entry', id),
  help: () => ipcRenderer.invoke('gwm:help'),
  settings: () => ipcRenderer.invoke('gwm:settings'),
  onState: listener => {
    const callback = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('gwm:state', callback);
    return () => ipcRenderer.removeListener('gwm:state', callback);
  }
};
contextBridge.exposeInMainWorld('desktop', api);
