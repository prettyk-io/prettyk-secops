import { useState } from 'react';
import { ComponentGallery } from './ComponentGallery';
import { InputVault } from './InputVault';
import { ControlsVault } from './ControlsVault';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';
import { LayoutGrid, Keyboard, Sliders } from 'lucide-react';

export interface ComponentCatalogProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

type CatalogSubTab = 'matrix' | 'inputs' | 'controls';

export function ComponentCatalog({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ComponentCatalogProps) {
  const [subTab, setSubTab] = useState<CatalogSubTab>('matrix');

  const tabs: { id: CatalogSubTab; label: string; icon: React.ReactNode; count?: string }[] = [
    {
      id: 'matrix',
      label: 'Core Matrix',
      icon: <LayoutGrid className="size-3.5 text-purple-400" />,
      count: '15 Primitives',
    },
    {
      id: 'inputs',
      label: 'Input Particles',
      icon: <Keyboard className="size-3.5 text-cyan-400" />,
      count: '12 Variants',
    },
    {
      id: 'controls',
      label: 'Buttons & Switches',
      icon: <Sliders className="size-3.5 text-emerald-400" />,
      count: '8 Controls',
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
              {t.count && (
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
        {subTab === 'matrix' && <ComponentGallery preset={preset} backdrop={backdrop} />}
        {subTab === 'inputs' && <InputVault preset={preset} backdrop={backdrop} />}
        {subTab === 'controls' && <ControlsVault preset={preset} backdrop={backdrop} />}
      </div>
    </div>
  );
}
