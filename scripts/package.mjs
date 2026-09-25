import { packager } from '@electron/packager';
import { excludeFromPackage } from './package-filter.mjs';
import path from 'node:path';
const [platform = process.platform, arch = process.arch, variant = ''] = process.argv.slice(2);
if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported packaging target');
if (variant && !/^[a-z][a-z0-9-]{0,39}$/.test(variant)) throw new Error('Invalid package variant');
const outputRoot = path.resolve('release', variant);
const target = path.resolve(outputRoot, `Game Wingman-${platform}-${arch}`);
if (!target.startsWith(path.resolve('release') + path.sep)) throw new Error('Package output must stay inside release');
const output = await packager({
  dir: '.', name: 'Game Wingman', executableName: 'Game Wingman',
  platform, arch, out: outputRoot, overwrite: true, asar: true,
  // Give Windows a moment to release freshly extracted binaries before renaming the folder.
  afterExtract: process.platform === 'win32' ? [async () => { await new Promise(resolve => setTimeout(resolve, 2000)); }] : [],
  appBundleId: 'com.gamewingman.desktop', appCategoryType: 'public.app-category.games',
  icon: platform === 'darwin' ? 'assets/icon.icns' : 'assets/icon.ico',
  // Keep packaging limited to the compiled application, without local research/screenshots.
  ignore: excludeFromPackage,
  win32metadata: { CompanyName: 'Game Wingman', FileDescription: 'Game Wingman experimental desktop companion' }
});
for (const path of output) console.log(path);
