const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const os = require('os');

// Set custom temp directory to avoid permission issues
const customTempDir = path.join(os.homedir(), '.metro-tmp');
process.env.TMPDIR = customTempDir;

const config = getDefaultConfig(__dirname);

// Use custom cache directory to avoid permission issues
config.cacheStores = [
  new (require('metro-cache').FileStore)({
    root: path.join(os.homedir(), '.metro-cache'),
  }),
];

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = config;
