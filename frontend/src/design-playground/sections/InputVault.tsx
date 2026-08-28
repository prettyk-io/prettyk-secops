import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Copy,
  Search,
  Eye,
  EyeOff,
  Globe,
  Lock,
  X,
  Plus,
  Minus,
  ExternalLink,
  Code,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { INPUT_PRESETS, type InputStylePreset } from './InputVaultData';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface InputVaultProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

interface InputParticleSpecimen {
  id: string;
  name: string;
  category: string;
  source: 'Origin UI' | '21st.dev' | 'shadcn/ui' | 'Aceternity' | 'PrettyK Current';
  sourceUrl: string;
  description: string;
}

const INPUT_PARTICLES: InputParticleSpecimen[] = [
  { id: 'clean', name: '1. Basic Clean Input', category: 'Primitive', source: 'shadcn/ui', sourceUrl: 'https://ui.shadcn.com/docs/components/input', description: 'Clean neutral input with subtle border, accessible focus-ring, and placeholder text.' },
  { id: 'leading-icon', name: '2. Leading Icon Search Input', category: 'Icons', source: 'Origin UI', sourceUrl: 'https://originui.com/input', description: 'Input with prominent leading search / security key icon.' },
  { id: 'trailing-clear', name: '3. Trailing Clear & Action Input', category: 'Actions', source: 'Origin UI', sourceUrl: 'https://originui.com/input', description: 'Interactive trailing clear button (✕) and status indicator.' },
  { id: 'protocol-addon', name: '4. Protocol Addon & Prefix Input', category: 'Addons', source: 'shadcn/ui', sourceUrl: 'https://ui.shadcn.com/docs/components/input', description: 'Locked protocol prefix (https://, wss://, git://) with seamless joined border.' },
  { id: 'inline-button', name: '5. Embedded Action Button Input', category: 'Actions', source: '21st.dev', sourceUrl: 'https://21st.dev/s/input', description: 'Primary action trigger (Inject / Send) nested directly inside the right input edge.' },
  { id: 'shortcut-badge', name: '6. Shortcut Badge Input (⌘K)', category: 'Badges', source: 'Origin UI', sourceUrl: 'https://originui.com/input', description: 'Keyboard shortcut pill badge (⌘K, Enter ↵) for quick desktop power users.' },
  { id: 'char-counter', name: '7. Character Counter Input', category: 'Feedback', source: 'Origin UI', sourceUrl: 'https://originui.com/input', description: 'Live character counter badge with capacity warning threshold indicator.' },
  { id: 'validation-error', name: '8. Validation Error & Helper State', category: 'Validation', source: 'shadcn/ui', sourceUrl: 'https://ui.shadcn.com/docs/components/input', description: 'Clear error stroke highlight with explanatory message and error alert badge.' },
  { id: 'number-stepper', name: '9. Number Stepper & Counter', category: 'Controls', source: '21st.dev', sourceUrl: 'https://21st.dev/s/number-input', description: 'Stepping controls (+ / -) for adjusting thread concurrency and rate limits.' },
  { id: 'otp-grid', name: '10. 6-Digit OTP / 2FA Token Grid', category: 'Security', source: 'Origin UI', sourceUrl: 'https://originui.com/otp-field', description: 'Segmented individual PIN boxes with automatic cursor advance and full paste support.' },
  { id: 'tag-chips', name: '11. Tag & Filter Chips Input', category: 'Tags', source: '21st.dev', sourceUrl: 'https://21st.dev/s/tag-input', description: 'Interactive multi-tag token field with removable chip items on Enter / Comma.' },
  { id: 'code-mono', name: '12. Monospace Payload & DSL Input', category: 'SecOps', source: 'PrettyK Current', sourceUrl: 'https://prettyk.io', description: 'JetBrains Mono styled field for SQLi probes, regex patterns, and DSL syntax lines.' },
];

