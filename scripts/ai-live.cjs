// Explicit, manual live benchmark. Never used by npm test or CI.
// Keys are imported from stdin into OS-encrypted storage, never printed or written as plaintext.
const { app, safeStorage, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AiSettingsStore } = require('../dist/main/ai/settings.js');
const { generateText, providerEndpoint } = require('../dist/main/ai/providers.js');
const { parseObservation, OBSERVATION_PROMPT } = require('../dist/main/ai/observation.js');
const directory = path.join(app.getPath('appData'), 'Game Wingman');
app.setPath('userData', directory);
let step = 'ready';
app.whenReady().then(async () => {
  const store = new AiSettingsStore(path.join(directory, 'ai-settings.json'), safeStorage);
  step = 'load'; await store.load();
  if (process.argv.includes('--use-tested-defaults')) {
    const report = JSON.parse(await fs.readFile(path.resolve('artifacts/ai-benchmark/results.json'), 'utf8'));
    if (!['deepseek', 'minimax', 'gemini'].every(provider => ['text', 'image'].every(modality => report.samples.filter(row => row.provider === provider && row.modality === modality && row.valid).length >= 3))) throw new Error('Incomplete benchmark');
    await store.save({ provider: 'gemini', model: 'gemini-3.5-flash-lite', region: 'global', enabled: true });
    await store.save({ provider: 'deepseek', model: 'deepseek-flash', region: 'global', enabled: true });
    console.log(JSON.stringify(store.status())); return;
  }
  if (process.argv.includes('--gemini-models')) {
    const config = store.config('gemini');
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    console.log(JSON.stringify({ status: response.status, models: response.ok ? data.models?.filter(item => item.supportedGenerationMethods?.includes('generateContent')).map(item => item.name).slice(0, 50) : undefined,
      reason: !response.ok && /^[A-Z_]+$/.test(data.error?.status) ? data.error.status : undefined }));
    return;
  }
  if (process.argv.includes('--import-stdin') || process.argv.includes('--import-env')) {
    step = 'input'; let text = process.argv.includes('--import-env') ? process.env.GWM_IMPORT_JSON || '' : '';
    delete process.env.GWM_IMPORT_JSON;
    if (!process.argv.includes('--import-env')) for await (const chunk of process.stdin) { text += chunk; if (text.length > 20000) throw new Error('Input too large'); }
    step = `parse (${text.length} input characters)`; const keys = JSON.parse(text.replace(/^\uFEFF/, ''));
    step = 'encrypt'; await store.importKeys(keys);
    await store.save({ provider: 'deepseek', model: 'deepseek-flash', region: 'global', enabled: true });
    console.log(JSON.stringify(store.status()));
    return;
  }
  if (!process.argv.includes('--benchmark')) throw new Error('Use --import-stdin or --benchmark explicitly.');
  const out = path.resolve('artifacts/ai-benchmark'); await fs.mkdir(out, { recursive: true });
  const report = process.argv.includes('--resume') ? JSON.parse(await fs.readFile(path.join(out, 'results.json'), 'utf8')) : { date: new Date().toISOString(), task: 'Synthetic visible-field extraction; completion latency, not time to first token. Three different fixtures per provider and modality. Missing HP must remain unknown.', samples: [] };
  const fixture = new BrowserWindow({ width: 800, height: 450, show: true, focusable: false, skipTaskbar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    for (const provider of (process.argv.includes('--retry-gemini') ? ['gemini'] : ['deepseek', 'gemini', 'minimax'])) {
      let failed = false;
      if (!process.argv.includes('--retry-gemini') && report.samples.some(row => row.provider === provider && row.error)) continue;
      const config = store.config(provider);
      const modelOverride = process.argv.find(arg => arg.startsWith('--model='));
      if (modelOverride && provider === 'gemini') config.model = modelOverride.slice('--model='.length);
      for (const modality of ['text', 'image']) {
        for (let round = 0; round < 3 && !failed; round++) {
          if (report.samples.some(row => row.provider === provider && row.modality === modality && row.round === round + 1 && !row.error)) continue;
          const expected = { stage: '3-2', gold: 37 + round, hp: null, level: 6, entities: ['Lux'] };
          let image;
          if (modality === 'image') {
            step = 'fixture load';
            await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="background:#21333e;color:white;font:32px Arial;padding:30px"><h3>Game Wingman · synthetic QA</h3><p>STAGE 3-2 &nbsp; GOLD ${expected.gold} &nbsp; LEVEL 6</p><p>Champion: Lux</p><p>No HP information shown</p></body></html>`));
            await fixture.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
            step = 'fixture capture'; const bitmap = await fixture.webContents.capturePage();
            await fs.writeFile(path.join(out, `fixture-${round}.png`), bitmap.toPNG());
            image = { mimeType: 'image/png', data: bitmap.toPNG().toString('base64') };
          }
          const started = performance.now();
          const row = { provider, model: config.model, endpoint: providerEndpoint(config), modality, round: round + 1 };
          try {
            const result = await generateText(config, { system: OBSERVATION_PROMPT, prompt: modality === 'text' ? `Visible HUD: stage 3-2; gold ${expected.gold}; level 6; champion Lux. HP is absent. Extract the fields.` : 'Extract the visible fields from this synthetic screenshot.', image, maxOutputTokens: 1024 });
            row.elapsedMs = Math.round(performance.now() - started);
            const actual = parseObservation(result.text);
            row.valid = Object.keys(expected).every(key => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
            row.inputTokens = result.inputTokens; row.outputTokens = result.outputTokens;
          } catch (error) {
            row.elapsedMs = Math.round(performance.now() - started); row.valid = false;
            row.error = error.code || 'invalid_fields'; row.httpStatus = error.status;
            failed = true; // No repeated charges on a failing credential or model.
          }
          report.samples.push(row); console.log(JSON.stringify(row));
          await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
        }
      }
    }
  } finally { fixture.destroy(); }
}).then(() => app.quit()).catch(error => { console.error(JSON.stringify({ step, error: error.name, code: error.code || null, detail: step.startsWith('fixture') ? error.message : undefined })); app.exit(1); });
