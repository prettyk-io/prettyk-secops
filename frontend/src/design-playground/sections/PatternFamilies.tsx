import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Globe,
  Copy,
  Key,
  Eye,
  EyeOff,
  Rocket,
  Search,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  ShieldAlert,
  scanner,
} from 'lucide-react';
import { PATTERN_FAMILIES } from '../data/patterns';
import { type GlobalDesignPreset, GLOBAL_STYLE_PRESETS } from '../data/styleSystem';
import { type CanvasBackdrop, CANVAS_BACKDROPS } from '../data/canvasBackdrops';

export interface PatternFamiliesProps {
  preset?: GlobalDesignPreset;
  backdrop?: CanvasBackdrop;
}

export function PatternFamilies({
  preset = GLOBAL_STYLE_PRESETS[0]!,
  backdrop = CANVAS_BACKDROPS[0]!,
}: PatternFamiliesProps) {
  const [activeTab, setActiveTab] = useState<'forms' | 'patterns' | 'links'>('forms');

  return (
    <div className="p-8 min-h-full">
      {/* Sub-tab Navigation */}
      <div
        style={backdrop.stageCardStyle}
        className="p-3.5 rounded-xl mb-6 flex items-center justify-between flex-wrap gap-3"
      >
        <div style={preset.segmentedStyle.container}>
          {[
            { id: 'forms', label: '⚡ SecOps Combat Forms (Live Suites)', icon: <scanner className="size-3.5 mr-1 text-cyan-400" /> },
            { id: 'patterns', label: '🧩 UI Pattern Families', icon: <ShieldAlert className="size-3.5 mr-1 text-purple-400" /> },
            { id: 'links', label: '🔗 Marketplace Catalog', icon: <ExternalLink className="size-3.5 mr-1 text-emerald-400" /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              style={{
                padding: '6px 14px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 12,
                transition: 'all 0.15s ease',
                ...(activeTab === t.id ? preset.segmentedStyle.activeItem : preset.segmentedStyle.inactiveItem),
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>Active Design Preset:</span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {preset.name}
          </Badge>
        </div>
      </div>

      {activeTab === 'forms' && <SecOpsFormsSuite preset={preset} backdrop={backdrop} />}
      {activeTab === 'patterns' && <InteractivePatternFamilies preset={preset} backdrop={backdrop} />}
      {activeTab === 'links' && <MarketplaceLinks preset={preset} backdrop={backdrop} />}
    </div>
  );
}

/** 1. Full Interactive SecOps Form Suites with Dynamic Skinning */
function SecOpsFormsSuite({ preset, backdrop }: { preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  const [targetUrl, setTargetUrl] = useState('https://juice-shop.prettyk.io/api');
  const [method, setMethod] = useState('POST');
  const [token, setToken] = useState('pk_live_secops_9921_f48a9c02');
  const [showToken, setShowToken] = useState(false);
  const [env, setEnv] = useState<'lab' | 'stage' | 'prod'>('lab');
  const [attackMode, setAttackMode] = useState<'sniper' | 'battering' | 'pitchfork' | 'cluster'>('sniper');
  const [concurrency, setConcurrency] = useState(8);
  const [stealthMode, setStealthMode] = useState(true);
  const [rateLimit, setRateLimit] = useState(120);
  const [selectedVectors, setSelectedVectors] = useState<string[]>(['sqli', 'xss', 'idor']);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);

  const [focusTarget, setFocusTarget] = useState(false);
  const [focusToken, setFocusToken] = useState(false);

  const copyText = (val: string, label: string) => {
    navigator.clipboard.writeText(val).then(() => toast.success(`${label} copied to clipboard`)).catch(() => {});
  };

  const handleSimulateLaunch = () => {
    setIsLaunching(true);
    setLaunchProgress(15);
    setTimeout(() => setLaunchProgress(45), 350);
    setTimeout(() => setLaunchProgress(85), 700);
    setTimeout(() => {
      setLaunchProgress(100);
      setIsLaunching(false);
      toast.success('SecOps Attack Pipeline successfully launched on stand :8767');
    }, 1100);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Form Suite 1: Target & Scope Configurator */}
      <div style={{ ...backdrop.stageCardStyle, padding: '24px 28px', borderRadius: 14 }}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-cyan-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              1. Target & Scope Configurator
            </span>
            <span style={preset.badgeStyle('#38bdf8')}>SUITE</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copyText(JSON.stringify({ targetUrl, method, env, attackMode, concurrency }, null, 2), 'Config JSON')}
            className="text-cyan-400 hover:text-cyan-300 text-xs h-7"
          >
            <Copy className="size-3 mr-1" />
            Copy JSON
          </Button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {/* Target URL with method select */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Target Endpoint & HTTP Method
            </label>
            <div style={{ ...preset.inputContainerStyle(focusTarget), display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-[90px] h-8 text-xs border-0 bg-transparent shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET" className="text-emerald-400 font-bold text-xs">GET</SelectItem>
                  <SelectItem value="POST" className="text-cyan-400 font-bold text-xs">POST</SelectItem>
                  <SelectItem value="PUT" className="text-amber-400 font-bold text-xs">PUT</SelectItem>
                  <SelectItem value="DELETE" className="text-rose-400 font-bold text-xs">DELETE</SelectItem>
                </SelectContent>
              </Select>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                onFocus={() => setFocusTarget(true)}
                onBlur={() => setFocusTarget(false)}
                placeholder="https://target.prettyk.io/api"
                style={{
                  ...preset.inputElementStyle,
                  fontFamily: 'JetBrains Mono, monospace',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  padding: '6px 4px',
                }}
              />
            </div>
          </div>

          {/* Environment Selector */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Execution Environment
            </label>
            <div style={preset.segmentedStyle.container}>
              {[
                { id: 'lab', label: '🧪 Lab Stand', color: '#38bdf8' },
                { id: 'stage', label: '🛡️ Staging VPC', color: '#7c4dff' },
                { id: 'prod', label: '⚠️ Prod Airgap', color: '#f85149' },
              ].map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setEnv(ev.id as typeof env)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: 'none',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    ...(env === ev.id ? preset.segmentedStyle.activeItem : preset.segmentedStyle.inactiveItem),
                  }}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </div>

          {/* Authorization Bearer Token */}
          <div>
            <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 6 }}>
              Authorization Bearer Token
            </label>
            <div style={{ ...preset.inputContainerStyle(focusToken), display: 'flex', alignItems: 'center', padding: '6px 12px' }}>
              <Key className="size-4 text-cyan-400 mr-2 shrink-0" />
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onFocus={() => setFocusToken(true)}
                onBlur={() => setFocusToken(false)}
                placeholder="Enter API token..."
                style={{
                  ...preset.inputElementStyle,
                  fontFamily: 'JetBrains Mono, monospace',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                }}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="bg-transparent border-0 text-muted-foreground hover:text-foreground cursor-pointer p-1"
                >
                  {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyText(token, 'Bearer Token')}
                  className="bg-transparent border-0 text-cyan-400 hover:text-cyan-300 cursor-pointer p-1"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Suite 2: Attack Mode Matrix & Vectors */}
      <div style={{ ...backdrop.stageCardStyle, padding: '24px 28px', borderRadius: 14 }}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-purple-400" />
            <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              2. Attack Matrix & Vulnerability Vectors
            </span>
            <span style={preset.badgeStyle('#9333ea')}>RADIO & CHECKBOX CARDS</span>
          </div>
        </div>

        {/* Radio Cards for Attack Modes */}
        <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 8 }}>
          Marker Positioning Mode (§...§ Burp Intruder-Killer)
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-5">
          {[
            { id: 'sniper', title: 'Sniper', desc: '1 position, sequential single payload injection', icon: '🎯' },
            { id: 'battering', title: 'Battering Ram', desc: 'All markers injected simultaneously with 1 payload', icon: '⚡' },
            { id: 'pitchfork', title: 'Pitchfork', desc: 'Multiple payload sets processed in lockstep', icon: '🔱' },
            { id: 'cluster', title: 'Cluster Bomb', desc: 'Full cartesian product permutation matrix', icon: '💣' },
          ].map((mode) => {
            const active = attackMode === mode.id;
            return (
              <div
                key={mode.id}
                onClick={() => setAttackMode(mode.id as typeof attackMode)}
                style={{
                  padding: '12px 14px',
                  borderRadius: backdrop.isLight ? 8 : 8,
                  border: active
                    ? `1.5px solid #38bdf8`
                    : backdrop.isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: active
                    ? 'rgba(56, 189, 248, 0.12)'
                    : backdrop.isLight ? '#ffffff' : 'rgba(8, 12, 22, 0.6)',
                  boxShadow: active ? '0 0 14px rgba(56, 189, 248, 0.25)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${active ? 'text-cyan-400' : backdrop.isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                    {mode.icon} {mode.title}
                  </span>
                  {active && <span style={preset.badgeStyle('#38bdf8')}>ACTIVE</span>}
                </div>
                <span className={`text-[11px] ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>{mode.desc}</span>
              </div>
            );
          })}
        </div>

        {/* Checkbox Cards for OWASP Vectors */}
        <label style={{ ...preset.labelStyle, display: 'block', marginBottom: 8 }}>
          Active Security Check Vectors (OWASP Top-10)
        </label>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 mb-5">
          {[
            { id: 'sqli', name: 'SQL Injection', badge: 'CRITICAL', color: '#f85149', desc: 'Boolean / Time-based blind' },
            { id: 'xss', name: 'Cross-Site Scripting', badge: 'HIGH', color: '#ff4d6d', desc: 'Reflected / DOM bypass' },
            { id: 'ssrf', name: 'SSRF & Cloud Meta', badge: 'HIGH', color: '#ff4d6d', desc: '169.254.169.254 AWS probe' },
            { id: 'idor', name: 'IDOR & BOLA', badge: 'MEDIUM', color: '#d8a13a', desc: 'Object authorization breach' },
            { id: 'cors', name: 'CORS Wildcard', badge: 'LOW', color: '#38bdf8', desc: 'Origin reflection exploit' },
          ].map((vec) => {
            const selected = selectedVectors.includes(vec.id);
            const toggle = () => {
              setSelectedVectors(selected ? selectedVectors.filter((x) => x !== vec.id) : [...selectedVectors, vec.id]);
            };
            return (
              <div
                key={vec.id}
                onClick={toggle}
                style={{
                  padding: '10px 12px',
                  borderRadius: backdrop.isLight ? 8 : 8,
                  border: `1.5px solid ${selected ? vec.color : backdrop.isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.1)'}`,
                  background: selected
                    ? `${vec.color}15`
                    : backdrop.isLight ? '#ffffff' : 'rgba(8, 12, 22, 0.6)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={toggle}
                  style={{ accentColor: vec.color, marginTop: 2, cursor: 'pointer' }}
                />
                <div className="flex-1">
                  <span className={`text-xs font-semibold block ${selected ? (backdrop.isLight ? 'text-slate-900' : 'text-slate-100') : 'text-slate-400'}`}>
                    {vec.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{vec.desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sliders & Execution Tuning */}
        <div
          style={{
            background: backdrop.isLight ? '#cbd5e1' : '#080c16',
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
          }}
          className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5"
        >
          <div>
            <div className="flex justify-between mb-1.5">
              <label style={preset.labelStyle}>Concurrency Threads</label>
              <span className="text-xs font-mono font-bold text-cyan-400">{concurrency} workers</span>
            </div>
            <Slider
              min={1}
              max={32}
              value={[concurrency]}
              onValueChange={(v) => setConcurrency(v[0] ?? 8)}
            />
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <label style={preset.labelStyle}>Rate Limiting</label>
              <span className="text-xs font-mono font-bold text-emerald-400">{rateLimit} req/s</span>
            </div>
            <Slider
              min={10}
              max={500}
              step={10}
              value={[rateLimit]}
              onValueChange={(v) => setRateLimit(v[0] ?? 120)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-xs font-semibold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-200'}`}>Stealth Jitter Mode</span>
              <span className="text-[10px] text-muted-foreground">Randomize delay ±15%</span>
            </div>
            <Switch checked={stealthMode} onCheckedChange={setStealthMode} />
          </div>
        </div>

        {/* Launch Trigger & Live Progress */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSimulateLaunch}
            style={{
              ...preset.primaryButtonStyle(isLaunching),
              padding: '10px 24px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <scanner className="size-4" />
            {isLaunching ? 'Executing Attack Pipeline...' : 'Launch SecOps Pipeline'}
          </button>

          {launchProgress > 0 && (
            <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full transition-all duration-300"
                style={{ width: `${launchProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 2. Interactive Pattern Families (Hero search, Dropzones, Sliders) */
function InteractivePatternFamilies({ preset, backdrop }: { preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPill, setSelectedPill] = useState('all');
  const [files, setFiles] = useState<{ name: string; size: string; status: string }[]>([
    { name: 'payloads_sqli_blind.txt', size: '42.8 KB', status: 'ready' },
    { name: 'jwt_secret_wordlist.dic', size: '128.4 KB', status: 'ready' },
  ]);
  const [colorHue, setColorHue] = useState(195);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
      {/* Pattern 1: Hero Search & Command Palette */}
      <div style={{ ...backdrop.stageCardStyle, padding: '20px 24px', borderRadius: 14 }}>
        <span className={`text-sm font-bold block mb-2 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          Hero Search & Command Bar (⌘K)
        </span>
        <div style={{ ...preset.inputContainerStyle(Boolean(searchQuery)), display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
          <Search className="size-4 text-cyan-400 mr-2 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scenarios, vulnerability rules, DSL keywords..."
            style={{
              ...preset.inputElementStyle,
              border: 'none',
              outline: 'none',
              width: '100%',
            }}
          />
          <span style={preset.badgeStyle('#94a3b8')}>⌘K</span>
        </div>
        {searchQuery && (
          <div className="mt-2 p-2 rounded bg-card/60 border border-border/40 text-xs text-muted-foreground">
            Matches for <span className="font-mono text-cyan-400">{searchQuery}</span>: 3 scenario definitions found
          </div>
        )}
      </div>

      {/* Pattern 2: Cyber Segmented Pills */}
      <div style={{ ...backdrop.stageCardStyle, padding: '20px 24px', borderRadius: 14 }}>
        <span className={`text-sm font-bold block mb-2 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          Segmented Category Filter
        </span>
        <div style={preset.segmentedStyle.container}>
          {[
            { id: 'all', label: 'All Scenarios' },
            { id: 'active', label: '⚡ Active' },
            { id: 'fuzzing', label: '🎯 Fuzzing' },
            { id: 'done', label: '✓ Done' },
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

      {/* Pattern 3: Payload Dropzone */}
      <div style={{ ...backdrop.stageCardStyle, padding: '20px 24px', borderRadius: 14 }}>
        <span className={`text-sm font-bold block mb-2 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          Payload Wordlist Dropzone
        </span>
        <div
          onClick={() => {
            const name = `custom_payload_${Date.now().toString().slice(-4)}.txt`;
            setFiles([...files, { name, size: '24.1 KB', status: 'ready' }]);
            toast.success(`File ${name} attached`);
          }}
          className="border-2 border-dashed border-cyan-500/40 rounded-xl p-5 text-center bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-colors mb-3"
        >
          <UploadCloud className="size-7 text-cyan-400 mx-auto mb-1.5" />
          <span className={`text-xs font-semibold block ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Drag & Drop .txt / .dic wordlists here
          </span>
          <span className="text-[10px] text-muted-foreground">or click to simulate payload upload</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <div
              key={f.name}
              className="flex items-center justify-between p-2 rounded bg-card/60 border border-border/40 text-xs"
            >
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-cyan-400" />
                <span className="font-mono text-foreground">{f.name}</span>
                <span className="text-[10px] text-muted-foreground">({f.size})</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Pattern 4: Dynamic Gradient Generator */}
      <div style={{ ...backdrop.stageCardStyle, padding: '20px 24px', borderRadius: 14 }}>
        <span className={`text-sm font-bold block mb-2 ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          Dynamic Gradient & Spectrum Shift
        </span>
        <div className="mb-3">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-muted-foreground">Hue Shift:</span>
            <span className="text-xs font-mono font-bold text-cyan-400">{colorHue}°</span>
          </div>
          <Slider
            min={0}
            max={360}
            value={[colorHue]}
            onValueChange={(v) => setColorHue(v[0] ?? 195)}
          />
        </div>

        <div
          style={{
            height: 48,
            borderRadius: 8,
            background: `linear-gradient(135deg, hsl(${colorHue}, 95%, 60%) 0%, hsl(${colorHue + 60}, 90%, 45%) 100%)`,
            boxShadow: `0 0 20px hsl(${colorHue}, 90%, 50%, 0.35)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => {
            const css = `linear-gradient(135deg, hsl(${colorHue}, 95%, 60%) 0%, hsl(${colorHue + 60}, 90%, 45%) 100%)`;
            navigator.clipboard.writeText(css).then(() => toast.success('Gradient CSS copied')).catch(() => {});
          }}
        >
          <span className="text-xs font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            Click to Copy CSS Gradient
          </span>
        </div>
      </div>
    </div>
  );
}

/** 3. Marketplace References */
function MarketplaceLinks({ preset, backdrop }: { preset: GlobalDesignPreset; backdrop: CanvasBackdrop }) {
  const SOURCE_COLORS: Record<string, string> = {
    'Origin UI': '#a855f7',
    '21st.dev': '#06b6d4',
    'shadcn/ui': '#38bdf8',
  };

  return (
    <div>
      <p className={`text-xs mb-4 ${backdrop.isLight ? 'text-slate-700' : 'text-slate-400'}`}>
        Open-source component libraries and pattern marketplaces. Click any card to visit source:
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        {PATTERN_FAMILIES.map((p) => (
          <div
            key={p.name}
            onClick={() => window.open(p.url, '_blank')}
            style={{
              ...backdrop.stageCardStyle,
              padding: 16,
              cursor: 'pointer',
              borderRadius: 12,
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <span className={`text-sm font-bold ${backdrop.isLight ? 'text-slate-900' : 'text-slate-100'}`}>{p.name}</span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                style={{
                  background: `${SOURCE_COLORS[p.source] ?? '#8b8b8b'}20`,
                  color: SOURCE_COLORS[p.source] ?? '#8b8b8b',
                }}
              >
                {p.source}
              </span>
            </div>
            <p className={`text-xs mb-3 line-clamp-2 ${backdrop.isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {p.description}
            </p>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {p.tags.map((t) => (
                <span key={t} style={preset.badgeStyle('#64748b')}>
                  {t}
                </span>
              ))}
            </div>
            <span className="text-xs text-cyan-400 inline-flex items-center gap-1 hover:underline">
              <ExternalLink className="size-3" /> {p.url.replace('https://', '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
