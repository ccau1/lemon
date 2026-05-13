const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  __dirname,
  path.resolve(__dirname, "../../node_modules"),
  path.resolve(__dirname, "../shared"),
  path.resolve(__dirname, "../shared-ui"),
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../../node_modules"),
];

config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_conditionNames = ["react-native", "require", "default", "browser"];

config.resolver.sourceExts = ["native.tsx", "native.ts", "native.jsx", "native.js"].concat(
  config.resolver.sourceExts
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fallback = context.resolveRequest;

  // .js -> .tsx/.ts mapping for workspace packages
  const tryResolve = (name) => {
    try {
      return fallback(context, name, platform);
    } catch {
      return null;
    }
  };

  if (moduleName.endsWith(".native.js")) {
    const base = moduleName.slice(0, -".native.js".length);
    const result =
      tryResolve(`${base}.native.tsx`) ||
      tryResolve(`${base}.native.ts`) ||
      tryResolve(`${base}.tsx`) ||
      tryResolve(`${base}.ts`);
    if (result) return result;
  }

  if (moduleName.endsWith(".js")) {
    const base = moduleName.slice(0, -3);
    const result =
      tryResolve(`${base}.tsx`) ||
      tryResolve(`${base}.ts`) ||
      tryResolve(`${base}.native.tsx`) ||
      tryResolve(`${base}.native.ts`);
    if (result) return result;
  }

  return fallback(context, moduleName, platform);
};

module.exports = config;
