export interface CatalogEntry { id: string; name: string; kind: 'champion' | 'trait' | 'augment'; description?: string; cost?: number }
export interface Catalog { version: string; checkedAt: string; entries: CatalogEntry[] }
export type AiProvider = 'minimax' | 'deepseek' | 'gemini';
export interface AiSettingsInput { provider: AiProvider; model: string; region: 'cn' | 'global'; enabled: boolean }
export interface AiSettings { selected: AiProvider; enabled: boolean; secureStorage: boolean; providers: Array<{ provider: AiProvider; label: string; model: string; region: 'cn' | 'global'; endpoint: string; hasKey: boolean }> }
export interface EquipmentObservation { components: string[] | null; completed: string[] | null }
export interface Observation { stage: string | null; gold: number | null; hp: number | null; level: number | null; entities: string[]; equipment?: EquipmentObservation }
export interface AiObservation { fields: Observation; entities: Array<{ name: string; id: string | null }>; provider: AiProvider; model: string; capturedAt: string; completedAt: string; elapsedMs: number; epoch: number; frameCount: number; corrected: boolean }
export interface AiState { status: 'idle' | 'running' | 'done' | 'error'; message: string; observation: AiObservation | null }
export interface CapturedFrame { data: string; epoch: number; frameCount: number; capturedAt: string }
export interface BudgetState {
  limitMicros: number; chargedMicros: number; reservedMicros: number; requests: number; completed: number;
  inputTokens: number; outputTokens: number; averageMs: number | null; ready: boolean; message: string;
}
export interface LiveState {
  phase: 'off' | 'watching' | 'running' | 'stopped'; message: string;
  provider: AiProvider | null; model: string | null; startedAt: string | null; expiresAt: string | null;
  requests: number; observation: AiObservation | null;
  events: Array<{ capturedAt: string; summary: string }>;
}
export interface CompGuide {
  id: string; name: string; sourceName: string; sourceUrl: string; patch: string; updatedAt: string;
  teamCode: string;
  winRate: number; top4Rate: number; averagePlace: number; games: number;
  core: string[]; flex: string[]; items: string[]; plan: string;
  units: Array<{ id: string; name: string; iconUrl?:string; priority: number | null; cell: {x:number;y:number} | null; items: Array<{ id: string; name: string }> }>;
}
export interface CompAugments { guideId:string; patch:string; checkedAt:string; stale:boolean; iconsChecked?:boolean; entries:Array<{id:string;name:string;iconUrl?:string;tier:'silver'|'gold'|'prism';rounds:string[]}> }
export interface ItemDefinition { id: string; name: string; englishName: string; iconUrl?:string; category: 'component' | 'core' | 'emblem' | 'artifact' | 'radiant'; recipe: string[] }
export interface ItemReference { set: number; patch: string; checkedAt: string; sourceUrl: string; items: ItemDefinition[] }
export interface EquipmentInventory { components: Record<string, number>; completed: Record<string, number> }
export interface CraftSuggestion { itemId: string; champion: string | null; reason: string; missing: string[]; reserved: boolean }
export interface EquipmentState {
  reference: ItemReference; manual: EquipmentInventory | null; inventory: EquipmentInventory | null;
  origin: 'manual' | 'ai' | 'none'; updatedAt: string | null; message: string;
  recommendations: CraftSuggestion[]; alternatives: CraftSuggestion[]; guideId: string | null;
}
export interface GuideState {
  patch: string;
  enabled: boolean; order: 'win' | 'top4'; selectedId: string | null; entries: CompGuide[]; loading: boolean;
  message: string; sourceKind: 'reviewed' | 'refreshed' | 'cached'; scope: string;
  recommendedId: string | null; freshIds: string[];
}
export interface OfficialVersion { patch: string; hotfix: string | null; url: string; publishedAt: string; contentHash: string; mentionsRecipes: boolean }
export interface RankChange { id: string; top4: number | null; win: number | null; top4Rate: number; winRate: number }
export interface DataUpdateState {
  official: OfficialVersion | null; officialCheckedAt: string | null; rankingCheckedAt: string | null;
  rankingChangedAt: string | null; comparedAt: string | null; nextCheckAt: string | null;
  changes: RankChange[]; added: number; removed: number; message: string;
  recipesPending: boolean; recipeMessage: string;
}
export interface AppState {
  platform: string; version: string; source: { id: string; name: string } | null; epoch: number; inputName: string | null;
  capture: 'idle' | 'starting' | 'active' | 'paused'; capturedAt: string | null; frameCount: number;
  overlayVisible: boolean; clickThrough: boolean; collapsed: boolean; opacity: number;
  selectedEntry: CatalogEntry | null; catalogVersion: string | null; catalogCount: number; catalogCheckedAt: string | null;
  shortcuts: { visibility: boolean; interaction: boolean }; error: string | null;
  ai: AiState;
  live: LiveState;
  budget: BudgetState;
  guides: GuideState;
  equipment: EquipmentState;
  dataUpdates: DataUpdateState;
  autoDetect: { enabled: boolean; status: 'waiting' | 'found' | 'ambiguous' | 'manual' | 'paused'; message: string };
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
  aiSettings(): Promise<Result<AiSettings>>;
  aiSave(input: AiSettingsInput): Promise<Result<AiSettings>>;
  aiImport(): Promise<Result<AiSettings>>;
  aiSetKey(input:{provider:AiProvider;key:string}):Promise<Result<AiSettings>>;
  aiTemplate():Promise<Result<boolean>>;
  aiRemove(provider: AiProvider): Promise<Result<AiSettings>>;
  aiProbe(): Promise<Result<{ elapsedMs: number; provider: AiProvider; model: string }>>;
  aiAnalyze(input: { data: string; epoch: number; frameCount: number; capturedAt: string }): Promise<Result<AppState>>;
  aiCancel(): Promise<Result<AppState>>;
  aiCorrect(fields: Observation): Promise<Result<AppState>>;
  liveStart(): Promise<Result<AppState>>;
  liveStop(): Promise<Result<AppState>>;
  liveFrame(input: CapturedFrame): Promise<Result<AppState>>;
  detectGame(): Promise<Result<AppState>>;
  autoDetect(enabled: boolean): Promise<Result<AppState>>;
  guideSettings(input: { enabled: boolean; order: 'win' | 'top4'; selectedId: string | null }): Promise<Result<AppState>>;
  guideRefresh(): Promise<Result<AppState>>;
  guideSource(id: string): Promise<Result<void>>;
  guideCopy(id: string): Promise<Result<void>>;
  guideAugments(id: string): Promise<Result<CompAugments>>;
  loadIcon(url:string):Promise<Result<string|null>>;
  officialSource(): Promise<Result<void>>;
  equipmentInventory(input: EquipmentInventory | null): Promise<Result<AppState>>;
  equipmentSource(): Promise<Result<void>>;
  onState(listener: (state: AppState) => void): () => void;
}
