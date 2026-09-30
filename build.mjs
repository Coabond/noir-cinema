import {build} from 'esbuild';
await build({entryPoints:['App.tsx'],bundle:true,outfile:'app.js',minify:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
