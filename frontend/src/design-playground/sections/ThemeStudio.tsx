import { useState } from 'react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ComponentStyler } from './ComponentStyler';
import { PaletteExplorer } from './PaletteExplorer';
import { TypographySection } from './Typography';
import { SpacingTokens } from './SpacingTokens';
import { IconGallery } from './IconGallery';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';
import { PaintBucket, Blend, Palette, Type, Ruler, Images } from 'lucide-react';

export interface ThemeStudioProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

type ThemeStudioSubTab =
  | 'themes'
  | 'styles'
  | 'palette'
  | 'typography'
  | 'spacing'
  | 'icons';

export function ThemeStudio({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ThemeStudioProps) {
  const [subTab, setSubTab] = useState<ThemeStudioSubTab>('themes');

  const tabs: { id: ThemeStudioSubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'themes',
      label: 'Color Themes',
      icon: <PaintBucket className="size-3.5 text-cyan-400" />,
      count: 16,
    },
    {
      id: 'styles',
      label: 'Shape & Motion',
      icon: <Blend className="size-3.5 text-amber-400" />,
      count: 12,
    },
    {
      id: 'palette',
      label: 'Brandbook & Gradients',
      icon: <Palette className="size-3.5 text-purple-400" />,
    },
    {
      id: 'typography',
      label: 'Typography',
      icon: <Type className="size-3.5 text-cyan-400" />,
    },
    {
      id: 'spacing',
      label: 'Spacing & Depth',
      icon: <Ruler className="size-3.5 text-rose-400" />,
    },
    {
      id: 'icons',
      label: 'Icon Gallery',
      icon: <Images className="size-3.5 text-violet-400" />,
      count: 180,
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Sub-navigation bar */}
      <div className="px-8 py-3 border-b border-white/10 bg-[#0c1220]/70 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1.5 p-1 rounded-xl bg-card/60 border border-border/40 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`py-1.5 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer border-0 inline-flex items-center gap-1.5 whitespace-nowrap ${
                subTab === t.id
                  ? 'bg-gradient-to-r from-sky-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/40 shadow-xs'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.count != null && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-white/5">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab view */}
      <div className="flex-1">
        {subTab === 'themes' && <ThemeSwitcher preset={preset} backdrop={backdrop} />}
        {subTab === 'styles' && <ComponentStyler preset={preset} backdrop={backdrop} />}
        {subTab === 'palette' && <PaletteExplorer preset={preset} backdrop={backdrop} />}
        {subTab === 'typography' && <TypographySection preset={preset} backdrop={backdrop} />}
        {subTab === 'spacing' && <SpacingTokens preset={preset} backdrop={backdrop} />}
        {subTab === 'icons' && <IconGallery preset={preset} backdrop={backdrop} />}
      </div>
    </div>
  );
}
