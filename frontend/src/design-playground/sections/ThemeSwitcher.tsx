import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Check, Copy, Moon, Sun, Undo2, Grid3X3, List, Sparkles } from 'lucide-react';
import { SHADCN_THEMES, applyShadcnTheme, type ShadcnThemeId } from '../data/shadcnThemes';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

const CURRENT_ID: ShadcnThemeId = 'neon-cyber';

const tagColors: Record<string, string> = {
  current: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  default: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  dark: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  light: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  cyber: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  cool: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  noir: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  terminal: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
  alert: 'bg-red-500/20 text-red-400 border-red-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  industrial: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ocean: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  soft: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  minimal: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  mono: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  graphite: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  night: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  teal: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  matrix: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  solar: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  gold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  premium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  frost: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  clean: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export interface ThemeSwitcherProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function ThemeSwitcher({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ThemeSwitcherProps) {
  const [activeId, setActiveId] = useState<ShadcnThemeId>(CURRENT_ID);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  const filtered = SHADCN_THEMES.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q));
  });

  const apply = useCallback((id: ShadcnThemeId) => {
    const theme = SHADCN_THEMES.find((t) => t.id === id);
    if (!theme) return;
    applyShadcnTheme(theme.cssVars);
    setActiveId(id);
    toast.success(`Theme "${theme.name}" applied`);
  }, []);

  const reset = useCallback(() => {
    const currentTheme = SHADCN_THEMES.find((t) => t.id === CURRENT_ID);
    if (!currentTheme) return;
    applyShadcnTheme(currentTheme.cssVars);
    setActiveId(CURRENT_ID);
    toast('Reset to Cyber Neon (Current)');
  }, []);

  const copyThemeCSS = useCallback((id: ShadcnThemeId) => {
    const theme = SHADCN_THEMES.find((t) => t.id === id);
    if (!theme) return;
    const css = `:root {\n${Object.entries(theme.cssVars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
    navigator.clipboard.writeText(css).then(() => toast.success(`${theme.name} CSS copied`)).catch(() => {});
  }, []);

  const activeTheme = SHADCN_THEMES.find((t) => t.id === activeId);

  return (
    <div className="p-8 min-h-full">
      {/* Header */}
      <div style={backdrop.stageCardStyle} className="p-4 rounded-xl mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className={`text-lg font-bold mb-1 ${backdrop.isLight ? 'text-slate-900' : 'text-white'}`}>
            <Sparkles className="size-4 inline mr-1.5 text-cyan-400" />
            Shadcn Theme Studio ({SHADCN_THEMES.length} Themes)
          </h2>
          <p className="text-xs text-muted-foreground">
            Current active: <span className="text-cyan-400 font-semibold font-mono">{activeTheme ? `${activeTheme.name}${activeTheme.id === CURRENT_ID ? ' (Current)' : ''}` : '—'}</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge className={activeTheme?.tags[0] ? tagColors[activeTheme.tags[0]] ?? 'bg-slate-500/20 text-slate-400' : ''}>
            {activeTheme ? `${activeTheme.name}${activeTheme.id === CURRENT_ID ? ' (Current)' : ''}` : '—'}
          </Badge>
          <Button size="sm" variant="secondary" onClick={reset} className="h-8 text-xs gap-1">
            <Undo2 className="size-3" /> Reset
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Input
            placeholder="Filter themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs bg-card border-border/50"
          />
        </div>
        <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border/40">
          <button type="button" onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 transition-all cursor-pointer border-0 ${viewMode === 'grid' ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'}`}>
            <Grid3X3 className="size-3" /> Grid
          </button>
          <button type="button" onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 rounded-md text-xs flex items-center gap-1 transition-all cursor-pointer border-0 ${viewMode === 'list' ? 'bg-background text-foreground font-bold shadow-xs' : 'bg-transparent text-muted-foreground'}`}>
            <List className="size-3" /> List
          </button>
        </div>
        {search && <span className={`text-xs ${backdrop.isLight ? 'text-slate-500' : 'text-slate-400'}`}>{filtered.length} of {SHADCN_THEMES.length} themes</span>}
      </div>

      {/* Theme Cards */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filtered.map((theme) => {
            const isActive = activeId === theme.id;
            const prim = theme.cssVars['--primary'];
            const bg = theme.cssVars['--background'];
            const fg = theme.cssVars['--foreground'];
            const cardBg = theme.cssVars['--card'];
            const muted = theme.cssVars['--muted'];
            const border = theme.cssVars['--border'];
            const accent = theme.cssVars['--accent'];
            const radius = theme.cssVars['--radius'];

            return (
              <div key={theme.id}
                style={{
                  background: bg,
                  color: fg,
                  border: `1px solid ${isActive ? prim : border}`,
                  borderRadius: radius ?? '0.5rem',
                  boxShadow: isActive ? `0 0 20px ${prim}40` : undefined,
                }}
                className="p-4 cursor-pointer transition-all hover:scale-[1.02]"
                onClick={() => apply(theme.id)}
              >
                {/* Color preview strip */}
                <div className="flex gap-1 mb-3 h-8 rounded-md overflow-hidden">
                  <div style={{ background: prim, flex: 2 }} className="flex items-center justify-center text-[10px] font-bold" title="Primary">
                    <span style={{ color: theme.cssVars['--primary-foreground'] }} className="drop-shadow-sm">Primary</span>
                  </div>
                  <div style={{ background: cardBg, flex: 1.5 }} className="flex items-center justify-center text-[10px] font-bold" title="Card">
                    <span style={{ color: theme.cssVars['--card-foreground'] }}>Card</span>
                  </div>
                  <div style={{ background: muted, flex: 1.5 }} className="flex items-center justify-center text-[10px] font-bold" title="Muted">
                    <span style={{ color: theme.cssVars['--muted-foreground'] }}>Muted</span>
                  </div>
                  <div style={{ background: accent, flex: 1 }} className="flex items-center justify-center text-[10px] font-bold" title="Accent">
                    <span style={{ color: theme.cssVars['--accent-foreground'] }}>A</span>
                  </div>
                </div>

                {/* Sample UI miniatures */}
                <div className="flex gap-1.5 mb-2">
                  <div style={{ background: prim, borderRadius: '4px' }} className="h-5 flex-1 flex items-center justify-center text-[9px] font-bold" title="Button">
                    <span style={{ color: theme.cssVars['--primary-foreground'] }}>Button</span>
                  </div>
                  <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '4px' }} className="h-5 flex-1 flex items-center justify-center text-[9px]" title="Input">
                    <span style={{ color: fg }}>Input</span>
                  </div>
                  <div style={{ background: theme.cssVars['--destructive'], borderRadius: '4px' }} className="h-5 w-10 flex items-center justify-center text-[9px] font-bold" title="Destructive">
                    <span style={{ color: theme.cssVars['--destructive-foreground'] }}>!</span>
                  </div>
                </div>

                {/* Theme info */}
                <div className="flex justify-between items-start mt-3">
                  <div>
                    <span className="text-sm font-bold block">{theme.name}</span>
                    <span className="text-[10px] opacity-60 block mt-0.5">{theme.description}</span>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    {isActive && <Check className="size-3.5" style={{ color: prim }} />}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); copyThemeCSS(theme.id); }}>
                      <Copy className="size-3 opacity-60 hover:opacity-100" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {theme.tags.map((tag) => (
                    <span key={tag} className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded border ${tagColors[tag] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>{tag}</span>
                  ))}
                </div>

                {isActive && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <Sun className="size-3" style={{ color: prim }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: prim }}>Active</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((theme) => {
            const isActive = activeId === theme.id;
            const prim = theme.cssVars['--primary'];
            const bg = theme.cssVars['--background'];
            const border = theme.cssVars['--border'];
            const radius = theme.cssVars['--radius'];
            return (
              <div key={theme.id}
                style={{
                  background: bg,
                  border: `1px solid ${isActive ? prim : border}`,
                  borderRadius: radius ?? '0.5rem',
                }}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all hover:brightness-110"
                onClick={() => apply(theme.id)}
              >
                <div style={{ background: prim }} className="size-6 rounded shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold block" style={{ color: theme.cssVars['--foreground'] }}>{theme.name}</span>
                  <span className="text-[10px] opacity-50 block truncate" style={{ color: theme.cssVars['--muted-foreground'] }}>{theme.description}</span>
                </div>
                <div className="flex gap-1">
                  {theme.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded border ${tagColors[tag] || ''}`}>{tag}</span>
                  ))}
                </div>
                {isActive && <Check className="size-4" style={{ color: prim }} />}
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); copyThemeCSS(theme.id); }}>
                  <Copy className="size-3" style={{ color: theme.cssVars['--muted-foreground'] }} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}