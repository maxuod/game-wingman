import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
type Source = { id: string; name: string };

export function gameCandidates(sources: Source[], ownedHandles?: ReadonlySet<string>): Source[] {
  // Exact game titles, never browser tabs, launchers or arbitrary titles containing "TFT".
  const title = /^(?:League of Legends \(TM\) Client|Teamfight Tactics|TFT|云顶之弈)$/i;
  return sources.filter(source => {
    const handle = /^window:(\d+):\d+$/.exec(source.id)?.[1];
    return title.test(source.name.trim()) && !!handle && (!ownedHandles || ownedHandles.has(handle));
  });
}

export async function findGameCandidates(sources: Source[]): Promise<Source[]> {
  if (process.platform !== 'win32') return gameCandidates(sources);
  // Process/window metadata only. No game memory, input injection, logs or client credentials.
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "@(Get-Process -Name 'League of Legends','TFTClient-Win64-Shipping','TFTClient' -ErrorAction SilentlyContinue | ForEach-Object { $_.MainWindowHandle.ToInt64().ToString() }) | ConvertTo-Json -Compress"],
  { windowsHide: true, timeout: 4000, maxBuffer: 16384 });
  const parsed: unknown = stdout.trim() ? JSON.parse(stdout) : [];
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const handles = new Set(values.filter((value): value is string => typeof value === 'string' && /^\d+$/.test(value) && value !== '0'));
  return gameCandidates(sources, handles);
}
