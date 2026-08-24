import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Image as ImageIcon, Sparkles, Search, Layers } from 'lucide-react';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface IconGalleryProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

interface StudioIconEntry {
  name: string;
  category: '3D Neon Studio' | 'Action Hub' | 'System Controls' | 'Connectors';
  path: string;
  desc: string;
  badge?: string;
}

const STUDIO_ICONS: StudioIconEntry[] = [
  { name: 'Auth Vault 3D', category: '3D Neon Studio', path: '/brand/studio-icons/auth-vault-3d.png', desc: '3D Isometric security vault, credentials & token store', badge: '3D NEON' },
  { name: 'Connector 3D', category: '3D Neon Studio', path: '/brand/studio-icons/connector-3d.png', desc: '3D Isometric infrastructure gateway & integration node', badge: '3D NEON' },
  { name: 'Data Module 3D', category: '3D Neon Studio', path: '/brand/studio-icons/data-module-3d.png', desc: '3D Isometric database entity & dataset storage', badge: '3D NEON' },
  { name: 'Fuzzer Target 3D', category: '3D Neon Studio', path: '/brand/studio-icons/fuzzer-3d.png', desc: '3D Isometric active fuzzer, probe target & attack point', badge: '3D NEON' },
  { name: 'Cyber Cube 3D', category: '3D Neon Studio', path: '/brand/studio-icons/module-cube-neon-3d.png', desc: '3D Isometric hyper-cube for custom logic & plugins', badge: '3D NEON' },
  { name: 'Page Model 3D', category: '3D Neon Studio', path: '/brand/studio-icons/page-model-3d.png', desc: '3D Isometric POM page model, DOM element tree', badge: '3D NEON' },
  { name: 'Scenario Graph 3D', category: '3D Neon Studio', path: '/brand/studio-icons/scenario-3d.png', desc: '3D Isometric test scenario graph & execution flow', badge: '3D NEON' },
  { name: 'Home History', category: 'System Controls', path: '/src/assets/icons/home-history-icon.png', desc: 'Previous execution run logs and history' },
  { name: 'Home New Check', category: 'System Controls', path: '/src/assets/icons/home-new-check-icon.png', desc: 'Create fresh security check / blank' },
  { name: 'Home Import', category: 'System Controls', path: '/src/assets/icons/home-import-icon.png', desc: 'Import wired JSON manifest package' },
  { name: 'Home Settings', category: 'System Controls', path: '/src/assets/icons/home-settings-icon.png', desc: 'Box policies and role settings' },
  { name: 'Home Lab', category: 'System Controls', path: '/src/assets/icons/home-lab-icon.png', desc: 'SecOps Lab attack workstation' },
  { name: 'Pipeline Start', category: 'Action Hub', path: '/src/assets/icons/pipeline-start.png', desc: 'Launch test pipeline trigger' },
  { name: 'Pipeline Success', category: 'Action Hub', path: '/src/assets/icons/pipeline-success.png', desc: 'Pipeline passed with zero findings' },
  { name: 'Pipeline Fail', category: 'Action Hub', path: '/src/assets/icons/pipeline-fail.png', desc: 'Pipeline failed / gate threshold exceeded' },
  { name: 'Pipeline Running', category: 'Action Hub', path: '/src/assets/icons/pipeline-running.png', desc: 'Pipeline executing active probes' },
  { name: 'Resource Folder', category: 'Action Hub', path: '/src/assets/icons/resource-folder.png', desc: 'Project resources and payloads' },
  { name: 'Model Graph', category: 'Action Hub', path: '/src/assets/icons/model-graph.png', desc: 'Visual page element relationship graph' },
];

export function IconGallery({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: IconGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = STUDIO_ICONS.filter((icon) => {
    const matchesCat = selectedCategory === 'all' || icon.category === selectedCategory;
    const matchesSearch = !searchQuery.trim() || icon.name.toLowerCase().includes(searchQuery.toLowerCase()) || icon.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const copyPath = (path: string, name: string) => {
    navigator.clipboard.writeText(path).then(() => toast.success(`Asset path for "${name}" copied`)).catch(() => {});
  };

  return (
    <div className="p-8 min-h-full">
      {/* Header Toolbar */}
      <div
        style={backdrop.stageCardStyle}
        className="p-5 rounded-2xl mb-6 flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-cyan-400" />
            <h2 className={`text-base font-bold m-0 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Curated 3D Cyber Neon & Studio Icon Assets
            </h2>
            <Badge variant="cyan" className="font-mono text-[10px]">3D CYBERPUNK</Badge>
          </div>
          <p className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} m-0`}>
            High-resolution 3D isometric neon renders and 2D action icons for HomePage, Studio entity nodes, and Admin cards. Click to copy asset path.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-background/50 border border-border/60 rounded-lg px-2.5 py-1 w-64">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search icons..."
            className="bg-transparent border-0 text-xs text-foreground outline-none w-full placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'all', label: 'All Curated Assets' },
          { id: '3D Neon Studio', label: '✨ 3D Neon Studio' },
          { id: 'System Controls', label: '⚙️ System Controls' },
          { id: 'Action Hub', label: '🎯 Action Hub' },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              selectedCategory === cat.id
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-xs'
                : 'bg-card/40 text-muted-foreground border-border/40 hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Icon Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        {filtered.map((icon) => (
          <div
            key={icon.name}
            style={backdrop.stageCardStyle}
            className="p-5 rounded-2xl flex flex-col items-center text-center justify-between group hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(56,189,248,0.2)] transition-all"
          >
            <div className="w-full flex justify-between items-start mb-2">
              <span className="text-[10px] font-mono text-muted-foreground">{icon.category}</span>
              {icon.badge && <Badge variant="cyan" className="text-[9px] font-mono px-1.5 py-0">{icon.badge}</Badge>}
            </div>

            {/* Icon Preview Image */}
            <div className="size-20 flex items-center justify-center my-2 p-2 rounded-xl bg-slate-950/40 border border-white/5 group-hover:scale-105 transition-transform">
              <img
                src={icon.path}
                alt={icon.name}
                className="max-h-full max-w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="w-full mt-2">
              <span className={`text-xs font-bold block mb-1 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                {icon.name}
              </span>
              <p className={`text-[11px] ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} mb-3 line-clamp-2`}>
                {icon.desc}
              </p>

              <Button
                size="sm"
                variant="outline"
                onClick={() => copyPath(icon.path, icon.name)}
                className="w-full text-[11px] h-7 border-border/60 hover:bg-cyan-500/10 hover:text-cyan-400 hover:border-cyan-500/40"
              >
                <Copy className="size-3 mr-1" /> Copy Path
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
