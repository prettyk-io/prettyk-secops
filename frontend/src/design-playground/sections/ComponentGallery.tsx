import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  Check,
  X,
  Copy,
  Search,
  scanner,
  Bold,
  Italic,
  Underline,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List as ListIcon,
} from 'lucide-react';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

type Density = 'compact' | 'comfortable' | 'spacious';

export interface ComponentGalleryProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function ComponentGallery({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ComponentGalleryProps) {
  const [density, setDensity] = useState<Density>('comfortable');
  const [globalState, setGlobalState] = useState<string>('normal');
  const [selected, setSelected] = useState<string>('button');

  const gap = density === 'compact' ? 8 : density === 'spacious' ? 18 : 12;

  const isHover = globalState === 'hover';
  const isFocus = globalState === 'focus';
  const isDisabled = globalState === 'disabled';
  const isAllLoading = globalState === 'loading';

  const hoverStyle: React.CSSProperties = isHover ? { boxShadow: '0 0 0 2px #38bdf8' } : {};
  const focusStyle: React.CSSProperties = isFocus ? { outline: '2px solid #38bdf8', outlineOffset: 2 } : {};

  const stressProps = (base: Record<string, unknown>) => ({
    disabled: isDisabled || (base.disabled as boolean) || false,
    loading: isAllLoading || (base.loading as boolean) || false,
  });

  const copyJsx = (code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.success('JSX snippet copied')).catch(() => {});
  };

  const sections: { id: string; label: string; el: React.ReactNode }[] = [
    { id: 'button', label: '🔘 Buttons', el: <BtnMatrix g={gap} hs={hoverStyle} fs={focusStyle} sps={stressProps} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'input', label: '⌨️ Inputs', el: <InpMatrix g={gap} hs={hoverStyle} fs={focusStyle} sps={stressProps} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'badge', label: '🏷️ Badges & Tags', el: <BadgeMatrix g={gap} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'selection', label: '☑️ Checkbox & Radio', el: <SelMatrix g={gap} hs={hoverStyle} fs={focusStyle} sps={stressProps} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'toggle', label: '🎚️ Switches', el: <TglMatrix g={gap} sps={stressProps} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'slider', label: '📏 Sliders', el: <SldMatrix g={gap} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'progress', label: '⏳ Progress', el: <PrgMatrix g={gap} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'toggle-group', label: '🔀 Toggle Group', el: <TggMatrix g={gap} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'radio', label: '🔘 Radio Group', el: <RdgMatrix g={gap} sps={stressProps} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
    { id: 'card', label: '🃏 Cards', el: <CrdMatrix g={gap} hs={hoverStyle} cp={copyJsx} preset={preset} backdrop={backdrop} /> },
  ];

  return (
    <div className="p-8 min-h-full">
      {/* Controls Bar */}
      <div
        style={backdrop.stageCardStyle}
        className="p-4 rounded-xl mb-5 flex items-center gap-5 flex-wrap"
      >
        <div>
          <label style={{ ...preset.labelStyle, color: backdrop.isLight ? '#475569' : '#94a3b8', display: 'block', marginBottom: 4 }}>
            Density Layout
          </label>
          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
            {[
              { label: 'Compact (Studio)', value: 'compact' },
              { label: 'Comfortable', value: 'comfortable' },
              { label: 'Spacious', value: 'spacious' },
            ].map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDensity(d.value as Density)}
                className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer border-0 ${
                  density === d.value ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ ...preset.labelStyle, color: backdrop.isLight ? '#475569' : '#94a3b8', display: 'block', marginBottom: 4 }}>
            Stress-State Global Override
          </label>
          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
            {[
              { label: 'Normal', value: 'normal' },
              { label: 'Hover (forced)', value: 'hover' },
              { label: 'Focus-visible', value: 'focus' },
              { label: 'Disabled', value: 'disabled' },
              { label: 'Loading', value: 'loading' },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setGlobalState(s.value)}
                className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer border-0 ${
                  globalState === s.value ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Component Navigation Bar */}
      <div className="flex gap-1.5 p-1 rounded-xl bg-card/60 border border-border/40 mb-6 overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected(s.id)}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer border-0 whitespace-nowrap ${
              selected === s.id
                ? 'bg-gradient-to-r from-sky-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/40 shadow-xs'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sections.find((s) => s.id === selected)?.el}
    </div>
  );
}

