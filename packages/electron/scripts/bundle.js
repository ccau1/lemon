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
  external: ['electron'],
  format: 'cjs',
  alias: {
    '@achingbrain/nat-port-mapper': path.join(__dirname, '..', '..', 'cli', 'scripts', 'nat-port-mapper-stub.js'),
    'bindings': path.join(__dirname, 'bindings-stub.cjs'),
  },
});

let source = fs.readFileSync(outFile, 'utf-8');
source = source.replace(/import_meta\d*\.url/g, 'require("url").pathToFileURL(__filename).href');
// Prevent server self-execution block from firing inside the bundle
source = source.replace(
  /if \(require\("url"\)\.pathToFileURL\(__filename\)\.href === `file:\/\/\$\{process\.argv\[1\]\}`\)/g,
  'if (false)'
);
source = source.replace(/const\s*\{\s*default:\s*(\w+)\s*\}\s*=\s*await import\("better-sqlite3"\)/g, 'const $1 = require("better-sqlite3")');
fs.writeFileSync(outFile, source, 'utf-8');

console.log('Bundled dist/main.js -> dist/bundle.cjs');
