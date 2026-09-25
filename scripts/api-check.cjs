const { providerEndpoint, providerConfig, generateText } = require('../dist/main/ai/providers.js');
async function main() {
  const args = process.argv.slice(2);
  const requested = args.find(arg => !arg.startsWith('--'));
  if (args.some(arg => arg.startsWith('--') && arg !== '--probe')) throw new Error('Usage: npm run api:check -- [minimax|deepseek|gemini] [--probe]');
  const config = providerConfig(process.env, requested);
  console.log(JSON.stringify({ provider: config.provider, model: config.model, enabled: config.enabled,
    keyConfigured: Boolean(config.apiKey), endpoint: providerEndpoint(config), mode: args.includes('--probe') ? 'live text probe' : 'configuration only; no network request' }, null, 2));
  if (!args.includes('--probe')) return;
  console.log('Sending one fixed text-only probe. No screenshots, files or game data are included. Provider charges may apply.');
  const result = await generateText(config, { prompt: 'Reply with exactly OK.', maxOutputTokens: 1024 });
  console.log(JSON.stringify({ success: true, provider: result.provider, model: result.model, responseCharacters: result.text.length,
    inputTokens: result.inputTokens, outputTokens: result.outputTokens }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
