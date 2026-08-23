import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Copy, Zap, Flame, Eye } from 'lucide-react';
import {
  PALETTES,
  SWATCHES,
  BRAND_GRADIENTS,
  THREAT_TOKENS,
  contrastRatio,
  wcagGrade,
} from '../data/palette';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface PaletteExplorerProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function PaletteExplorer({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: PaletteExplorerProps) {
  const [sectionTab, setSectionTab] = useState<'gradients' | 'threats' | 'packs'>('gradients');
  const [paletteIdx, setPaletteIdx] = useState(0);
  const palette = PALETTES[paletteIdx]!;

  const copyHex = (hex: string, label?: string) => {
    navigator.clipboard.writeText(hex).then(() => toast.success(`${label ?? hex} copied`)).catch(() => {});
  };

  const copyCss = (css: string, label: string) => {
    navigator.clipboard.writeText(css).then(() => toast.success(`Gradient ${label} CSS copied`)).catch(() => {});
  };

  const bgColor = palette.pack.colorBgLayout;
  const textColor = palette.pack.colorText;

  return (
    <TooltipProvider>
      <div className="p-8 min-h-full">
        {/* Sub-tab Switcher */}
        <div
          style={backdrop.stageCardStyle}
          className="p-3.5 rounded-xl mb-6 flex items-center justify-between flex-wrap gap-3"
        >
          <div style={preset.segmentedStyle.container}>
            {[
              { id: 'gradients', label: '🌈 Brand Master Gradients', icon: <Zap className="size-3.5 mr-1 text-cyan-400" /> },
              { id: 'threats', label: '🛡️ SecOps Threat Matrix Tokens', icon: <Flame className="size-3.5 mr-1 text-rose-400" /> },
              { id: 'packs', label: '🎨 Color Palette Packs', icon: <Eye className="size-3.5 mr-1 text-amber-400" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSectionTab(t.id as typeof sectionTab)}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 12,
                  transition: 'all 0.15s ease',
                  ...(sectionTab === t.id ? preset.segmentedStyle.activeItem : preset.segmentedStyle.inactiveItem),
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1. BRAND GRADIENTS SECTION */}
        {sectionTab === 'gradients' && (
          <div className="flex flex-col gap-4">
            {/* Prominent High-Contrast Helper Header */}
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 8,
                background: backdrop.isLight ? '#cbd5e1' : 'rgba(18, 23, 34, 0.75)',
                border: `1px solid ${backdrop.isLight ? '#94a3b8' : 'rgba(92, 136, 245, 0.25)'}`,
              }}
            >
              <span className={`text-xs font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                PrettyK SecOps Suite current brand gradients. Click any gradient or button to copy CSS{' '}
                <code className={`px-1.5 py-0.5 rounded font-mono font-bold ${backdrop.isLight ? 'bg-white text-cyan-600 border border-slate-300' : 'bg-slate-950 text-cyan-400 border border-slate-800'}`}>
                  linear-gradient
                </code>
                :
              </span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
              {BRAND_GRADIENTS.map((bg) => (
                <div
                  key={bg.id}
                  style={{
                    ...backdrop.stageCardStyle,
                    padding: '20px 22px',
                    borderRadius: 14,
                  }}
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                      {bg.name}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => copyCss(bg.gradient, bg.name)}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs h-7 px-2.5"
                    >
                      <Copy className="size-3 mr-1" /> Copy CSS
                    </Button>
                  </div>

                  <div
                    onClick={() => copyCss(bg.gradient, bg.name)}
                    style={{
                      height: 64,
                      borderRadius: 8,
                      background: bg.gradient,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <span className="text-xs font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                      {bg.description}
                    </span>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {bg.stops.map((st) => (
                      <button
                        key={st.color}
                        type="button"
                        onClick={() => copyHex(st.color, st.label)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold cursor-pointer border"
                        style={{
                          background: backdrop.isLight ? '#ffffff' : '#080c16',
                          borderColor: st.color,
                          color: backdrop.isLight ? '#0f172a' : '#f8fafc',
                        }}
                      >
                        <span className="size-2.5 rounded-xs" style={{ background: st.color }} />
                        <span>{st.color}</span>
                        <span className="text-[10px] text-muted-foreground">({st.label.split(' ')[0]})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. THREAT MATRIX TOKENS */}
        {sectionTab === 'threats' && (
          <div className="flex flex-col gap-4">
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 8,
                background: backdrop.isLight ? '#cbd5e1' : 'rgba(18, 23, 34, 0.75)',
                border: `1px solid ${backdrop.isLight ? '#94a3b8' : 'rgba(92, 136, 245, 0.25)'}`,
              }}
            >
              <span className={`text-xs font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Current vulnerability severity ratings, risk categories, and telemetry tokens:
              </span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {THREAT_TOKENS.map((th) => (
                <div
                  key={th.id}
                  style={{
                    ...backdrop.stageCardStyle,
                    background: backdrop.isLight ? '#ffffff' : th.bgRgba,
                    borderColor: th.hex,
                    borderWidth: backdrop.isLight ? '1.5px' : '1px',
                    padding: 16,
                    cursor: 'pointer',
                    borderRadius: 12,
                  }}
                  onClick={() => copyHex(th.hex, th.name)}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: th.hex, boxShadow: `0 0 8px ${th.hex}` }} />
                      <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                        {th.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded text-white" style={{ background: th.hex }}>
                      {th.level}
                    </span>
                  </div>
                  <p className={`text-xs mb-3 ${backdrop.isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    {th.description}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: th.hex, background: backdrop.isLight ? '#f1f5f9' : 'rgba(0,0,0,0.5)', border: `1px solid ${th.hex}40` }}>
                      {th.hex}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Click to copy hex</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. PALETTE PACKS & WCAG CONTRAST */}
        {sectionTab === 'packs' && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 flex-wrap mb-2">
              {PALETTES.map((p, i) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={paletteIdx === i ? 'default' : 'outline'}
                  onClick={() => setPaletteIdx(i)}
                  className="text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div
              style={{
                background: bgColor,
                border: `1px solid ${palette.pack.colorBorder}`,
                borderRadius: 14,
                padding: 20,
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <span style={{ color: textColor }} className="text-sm font-bold">
                  {palette.label} · Mode: <Badge variant="outline" className="ml-1 text-[10px]">{palette.mode}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  Layout Canvas: <span className="font-mono font-bold" style={{ color: palette.pack.colorPrimary }}>{bgColor}</span>
                </span>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
                {SWATCHES.map((sw) => {
                  const hex = String(palette.pack[sw.key] ?? '#000');
                  const ratio = contrastRatio(hex, bgColor);
                  const grade = wcagGrade(ratio);
                  const textOnSwatch = contrastRatio('#ffffff', hex) >= 4.5 ? '#ffffff' : '#0b0f17';
                  return (
                    <Tooltip key={String(sw.key)}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => copyHex(hex, sw.label)}
                          style={{
                            background: hex,
                            border: `1px solid ${palette.pack.colorBorder}`,
                            borderRadius: 8,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          }}
                        >
                          <span style={{ color: textOnSwatch }} className="text-[11px] font-bold block">
                            {sw.label}
                          </span>
                          <span style={{ color: textOnSwatch }} className="text-xs font-mono block">
                            {hex}
                          </span>
                          <div className="flex justify-between mt-2 items-center">
                            <span
                              className="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white"
                              style={{
                                background: grade === 'AAA' ? '#3fb27f' : grade === 'AA' ? '#38bdf8' : '#f85149',
                              }}
                            >
                              {grade}
                            </span>
                            <span style={{ color: textOnSwatch }} className="text-[10px] font-semibold opacity-90">
                              {ratio.toFixed(1)}:1
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs font-mono">{sw.label}: {hex} ({grade} {ratio.toFixed(1)}:1)</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
