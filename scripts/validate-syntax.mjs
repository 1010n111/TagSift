/**
 * Syntax validation for all JS files
 * Run: node scripts/validate-syntax.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const files = [
  'lib/constants.js',
  'lib/encrypt.js',
  'lib/storage.js',
  'content/content.js',
  'background/service-worker.js',
  'popup/popup.js',
  'options/options.js',
];

let errors = 0;
for (const rel of files) {
  const full = path.join(root, rel);
  const code = fs.readFileSync(full, 'utf8');
  try {
    // Each module file is parsed as ES module
    if (rel === 'content/content.js') {
      // content.js is a non-module script (no imports/exports)
      // It uses chrome.runtime.onMessage directly
      new Function(code);
    } else {
      // For ES modules, try to parse as module
      import(`file://${full}`).catch(err => {
        // import() will fail on runtime errors (chrome API not available),
        // but we can at least check if it parses
        if (err instanceof SyntaxError) throw err;
        // Runtime errors are fine (missing chrome API in Node)
      });
    }
    console.log(`✅ ${rel}`);
  } catch(e) {
    console.log(`❌ ${rel}: ${e.message}`);
    errors++;
  }
}

// Give async imports time to fail-or-resolve
setTimeout(() => {
  if (errors === 0) {
    console.log('\n🎉 All files pass syntax validation');
  } else {
    console.log(`\n❌ ${errors} file(s) have syntax errors`);
  }
  process.exit(errors > 0 ? 1 : 0);
}, 500);
