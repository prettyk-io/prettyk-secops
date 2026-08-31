import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Copy,
  ScanLine,
  Rocket,
  Check,
  Settings,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface ControlsVaultProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function ControlsVault({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: ControlsVaultProps) {
  const [btnLoading, setBtnLoading] = useState(false);
  const [switchState, setSwitchState] = useState(true);
  const [selectedPill, setSelectedPill] = useState('sqli');

  const copySnippet = (name: string, code: string) => {
    navigator.clipboard.writeText(code).then(() => toast.success(`TSX snippet for "${name}" copied`)).catch(() => {});
  };

  const buttonSpecimens = [
    {
      id: 'cyber-neon',
      name: '1. Cyber Neon Glow (PrettyK Current)',
      source: 'PrettyK Current',
      sourceUrl: 'https://prettyk.io',
      description: 'Solid electric cyan button with deep dark text, active glow shadow on hover.',
      el: (
        <button
          type="button"
          onClick={() => { setBtnLoading(true); setTimeout(() => setBtnLoading(false), 800); }}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: '#38bdf8',
            color: '#080c16',
            fontWeight: 700,
            fontSize: 13,
            fontFamily: '"Golos UI", sans-serif',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {btnLoading ? <RefreshCw className="size-4 animate-spin" /> : <Rocket className="size-4" />} Launch Security Scan
        </button>
      ),
      code: '<button style={{ background: "#38bdf8", color: "#080c16", boxShadow: "0 0 16px rgba(56,189,248,0.4)" }}>Launch</button>',
    },
    {
      id: 'brand-gradient',
      name: '2. Brand Master Gradient Trigger',
      source: 'PrettyK Current',
      sourceUrl: 'https://prettyk.io',
      description: 'Signature electric cyan → vibrant violet → dark indigo gradient fill with elevation shadow.',
      el: (
        <button
          type="button"
          style={{
            width: '100%',
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #38bdf8 0%, #7a1fa2 50%, #522e90 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(122, 31, 162, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <ScanLine className="size-4" /> Active Fuzz Engine
        </button>
      ),
      code: '<button style={{ background: "linear-gradient(135deg, #38bdf8 0%, #7a1fa2 50%, #522e90 100%)" }}>Active Fuzz</button>',
    },
    {
      id: 'frosted-glass',
      name: '3. Vapor Frosted Glass Button',
      source: '21st.dev',
      sourceUrl: 'https://21st.dev/s/button',
      description: 'Translucent frosted glass button with subtle specular border and backdrop blur.',
      el: (
        <button
          type="button"
          style={{
            width: '100%',
            padding: '12px 20px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(12px)',
            color: '#f8fafc',
            fontWeight: 500,
            fontSize: 13,
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Settings className="size-4" /> Configure Stand Parameters
        </button>
      ),
      code: '<button style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>Configure</button>',
    },
    {
      id: 'neubrutalism',
      name: '4. Sharp Cyber Neubrutalism',
      source: 'Origin UI',
      sourceUrl: 'https://originui.com/button',
      description: 'Solid 2px cyan border, 0px corner radius, and thick 4px hard offset shadow.',
      el: (
        <button
          type="button"
          style={{
            width: '100%',
            padding: '11px 20px',
            background: '#0d111a',
            border: '2px solid #00f0ff',
            color: '#00f0ff',
            fontWeight: 800,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            borderRadius: 0,
            cursor: 'pointer',
            boxShadow: '4px 4px 0px #00f0ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          BURP INTRUDER KILLER
        </button>
      ),
      code: '<button style={{ border: "2px solid #00f0ff", boxShadow: "4px 4px 0px #00f0ff" }}>BURP KILLER</button>',
    },
    {
      id: 'shimmer-border',
      name: '5. Shimmer / Emerald Glow Border',
      source: 'Aceternity',
      sourceUrl: 'https://ui.aceternity.com',
      description: 'Dark translucent fill with radiant emerald glow stroke for verified status actions.',
      el: (
        <button
          type="button"
          style={{
            width: '100%',
            padding: '11px 20px',
            background: 'rgba(46, 230, 168, 0.1)',
            border: '1.5px solid #2ee6a8',
            color: '#2ee6a8',
            fontWeight: 600,
            fontSize: 13,
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(46, 230, 168, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Check className="size-4" /> Verify Baseline Pass
        </button>
      ),
      code: '<button style={{ border: "1.5px solid #2ee6a8", boxShadow: "0 0 16px rgba(46,230,168,0.3)" }}>Verify</button>',
    },
    {
      id: 'retro-terminal',
      name: '6. Retro Terminal Key [Enter ↵]',
      source: 'Origin UI',
      sourceUrl: 'https://originui.com/button',
      description: 'Monospaced command execution key with retro amber phosphor border.',
      el: (
        <button
          type="button"
          style={{
            width: '100%',
            padding: '11px 20px',
            background: '#1a1308',
            border: '1px solid #ffb020',
            color: '#ffb020',
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 700,
            fontSize: 12,
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>[EXECUTE PROBE ↵]</span>
        </button>
      ),
      code: '<button style={{ background: "#1a1308", border: "1px solid #ffb020", color: "#ffb020" }}>[EXECUTE ↵]</button>',
    },
  ];

  return (
    <div className="p-8 min-h-full">
      {/* 1. Header Toolbar */}
      <div
        style={backdrop.stageCardStyle}
        className="p-5 rounded-xl mb-6 flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className={`text-base font-bold m-0 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            🔘 Buttons & Action Triggers Showcase
          </h2>
          <p className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} mt-1 mb-0`}>
            Interactive specimen stages with hover effects, active glow, and provenance links.
          </p>
        </div>
      </div>

      {/* 2. Button Specimen Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-5 mb-7">
        {buttonSpecimens.map((btn) => (
          <div
            key={btn.id}
            style={backdrop.stageCardStyle}
            className="p-6 rounded-2xl flex flex-col justify-between transition-all duration-150"
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className={`text-sm font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {btn.name}
                </span>

                <div className="flex items-center gap-1.5">
                  <a
                    href={btn.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold no-underline bg-cyan-500/15 border border-cyan-500/40 text-cyan-400"
                  >
                    <ExternalLink className="size-2.5" />
                    {btn.source}
                  </a>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copySnippet(btn.name, btn.code)}
                    className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300"
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              </div>

              <p className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} mb-5 line-clamp-2`}>
                {btn.description}
              </p>
            </div>

            <div className="mt-auto">
              {btn.el}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Toggles, Switches & Segmented Controls */}
      <div
        style={backdrop.stageCardStyle}
        className="p-6 rounded-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-emerald-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              Switches, Toggles & Segmented Selectors
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {/* Control 1: Segmented Pill */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Segmented Vector Filter
            </label>
            <div style={preset.segmentedStyle.container}>
              {[
                { id: 'sqli', label: 'SQL Injection' },
                { id: 'xss', label: 'XSS Reflected' },
                { id: 'ssrf', label: 'SSRF Cloud' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedPill(pill.id)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    ...(selectedPill === pill.id ? preset.segmentedStyle.activeItem : preset.segmentedStyle.inactiveItem),
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Control 2: Neon Glowing Switch */}
          <div className="flex items-center justify-between bg-card/60 p-3 rounded-lg border border-border/40">
            <div>
              <span className="text-xs font-semibold text-foreground block">
                scanner Demon Proxy
              </span>
              <span className="text-[10px] text-muted-foreground">Background HTTP interceptor</span>
            </div>
            <div
              onClick={() => setSwitchState(!switchState)}
              style={{
                width: 48,
                height: 26,
                borderRadius: 13,
                background: switchState ? '#38bdf8' : '#1e293b',
                boxShadow: switchState ? '0 0 12px rgba(56, 189, 248, 0.5)' : 'none',
                padding: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: switchState ? 'flex-end' : 'flex-start',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 11, background: '#080c16' }} />
            </div>
          </div>

          {/* Control 3: Cyber Card Checkbox */}
          <div
            onClick={() => setSwitchState(!switchState)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: switchState ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              border: `1.5px solid ${switchState ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
              padding: '12px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: `1.5px solid ${switchState ? '#38bdf8' : '#64748b'}`,
              background: switchState ? '#38bdf8' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#080c16',
              fontSize: 11,
              fontWeight: 800,
            }}>
              {switchState && '✓'}
            </div>
            <div>
              <span className="text-xs font-semibold text-foreground block">
                Stealth Jitter Mode
              </span>
              <span className="text-[10px] text-muted-foreground">Randomize delays between payloads</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
