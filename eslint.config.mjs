import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'extension/output/**',
      'extension/.output/**',
      'extension/.wxt/**',
      '.otto-relay/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,mtsx,cts,ctsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.test.{js,mjs,cjs,ts,tsx,mts,mtsx,cts,ctsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['extension/**/*.{ts,tsx,mts,mtsx,cts,ctsx,js,mjs,cjs}'],
    plugins: {
      'no-unsanitized': noUnsanitized,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'chrome',
          property: 'debugger',
          message: 'chrome.debugger usage is feature-flagged and must not be used in default runtime paths.',
        },
      ],
    },
  },
  {
    files: ['extension/**/*.test.{ts,tsx,mts,mtsx,cts,ctsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];