function MC({
  label,
  code,
  cp,
  children,
  preset,
  backdrop,
}: {
  label: string;
  code: string;
  cp: (c: string) => void;
  children: React.ReactNode;
  preset: GlobalDesignPreset;
  backdrop: CanvasBackdrop;
}) {
  return (
    <div
      style={backdrop.stageCardStyle}
      className="p-4 rounded-xl min-w-[160px] flex flex-col justify-between"
    >
      <div className="flex justify-between items-center mb-3">
        <span className={`text-xs font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          {label}
        </span>
        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-cyan-400 hover:text-cyan-300" onClick={() => cp(code)}>
          <Copy className="size-3" />
        </Button>
      </div>
      <div className="flex items-center justify-center min-h-[44px]">
        {children}
      </div>
    </div>
  );
}

function BtnMatrix({ g, hs, fs, sps, cp, preset, backdrop }: {
  g: number; hs: React.CSSProperties; fs: React.CSSProperties;
  sps: (b: Record<string, unknown>) => Record<string, unknown>; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop;
}) {
  const p = sps({});
  const primaryStyle = preset.primaryButtonStyle();
  const secStyle = preset.secondaryButtonStyle;
  const rows = [
    { l: 'Primary Preset', e: <Button {...p} style={{ ...hs, ...fs, ...primaryStyle }}>Primary</Button>, c: '<Button type="primary">Primary</Button>' },
    { l: 'Brand Gradient', e: <Button {...p} style={{ ...hs, ...fs, background: 'linear-gradient(135deg, #38bdf8, #7a1fa2)', borderColor: 'transparent', fontWeight: 600, color: '#fff', borderRadius: primaryStyle.borderRadius }}>Launch</Button>, c: '<Button style={{ background: "linear-gradient(135deg, #38bdf8, #7a1fa2)" }}>Launch</Button>' },
    { l: 'Secondary Preset', e: <Button variant="secondary" {...p} style={{ ...hs, ...fs, ...secStyle }}>Secondary</Button>, c: '<Button variant="secondary">Secondary</Button>' },
    { l: 'Outline Default', e: <Button variant="outline" {...p} style={{ ...hs, ...fs, borderRadius: primaryStyle.borderRadius, ...(backdrop.isLight ? { background: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' } : {}) }}>Outline</Button>, c: '<Button variant="outline">Default</Button>' },
    { l: 'Ghost', e: <Button variant="ghost" {...p} style={{ ...hs, ...fs, color: '#38bdf8', borderRadius: primaryStyle.borderRadius }}>Ghost</Button>, c: '<Button variant="ghost">Ghost</Button>' },
    { l: 'Link', e: <Button variant="link" {...p} style={{ ...hs, ...fs, color: '#38bdf8' }}>Link</Button>, c: '<Button variant="link">Link</Button>' },
    { l: 'Destructive Solid', e: <Button variant="destructive" {...p} style={{ ...hs, ...fs, borderRadius: primaryStyle.borderRadius }}>Danger</Button>, c: '<Button variant="destructive">Danger</Button>' },
    { l: 'With Icon', e: <Button {...p} style={{ ...hs, ...fs, ...primaryStyle }}><scanner className="size-3.5 mr-1" /> Inject</Button>, c: '<Button><scanner /> Inject</Button>' },
  ];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>{rows.map((r) => <MC key={r.l} label={r.l} code={r.c} cp={cp} preset={preset} backdrop={backdrop}>{r.e}</MC>)}</div>;
}

function InpMatrix({ g, hs, fs, sps, cp, preset, backdrop }: {
  g: number; hs: React.CSSProperties; fs: React.CSSProperties;
  sps: (b: Record<string, unknown>) => Record<string, unknown>; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop;
}) {
  const p = sps({});
  const containerStyle = preset.inputContainerStyle(false);
  const inputStyle = preset.inputElementStyle;

  const items = [
    { l: 'Preset Input', e: <div style={{ ...containerStyle, padding: '4px 8px', width: 170 }}><Input placeholder="Placeholder..." style={{ ...hs, ...fs, ...inputStyle, border: 'none', background: 'transparent', height: '100%' }} {...p} /></div>, c: '<Input placeholder="Placeholder..." />' },
    { l: 'Search with Icon', e: <div style={{ ...containerStyle, position: 'relative', width: 170, padding: '4px 8px 4px 28px' }}><Search className="size-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" /><Input placeholder="Search..." style={{ ...hs, ...fs, ...inputStyle, border: 'none', background: 'transparent', height: '100%' }} {...p} /></div>, c: '<Input prefix={<Search />} placeholder="Search..." />' },
    { l: 'Code Monospace', e: <div style={{ ...containerStyle, padding: '4px 8px', width: 170 }}><Input defaultValue="fuzzer.run()" style={{ ...hs, ...fs, ...inputStyle, width: '100%', border: 'none', background: 'transparent', fontFamily: 'JetBrains Mono, monospace', color: '#38bdf8' }} {...p} /></div>, c: '<Input style={{ fontFamily: "JetBrains Mono" }} />' },
    { l: 'Small (Studio)', e: <div style={{ ...containerStyle, padding: '2px 6px', width: 130 }}><Input className="h-6 text-xs" placeholder="Small" style={{ ...hs, ...fs, ...inputStyle, border: 'none', background: 'transparent' }} {...p} /></div>, c: '<Input size="sm" placeholder="Small" />' },
    { l: 'Large Hero', e: <div style={{ ...containerStyle, padding: '6px 12px', width: 220 }}><Input className="h-8 text-base" placeholder="Large Hero Input" style={{ ...hs, ...fs, ...inputStyle, border: 'none', background: 'transparent' }} {...p} /></div>, c: '<Input size="lg" placeholder="Large Hero Input" />' },
  ];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>{items.map((r) => <MC key={r.l} label={r.l} code={r.c} cp={cp} preset={preset} backdrop={backdrop}>{r.e}</MC>)}</div>;
}

function BadgeMatrix({ g, cp, preset, backdrop }: { g: number; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  const items = [
    { l: 'Preset Cyan', e: <span style={preset.badgeStyle('#38bdf8')} className="px-2 py-0.5 inline-block">#38BDF8</span>, c: '<Badge variant="cyan">#38BDF8</Badge>' },
    { l: 'Preset Violet', e: <span style={preset.badgeStyle('#9333ea')} className="px-2 py-0.5 inline-block">#9333EA</span>, c: '<Badge variant="purple">#9333EA</Badge>' },
    { l: 'Preset Emerald', e: <span style={preset.badgeStyle('#10b981')} className="px-2 py-0.5 inline-block">PASS 200 OK</span>, c: '<Badge variant="emerald">PASS</Badge>' },
    { l: 'Preset Amber', e: <span style={preset.badgeStyle('#f59e0b')} className="px-2 py-0.5 inline-block">MEDIUM RISK</span>, c: '<Badge variant="amber">MEDIUM</Badge>' },
    { l: 'Preset Crimson', e: <span style={preset.badgeStyle('#f85149')} className="px-2 py-0.5 inline-block">CRITICAL 500</span>, c: '<Badge variant="destructive">CRITICAL</Badge>' },
    { l: 'Outline Neutral', e: <Badge variant="outline" style={{ borderRadius: preset.badgeStyle().borderRadius }}>Neutral Tag</Badge>, c: '<Badge variant="outline">Neutral Tag</Badge>' },
  ];
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>{items.map((r) => <MC key={r.l} label={r.l} code={r.c} cp={cp} preset={preset} backdrop={backdrop}>{r.e}</MC>)}</div>;
}

function SelMatrix({ g, hs, fs, sps, cp, preset, backdrop }: {
  g: number; hs: React.CSSProperties; fs: React.CSSProperties;
  sps: (b: Record<string, unknown>) => Record<string, unknown>; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop;
}) {
  const p = sps({});
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>
      <MC label="Checkbox Unchecked" code={'<Checkbox />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div className="flex items-center gap-2">
          <Checkbox id="c1" {...p} />
          <label htmlFor="c1" className="text-xs cursor-pointer">Passive Scan</label>
        </div>
      </MC>
      <MC label="Checkbox Checked" code={'<Checkbox defaultChecked />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div className="flex items-center gap-2">
          <Checkbox id="c2" defaultChecked {...p} />
          <label htmlFor="c2" className="text-xs cursor-pointer text-cyan-400 font-semibold">Active Fuzz</label>
        </div>
      </MC>
    </div>
  );
}

function TglMatrix({ g, sps, cp, preset, backdrop }: { g: number; sps: (b: Record<string, unknown>) => Record<string, unknown>; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  const p = sps({});
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>
      <MC label="Switch OFF" code={'<Switch />'} cp={cp} preset={preset} backdrop={backdrop}><Switch {...p} /></MC>
      <MC label="Switch ON" code={'<Switch defaultChecked />'} cp={cp} preset={preset} backdrop={backdrop}><Switch defaultChecked {...p} /></MC>
    </div>
  );
}

function SldMatrix({ g, cp, preset, backdrop }: { g: number; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g, alignItems: 'flex-end' }}>
      <MC label="Single Value Slider" code={'<Slider defaultValue={[60]} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Slider defaultValue={[60]} /></div>
      </MC>
      <MC label="Range Slider" code={'<Slider defaultValue={[20, 80]} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Slider defaultValue={[20, 80]} /></div>
      </MC>
    </div>
  );
}

function PrgMatrix({ g, cp, preset, backdrop }: { g: number; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g, alignItems: 'flex-end' }}>
      <MC label="0% (Empty)" code={'<Progress value={0} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Progress value={0} /></div>
      </MC>
      <MC label="33% In Progress" code={'<Progress value={33} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Progress value={33} /></div>
      </MC>
      <MC label="66%" code={'<Progress value={66} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Progress value={66} /></div>
      </MC>
      <MC label="100% (Complete)" code={'<Progress value={100} />'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ width: 160 }}><Progress value={100} /></div>
      </MC>
    </div>
  );
}

function TggMatrix({ g, cp, preset, backdrop }: { g: number; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g, alignItems: 'flex-start' }}>
      <MC label="Single-value toggle" code={'<ToggleGroup type="single" defaultValue="bold">...</ToggleGroup>'} cp={cp} preset={preset} backdrop={backdrop}>
        <ToggleGroup type="single" defaultValue="bold">
          <ToggleGroupItem value="bold" aria-label="Bold"><Bold className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic"><Italic className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline"><Underline className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="code" aria-label="Code"><Code className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
      </MC>
      <MC label="Multiple-value toggle" code={'<ToggleGroup type="multiple" defaultValue={["left"]}>...</ToggleGroup>'} cp={cp} preset={preset} backdrop={backdrop}>
        <ToggleGroup type="multiple" defaultValue={['left']}>
          <ToggleGroupItem value="left" aria-label="Left"><AlignLeft className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center"><AlignCenter className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Right"><AlignRight className="size-3.5" /></ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List"><ListIcon className="size-3.5" /></ToggleGroupItem>
        </ToggleGroup>
      </MC>
    </div>
  );
}

function RdgMatrix({ g, sps, cp, preset, backdrop }: {
  g: number;
  sps: (b: Record<string, unknown>) => Record<string, unknown>;
  cp: (c: string) => void;
  preset: GlobalDesignPreset;
  backdrop: CanvasBackdrop;
}) {
  const p = sps({});
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>
      <MC label="Attack mode selection" code={'<RadioGroup defaultValue="sniper">...</RadioGroup>'} cp={cp} preset={preset} backdrop={backdrop}>
        <RadioGroup defaultValue="sniper" disabled={!!p.disabled}>
          <div className="flex items-center gap-2"><RadioGroupItem value="sniper" id="ra1" /><label htmlFor="ra1" className="text-xs cursor-pointer">Sniper</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="battering" id="ra2" /><label htmlFor="ra2" className="text-xs cursor-pointer">Battering Ram</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="pitchfork" id="ra3" /><label htmlFor="ra3" className="text-xs cursor-pointer">Pitchfork</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="cluster" id="ra4" /><label htmlFor="ra4" className="text-xs cursor-pointer">Cluster Bomb</label></div>
        </RadioGroup>
      </MC>
      <MC label="Severity filter" code={'<RadioGroup defaultValue="all">...</RadioGroup>'} cp={cp} preset={preset} backdrop={backdrop}>
        <RadioGroup defaultValue="all" disabled={!!p.disabled}>
          <div className="flex items-center gap-2"><RadioGroupItem value="all" id="rs1" /><label htmlFor="rs1" className="text-xs cursor-pointer">All Findings</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="critical" id="rs2" /><label htmlFor="rs2" className="text-xs cursor-pointer text-red-400 font-semibold">Critical Only</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="active" id="rs3" /><label htmlFor="rs3" className="text-xs cursor-pointer">Active Only</label></div>
        </RadioGroup>
      </MC>
    </div>
  );
}

function CrdMatrix({ g, hs, cp, preset, backdrop }: { g: number; hs: React.CSSProperties; cp: (c: string) => void; preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: g }}>
      <MC label="Preset Card Surface" code={'<Card style={preset.cardStyle}>Active Preset</Card>'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ ...preset.cardStyle, padding: '10px 14px', width: 160 }}>
          <span className="text-xs font-semibold" style={{ color: preset.primaryButtonStyle().color === '#080c16' ? '#38bdf8' : '#f8fafc' }}>
            {preset.name}
          </span>
        </div>
      </MC>
      <MC label="Default Surface" code={'<Card>DSL Payload</Card>'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ ...backdrop.stageCardStyle, padding: '8px 12px', width: 160, borderRadius: 6 }}>
          <span className="text-xs text-muted-foreground">DSL Payload</span>
        </div>
      </MC>
      <MC label="Hover Glow" code={'<Card className="border-cyan-500">Live Stand</Card>'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ ...backdrop.stageCardStyle, borderColor: '#38bdf8', padding: '8px 12px', width: 160, borderRadius: 6 }}>
          <span className="text-xs text-cyan-400 font-semibold">Running :8767</span>
        </div>
      </MC>
      <MC label="Cyber Border" code={'<Card className="border-indigo-500/40">SecOps</Card>'} cp={cp} preset={preset} backdrop={backdrop}>
        <div style={{ background: backdrop.isLight ? '#ffffff' : '#080c16', border: '1px solid rgba(92, 136, 245, 0.4)', borderRadius: 6, padding: '8px 12px', width: 160 }}>
          <span className="text-xs text-foreground font-semibold">SecOps Lab</span>
        </div>
      </MC>
    </div>
  );
}
