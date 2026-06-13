import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import { configs as astroConfigs } from 'eslint-plugin-astro';
import { configs as regexpConfigs } from 'eslint-plugin-regexp';
import * as importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs';
import n from 'eslint-plugin-n';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'public', '.astro', 'node_modules']),
  {
    files: ['**/*.{ts,mts,cts,mjs,js}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      unicorn.configs.recommended,
      regexpConfigs['flat/recommended'],
      importX.flatConfigs.recommended,
      sonarjs.configs.recommended,
      n.configs['flat/recommended-module'],
    ],
    settings: {
      'import-x/extensions': ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'],
      'import-x/external-module-folders': [
        'node_modules',
        'node_modules/@types',
      ],
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.mts', '.cts'],
      },
      n: { version: '>=22.0.0' },
    },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'import-x/no-unresolved': [
        'error',
        { ignore: ['^node:', '^astro', String.raw`^\.`, String.raw`\?url$`] },
      ],
      'no-undef': 'off',
      'import-x/order': 'error',
      'n/no-missing-import': 'off',
      'n/hashbang': 'off',
    },
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'jsx-a11y/no-redundant-roles': 'off',
    },
  },
  ...astroConfigs['flat/recommended'],
  {
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: ['**/*.astro/*.ts', '*.astro/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    // Browser-only client modules loaded from an Astro <script>; Web APIs like
    // URL.createObjectURL and canvas are valid here, not Node builtins.
    files: [
      'src/lib/run.ts',
      'src/lib/reorder.ts',
      'src/lib/merge.ts',
      'src/lib/dnd.ts',
      'src/lib/lightbox.ts',
      'src/lib/grid-core.ts',
    ],
    rules: {
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
]);
