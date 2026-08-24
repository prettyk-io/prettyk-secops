/** Thin alias → inspector preset `form-shot`. Prefer: npm run inspect -- form-shot */
if (!process.argv[2]) process.argv[2] = 'form-shot';
require('./inspector/run.cjs');
