import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['./App.tsx'],tsconfigRaw:{},bundle:true,outfile:'app.js',minify:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
await copyFile('node_modules/shaka-player/dist/shaka-player.compiled.js','player-engine.js');
await copyFile('node_modules/shaka-player/LICENSE','SHAKA-LICENSE');

await build({entryPoints:['./decipher-worker.ts'],bundle:true,outfile:'decipher-worker.js',minify:true,format:'esm',platform:'browser',conditions:['browser'],legalComments:'eof'});
await copyFile('node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm','decipher.wasm');
await copyFile('node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE','QUICKJS-LICENSE');

await copyFile('node_modules/youtubei.js/LICENSE','YOUTUBEJS-LICENSE');
