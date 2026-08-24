import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Copy,
  BookOpen,
  ExternalLink,
  Code,
  Lightbulb,
} from 'lucide-react';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface TailwindWorkshopProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

const CHEAT_SHEET_SPACING = [
  { class: 'p-1 / gap-1', px: '4px', usage: 'Tight micro-paddings, badge insets, icon gaps' },
  { class: 'p-2 / gap-2', px: '8px', usage: 'Button inline gap, form item spacing, tag margin' },
  { class: 'p-3 / gap-3', px: '12px', usage: 'Compact card padding, table cell padding' },
  { class: 'p-4 / gap-4', px: '16px', usage: 'Standard card padding, grid gutter' },
  { class: 'p-6 / gap-6', px: '24px', usage: 'Spacious panel padding, section spacing' },
  { class: 'p-8 / gap-8', px: '32px', usage: 'Modal dialog padding, page margin' },
  { class: 'p-12 / gap-12', px: '48px', usage: 'Landing hero sections, empty states' },
  { class: 'p-16 / gap-16', px: '64px', usage: 'Major view stage boundaries' },
];

const CHEAT_SHEET_SEMANTICS = [
  { token: 'bg-background', role: 'Main Canvas Background', meaning: 'Dark canvas (#080c16) or Light canvas (#cbd5e1)' },
  { token: 'bg-card / bg-surface', role: 'Elevated Container', meaning: 'Midnight panel (#121722) or Soft grey card (#e2e8f0)' },
  { token: 'text-foreground', role: 'Primary Typography', meaning: 'High contrast white (#f8fafc) or Dark slate (#0f172a)' },
  { token: 'text-muted-foreground', role: 'Secondary / Subtitle', meaning: 'Muted slate (#94a3b8) for helper text and captions' },
  { token: 'border-border', role: 'Panel Dividers & Strokes', meaning: 'Subtle boundary border (rgba(255,255,255,0.08) or #94a3b8)' },
  { token: 'bg-primary / text-primary', role: 'Brand Master Accent', meaning: 'Electric Ice Blue (#38bdf8) for active states and highlights' },
  { token: 'bg-destructive / text-destructive', role: 'Critical Security Alert', meaning: 'Crimson red (#f85149) for high risk findings and aborts' },
  { token: 'bg-accent', role: 'Hover Highlight Background', meaning: 'Translucent blue/violet glow for active menu items' },
];

const CHEAT_SHEET_RADIUS = [
  { class: 'rounded-none', px: '0px', usage: 'Sharp cyber neubrutalism, terminal windows' },
  { class: 'rounded-sm', px: '4px', usage: 'Micro tags, code tokens, compact badges' },
  { class: 'rounded-md', px: '6px', usage: 'Standard buttons, input containers' },
  { class: 'rounded-lg', px: '8px', usage: 'Dialogs, floating menus, action hub nodes' },
  { class: 'rounded-xl', px: '12px', usage: 'Prominent cards, modal containers' },
  { class: 'rounded-2xl', px: '16px', usage: 'Large workspace stage specimen frames' },
  { class: 'rounded-full', px: '9999px', usage: 'Pill toggles, avatar squircle indicators, status dots' },
];

const PRESET_SNIPPETS: { title: string; desc: string; html: string }[] = [
  {
    title: '1. SecOps Threat Card (Tailwind)',
    desc: 'Interactive vulnerability alert card with status badge and metadata',
    html: `<div class="p-5 rounded-xl border border-rose-500/30 bg-rose-950/20 shadow-lg flex flex-col gap-3 max-w-sm">
  <div class="flex items-center justify-between">
    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40">
      <span class="size-1.5 rounded-full bg-rose-400 animate-pulse"></span>
      CRITICAL
    </span>
    <span class="text-xs font-mono text-slate-400">CVE-2026-9921</span>
  </div>
  <h4 class="text-sm font-semibold text-white">Blind SQL Injection</h4>
  <p class="text-xs text-slate-300 leading-relaxed">Time-based payload confirmed delay of 5000ms on /api/v1/auth endpoint.</p>
  <div class="mt-2 pt-3 border-t border-rose-500/20 flex items-center justify-between text-xs text-slate-400">
    <span>CVSS 9.8</span>
    <button class="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors">
      Remediate →
    </button>
  </div>
</div>`,
  },
  {
    title: '2. Cyber Hero Input Bar',
    desc: 'Target URL input field with protocol badge and action shortcut',
    html: `<div class="flex items-center gap-2 p-1 rounded-lg border border-cyan-500/30 bg-slate-900/90 shadow-md max-w-md focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
  <span class="px-2.5 py-1 text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 rounded border border-cyan-500/20 select-none">
    https://
  </span>
  <input class="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none w-full font-mono" placeholder="target.prettyk.io/api" value="juice-shop.prettyk.io/api/v1" />
  <span class="px-2 py-0.5 text-xs text-slate-400 bg-slate-800 rounded border border-slate-700 select-none">
    ⌘K
  </span>
</div>`,
  },
  {
    title: '3. Brand Master Launch Trigger',
    desc: 'Electric gradient button with elevation shadow and active state',
    html: `<button class="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-sky-400 via-purple-600 to-indigo-700 shadow-lg shadow-purple-900/40 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer">
  <span>⚡</span>
  <span>Launch SecOps Pipeline</span>
</button>`,
  },
];

