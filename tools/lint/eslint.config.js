import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Syntax-level rules only: type-aware rules would need the TypeScript 6 checker to understand a
// project set up for TypeScript 7, and `npm run typecheck` already covers types.
export default tseslint.config(
  { basePath: '../..' },
  { ignores: ['dist/**', 'node_modules/**', 'tools/**', '.claude/**', 'presetexample/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.worker.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['*.ts', '*.js', 'scripts/**', 'pwa/**'],
    languageOptions: { globals: { ...globals.node, ...globals.serviceworker } },
  },
  {
    rules: {
      // `_name` marks a parameter that is required by a signature but unused.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
