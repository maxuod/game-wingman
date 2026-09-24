import { packager } from '@electron/packager';
import { excludeFromPackage } from './package-filter.mjs';
const [platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!['darwin', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported packaging target');
const output = await packager({
  dir: '.', name: 'Game Wingman', executableName: 'Game Wingman',
  platform, arch, out: 'release', overwrite: true, asar: true,
  appBundleId: 'com.gamewingman.desktop', appCategoryType: 'public.app-category.games',
  icon: platform === 'darwin' ? 'assets/icon.icns' : 'assets/icon.ico',
  // Keep packaging limited to the compiled application, without local research/screenshots.
  ignore: excludeFromPackage,
  win32metadata: { CompanyName: 'Game Wingman', FileDescription: 'Game Wingman experimental desktop companion' }
});
for (const path of output) console.log(path);