export function TailwindWorkshop({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: TailwindWorkshopProps) {
  const [activeSnippetIdx, setActiveSnippetIdx] = useState(0);
  const [customHtml, setCustomHtml] = useState(PRESET_SNIPPETS[0]!.html);

  const copyText = (val: string, label: string) => {
    navigator.clipboard.writeText(val).then(() => toast.success(`${label} copied`)).catch(() => {});
  };

  return (
    <div className="p-8 min-h-full">
      {/* 1. Top Header Banner */}
      <div
        style={backdrop.stageCardStyle}
        className="p-6 rounded-2xl mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xl">📘</span>
              <h2 className={`text-base font-bold m-0 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Tailwind Design Workshop — Token Playground & Live Sandbox
              </h2>
              <Badge variant="cyan" className="text-[10px] font-mono font-bold tracking-wider">
                DESIGN TOKENS · TAILWIND V4
              </Badge>
            </div>
            <p className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} m-0`}>
              Why Tailwind matters for UI/UX designers, token mapping cheat sheets, and live interactive HTML/CSS sandbox.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Why Tailwind Matters for Designers & Practical Resources */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-5 mb-7">
        {/* Card A: Designer's Toolkit */}
        <div style={backdrop.stageCardStyle} className="p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="size-4 text-cyan-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Designer-First Tailwind: Your Visual Playground
            </span>
          </div>
          <p className={`text-xs leading-relaxed mb-3 ${backdrop.isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            Tailwind is a <strong>design token language</strong> that the entire team speaks fluently.
            Your Figma variables (colors, spacing, radius, typography) map directly to CSS utility classes,
            making design-dev collaboration seamless and drift-free.
          </p>
          <ul className={`text-xs pl-4 m-0 flex flex-col gap-1.5 ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            <li><strong>Figma → Code, No Friction:</strong> Variables sync 1:1. A color token in Figma is the same token in production.</li>
            <li><strong>Theme-Agnostic Design:</strong> Using semantic names like <code className="text-cyan-400">bg-card</code> means your palette works across dark/light/cyber/glass out of the box.</li>
            <li><strong>Constraint-Driven Creativity:</strong> The 4px spacing scale and predefined radius tokens become your creative toolkit, not limitations.</li>
          </ul>
        </div>

        {/* Card B: Practical Design Resources */}
        <div style={backdrop.stageCardStyle} className="p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="size-4 text-purple-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Designer Resources & Tutorials
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className={`flex justify-between items-start pb-2 border-b ${backdrop.isLight ? 'border-slate-300' : 'border-border/30'}`}>
              <div>
                <span className={`text-xs font-bold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  🎨 Figma to Tailwind: Full Mapping Guide
                </span>
                <span className={`text-[11px] block ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Complete token bridge: Auto Layout → flex/gap, Fills → bg-/border-, Strokes → ring-/outline-.
                </span>
              </div>
              <a href="https://www.figma.com/community/file/958383439802195085" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 inline-flex items-center gap-1 hover:underline">
                Figma Community <ExternalLink className="size-2.5" />
              </a>
            </div>

            <div className={`flex justify-between items-start pb-2 border-b ${backdrop.isLight ? 'border-slate-300' : 'border-border/30'}`}>
              <div>
                <span className={`text-xs font-bold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  🖼️ shadcn/ui Figma Kit
                </span>
                <span className={`text-[11px] block ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Official Figma components matching our shadcn/ui primitives exactly.
                </span>
              </div>
              <a href="https://ui.shadcn.com/figma" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 inline-flex items-center gap-1 hover:underline">
                ui.shadcn.com <ExternalLink className="size-2.5" />
              </a>
            </div>

            <div className={`flex justify-between items-start pb-2 border-b ${backdrop.isLight ? 'border-slate-300' : 'border-border/30'}`}>
              <div>
                <span className={`text-xs font-bold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  📐 Spacing & Hierarchy Masterclass
                </span>
                <span className={`text-[11px] block ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Fewer borders, smarter hierarchy, consistent rhythm. Professional UI design patterns.
                </span>
              </div>
              <a href="https://www.youtube.com/@DesignCourse" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 inline-flex items-center gap-1 hover:underline">
                DesignCourse <ExternalLink className="size-2.5" />
              </a>
            </div>

            <div className="flex justify-between items-start">
              <div>
                <span className={`text-xs font-bold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  ⚡ Tailwind Play & v4 Docs
                </span>
                <span className={`text-[11px] block ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Real-time class experimentation sandbox and @theme engine specs.
                </span>
              </div>
              <a href="https://play.tailwindcss.com" target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 inline-flex items-center gap-1 hover:underline">
                play.tailwindcss.com <ExternalLink className="size-2.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Designer Cheat Sheet Tables (Spacing / Semantics / Radius) */}
      <div style={backdrop.stageCardStyle} className="p-6 rounded-2xl mb-7">
        <h3 className={`text-sm font-bold m-0 mb-4 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          📐 Tailwind Token Cheat Sheet for Product Design
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
          {/* Table A: Spacing Scale */}
          <div>
            <span className="text-xs font-bold text-cyan-400 block mb-2">
              1. 4px Spacing Ladder (Padding / Margin / Gap)
            </span>
            <div className="flex flex-col gap-1.5">
              {CHEAT_SHEET_SPACING.map((s) => (
                <div key={s.class} className={`flex items-center justify-between p-1.5 px-2.5 rounded border text-xs ${backdrop.isLight ? 'bg-white border-slate-300' : 'bg-slate-950/80 border-border/40'}`}>
                  <code className="text-cyan-400 font-bold">{s.class}</code>
                  <span className={`font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>{s.px}</span>
                  <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>{s.usage}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table B: Semantic Color Tokens */}
          <div>
            <span className="text-xs font-bold text-purple-400 block mb-2">
              2. Semantic Color Tokens (Theme-Adaptive)
            </span>
            <div className="flex flex-col gap-1.5">
              {CHEAT_SHEET_SEMANTICS.slice(0, 6).map((c) => (
                <div key={c.token} className={`flex items-center justify-between p-1.5 px-2.5 rounded border text-xs ${backdrop.isLight ? 'bg-white border-slate-300' : 'bg-slate-950/80 border-border/40'}`}>
                  <code className="text-purple-400 font-bold">{c.token}</code>
                  <span className={`text-[11px] font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>{c.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table C: Border Radius Tokens */}
          <div>
            <span className="text-xs font-bold text-emerald-400 block mb-2">
              3. Border Radius Curves
            </span>
            <div className="flex flex-col gap-1.5">
              {CHEAT_SHEET_RADIUS.map((r) => (
                <div key={r.class} className={`flex items-center justify-between p-1.5 px-2.5 rounded border text-xs ${backdrop.isLight ? 'bg-white border-slate-300' : 'bg-slate-950/80 border-border/40'}`}>
                  <code className="text-emerald-400 font-bold">{r.class}</code>
                  <span className={`font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>{r.px}</span>
                  <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>{r.usage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Interactive Live Sandbox (Editor & Preview) */}
      <div style={backdrop.stageCardStyle} className="p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Code className="size-4 text-cyan-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              4. Interactive Tailwind Sandbox & Component Specimen Generator
            </span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-2">
            {PRESET_SNIPPETS.map((sn, idx) => (
              <Button
                key={sn.title}
                size="sm"
                variant={activeSnippetIdx === idx ? 'default' : 'outline'}
                onClick={() => {
                  setActiveSnippetIdx(idx);
                  setCustomHtml(sn.html);
                }}
                className="text-xs h-7"
              >
                Snippet {idx + 1}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyText(customHtml, 'Tailwind HTML')}
              className="text-cyan-400 hover:text-cyan-300 text-xs h-7"
            >
              <Copy className="size-3 mr-1" /> Copy HTML
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: Code Editor Area */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Tailwind HTML / Utility Class Markup:
            </label>
            <textarea
              value={customHtml}
              onChange={(e) => setCustomHtml(e.target.value)}
              rows={12}
              className="w-full bg-slate-950 text-cyan-400 font-mono text-xs rounded-xl p-3.5 border border-border/50 outline-none leading-relaxed focus:border-cyan-400 transition-colors"
            />
          </div>

          {/* Right: Live Rendered Output */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Live Specimen Stage (Rendered):
            </label>
            <div
              className={`rounded-xl p-8 min-h-[280px] flex items-center justify-center border-2 border-dashed ${
                backdrop.isLight ? 'bg-slate-200 border-slate-400' : 'bg-slate-950/80 border-cyan-500/30'
              }`}
              dangerouslySetInnerHTML={{ __html: customHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
