export interface FontFace {
  family: string;
  category: string;
  cssFamily: string;
  weights: number[];
  sample: string;
  hasItalic?: boolean;
}

export const FONTS: FontFace[] = [
  {
    family: 'GT Eesti Pro Text',
    category: 'Wordmark / Studio Brand & Titles',
    cssFamily: '"GT Eesti Pro Text", "Golos UI", system-ui, sans-serif',
    weights: [400, 500],
    sample: 'pretty< SecOps Studio — Security Automation Platform',
    hasItalic: true,
  },
  {
    family: 'GT Eesti Pro Display',
    category: 'Display / Large Headlines',
    cssFamily: '"GT Eesti Pro Display", "GT Eesti Pro Text", system-ui, sans-serif',
    weights: [500],
    sample: 'Pretty< SEC OPS LAB 2026',
    hasItalic: false,
  },
  {
    family: 'Golos UI',
    category: 'UI / Controls / Form Elements',
    cssFamily: '"Golos UI", "Golos Text", "Segoe UI", system-ui, sans-serif',
    weights: [400, 500, 700],
    sample: 'Execute automated security verification pipeline',
    hasItalic: false,
  },
  {
    family: 'Golos Text',
    category: 'Reports / Long Form Copy / Body',
    cssFamily: '"Golos Text", "Segoe UI", system-ui, sans-serif',
    weights: [400, 500, 600, 700],
    sample: 'High-severity Cross-Site Scripting (XSS) identified on /api/v1/profile',
    hasItalic: false,
  },
  {
    family: 'JetBrains Mono',
    category: 'Code / Monaco / DSL / Logs',
    cssFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
    weights: [400],
    sample: 'scenario "SQLi Probe" { url = "https://target/api"; fuzzer.inject(payloads.sqli); }',
    hasItalic: true,
  },
  {
    family: 'PT Astra Sans',
    category: 'Compliance / Security Audit Certificates',
    cssFamily: '"PT Astra Sans", "Segoe UI", system-ui, sans-serif',
    weights: [400, 700],
    sample: 'Security Assessment and Comprehensive Vulnerability Verification Certificate',
    hasItalic: true,
  },
];

export const TYPE_SCALE = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 84];
