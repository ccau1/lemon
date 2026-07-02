const { app } = require('electron');
const path = require('path');

module.exports = function bindings() {
  const appPath = app?.getAppPath() ?? process.cwd();
  const isPackaged = app?.isPackaged ?? false;
  const nativePath = isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
    : path.join(appPath, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  return require(nativePath);
};
