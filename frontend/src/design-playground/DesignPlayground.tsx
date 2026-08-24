import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import {
  Home,
  Sliders,
  ShieldAlert,
  LayoutGrid,
  PaintBucket,
  BookOpen,
  Monitor,
  Type,
} from 'lucide-react';
import { ThemeStudio } from './sections/ThemeStudio';
import { ComponentCatalog } from './sections/ComponentCatalog';
import { PatternFamilies } from './sections/PatternFamilies';
import { TailwindWorkshop } from './sections/TailwindWorkshop';
import { DashboardBlocks, LoginSettings } from './sections/StudioBlocks';
import {
  GLOBAL_STYLE_PRESETS,
  PRESET_TO_STYLE_PACK_MAP,
  type GlobalDesignPresetId,
} from './data/styleSystem';
import {
  COMPONENT_STYLE_PACKS,
  applyComponentStylePack,
} from './data/componentStyles';
import { CANVAS_BACKDROPS, type CanvasBackdropId } from './data/canvasBackdrops';
import {
  DESIGN_FONTS,
  type DesignFontId,
  getStoredFontId,
  setStoredFontId,
  applyFontToDocument,
} from './data/fontSystem';

export type PlaygroundWorkspaceTab = 'patterns' | 'components' | 'themes' | 'studio-blocks' | 'tailwind';

