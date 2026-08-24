import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, ArrowLeftRight } from 'lucide-react';
import { FONTS, TYPE_SCALE, type FontFace } from '../data/typography';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

const DEFAULT_TEXT_SEC = 'pretty< SecOps Studio — Security Automation Platform';
const DEFAULT_TEXT_EN = 'The quick brown fox jumps over the lazy dog 0123456789 §!@#';
const DEFAULT_CODE = 'scenario "Auth Bypass" {\n  url = "https://target.prettyk.io/api/v1/auth";\n  fuzzer.inject(payloads.sqli);\n}';

export interface TypographySectionProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function TypographySection({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: TypographySectionProps) {
  const [fontIdx, setFontIdx] = useState(0); // GT Eesti Pro Text
  const [size, setSize] = useState(20);
  const [weight, setWeight] = useState(500);
  const [italic, setItalic] = useState(false);
  const [tracking, setTracking] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [uppercase, setUppercase] = useState(false);
  const [text, setText] = useState(DEFAULT_TEXT_EN);
  const [viewMode, setViewMode] = useState<'sandbox' | 'matrix' | 'compare' | 'brand-lockups'>('sandbox');

  // Compare mode
  const [compareFontIdx, setCompareFontIdx] = useState(2); // Golos UI

  const font = FONTS[fontIdx] ?? FONTS[0]!;
  const compareFont = FONTS[compareFontIdx] ?? FONTS[1]!;

  const copyCss = () => {
    const css = `font-family: ${font.cssFamily};\nfont-size: ${size}px;\nfont-weight: ${weight};\nfont-style: ${italic ? 'italic' : 'normal'};\nletter-spacing: ${tracking.toFixed(2)}em;\nline-height: ${lineHeight};${uppercase ? '\ntext-transform: uppercase;' : ''}`;
    navigator.clipboard.writeText(css).then(() => toast.success('Typography CSS token copied')).catch(() => {});
  };

  const previewStyle: React.CSSProperties = {
    fontFamily: font.cssFamily,
    fontSize: size,
    fontWeight: weight,
    fontStyle: italic ? 'italic' : 'normal',
    letterSpacing: `${tracking.toFixed(2)}em`,
    lineHeight,
    textTransform: uppercase ? 'uppercase' : 'none',
    color: backdrop.isLight ? '#0f172a' : '#f8fafc',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div className="p-8 min-h-full">
      {/* View Mode Bar */}
      <div className="flex justify-between items-center gap-4 mb-5 flex-wrap">
        <div style={preset.segmentedStyle.container}>
          {[
            { id: 'sandbox', label: '🎛️ Interactive Studio' },
            { id: 'brand-lockups', label: '👑 Brand Wordmarks & Lockups' },
            { id: 'compare', label: '⚖️ Side-by-Side Comparison' },
            { id: 'matrix', label: '📊 Full Size Scale Ladder' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id as typeof viewMode)}
              style={{
                padding: '6px 14px',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                transition: 'all 0.15s ease',
                ...(viewMode === mode.id ? preset.segmentedStyle.activeItem : preset.segmentedStyle.inactiveItem),
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={copyCss}
          className="bg-gradient-to-r from-sky-400 to-purple-600 text-white font-semibold text-xs border-0 shadow-md"
        >
          <Copy className="size-3.5 mr-1" /> Copy CSS Token
        </Button>
      </div>

      {/* Control Bar for Active Font */}
      <div
        style={{
          ...backdrop.stageCardStyle,
          padding: '16px 20px',
          borderRadius: 12,
          marginBottom: 20,
        }}
        className="flex gap-4 items-center flex-wrap"
      >
        <div>
          <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 2 }}>Font Family</label>
          <Select
            value={String(fontIdx)}
            onValueChange={(v) => {
              const idx = parseInt(v, 10);
              setFontIdx(idx);
              const nextFont = FONTS[idx]!;
              if (!nextFont.weights.includes(weight)) {
                setWeight(nextFont.weights[0]!);
              }
            }}
          >
            <SelectTrigger className="w-[230px] h-8 text-xs bg-background/50 border-border/60">
              <SelectValue placeholder="Select font" />
            </SelectTrigger>
            <SelectContent>
              {FONTS.map((f, i) => (
                <SelectItem key={f.family} value={String(i)} className="text-xs">
                  <span style={{ fontFamily: f.cssFamily }}>
                    {f.family} <span className="text-[10px] text-muted-foreground">({f.category.split('/')[0]})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label style={preset.labelStyle}>Size: <span className="font-mono text-cyan-400">{size}px</span></label>
          </div>
          <Slider
            min={10}
            max={84}
            value={[size]}
            onValueChange={(v) => setSize(v[0] ?? 20)}
            className="w-[120px]"
          />
        </div>

        <div>
          <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 4 }}>Weight</label>
          <div className="flex bg-muted/60 p-0.5 rounded-md border border-border/40">
            {font.weights.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeight(w)}
                className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                  weight === w ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 4 }}>Style</label>
          <div className="flex bg-muted/60 p-0.5 rounded-md border border-border/40">
            <button
              type="button"
              onClick={() => setItalic(false)}
              className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                !italic ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setItalic(true)}
              className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                italic ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              Italic
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label style={preset.labelStyle}>Tracking: <span className="font-mono text-emerald-400">{tracking.toFixed(2)}em</span></label>
          </div>
          <Slider
            min={-10}
            max={30}
            value={[Math.round(tracking * 100)]}
            onValueChange={(v) => setTracking((v[0] ?? 0) / 100)}
            className="w-[100px]"
          />
        </div>

        <div>
          <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 4 }}>Case</label>
          <div className="flex bg-muted/60 p-0.5 rounded-md border border-border/40">
            <button
              type="button"
              onClick={() => setUppercase(false)}
              className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                !uppercase ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setUppercase(true)}
              className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                uppercase ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              AA
            </button>
          </div>
        </div>
      </div>

      {/* View Mode 1: Sandbox Live Preview */}
      {viewMode === 'sandbox' && (
        <div className="flex flex-col gap-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Type custom text to inspect glyphs, kerning, and baseline rhythm..."
            className="w-full bg-slate-950/80 border border-border/60 text-cyan-400 font-mono text-xs rounded-lg p-3 outline-none focus:border-cyan-400"
          />

          <div
            style={{
              ...backdrop.stageCardStyle,
              padding: 24,
              borderRadius: 14,
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <span style={preset.badgeStyle('#38bdf8')}>
                {font.family} · {weight} · {size}px {italic ? '· Italic' : ''}
              </span>
              <span className="text-xs text-muted-foreground">{font.category}</span>
            </div>
            <div style={previewStyle}>{text || DEFAULT_TEXT_EN}</div>
            <div className="my-4 border-t border-border/30" />
            <div style={{ ...previewStyle, fontSize: Math.max(12, Math.round(size * 0.75)), color: backdrop.isLight ? '#475569' : '#94a3b8' }}>
              {DEFAULT_TEXT_SEC}
            </div>
          </div>

          {/* Quick presets for testing */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setText(DEFAULT_TEXT_EN)} className="text-xs">English Pangram</Button>
            <Button size="sm" variant="outline" onClick={() => setText(DEFAULT_TEXT_SEC)} className="text-xs">SecOps Title Text</Button>
            <Button size="sm" variant="outline" onClick={() => setText('0123456789 §!@#$%^&*()_+-=[]{}|;:,.<>?/~`')} className="text-xs">Numbers & Symbols</Button>
            <Button size="sm" variant="outline" onClick={() => setText(DEFAULT_CODE)} className="text-xs">DSL Scenario Code</Button>
          </div>
        </div>
      )}

      {/* View Mode 2: Brand Wordmarks & Header Lockups SOT */}
      {viewMode === 'brand-lockups' && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
          {/* Masterbrand Lockup */}
          <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
            <span className={`text-sm font-bold block mb-3 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              {"1. Masterbrand Wordmark ('pretty<')"}
            </span>
            <div className="bg-slate-950 p-6 rounded-lg flex items-baseline gap-0.5 mb-2.5">
              <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-3xl font-medium italic text-white tracking-tight">
                pretty
              </span>
              <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-3xl font-medium text-cyan-400 translate-y-[2px] inline-block drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]">
                &lt;
              </span>
            </div>
            <span className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Current: GT Eesti Pro Text Medium Italic + chevron &lt; with +2px optical baseline offset.
            </span>
          </div>

          {/* SecOps Lab Header Lockup */}
          <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
            <span className={`text-sm font-bold block mb-3 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              2. Portal / Lab Header Lockup
            </span>
            <div className="bg-slate-950 p-5 rounded-lg flex items-center gap-2 border border-border/30 mb-2.5">
              <div className="flex items-baseline gap-0.5">
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium italic text-white">Pretty</span>
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium text-cyan-400 translate-y-[2px]">&lt;</span>
              </div>
              <span className="font-['Golos_Text',sans-serif] text-xs font-semibold text-slate-400 -translate-y-[1px]">
                SecOps Lab
              </span>
            </div>
            <span className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Current: Descriptor SecOps Lab (Golos Text SemiBold 12px) with -1px optical baseline lowering.
            </span>
          </div>

          {/* Editor Header Lockup */}
          <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
            <span className={`text-sm font-bold block mb-3 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              3. Studio Editor Header Lockup
            </span>
            <div className="bg-slate-950 p-5 rounded-lg flex items-center gap-2 border border-border/30 mb-2.5">
              <div className="flex items-baseline gap-0.5">
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium italic text-white">Pretty</span>
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium text-cyan-400 translate-y-[2px]">&lt;</span>
              </div>
              <span className="font-['Golos_UI',sans-serif] text-[10.5px] font-bold text-cyan-400 tracking-[0.15em] -translate-y-[1px]">
                EDITOR
              </span>
            </div>
            <span className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Current: Studio caps EDITOR (Golos UI Bold 10.5px, tracking 0.15em).
            </span>
          </div>

          {/* LIVE Header Lockup */}
          <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
            <span className={`text-sm font-bold block mb-3 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              4. Runtime Live Stream Lockup
            </span>
            <div className="bg-slate-950 p-5 rounded-lg flex items-center gap-2 border border-border/30 mb-2.5">
              <div className="flex items-baseline gap-0.5">
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium italic text-white">Pretty</span>
                <span className="font-['GT_Eesti_Pro_Text',sans-serif] text-base font-medium text-cyan-400 translate-y-[2px]">&lt;</span>
              </div>
              <span className="font-['Golos_UI',sans-serif] text-[10px] font-bold text-red-500 tracking-[0.16em] flex items-center gap-1 -translate-y-[1px]">
                <span className="size-1.5 rounded-full bg-red-500 animate-pulse"></span> LIVE
              </span>
            </div>
            <span className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Current: Compact stream caps LIVE (Golos UI Bold 10px + pulse-dot).
            </span>
          </div>
        </div>
      )}

      {/* View Mode 3: Compare 2 Fonts */}
      {viewMode === 'compare' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4 items-center flex-wrap">
            <Select value={String(fontIdx)} onValueChange={(v) => setFontIdx(parseInt(v, 10))}>
              <SelectTrigger className="w-[240px] h-8 text-xs bg-background/50 border-border/60">
                <SelectValue placeholder="Font A" />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f, i) => (
                  <SelectItem key={f.family} value={String(i)} className="text-xs">Font A: {f.family}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ArrowLeftRight className="size-4 text-cyan-400" />

            <Select value={String(compareFontIdx)} onValueChange={(v) => setCompareFontIdx(parseInt(v, 10))}>
              <SelectTrigger className="w-[240px] h-8 text-xs bg-background/50 border-border/60">
                <SelectValue placeholder="Font B" />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f, i) => (
                  <SelectItem key={f.family} value={String(i)} className="text-xs">Font B: {f.family}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
              <span className="text-xs font-bold text-cyan-400 block mb-2">Font A: {font.family}</span>
              <div style={{ ...previewStyle, fontFamily: font.cssFamily }}>
                {text || DEFAULT_TEXT_EN}
              </div>
            </div>

            <div style={{ ...backdrop.stageCardStyle, padding: 20, borderRadius: 12 }}>
              <span className="text-xs font-bold text-purple-400 block mb-2">Font B: {compareFont.family}</span>
              <div style={{ ...previewStyle, fontFamily: compareFont.cssFamily }}>
                {text || DEFAULT_TEXT_EN}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Mode 4: Full Matrix Scale */}
      {viewMode === 'matrix' && (
        <div style={{ ...backdrop.stageCardStyle, padding: 24, borderRadius: 14 }}>
          <div className="flex flex-col gap-2">
            {TYPE_SCALE.map((s) => (
              <div key={s} className="flex items-baseline gap-4 pb-1.5 border-b border-border/20">
                <span className="font-mono text-cyan-400 text-xs w-10 text-right">{s}px</span>
                <div style={{ fontFamily: font.cssFamily, fontSize: s, color: backdrop.isLight ? '#0f172a' : '#f8fafc', lineHeight: 1.2 }}>
                  {text.slice(0, 50)}...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
