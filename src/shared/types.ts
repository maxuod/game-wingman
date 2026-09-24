export interface CatalogEntry { id: string; name: string; kind: 'champion' | 'trait' | 'augment'; description?: string; cost?: number }
export interface Catalog { version: string; checkedAt: string; entries: CatalogEntry[] }
export interface AppState {
  platform: string; version: string; source: { id: string; name: string } | null; epoch: number; inputName: string | null;
  capture: 'idle' | 'starting' | 'active' | 'paused'; capturedAt: string | null; frameCount: number;
  overlayVisible: boolean; clickThrough: boolean; collapsed: boolean; opacity: number;
  selectedEntry: CatalogEntry | null; catalogVersion: string | null; catalogCount: number; catalogCheckedAt: string | null;
  shortcuts: { visibility: boolean; interaction: boolean }; error: string | null;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface DesktopAPI {
  state(): Promise<Result<AppState>>;
  sources(): Promise<Result<Array<{ id: string; name: string }>>>;
  selectSource(id: string): Promise<Result<AppState>>;
  captureState(state: 'starting' | 'active' | 'paused' | 'idle', epoch: number, error?: string): Promise<Result<AppState>>;
  frame(epoch: number): Promise<Result<AppState>>;
  importImage(): Promise<Result<{ data: string; name: string } | null>>;
  overlay(action: 'show' | 'hide' | 'toggle' | 'interaction' | 'collapse' | 'reset'): Promise<Result<AppState>>;
  opacity(value: number): Promise<Result<AppState>>;
  syncCatalog(): Promise<Result<AppState>>;
  search(query: string): Promise<Result<CatalogEntry[]>>;
  selectEntry(id: string | null): Promise<Result<AppState>>;
  help(): Promise<Result<void>>;
  settings(): Promise<Result<void>>;
  onState(listener: (state: AppState) => void): () => void;
}
