import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(cliDir, '../..');
const distDir = path.join(cliDir, 'dist');

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const targetArg = targetIndex !== -1 ? args[targetIndex + 1] : null;
const skipBuild = args.includes('--skip-build');

function getDefaultTarget() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') return a === 'arm64' ? 'node20-macos-arm64' : 'node20-macos-x64';
  if (p === 'win32') return 'node20-win-x64';
  return a === 'arm64' ? 'node20-linux-arm64' : 'node20-linux-x64';
}

async function main() {
  // 1. Build workspace dependency graph
  if (!skipBuild) {
    execSync('pnpm --filter @lemon/cli... run build', { stdio: 'inherit', cwd: rootDir });
  }

  // 2. Bundle into a single self-contained JS entry
  await esbuild.build({
    entryPoints: [path.join(distDir, 'index.js')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(distDir, 'bundle.js'),
    external: ['better-sqlite3'],
    format: 'cjs',
    banner: { js: '' },
    alias: {
      '@achingbrain/nat-port-mapper': path.join(__dirname, 'nat-port-mapper-stub.js'),
    },
  });

  // Patch constructs that don't survive CJS bundling + pkg
  const bundlePath = path.join(distDir, 'bundle.js');
  let bundleSource = fs.readFileSync(bundlePath, 'utf-8');
  // Inject version from package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(cliDir, 'package.json'), 'utf-8'));
  bundleSource = bundleSource.replace(/globalThis\["__LEMON_CLI_VERSION__"\]/g, `"${pkg.version}"`);
  // Strip shebang copied from entry point
  bundleSource = bundleSource.replace(/^#!.*\n/, '');
  // import.meta.url
  bundleSource = bundleSource.replace(/import_meta\d*\.url/g, 'require("url").pathToFileURL(__filename).href');
  // Prevent server self-execution block from firing inside the bundle
  bundleSource = bundleSource.replace(
    /if \(require\("url"\)\.pathToFileURL\(__filename\)\.href === `file:\/\/\$\{process\.argv\[1\]\}`\)/g,
    'if (false)'
  );
  // dynamic imports of built-in and external modules -> static require
  bundleSource = bundleSource.replace(/const\s*\{\s*default:\s*(\w+)\s*\}\s*=\s*await import\("better-sqlite3"\)/g, 'const $1 = require("better-sqlite3")');
  bundleSource = bundleSource.replace(/await import\("node:fs"\)/g, 'require("fs")');
  bundleSource = bundleSource.replace(/await import\("node:os"\)/g, 'require("os")');
  bundleSource = bundleSource.replace(/await import\("node:path"\)/g, 'require("path")');
  fs.writeFileSync(bundlePath, bundleSource, 'utf-8');

  // 3. Compile with pkg
  const target = targetArg || getDefaultTarget();
  const isWin = target.includes('win');
  let outputName;
  if (targetArg) {
    const suffix = target.replace(/^node\d+-/, '');
    outputName = isWin ? `lemon-cli-${suffix}.exe` : `lemon-cli-${suffix}`;
  } else {
    outputName = isWin ? 'lemon-cli.exe' : 'lemon-cli';
  }
  const outputPath = path.join(distDir, outputName);

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const pkgBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'pkg.cmd' : 'pkg');
  const cmd = `${pkgBin} ${path.join(distDir, 'bundle.js')} --target ${target} --output ${outputPath} --compress GZip --fallback-to-source`;
  execSync(cmd, { stdio: 'inherit', cwd: cliDir });

  console.log(`Executable created: ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
