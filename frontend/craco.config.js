const path = require('path');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

// The plugin system lives at the repo root (../Plugins), outside CRA's src/.
// This config lets the build both IMPORT and TRANSPILE code from there.
const pluginsDir = path.resolve(__dirname, '..', 'Plugins');

module.exports = {
  webpack: {
    alias: {
      // Lets app code do: import { ... } from 'Plugins'
      Plugins: pluginsDir,
    },
    configure: (webpackConfig) => {
      // 1. Allow imports from outside src/ by removing CRA's ModuleScopePlugin.
      webpackConfig.resolve.plugins = (webpackConfig.resolve.plugins || []).filter(
        (p) => !(p instanceof ModuleScopePlugin),
      );

      // 2. babel-loader only transpiles src/ by default — add the Plugins folder
      //    so its JSX/modern JS compiles too.
      const oneOfRule = webpackConfig.module.rules.find((rule) => Array.isArray(rule.oneOf));
      if (oneOfRule) {
        const babelRule = oneOfRule.oneOf.find(
          (r) => r.loader && r.loader.includes('babel-loader') && r.include,
        );
        if (babelRule) {
          babelRule.include = [].concat(babelRule.include, pluginsDir);
        }
      }

      return webpackConfig;
    },
  },
};
