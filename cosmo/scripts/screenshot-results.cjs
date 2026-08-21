/** Thin alias → inspector preset `results-shot`. Prefer: npm run inspect:results */
if (!process.argv[2]) process.argv[2] = 'results-shot';
require('./inspector/run.cjs');
