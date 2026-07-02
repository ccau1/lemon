import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const outFile = path.join(distDir, 'bundle.cjs');

await esbuild.build({
  entryPoints: [path.join(distDir, 'main.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: outFile,
  external: ['better-sqlite3', 'electron'],
  format: 'cjs',
});

let source = fs.readFileSync(outFile, 'utf-8');
source = source.replace(/import_meta\d*\.url/g, 'require("url").pathToFileURL(__filename).href');
fs.writeFileSync(outFile, source, 'utf-8');

console.log('Bundled dist/main.js -> dist/bundle.cjs');
