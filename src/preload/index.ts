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
  aiSettings: () => ipcRenderer.invoke('gwm:ai-settings'),
  aiSave: input => ipcRenderer.invoke('gwm:ai-save', input),
  aiImport: () => ipcRenderer.invoke('gwm:ai-import'),
  aiSetKey: input => ipcRenderer.invoke('gwm:ai-set-key', input),
  aiTemplate: () => ipcRenderer.invoke('gwm:ai-template'),
  aiRemove: provider => ipcRenderer.invoke('gwm:ai-remove', provider),
  aiProbe: () => ipcRenderer.invoke('gwm:ai-probe'),
  aiAnalyze: input => ipcRenderer.invoke('gwm:ai-analyze', input),
  aiCancel: () => ipcRenderer.invoke('gwm:ai-cancel'),
  aiCorrect: fields => ipcRenderer.invoke('gwm:ai-correct', fields),
  liveStart: () => ipcRenderer.invoke('gwm:live-start'),
  liveStop: () => ipcRenderer.invoke('gwm:live-stop'),
  liveFrame: input => ipcRenderer.invoke('gwm:live-frame', input),
  detectGame: () => ipcRenderer.invoke('gwm:detect-game'),
  autoDetect: enabled => ipcRenderer.invoke('gwm:auto-detect', enabled),
  guideSettings: input => ipcRenderer.invoke('gwm:guide-settings', input),
  guideRefresh: () => ipcRenderer.invoke('gwm:guide-refresh'),
  officialSource: () => ipcRenderer.invoke('gwm:official-source'),
  guideSource: id => ipcRenderer.invoke('gwm:guide-source', id),
  guideCopy: id => ipcRenderer.invoke('gwm:guide-copy', id),
  guideAugments: id => ipcRenderer.invoke('gwm:guide-augments', id),
  loadIcon: url => ipcRenderer.invoke('gwm:load-icon', url),
  equipmentInventory: input => ipcRenderer.invoke('gwm:equipment-inventory', input),
  equipmentSource: () => ipcRenderer.invoke('gwm:equipment-source'),
  onState: listener => {
    const callback = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('gwm:state', callback);
    return () => ipcRenderer.removeListener('gwm:state', callback);
  }
};
contextBridge.exposeInMainWorld('desktop', api);
