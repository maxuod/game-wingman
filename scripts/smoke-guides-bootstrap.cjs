// Isolated hidden native app: no real window enumeration, capture, API calls or focus changes.
const path = require('node:path');
const electron = require('electron');
if(!process.env.GWM_SMOKE_PROFILE||!electron.app.commandLine.hasSwitch('user-data-dir')||path.resolve(electron.app.commandLine.getSwitchValue('user-data-dir'))!==path.resolve(process.env.GWM_SMOKE_PROFILE))throw new Error('Hidden tests require an explicit isolated --user-data-dir');
electron.app.setPath('userData', process.env.GWM_SMOKE_PROFILE);
const appDir = process.env.GWM_SMOKE_APP_DIR || path.resolve('.');
electron.app.getAppPath = () => appDir;
electron.BrowserWindow.prototype.show = function () { this.__requestedVisible = true; };
electron.BrowserWindow.prototype.showInactive = function () { this.__requestedVisible = true; };
electron.BrowserWindow.prototype.hide = function () { this.__requestedVisible = false; };
electron.BrowserWindow.prototype.focus = function () {};
global.__testSources = [];
electron.desktopCapturer.getSources = async () => global.__testSources;
require(path.join(appDir, 'dist/main/game-window.js')).findGameCandidates = async () => global.__testSources;
electron.shell.openExternal = async url => { global.__openedGuide = url; };
// Exercise the native IPC write path without touching the user's system clipboard.
global.__clipboardWrites = [];
electron.clipboard.writeText = text => {
  if (global.__clipboardFailure) throw new Error('Synthetic clipboard failure');
  global.__clipboardWrites.push(text);
};
global.__publicFetches = [];
global.__iconRequests = [];
// Keep image responses local even when a test changes the public-data/AI transport.
// Optional source directory contains previously downloaded public icon files only.
const fs=require('node:fs/promises'),{createHash}=require('node:crypto');
const {validIconUrl}=require(path.join(appDir,'dist/main/icon-cache.js'));
let transport=async url=>{global.__publicFetches.push(url);throw new Error('No external network allowed in hidden desktop tests');};
const routedFetch=async(url,options)=>{
  if(!validIconUrl(url))return transport(url,options);
  global.__iconRequests.push(url);
  if(global.__failIcons&&url.endsWith('/OfflineFixture.png'))return new Response('<html>Unavailable</html>',{status:503});
  let bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
  if(process.env.GWM_ICON_SOURCE_DIR){try{bytes=await fs.readFile(path.join(process.env.GWM_ICON_SOURCE_DIR,createHash('sha256').update(url).digest('hex')+'.img'));}catch{}}
  return new Response(bytes);
};
Object.defineProperty(global,'fetch',{configurable:true,get:()=>routedFetch,set:value=>{transport=value}});
require(path.join(appDir, 'dist/main/index.js'));
