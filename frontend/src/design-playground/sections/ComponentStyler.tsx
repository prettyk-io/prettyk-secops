import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Check, Undo2, Sparkles, MousePointerClick, Square, Circle } from 'lucide-react';
import {
  COMPONENT_STYLE_PACKS,
  applyComponentStylePack,
  type ComponentStylePackId,
  type ComponentStylePack,
} from '../data/componentStyles';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

const CURRENT_ID: ComponentStylePackId = 'current';

const tagColors: Record<string, string> = {
  current: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  default: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  zinc: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  sharp: 'bg-red-400/20 text-red-300 border-red-400/30',
  industrial: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
  square: 'bg-red-400/20 text-red-300 border-red-400/30',
  pill: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
  rounded: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
  soft: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
  mobile: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
  brutal: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  bold: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  shadow: 'bg-violet-400/20 text-violet-300 border-violet-400/30',
  pop: 'bg-pink-400/20 text-pink-300 border-pink-400/30',
  glass: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  frosted: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  translucent: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  depth: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  minimal: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
  thin: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
  compact: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
  dense: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
  chunky: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
  playful: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
  bouncy: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
  big: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
  material: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  elevation: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  layered: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  glitch: 'bg-lime-400/20 text-lime-300 border-lime-400/30',
  cyber: 'bg-lime-400/20 text-lime-300 border-lime-400/30',
  rgb: 'bg-lime-400/20 text-lime-300 border-lime-400/30',
  distortion: 'bg-lime-400/20 text-lime-300 border-lime-400/30',
  organic: 'bg-teal-400/20 text-teal-300 border-teal-400/30',
  blob: 'bg-teal-400/20 text-teal-300 border-teal-400/30',
  calm: 'bg-teal-400/20 text-teal-300 border-teal-400/30',
  retro: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  brutalist: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  mono: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
  typewriter: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  gradient: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  liquid: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  animated: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  web3: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  precision: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  finance: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  monospace: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  tight: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
};

function radiusToShape(r: string): 'none' | 'sm' | 'md' | 'lg' | 'pill' {
  const v = parseFloat(r);
  if (v === 0) return 'none';
  if (v <= 0.25) return 'sm';
  if (v <= 0.625) return 'md';
  if (v <= 1) return 'lg';
  return 'pill';
}

function shapeIcon(shape: string) {
  if (shape === 'none') return <Square className="size-12" strokeWidth={3} />;
  if (shape === 'sm') return <Square className="size-12 rounded-sm" strokeWidth={2.5} />;
  if (shape === 'md') return <Square className="size-12 rounded-md" strokeWidth={2} />;
  if (shape === 'lg') return <Square className="size-12 rounded-xl" strokeWidth={1.5} />;
  return <Circle className="size-12" strokeWidth={1.5} />;
}

