import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

export default [
  { ignores: ['dist', 'node_modules', 'functions/node_modules', 'scripts/serviceAccountKey.json'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Only jsx-uses-vars: it marks a component identifier as "used" when it
      // appears as a JSX tag, which plain no-unused-vars can't see on its own.
      // jsx-uses-react/react-in-jsx-scope are for the classic transform and
      // don't apply here (Vite's react plugin uses the automatic runtime).
      'react/jsx-uses-vars': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': unusedVarsRule,
      // Council export sheets deliberately use U+3000 (full-width space) for
      // CJK indentation in template-literal row labels (see councilExport.js).
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
  {
    files: ['functions/**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': unusedVarsRule,
    },
  },
  {
    // Test files under functions/ use import/export (Vitest transforms them
    // regardless of the package's own CommonJS "type"), unlike the plain
    // .js/.cjs sources above.
    files: ['functions/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': unusedVarsRule,
    },
  },
  {
    files: ['scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': unusedVarsRule,
    },
  },
];