export function DesignPlayground() {
  const [activeTab, setActiveTab] = useState<PlaygroundWorkspaceTab>('patterns');
  const [globalPresetId, setGlobalPresetId] = useState<GlobalDesignPresetId>('meta-dark');
  const [canvasBackdropId, setCanvasBackdropId] = useState<CanvasBackdropId>('meta-dark-canvas');
  const [activeFontId, setActiveFontId] = useState<DesignFontId>(getStoredFontId);

  const preset = GLOBAL_STYLE_PRESETS.find((p) => p.id === globalPresetId) ?? GLOBAL_STYLE_PRESETS[0]!;
  const backdrop = CANVAS_BACKDROPS.find((b) => b.id === canvasBackdropId) ?? CANVAS_BACKDROPS[0]!;
  const activeFont = DESIGN_FONTS.find((f) => f.id === activeFontId) ?? DESIGN_FONTS[0]!;

  // Reactive Batch Style Morph: automatically applies component CSS pack rules to whole page
  useEffect(() => {
    const packId = PRESET_TO_STYLE_PACK_MAP[globalPresetId];
    const pack = COMPONENT_STYLE_PACKS.find((p) => p.id === packId);
    if (pack) {
      applyComponentStylePack(pack);
    }
  }, [globalPresetId]);

  // Reactive Font Sync: applies --pk-font and --font-sans globally
  useEffect(() => {
    document.title = 'prettyK Lab Design Playground';
    applyFontToDocument(activeFontId);
  }, [activeFontId]);

  return (
    <div
      className="dark h-screen w-screen flex flex-col overflow-hidden bg-[#080c16] text-[#f8fafc]"
      style={{ fontFamily: activeFont.fontFamily }}
    >
      <Toaster />

      {/* 1. Global Header Bar */}
      <header className="px-6 py-2.5 border-b border-white/10 flex items-center justify-between bg-[#0b101c]/95 backdrop-blur-md shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.hash = '#/home';
            }}
            className="text-slate-400 hover:text-white hover:bg-white/5 h-8 px-2.5"
          >
            <Home className="size-4 mr-1.5" />
            Home
          </Button>

          {/* Masterbrand Logo Asset */}
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/prettyk-logo-temp.png"
              alt="pretty<"
              className="h-6 w-auto object-contain"
            />
            <span className="font-['Golos_UI',sans-serif] text-[11px] font-bold tracking-[0.14em] text-slate-400">
              DESIGN WORKBENCH
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.hash = '#/design-admin';
            }}
            className="h-8 px-3 text-xs font-semibold bg-indigo-500/15 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25 hover:text-white cursor-pointer ml-1"
          >
            <Monitor className="size-3.5 mr-1.5 text-indigo-400" />
            Admin Showcase (MUI) →
          </Button>
        </div>

        {/* Global Controls in Header */}
        <div className="flex items-center gap-3.5">
          {/* Global UI Font Selector (Golos UI / PT Astra / Inter) */}
          <div className="flex items-center gap-1.5">
            <Type className="size-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs font-medium text-slate-400 shrink-0">Font:</span>
            <Select
              value={activeFontId}
              onValueChange={(v) => {
                const id = v as DesignFontId;
                setActiveFontId(id);
                setStoredFontId(id);
              }}
            >
              <SelectTrigger className="w-[170px] h-8 text-xs bg-[#131b2e] border-white/10 text-slate-200">
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f172a] border-slate-700 text-slate-200 min-w-[210px]">
                {DESIGN_FONTS.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="text-xs cursor-pointer">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="truncate">{f.name}</span>
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 uppercase shrink-0">
                        {f.badge}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canvas Backdrop Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400">Canvas:</span>
            <Select value={canvasBackdropId} onValueChange={(v) => setCanvasBackdropId(v as CanvasBackdropId)}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-[#131b2e] border-white/10 text-slate-200">
                <SelectValue placeholder="Select canvas" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f172a] border-slate-700 text-slate-200">
                {CANVAS_BACKDROPS.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs cursor-pointer">
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Design Style Preset Dropdown */}
          <div className="flex items-center gap-1.5">
            <Sliders className="size-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs font-medium text-slate-400 shrink-0">Preset:</span>
            <Select value={globalPresetId} onValueChange={(v) => setGlobalPresetId(v as GlobalDesignPresetId)}>
              <SelectTrigger className="w-[230px] h-8 text-xs bg-[#131b2e] border-white/10 text-slate-200 truncate">
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f172a] border-slate-700 text-slate-200 min-w-[250px]">
                {GLOBAL_STYLE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase shrink-0">
                        {p.tag}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131b2e] border border-white/10 text-xs font-medium text-slate-200">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <span>{preset.tag}</span>
          </div>
        </div>
      </header>

      {/* 2. Global Batch Style Switcher Bar (Instant UI Morph across all components) */}
      <div className="px-6 py-2 border-b border-white/5 bg-[#080e1a]/95 flex items-center justify-between gap-4 shrink-0 overflow-x-auto z-20">
        <div className="flex items-center gap-2 shrink-0">
          <Sliders className="size-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Batch Style Morph (8):
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {GLOBAL_STYLE_PRESETS.map((p) => {
            const isActive = p.id === globalPresetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setGlobalPresetId(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                    : 'bg-card/40 text-slate-400 border-white/5 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{p.name.split(' (')[0]}</span>
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded uppercase ${
                    isActive ? 'bg-cyan-400/20 text-cyan-300' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {p.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Content: 4 Clear Workspaces */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PlaygroundWorkspaceTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Workspace Selector Bar */}
        <div className="px-6 border-b border-white/10 bg-[#0b101c]/90 backdrop-blur-md shrink-0">
          <TabsList className="bg-transparent h-11 p-0 gap-3 border-b-0">
            <TabsTrigger
              value="patterns"
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-emerald-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer"
            >
              <ShieldAlert className="size-4 text-emerald-400" />
              <span>Forms & Combat Matrix</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                4 Combat Forms · States
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="components"
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-purple-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer"
            >
              <LayoutGrid className="size-4 text-purple-400" />
              <span>Component Catalog</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                15 Primitives · 3D Assets
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="themes"
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-cyan-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer"
            >
              <PaintBucket className="size-4 text-cyan-400" />
              <span>Design Tokens & Foundations</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                Typography · Tokens · Spacing
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="studio-blocks"
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-rose-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer"
            >
              <LayoutGrid className="size-4 text-rose-400" />
              <span>Studio Blocks & Layouts</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                Dashboard · Sidebars · Login
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="tailwind"
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-amber-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer"
            >
              <BookOpen className="size-4 text-amber-400" />
              <span>Tailwind Recipes & Sandbox</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-white/5">
                Reference
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="admin-showcase"
              onClick={() => {
                window.location.hash = '#/design-admin';
              }}
              className="data-[state=active]:bg-[#162035] data-[state=active]:text-indigo-400 text-xs font-semibold gap-2 px-4 py-2 rounded-t-lg text-slate-400 transition-all cursor-pointer border-b-2 border-indigo-500/40"
            >
              <Monitor className="size-4 text-indigo-400" />
              <span>Admin Showcase</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                MUI Gallery →
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Dynamic Artboard Canvas Stage */}
        <div className="flex-1 overflow-auto transition-colors duration-200" style={backdrop.style}>
          <TabsContent value="patterns" className="m-0 outline-none">
            <PatternFamilies preset={preset} backdrop={backdrop} />
          </TabsContent>

          <TabsContent value="components" className="m-0 outline-none">
            <ComponentCatalog preset={preset} backdrop={backdrop} />
          </TabsContent>

          <TabsContent value="themes" className="m-0 outline-none">
            <ThemeStudio preset={preset} backdrop={backdrop} />
          </TabsContent>

          <TabsContent value="studio-blocks" className="m-0 outline-none">
            <div className="space-y-0">
              <DashboardBlocks />
              <LoginSettings />
            </div>
          </TabsContent>

          <TabsContent value="tailwind" className="m-0 outline-none">
            <TailwindWorkshop preset={preset} backdrop={backdrop} />
          </TabsContent>
        </div>
      </Tabs>

      {/* 4. Footer Bar */}
      <footer className="px-6 border-t border-white/10 flex items-center justify-between bg-[#0b101c]/95 backdrop-blur-md shrink-0 h-8 text-[11px] text-slate-400 z-30">
        <div>
          Typography: GT Eesti Pro (Text/Display) · Golos UI/Text · JetBrains Mono · PT Astra Sans (OFL 1.1)
        </div>
        <div className="font-mono text-slate-400">PrettyK SecOps Platform · prettyk.io</div>
      </footer>
    </div>
  );
}
