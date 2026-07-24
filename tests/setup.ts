// Polyfills global indexedDB for tests (src/cache/db.ts uses raw indexedDB,
// no lib). Wired in via vite.config.ts test.setupFiles.
import 'fake-indexeddb/auto'