export function InputVault({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: InputVaultProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(preset.id);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [activeFocus, setActiveFocus] = useState<string | null>(null);

  // Sync with global preset changes
  useEffect(() => {
    setSelectedPresetId(preset.id);
  }, [preset.id]);

  // Field values
  const [sampleText, setSampleText] = useState('https://juice-shop.prettyk.io/api/v1/auth');
  const [urlVal, setUrlVal] = useState('juice-shop.prettyk.io/api/v1/auth');
  const [searchVal, setSearchVal] = useState('');
  const [clearVal, setClearVal] = useState('SELECT * FROM users WHERE admin=1');
  const [pwdVal, setPwdVal] = useState('SecretKey_2026!');
  const [showPwd, setShowPwd] = useState(false);
  const [counterVal, setCounterVal] = useState('Automated XSS fuzzer payload');
  const [stepperVal, setStepperVal] = useState(16);
  const [tags, setTags] = useState(['SQLi', 'XSS-DOM', 'SSRF']);
  const [tagInput, setTagInput] = useState('');
  const [otpDigits, setOtpDigits] = useState(['5', '8', '2', '', '', '']);

  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const currentPreset = INPUT_PRESETS.find((p) => p.id === selectedPresetId) ?? INPUT_PRESETS[0]!;

  const filteredParticles = filterSource === 'all'
    ? INPUT_PARTICLES
    : INPUT_PARTICLES.filter((p) => p.source === filterSource);

  const copyCode = (item: InputParticleSpecimen) => {
    const code = `// ${item.name} (${item.source})\n// Source: ${item.sourceUrl}\n<div style={${JSON.stringify(preset.inputContainerStyle(true), null, 2)}}>\n  <input style={${JSON.stringify(preset.inputElementStyle, null, 2)}} />\n</div>`;
    navigator.clipboard.writeText(code).then(() => toast.success(`TSX snippet for "${item.name}" copied`)).catch(() => {});
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) {
      const chars = val.slice(0, 6).split('');
      const next = [...otpDigits];
      chars.forEach((c, i) => { next[i] = c; });
      setOtpDigits(next);
      otpRefs[Math.min(chars.length, 5)]?.current?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = val;
    setOtpDigits(next);
    if (val && index < 5) {
      otpRefs[index + 1]?.current?.focus();
    }
  };

  const getContainerStyle = (focused: boolean, hasError = false) => {
    const base = preset.inputContainerStyle(focused, hasError);
    if (backdrop.isLight) {
      return {
        ...base,
        background: '#ffffff',
        border: `1.5px solid ${hasError ? '#f85149' : focused ? '#0284c7' : '#94a3b8'}`,
        boxShadow: focused ? '0 0 0 3px rgba(14, 165, 233, 0.15)' : 'none',
      };
    }
    return base;
  };

  const getInputElementStyle = () => {
    if (backdrop.isLight) {
      return {
        ...preset.inputElementStyle,
        color: '#0f172a',
      };
    }
    return preset.inputElementStyle;
  };

  const getLabelStyle = () => {
    if (backdrop.isLight) {
      return {
        ...preset.labelStyle,
        color: '#334155',
      };
    }
    return preset.labelStyle;
  };

  return (
    <div className="p-8 min-h-full">
      {/* 1. Header Specimen Toolbar */}
      <div
        style={backdrop.stageCardStyle}
        className="p-5 rounded-xl mb-6 flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-base font-bold text-foreground m-0">
            ⌨️ Input Particles & Anatomical Patterns (12 Varieties)
          </h2>
          <p className="text-xs text-muted-foreground mt-1 mb-0">
            Spacious isolated specimens with live state toggles, clear provenance links to open-source marketplaces, and 1-click TSX copying.
          </p>
        </div>

        {/* Filter by Marketplace Source */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Filter Marketplace:</span>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-background/50 border-border/60">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Sources (12)</SelectItem>
              <SelectItem value="Origin UI" className="text-xs">Origin UI</SelectItem>
              <SelectItem value="21st.dev" className="text-xs">21st.dev</SelectItem>
              <SelectItem value="shadcn/ui" className="text-xs">shadcn/ui</SelectItem>
              <SelectItem value="PrettyK Current" className="text-xs">PrettyK Current</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2. Spacious Specimen Stages Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-5">
        {/* Specimen 1: Basic Clean Input */}
        {filteredParticles.some((p) => p.id === 'clean') && (
          <SpecimenCard
            item={INPUT_PARTICLES[0]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[0]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Username / Account ID
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p1'), padding: '8px 12px' }}>
              <input
                defaultValue="admin-sec@spaceport.cbr.ru"
                onFocus={() => setActiveFocus('p1')}
                onBlur={() => setActiveFocus(null)}
                placeholder="Enter username..."
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 2: Leading Icon Search Input */}
        {filteredParticles.some((p) => p.id === 'leading-icon') && (
          <SpecimenCard
            item={INPUT_PARTICLES[1]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[1]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Vulnerability Search Query
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p2'), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <Search className="size-4 text-cyan-400 mr-2.5 shrink-0" />
              <input
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onFocus={() => setActiveFocus('p2')}
                onBlur={() => setActiveFocus(null)}
                placeholder="Search CVEs, rule tags, methods..."
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 3: Trailing Clear & Action */}
        {filteredParticles.some((p) => p.id === 'trailing-clear') && (
          <SpecimenCard
            item={INPUT_PARTICLES[2]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[2]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              SQL Probe String (Clearable)
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p3'), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <input
                value={clearVal}
                onChange={(e) => setClearVal(e.target.value)}
                onFocus={() => setActiveFocus('p3')}
                onBlur={() => setActiveFocus(null)}
                placeholder="Enter injection string..."
                style={{ ...getInputElementStyle(), fontFamily: 'JetBrains Mono, monospace', border: 'none', outline: 'none', width: '100%' }}
              />
              {clearVal && (
                <button
                  type="button"
                  onClick={() => setClearVal('')}
                  className="bg-transparent border-0 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 4: Protocol Addon & Prefix */}
        {filteredParticles.some((p) => p.id === 'protocol-addon') && (
          <SpecimenCard
            item={INPUT_PARTICLES[3]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[3]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Target Endpoint URL (Locked Prefix)
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p4'), display: 'flex', alignItems: 'center', padding: 0, overflow: 'hidden' }}>
              <div style={{
                background: backdrop.isLight ? '#cbd5e1' : 'rgba(56, 189, 248, 0.1)',
                borderRight: `1px solid ${backdrop.isLight ? '#94a3b8' : 'rgba(92, 136, 245, 0.25)'}`,
                padding: '8px 12px',
                color: backdrop.isLight ? '#0284c7' : '#38bdf8',
                fontWeight: 700,
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                userSelect: 'none',
              }}>
                https://
              </div>
              <input
                value={urlVal}
                onChange={(e) => setUrlVal(e.target.value)}
                onFocus={() => setActiveFocus('p4')}
                onBlur={() => setActiveFocus(null)}
                style={{ ...getInputElementStyle(), padding: '8px 12px', border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 5: Embedded Action Button */}
        {filteredParticles.some((p) => p.id === 'inline-button') && (
          <SpecimenCard
            item={INPUT_PARTICLES[4]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[4]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Quick Scenario Launcher (Inline Trigger)
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p5'), display: 'flex', alignItems: 'center', padding: '4px 6px 4px 12px' }}>
              <input
                defaultValue="scenario_quick_scan_01"
                onFocus={() => setActiveFocus('p5')}
                onBlur={() => setActiveFocus(null)}
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => toast.success('Payload dispatched to scanner demon')}
                style={{
                  ...preset.primaryButtonStyle(),
                  padding: '6px 14px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>⚡</span> Inject
              </button>
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 6: Shortcut Badge Input (⌘K) */}
        {filteredParticles.some((p) => p.id === 'shortcut-badge') && (
          <SpecimenCard
            item={INPUT_PARTICLES[5]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[5]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Global Command Palette Input
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p6'), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <Search className="size-4 text-cyan-400 mr-2 shrink-0" />
              <input
                placeholder="Type a command or jump to screen..."
                onFocus={() => setActiveFocus('p6')}
                onBlur={() => setActiveFocus(null)}
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', width: '100%' }}
              />
              <span style={preset.badgeStyle('#94a3b8')}>⌘K</span>
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 7: Character Counter Input */}
        {filteredParticles.some((p) => p.id === 'char-counter') && (
          <SpecimenCard
            item={INPUT_PARTICLES[6]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[6]!)}
          >
            <div className="flex justify-between mb-1.5">
              <label style={getLabelStyle()}>Payload Description Label</label>
              <span style={{ color: counterVal.length > 50 ? '#f85149' : '#38bdf8', fontSize: 10, fontWeight: 600 }}>
                {counterVal.length} / 60 chars
              </span>
            </div>
            <div style={{ ...getContainerStyle(activeFocus === 'p7'), padding: '8px 12px' }}>
              <input
                maxLength={60}
                value={counterVal}
                onChange={(e) => setCounterVal(e.target.value)}
                onFocus={() => setActiveFocus('p7')}
                onBlur={() => setActiveFocus(null)}
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 8: Validation Error & Helper State */}
        {filteredParticles.some((p) => p.id === 'validation-error') && (
          <SpecimenCard
            item={INPUT_PARTICLES[7]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[7]!)}
          >
            <div className="flex justify-between mb-1.5">
              <label style={{ ...getLabelStyle(), color: '#f85149' }}>Invalid Target IP Range</label>
              <span className="text-[10px] font-bold text-red-400 uppercase">SYNTAX ERROR</span>
            </div>
            <div style={{ ...getContainerStyle(activeFocus === 'p8', true), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <AlertCircle className="size-4 text-red-500 mr-2 shrink-0" />
              <input
                defaultValue="999.255.300.1/40"
                onFocus={() => setActiveFocus('p8')}
                onBlur={() => setActiveFocus(null)}
                style={{ ...getInputElementStyle(), color: '#f85149', border: 'none', outline: 'none', width: '100%' }}
              />
            </div>
            <span className="text-[11px] text-red-400 mt-1 block">
              Octet value 999 exceeds standard IPv4 range (0–255)
            </span>
          </SpecimenCard>
        )}

        {/* Specimen 9: Number Stepper & Counter */}
        {filteredParticles.some((p) => p.id === 'number-stepper') && (
          <SpecimenCard
            item={INPUT_PARTICLES[8]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[8]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Execution Worker Threads
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p9'), display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStepperVal(Math.max(1, stepperVal - 1))}
                className="h-7 w-7 p-0 text-muted-foreground"
              >
                <Minus className="size-3.5" />
              </Button>
              <span style={{ ...getInputElementStyle(), fontWeight: 700, fontSize: 14 }}>
                {stepperVal} parallel workers
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStepperVal(Math.min(64, stepperVal + 1))}
                className="h-7 w-7 p-0 text-cyan-400"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 10: 6-Digit OTP / 2FA Token Grid */}
        {filteredParticles.some((p) => p.id === 'otp-grid') && (
          <SpecimenCard
            item={INPUT_PARTICLES[9]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[9]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              2FA Authentication Token
            </label>
            <div className="flex gap-2">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={otpRefs[i]}
                  type="text"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && i > 0) {
                      otpRefs[i - 1]?.current?.focus();
                    }
                  }}
                  style={{
                    width: 44,
                    height: 48,
                    textAlign: 'center',
                    fontSize: 20,
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", monospace',
                    background: backdrop.isLight ? '#ffffff' : '#080c16',
                    color: '#38bdf8',
                    border: `1.5px solid ${digit ? '#38bdf8' : backdrop.isLight ? '#94a3b8' : 'rgba(92, 136, 245, 0.3)'}`,
                    borderRadius: 6,
                    outline: 'none',
                    boxShadow: digit ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none',
                  }}
                />
              ))}
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 11: Tag & Filter Chips Input */}
        {filteredParticles.some((p) => p.id === 'tag-chips') && (
          <SpecimenCard
            item={INPUT_PARTICLES[10]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[10]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Vulnerability Tags & Labels
            </label>
            <div style={{
              ...getContainerStyle(activeFocus === 'p11'),
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              padding: '6px 10px',
              minHeight: 44,
            }}>
              {tags.map((t, idx) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="bg-background/80 border-cyan-500/40 text-cyan-400 gap-1 pl-2 pr-1 py-0.5 text-xs font-mono"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    className="hover:text-destructive cursor-pointer ml-1"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    setTags([...tags, tagInput.trim()]);
                    setTagInput('');
                  }
                }}
                onFocus={() => setActiveFocus('p11')}
                onBlur={() => setActiveFocus(null)}
                placeholder={tags.length === 0 ? 'Type tag and press Enter...' : '+ add'}
                style={{ ...getInputElementStyle(), border: 'none', outline: 'none', flex: 1, minWidth: 60 }}
              />
            </div>
          </SpecimenCard>
        )}

        {/* Specimen 12: Monospace Code / Payload Area */}
        {filteredParticles.some((p) => p.id === 'code-mono') && (
          <SpecimenCard
            item={INPUT_PARTICLES[11]!}
            backdrop={backdrop}
            preset={preset}
            onCopy={() => copyCode(INPUT_PARTICLES[11]!)}
          >
            <label style={{ ...getLabelStyle(), display: 'block', marginBottom: 6 }}>
              Monospace DSL Payload Expression
            </label>
            <div style={{ ...getContainerStyle(activeFocus === 'p12'), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <Code className="size-4 text-emerald-400 mr-2 shrink-0" />
              <input
                defaultValue="fuzzer.inject(payloads.sqli_blind)"
                onFocus={() => setActiveFocus('p12')}
                onBlur={() => setActiveFocus(null)}
                style={{
                  ...getInputElementStyle(),
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#2ee6a8',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>
          </SpecimenCard>
        )}
      </div>
    </div>
  );
}

/** Specimen Card Wrapper with Isolated Stage Padding & Marketplace Direct Link */
function SpecimenCard({
  item,
  backdrop,
  preset,
  onCopy,
  children,
}: {
  item: InputParticleSpecimen;
  backdrop: CanvasBackdrop;
  preset: GlobalDesignPreset;
  onCopy: () => void;
  children: React.ReactNode;
}) {
  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'Origin UI': return '#a855f7';
      case '21st.dev': return '#06b6d4';
      case 'shadcn/ui': return '#38bdf8';
      case 'PrettyK Current': return '#2ee6a8';
      default: return '#94a3b8';
    }
  };

  return (
    <div
      style={backdrop.stageCardStyle}
      className="p-6 rounded-2xl flex flex-col justify-between transition-all duration-150"
    >
      {/* Top Meta Bar */}
      <div>
        <div className="flex justify-between items-start mb-2">
          <span className={`text-sm font-semibold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            {item.name}
          </span>

          {/* Prominent Marketplace Link Pill */}
          <div className="flex items-center gap-1.5">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold no-underline transition-opacity hover:opacity-80"
              style={{
                background: `${getSourceBadgeColor(item.source)}18`,
                border: `1px solid ${getSourceBadgeColor(item.source)}50`,
                color: getSourceBadgeColor(item.source),
              }}
            >
              <ExternalLink className="size-2.5" />
              {item.source}
            </a>

            <Button
              size="sm"
              variant="ghost"
              onClick={onCopy}
              className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300"
              title="Copy TSX Snippet"
            >
              <Copy className="size-3" />
            </Button>
          </div>
        </div>

        <p className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'} mb-4 line-clamp-2`}>
          {item.description}
        </p>
      </div>

      {/* Centered Specimen Stage with Generous Breathing Room */}
      <div className="mt-auto pt-2">
        {children}
      </div>
    </div>
  );
}
