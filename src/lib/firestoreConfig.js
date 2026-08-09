// Mirrors functions/firestoreConfig.cjs's value. Duplicated rather than
// cross-imported: Vite's dev server (unlike its production/Rollup build, and
// unlike Vitest) does not apply CommonJS interop to a bare .cjs file in the
// source tree, so `import x from '../functions/firestoreConfig.cjs'` throws
// "does not provide an export named 'default'" at runtime in `npm run dev`
// specifically. src/lib/firestoreConfig.test.js asserts these stay in sync.
export const FIRESTORE_DATABASE_ID = 'ltps-finance-data';
