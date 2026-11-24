// ESLint flat config (ESLint 9 no longer reads .eslintrc.*).
// CI lints scripts/ (the Foundry module, run in the browser) and
// bridge-server/ (the Node bridge); each gets the globals of its runtime.
import js from '@eslint/js';
import globals from 'globals';

// Globals the Foundry client defines for module code
const foundryGlobals = {
  game: 'readonly',
  ui: 'readonly',
  Hooks: 'readonly',
  CONFIG: 'readonly',
  CONST: 'readonly',
  foundry: 'readonly',
  Roll: 'readonly',
  ChatMessage: 'readonly',
  User: 'readonly',
  USER: 'readonly',
  FormApplication: 'readonly',
  Dialog: 'readonly',
  Die: 'readonly',
  NumericTerm: 'readonly',
  OperatorTerm: 'readonly'
};

export default [
  {
    ignores: ['**/node_modules/**', '**/coverage/**', 'module.json']
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...foundryGlobals }
    }
  },
  {
    // Build script and HTTP server stub run under Node, not in Foundry
    files: ['scripts/build.js', 'scripts/http-server.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['bridge-server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },
  {
    // Module tests run under Jest + jsdom and touch Foundry globals
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.jest, ...foundryGlobals }
    }
  },
  {
    files: [
      'bridge-server/tests/**/*.js',
      'bridge-server/__mocks__/**/*.js',
      'bridge-server/jest.config.js'
    ],
    languageOptions: {
      globals: { ...globals.jest }
    }
  },
  {
    rules: {
      // Unused arguments document handler signatures (req, res, next)
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
