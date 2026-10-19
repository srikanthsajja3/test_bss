const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure font assets are included in the web export
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  // Add additional asset extensions here only if needed
];

module.exports = config;