export interface ComponentStylerProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function ComponentStyler({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ComponentStylerProps) {
  const [activeId, setActiveId] = useState<ComponentStylePackId>(CURRENT_ID);
  const [demoInput, setDemoInput] = useState('hello@secops.io');
  const [demoChecked, setDemoChecked] = useState(true);
  const [demoSwitch, setDemoSwitch] = useState(true);

  const apply = useCallback((pack: ComponentStylePack) => {
    applyComponentStylePack(pack);
    setActiveId(pack.id);
    toast.success(`Style "${pack.name}" applied`);
  }, []);

  const reset = useCallback(() => {
    const current = COMPONENT_STYLE_PACKS[0]!;
    applyComponentStylePack(current);
    setActiveId(CURRENT_ID);
    toast('Reset to Current (Default)');
  }, []);

  const activePack = COMPONENT_STYLE_PACKS.find((p) => p.id === activeId);

  return (
    <div className="p-8 min-h-full">
      {/* Header */}
      <div style={backdrop.stageCardStyle} className="p-4 rounded-xl mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className={`text-lg font-bold mb-1 ${backdrop.isLight ? 'text-slate-900' : 'text-white'}`}>
            <Sparkles className="size-4 inline mr-1.5 text-amber-400" />
            Component Style Packs · 12 Styles
          </h2>
          <p className={`text-xs ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Radius, shadows, borders, animations. Click a pack to inject component-level CSS live.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="text-xs">
            {activePack?.name ?? 'Current'} {activeId === CURRENT_ID ? '(Default)' : ''}
          </Badge>
          <Button size="sm" variant="secondary" onClick={reset} className="h-8 text-xs gap-1">
            <Undo2 className="size-3" /> Reset
          </Button>
        </div>
      </div>

      {/* Live Preview Zone */}
      <div style={backdrop.stageCardStyle} className="p-6 rounded-xl mb-6">
        <h3 className={`text-sm font-bold mb-4 ${backdrop.isLight ? 'text-slate-800' : 'text-slate-200'}`}>
          <MousePointerClick className="size-3.5 inline mr-1.5 text-amber-400" />
          Live Preview — {activePack?.name ?? 'Current'}
        </h3>
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Buttons</span>
            <div className="flex gap-2 flex-wrap items-center">
              <Button size="sm">Primary</Button>
              <Button variant="outline" size="sm">Outline</Button>
              <Button variant="secondary" size="sm">Secondary</Button>
              <Button variant="ghost" size="sm">Ghost</Button>
              <Button variant="destructive" size="sm">Danger</Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Input</span>
            <Input
              value={demoInput}
              onChange={(e) => setDemoInput(e.target.value)}
              className="h-8 text-xs w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Badges</span>
            <div className="flex gap-1.5">
              <Badge variant="cyan">Active</Badge>
              <Badge variant="destructive">Critical</Badge>
              <Badge variant="emerald">Pass</Badge>
              <Badge variant="amber">Warn</Badge>
              <Badge variant="outline">Tag</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-start">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Switch</span>
            <Switch checked={demoSwitch} onCheckedChange={setDemoSwitch} />
          </div>
          <div className="flex flex-col gap-1.5 items-start">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Checkbox</span>
            <div className="flex items-center gap-2">
              <Checkbox id="cs-demo" checked={demoChecked} onCheckedChange={(v) => setDemoChecked(!!v)} />
              <label htmlFor="cs-demo" className={`text-xs cursor-pointer ${backdrop.isLight ? 'text-slate-700' : 'text-slate-300'}`}>Fuzzing enabled</label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Slider</span>
            <div className="w-28"><Slider defaultValue={[60]} /></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`text-[10px] ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>Progress</span>
            <div className="w-24"><Progress value={66} /></div>
          </div>
        </div>
        {activePack?.description && (
          <p className={`text-[10px] mt-4 ${backdrop.isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {activePack.description}
          </p>
        )}
      </div>

      {/* Style Pack Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {COMPONENT_STYLE_PACKS.map((pack) => {
          const isActive = activeId === pack.id;
          const shape = radiusToShape(pack.cssVars['--radius'] ?? '0.625rem');

          return (
            <div
              key={pack.id}
              style={{
                background: backdrop.isLight ? '#ffffff' : '#0a0f1a',
                border: `1.5px solid ${isActive ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: pack.cssVars['--radius'] ?? '0.5rem',
                boxShadow: isActive ? '0 0 16px rgba(245,158,11,0.25)' : undefined,
              }}
              className="p-4 cursor-pointer transition-all hover:border-cyan-400/30 select-none"
              onClick={() => apply(pack)}
            >
              {/* Top row: shape icon + info */}
              <div className="flex gap-3 items-start mb-3">
                <div
                  className={`shrink-0 flex items-center justify-center transition-colors ${isActive ? 'text-amber-400' : backdrop.isLight ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {shapeIcon(shape)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-white'}`}>
                      {pack.name}
                    </span>
                    {isActive && <Check className="size-3.5 text-amber-400 shrink-0" />}
                  </div>
                  <p className={`text-[10px] leading-relaxed mt-0.5 ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {pack.description}
                  </p>
                </div>
              </div>

              {/* Mini mockup: shadow + border preview */}
              <div className="flex gap-2 mb-3">
                <div
                  className="h-7 flex-1 rounded flex items-center justify-center text-[9px] font-bold"
                  style={{
                    background: backdrop.isLight ? '#f1f5f9' : '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: pack.id === 'neubrut' ? '3px 3px 0 rgba(255,255,255,0.15)'
                      : pack.id === 'elevated' ? '0 2px 4px rgba(0,0,0,0.2)'
                      : pack.id === 'glass' ? '0 4px 16px rgba(0,0,0,0.2)'
                      : pack.id === 'glitch' ? '0 0 6px rgba(56,189,248,0.3)'
                      : '0 1px 2px rgba(0,0,0,0.15)',
                  }}
                >
                  <span style={{ color: backdrop.isLight ? '#475569' : '#94a3b8' }}>Button mock</span>
                </div>
                <div
                  className="h-7 w-16 rounded flex items-center justify-center text-[9px] font-bold"
                  style={{
                    background: '#38bdf8',
                    color: '#080c16',
                    borderRadius: pack.cssVars['--radius'] ?? '0.5rem',
                  }}
                >
                  CTA
                </div>
              </div>

              {/* Tags */}
              <div className="flex gap-1 flex-wrap">
                {pack.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded border ${tagColors[tag] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}