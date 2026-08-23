import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Copy,
  Search,
  Sparkles,
  Grid3X3,
  List,
  X,
  Code,
  Sliders,
  Check,
  Zap,
} from 'lucide-react';
import {
  ICON_CATALOG,
  ICON_CATEGORIES,
  ICON_VISUAL_STYLES,
  type IconCategory,
  type IconVisualStyleId,
  type IconItem,
} from '../data/iconPacks';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

const ACCENT_COLORS = [
  { id: 'cyan', label: 'Cyan', hex: '#38bdf8', bgRgba: 'rgba(56, 189, 248, 0.15)', glow: 'rgba(56, 189, 248, 0.45)' },
  { id: 'violet', label: 'Violet', hex: '#a855f7', bgRgba: 'rgba(168, 85, 247, 0.15)', glow: 'rgba(168, 85, 247, 0.45)' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981', bgRgba: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.45)' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b', bgRgba: 'rgba(245, 158, 11, 0.15)', glow: 'rgba(245, 158, 11, 0.45)' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e', bgRgba: 'rgba(244, 63, 94, 0.15)', glow: 'rgba(244, 63, 94, 0.45)' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9', bgRgba: 'rgba(14, 165, 233, 0.15)', glow: 'rgba(14, 165, 233, 0.45)' },
  { id: 'gold', label: 'Gold', hex: '#fbbf24', bgRgba: 'rgba(251, 191, 36, 0.15)', glow: 'rgba(251, 191, 36, 0.45)' },
  { id: 'mono', label: 'Mono', hex: '#f8fafc', bgRgba: 'rgba(248, 250, 252, 0.12)', glow: 'rgba(248, 250, 252, 0.3)' },
];

export interface IconGalleryProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function IconGallery({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: IconGalleryProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IconCategory>('all');
  const [selectedStyle, setSelectedStyle] = useState<IconVisualStyleId>('outline');
  const [iconSize, setIconSize] = useState<number>(24);
  const [strokeWidth, setStrokeWidth] = useState<number>(1.5);
  const [accentColorId, setAccentColorId] = useState<string>('cyan');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [inspectedIcon, setInspectedIcon] = useState<IconItem | null>(null);

  const activeAccent = ACCENT_COLORS.find((c) => c.id === accentColorId) ?? ACCENT_COLORS[0]!;

  const filteredIcons = useMemo(() => {
    return ICON_CATALOG.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        item.name.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [search, selectedCategory]);

  const copyImport = (name: string) => {
    const code = `import { ${name} } from 'lucide-react';`;
    navigator.clipboard
      .writeText(code)
      .then(() => toast.success(`Import for ${name} copied`))
      .catch(() => {});
  };

  const copyJSX = (name: string, styleId: IconVisualStyleId = selectedStyle) => {
    let snippet = `<${name} className="size-5" />`;
    if (styleId === 'neon') {
      snippet = `<${name} className="size-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" />`;
    } else if (styleId === 'duotone') {
      snippet = `<div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/25 inline-flex items-center justify-center"><${name} className="size-5 text-cyan-400" /></div>`;
    } else if (styleId === 'glass') {
      snippet = `<div className="p-2 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 shadow-lg inline-flex items-center justify-center"><${name} className="size-5 text-slate-100" /></div>`;
    } else if (styleId === 'neubrutal') {
      snippet = `<div className="p-2 rounded-md bg-amber-400 border-2 border-black shadow-[3px_3px_0_#000] inline-flex items-center justify-center"><${name} className="size-5 text-black" strokeWidth={2.5} /></div>`;
    } else if (styleId === 'terminal') {
      snippet = `<div className="px-2 py-1 rounded bg-black border border-emerald-500/40 font-mono text-emerald-400 text-xs inline-flex items-center gap-1.5"><${name} className="size-4" /><span>[${name.toUpperCase()}]</span></div>`;
    } else if (styleId === 'gold') {
      snippet = `<div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 shadow-[0_0_12px_rgba(251,191,36,0.3)] inline-flex items-center justify-center"><${name} className="size-5 text-amber-300" /></div>`;
    } else if (styleId === 'gradient') {
      snippet = `<div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-purple-500/30 inline-flex items-center justify-center"><${name} className="size-5 text-pink-400" /></div>`;
    }

    navigator.clipboard
      .writeText(snippet)
      .then(() => toast.success(`Styled JSX for ${name} (${styleId}) copied`))
      .catch(() => {});
  };

  // Renderer helper for different visual styles
  const renderStyledIcon = (
    Icon: IconItem['Icon'],
    name: string,
    styleId: IconVisualStyleId = selectedStyle,
    size: number = iconSize,
    stroke: number = strokeWidth,
  ) => {
    const color = activeAccent.hex;
    const bg = activeAccent.bgRgba;
    const glow = activeAccent.glow;

    switch (styleId) {
      case 'outline':
        return (
          <div className="flex items-center justify-center p-2">
            <Icon
              style={{ width: size, height: size, color }}
              strokeWidth={stroke}
            />
          </div>
        );

      case 'duotone':
        return (
          <div
            style={{
              background: bg,
              border: `1px solid ${color}35`,
              borderRadius: '12px',
              padding: Math.max(6, Math.floor(size * 0.3)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 2px 8px ${color}15`,
            }}
          >
            <Icon
              style={{ width: size, height: size, color }}
              strokeWidth={stroke}
            />
          </div>
        );

      case 'neon':
        return (
          <div className="flex items-center justify-center p-2">
            <Icon
              style={{
                width: size,
                height: size,
                color,
                filter: `drop-shadow(0 0 6px ${glow}) drop-shadow(0 0 14px ${color}60)`,
              }}
              strokeWidth={stroke + 0.2}
            />
          </div>
        );

      case 'glass':
        return (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: Math.max(6, Math.floor(size * 0.3)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            }}
          >
            <Icon
              style={{ width: size, height: size, color }}
              strokeWidth={stroke}
            />
          </div>
        );

      case 'neubrutal':
        return (
          <div
            style={{
              background: color,
              border: '2.5px solid #000',
              borderRadius: '6px',
              padding: Math.max(5, Math.floor(size * 0.25)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '3px 3px 0px #000',
            }}
          >
            <Icon
              style={{ width: size, height: size, color: '#000000' }}
              strokeWidth={Math.max(2, stroke)}
            />
          </div>
        );

      case 'gradient':
        return (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2), rgba(244, 63, 94, 0.2))',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              borderRadius: '14px',
              padding: Math.max(6, Math.floor(size * 0.3)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(168, 85, 247, 0.2)',
            }}
          >
            <Icon
              style={{
                width: size,
                height: size,
                color: '#f472b6',
                filter: 'drop-shadow(0 0 6px rgba(244, 114, 182, 0.4))',
              }}
              strokeWidth={stroke}
            />
          </div>
        );

      case 'terminal':
        return (
          <div
            style={{
              background: '#050c05',
              border: '1px solid #10b981',
              borderRadius: '4px',
              padding: Math.max(4, Math.floor(size * 0.2)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.3)',
            }}
          >
            <Icon
              style={{
                width: size,
                height: size,
                color: '#34d399',
                filter: 'drop-shadow(0 0 4px #10b981)',
              }}
              strokeWidth={stroke}
            />
          </div>
        );

      case 'gold':
        return (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(217, 119, 6, 0.15))',
              border: '1.5px solid rgba(251, 191, 36, 0.45)',
              borderRadius: '12px',
              padding: Math.max(6, Math.floor(size * 0.3)),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(251, 191, 36, 0.25)',
            }}
          >
            <Icon
              style={{
                width: size,
                height: size,
                color: '#fde047',
                filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.4))',
              }}
              strokeWidth={stroke}
            />
          </div>
        );

      default:
        return <Icon style={{ width: size, height: size, color }} strokeWidth={stroke} />;
    }
  };

  return (
    <div className="p-8 min-h-full flex flex-col gap-6">
      {/* 1. Header Banner */}
      <div
        style={backdrop.stageCardStyle}
        className="p-5 rounded-2xl flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-5 text-cyan-400" />
            <h2 className={`text-lg font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-white'}`}>
              Multi-Style Icon Engine · {ICON_CATALOG.length} Vector Icons
            </h2>
          </div>
          <p className={`text-xs ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            8 dynamic rendering styles (Outline, Duotone, Neon Glow, Glass Pod, Neubrutalism, Gradient, Terminal, Gold). Select style & size to transform all icons live.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="cyan" className="font-mono text-xs">
            {filteredIcons.length} of {ICON_CATALOG.length} Icons
          </Badge>
        </div>
      </div>

      {/* 2. Style & Category Studio Bar */}
      <div style={backdrop.stageCardStyle} className="p-5 rounded-2xl flex flex-col gap-4">
        {/* Row 1: 8 Visual Rendering Styles Switcher */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${backdrop.isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              🎨 Visual Rendering Style (8):
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              Active: <strong className="text-cyan-400">{ICON_VISUAL_STYLES.find((s) => s.id === selectedStyle)?.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
            {ICON_VISUAL_STYLES.map((st) => {
              const isSelected = selectedStyle === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStyle(st.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-500/50 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                      : 'bg-card/40 border-white/5 hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${isSelected ? 'text-cyan-300' : backdrop.isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                      {st.name}
                    </span>
                    {isSelected && <Check className="size-3 text-cyan-400" />}
                  </div>
                  <span className={`text-[9px] leading-tight ${isSelected ? 'text-cyan-400/80' : 'text-muted-foreground'}`}>
                    {st.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Category Filter Tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${backdrop.isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              📂 Domain Categories:
            </span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {ICON_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const count = cat.id === 'all'
                ? ICON_CATALOG.length
                : ICON_CATALOG.filter((i) => i.category === cat.id).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-xs'
                      : 'bg-card/30 text-slate-400 border-white/5 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className={`text-[10px] font-mono px-1 py-0.2 rounded-full ${
                    isSelected ? 'bg-purple-400/30 text-purple-200' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Parameter Sliders, Accent Color & Search */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between flex-wrap gap-4">
          {/* Search Input */}
          <div className="relative min-w-[220px] max-w-[340px] flex-1">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search icons (e.g. shield, lock, cpu, git)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8 bg-card border-border/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Size Preset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Size:</span>
            <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
              {[
                { label: '18px', value: 18 },
                { label: '24px', value: 24 },
                { label: '32px', value: 32 },
                { label: '44px', value: 44 },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setIconSize(s.value)}
                  className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                    iconSize === s.value ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Stroke:</span>
            <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
              {[
                { label: '1px', value: 1.0 },
                { label: '1.5px', value: 1.5 },
                { label: '2px', value: 2.0 },
                { label: '2.5px', value: 2.5 },
              ].map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setStrokeWidth(sw.value)}
                  className={`px-2 py-0.5 text-xs rounded transition-all cursor-pointer border-0 ${
                    strokeWidth === sw.value ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
                  }`}
                >
                  {sw.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Accent Picker */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium mr-1">Accent:</span>
            {ACCENT_COLORS.map((col) => {
              const isSelected = accentColorId === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setAccentColorId(col.id)}
                  title={col.label}
                  className={`size-5 rounded-full cursor-pointer transition-all border ${
                    isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col.hex, borderColor: 'rgba(255,255,255,0.2)' }}
                />
              );
            })}
          </div>

          {/* View Toggle */}
          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`p-1 rounded text-xs transition-all cursor-pointer border-0 ${
                view === 'grid' ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              <Grid3X3 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`p-1 rounded text-xs transition-all cursor-pointer border-0 ${
                view === 'list' ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'
              }`}
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Icon Inspection Drawer (if an icon is clicked) */}
      {inspectedIcon && (
        <div
          style={backdrop.stageCardStyle}
          className="p-6 rounded-2xl border-2 border-cyan-500/40 bg-[#0c1424] flex flex-col gap-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-base font-bold text-white">
                {inspectedIcon.name}
              </span>
              <Badge variant="cyan" className="text-[10px] font-mono">
                {inspectedIcon.category.toUpperCase()}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => copyImport(inspectedIcon.name)}
              >
                <Code className="size-3" /> Copy Import
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                onClick={() => copyJSX(inspectedIcon.name, selectedStyle)}
              >
                <Copy className="size-3" /> Copy Active JSX
              </Button>
              <button
                type="button"
                onClick={() => setInspectedIcon(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* 8-Style Matrix for the Selected Icon */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              All 8 Visual Styles for &lt;{inspectedIcon.name} /&gt;:
            </span>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              {ICON_VISUAL_STYLES.map((st) => (
                <div
                  key={st.id}
                  onClick={() => copyJSX(inspectedIcon.name, st.id)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: selectedStyle === st.id ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                  }}
                  className="p-3 flex flex-col items-center justify-between gap-2 cursor-pointer hover:border-cyan-400/50 transition-all select-none group"
                >
                  <div className="h-14 flex items-center justify-center">
                    {renderStyledIcon(inspectedIcon.Icon, inspectedIcon.name, st.id, 28, strokeWidth)}
                  </div>
                  <div className="w-full text-center">
                    <span className="text-[10px] font-bold block text-slate-200 group-hover:text-cyan-300">
                      {st.name}
                    </span>
                    <span className="text-[8px] text-muted-foreground font-mono block">
                      Click to copy JSX
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Icon Showcase Grid / List */}
      {filteredIcons.length === 0 ? (
        <div style={backdrop.stageCardStyle} className="p-12 rounded-2xl text-center">
          <Search className="size-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-semibold text-slate-300">No icons match "{search}" in {selectedCategory}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setSelectedCategory('all');
            }}
            className="mt-3 text-xs text-cyan-400"
          >
            Reset Filters
          </Button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3.5">
          {filteredIcons.map((item) => {
            const isInspected = inspectedIcon?.name === item.name;

            return (
              <div
                key={item.name}
                style={{
                  ...backdrop.stageCardStyle,
                  borderColor: isInspected ? '#38bdf8' : undefined,
                  boxShadow: isInspected ? '0 0 16px rgba(56,189,248,0.3)' : undefined,
                }}
                className="p-3 rounded-2xl flex flex-col items-center justify-between gap-2 cursor-pointer transition-all hover:scale-105 hover:border-cyan-400/40 select-none group min-h-[110px]"
                onClick={() => setInspectedIcon(item)}
              >
                {/* Icon rendering container */}
                <div className="flex-1 flex items-center justify-center">
                  {renderStyledIcon(item.Icon, item.name)}
                </div>

                {/* Name */}
                <span className="text-[10px] font-mono text-slate-300 text-center w-full truncate group-hover:text-cyan-300">
                  {item.name}
                </span>

                {/* Hover quick copy bar */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyJSX(item.name, selectedStyle);
                    }}
                    title="Copy JSX"
                    className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[9px] font-mono cursor-pointer hover:bg-cyan-500 hover:text-black font-bold"
                  >
                    JSX
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyImport(item.name);
                    }}
                    title="Copy Import"
                    className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-mono cursor-pointer hover:bg-purple-500 hover:text-white"
                  >
                    Imp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filteredIcons.map((item) => {
            const isInspected = inspectedIcon?.name === item.name;

            return (
              <div
                key={item.name}
                style={{
                  ...backdrop.stageCardStyle,
                  borderColor: isInspected ? '#38bdf8' : undefined,
                }}
                className="px-4 py-2.5 rounded-xl flex items-center justify-between gap-4 cursor-pointer hover:border-cyan-400/40 transition-all select-none"
                onClick={() => setInspectedIcon(item)}
              >
                <div className="flex items-center gap-4 min-w-[200px]">
                  <div className="size-10 flex items-center justify-center">
                    {renderStyledIcon(item.Icon, item.name, selectedStyle, 22, strokeWidth)}
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-200 block">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Category: {item.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.keywords.slice(0, 4).map((k) => (
                    <Badge key={k} variant="outline" className="text-[9px] font-mono text-slate-400">
                      {k}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyImport(item.name);
                    }}
                  >
                    Import
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyJSX(item.name, selectedStyle);
                    }}
                  >
                    Copy JSX
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
