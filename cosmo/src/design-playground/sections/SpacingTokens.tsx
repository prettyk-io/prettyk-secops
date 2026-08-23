import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

const SPACING_SCALE = [0, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96];
const RADIUS_SCALE = [0, 2, 4, 6, 8, 12, 16, 24, 9999];
const SHADOWS = [
  { label: 'Ambient Micro (0 1px 0)', css: '0 1px 0 rgba(15,23,42,0.03)', desc: 'Micro shadow for flat Editor panels' },
  { label: 'Surface Card (0 2px 8px)', css: '0 2px 8px rgba(0,0,0,0.45)', desc: 'Cards and modal lists' },
  { label: 'Cyber Glow Cyan', css: '0 0 16px rgba(56, 189, 248, 0.3)', desc: 'Active focus outlines and primary Launch buttons' },
  { label: 'Cyber Glow Violet', css: '0 0 16px rgba(147, 51, 234, 0.3)', desc: 'Special accents & Action Hub nodes' },
  { label: 'Deep Drop Shadow', css: '0 8px 24px rgba(0,0,0,0.6)', desc: 'Floating modal overlays and Evidence Drawer' },
];
const Z_INDEXES = [
  { label: 'Tree / Monaco Canvas', value: 10, role: 'Base Editor Surface' },
  { label: 'Sticky Pane Headers', value: 50, role: 'Split View Anchors' },
  { label: 'Dropdown / Select Popup', value: 1050, role: 'Radix UI / Popover Overlay' },
  { label: 'Modal / Command Palette', value: 1000, role: 'Center Screen Dialogs' },
  { label: 'Tooltip / Status Hover', value: 1070, role: 'Topmost Hints' },
  { label: 'Live Video Overlay', value: 1100, role: 'Airgap Stream Layer' },
];

export interface SpacingTokensProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function SpacingTokens({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: SpacingTokensProps) {
  return (
    <div className="p-8 min-h-full">
      {/* 1. Spacing Scale */}
      <div
        style={{
          ...backdrop.stageCardStyle,
          padding: 24,
          borderRadius: 14,
          marginBottom: 20,
        }}
      >
        <span className={`text-sm font-bold block mb-4 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          📐 Spacing Scale Ladder (Margin / Padding / Gaps)
        </span>
        <div className="flex flex-col gap-2">
          {SPACING_SCALE.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <span className="font-mono text-cyan-400 text-xs w-9 text-right font-bold">{s}px</span>
              <div
                style={{
                  width: Math.max(s * 4, 8),
                  height: 18,
                  background: 'linear-gradient(90deg, #38bdf8, #7a1fa2)',
                  opacity: 0.4 + (s / 160),
                  borderRadius: 3,
                }}
              />
              <span className="text-[11px] text-muted-foreground">gap-{s} ({s}px)</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Border Radius & Shadows */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5 mb-5">
        <div style={{ ...backdrop.stageCardStyle, padding: 24, borderRadius: 14 }}>
          <span className={`text-sm font-bold block mb-4 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            ⭕ Border-Radius Curves
          </span>
          <div className="flex flex-wrap gap-3">
            {RADIUS_SCALE.map((r) => (
              <div key={r} className="flex flex-col items-center gap-1.5">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: r === 9999 ? '50%' : r,
                    border: '1.5px solid #38bdf8',
                    background: 'rgba(56, 189, 248, 0.1)',
                    boxShadow: '0 0 8px rgba(56, 189, 248, 0.2)',
                  }}
                />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {r === 9999 ? 'pill' : `${r}px`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...backdrop.stageCardStyle, padding: 24, borderRadius: 14 }}>
          <span className={`text-sm font-bold block mb-4 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            ✨ Elevation & Shadow Depth
          </span>
          <div className="flex flex-col gap-2.5">
            {SHADOWS.map((s) => (
              <div
                key={s.label}
                style={{
                  padding: '10px 14px',
                  boxShadow: s.css,
                  borderRadius: 8,
                  background: backdrop.isLight ? '#ffffff' : '#080c16',
                  border: `1px solid ${backdrop.isLight ? '#cbd5e1' : 'rgba(92, 136, 245, 0.2)'}`,
                }}
              >
                <div className="flex justify-between items-center mb-0.5">
                  <span className={`text-xs font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>{s.label}</span>
                  <span className="text-[10px] font-mono text-cyan-400">{s.css}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Z-Index Layer Stack */}
      <div style={{ ...backdrop.stageCardStyle, padding: 24, borderRadius: 14 }}>
        <span className={`text-sm font-bold block mb-4 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          📚 Z-Index Layer Hierarchy
        </span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {Z_INDEXES.map((z) => (
            <div
              key={z.label}
              style={{
                padding: '10px 14px',
                border: `1px solid ${backdrop.isLight ? '#cbd5e1' : 'rgba(92, 136, 245, 0.2)'}`,
                borderRadius: 8,
                background: backdrop.isLight ? '#ffffff' : '#080c16',
              }}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`text-xs font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-200'}`}>{z.label}</span>
                <span className="text-xs font-mono font-bold text-cyan-400">{z.value}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{z.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
