// This sample has no runtime npm dependencies. Ship only compiled code and original assets.
// An allowlist also excludes .env, private keys, captures, logs and future local scratch files.
export function excludeFromPackage(filename) {
  const relative = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relative) return false;
  return !['dist', 'assets', 'package.json'].includes(relative.split('/')[0]);
}
