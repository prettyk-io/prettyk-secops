import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, RotateCcw, Camera, Link2, Unlink, Loader2, ExternalLink, Circle, Play, Square } from "lucide-react";
import { useCdpRecorder } from "../terminal/useCdpRecorder";
import { DSLProposalBanner } from "../terminal/DiscoveryOverlay";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { stepToDSL } from "./scenarioStepModel";

interface BS { ok: boolean; connected: boolean; url?: string | null; title?: string | null; }

export function BrowserPanel() {
  const [status, setStatus] = useState<BS>({ ok: true, connected: false });
  const [navUrl, setNavUrl] = useState("http://juice-shop:3000");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false); // live-превью: авто-поллинг скриншотов

  const poll = useCallback(async () => {
    try { const r = await fetch("/api/browser/status"); setStatus(await r.json() as BS); } catch { setStatus({ ok: true, connected: false }); }
  }, []);

  useEffect(() => { poll(); const i = setInterval(poll, 3000); return () => clearInterval(i); }, [poll]);

  const shot = useCallback(async () => {
    try {
      const r = await fetch("/api/browser/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (d.ok && d.screenshot) setScreenshot(d.screenshot as string);
    } catch { /* CDP down — ignore */ }
  }, []);

  // Live-превью: поллинг скриншотов пока включён (F1/F2)
  useEffect(() => {
    if (!live) return;
    shot();
    const i = setInterval(shot, 1500);
    return () => clearInterval(i);
  }, [live, shot]);

  const nav = useCallback(async () => { if (!navUrl) return; setLoading(true);
    try { await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: navUrl }) }); poll(); setLive(true); } finally { setLoading(false); }
  }, [navUrl, poll]);

  const c = status.connected;

  // ── Record mode (F2): живой CDP observe → proposal → DSL-шаг ──
  const decks = useScenarioDeckStore(s => s.decks);
  const addStep = useScenarioDeckStore(s => s.addStep);
  const updateStep = useScenarioDeckStore(s => s.updateStep);
  const deckId = decks[0]?.id ?? "browser-stage";

  const existingDslLines = (decks[0]?.steps ?? []).map(s => stepToDSL(s));

  const recorder = useCdpRecorder({
    deckId,
    existingDslLines,
    onStepAccepted: ({ step }) => {
      // Добавить канонический шаг в первую колоду (Studio StepPill)
      const current = useScenarioDeckStore.getState().decks;
      const target = current[0];
      if (!target) return;
      addStep(target.id);
      const after = useScenarioDeckStore.getState().decks;
      const deck = after.find(d => d.id === target.id);
      const newStep = deck?.steps[deck.steps.length - 1];
      if (newStep) {
        updateStep(target.id, newStep.id, { ...step, id: newStep.id, led: "predicted" as const });
      }
    },
  });

  return <div className="flex flex-col h-full" style={{ background: "#0f172a", color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>
    {/* Строка статуса CDP */}
    <div className="flex items-center gap-2 px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
      {c ? <><div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} /><Link2 className="size-3" style={{ color: "#22c55e" }} /><span className="text-xs font-medium" style={{ color: "#22c55e" }}>CDP</span></> : <><div className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /><Unlink className="size-3" style={{ color: "#ef4444" }} /><span className="text-xs" style={{ color: "#ef4444" }}>Нет CDP</span></>}
      <div className="flex-1" />{loading && <Loader2 className="size-3 animate-spin" style={{ color: "#38bdf8" }} />}
      <span className="text-[10px] truncate max-w-[180px]" style={{ color: "#64748b" }}>{status.title || navUrl}</span>
    </div>

    {/* Панель навигации + запуск + запись */}
    <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: "1px solid #1e293b" }}>
      <Input value={navUrl} onChange={(e:any) => setNavUrl(e.target.value)} onKeyDown={(e:any) => e.key === "Enter" && nav()} className="h-7 text-xs flex-1 min-w-0" style={{ background: "#09090b", borderColor: "#1e293b", color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }} />
      {/* Явная кнопка запуска браузера (F1) */}
      <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1" style={{ borderColor: "#0ea5e9", color: "#38bdf8", fontFamily: "Golos UI, sans-serif" }} onClick={nav} disabled={loading || !c} title="Запустить браузер по URL">
        <Play className="size-3" /> Запустить
      </Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={nav} disabled={loading || !c}><ExternalLink className="size-3" /></Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={()=>{setLoading(true);fetch("/api/browser/eval",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expression:"window.location.reload()"})}).finally(()=>{setLoading(false);setTimeout(poll,500);})}} disabled={loading||!c}><RotateCcw className="size-3"/></Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={shot} disabled={loading||!c}><Camera className="size-3"/></Button>
      {/* Live toggle */}
      <Button variant={live ? "default" : "outline"} size="icon" className="size-7 shrink-0" onClick={() => setLive(v => !v)} disabled={!c} title={live ? "Live-превью вкл" : "Live-превью выкл"}>
        <span className="w-2 h-2 rounded-full" style={{ background: live ? "#22c55e" : "#475569" }} />
      </Button>
      {/* Record toggle (F2) */}
      <Button
        variant={recorder.state.recording ? "default" : "outline"}
        size="sm"
        className="h-7 shrink-0 gap-1"
        style={recorder.state.recording ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff", fontFamily: "Golos UI, sans-serif" } : { borderColor: "#dc2626", color: "#f87171", fontFamily: "Golos UI, sans-serif" }}
        onClick={() => recorder.state.recording ? recorder.stopRecording() : recorder.startRecording()}
        disabled={!c}
        title={recorder.state.recording ? "Остановить запись" : "Начать запись (клик в браузере = шаг)"}
      >
        {recorder.state.recording ? <Square className="size-3" /> : <Circle className="size-3" />}
        {recorder.state.recording ? "Стоп" : "Запись"}
      </Button>
    </div>

    {/* Proposal-баннер (F2): предложен шаг → Accept/Reject */}
    {recorder.state.proposal && (
      <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
        <DSLProposalBanner
          proposal={recorder.state.proposal}
          onAccept={() => { recorder.acceptProposal(); shot(); }}
          onReject={() => { recorder.rejectProposal(); shot(); }}
        />
      </div>
    )}
    {recorder.state.ambiguous && (
      <div className="px-3 py-1.5 shrink-0 text-[10px]" style={{ borderBottom: "1px solid #1e293b", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>Неоднозначный локатор — выберите элемент точнее</div>
    )}

    {/* Viewport: скриншот растянут по всей высоте (F1) */}
    <div className="flex-1 overflow-auto min-h-0 relative" style={{ background: "#09090b" }}>
      {screenshot ? (
        <img src={screenshot} alt="screenshot" className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "#475569" }}>
          <Globe className="size-8 opacity-30" />
          <span className="text-xs">{c ? "Нажми «Запустить» для загрузки страницы" : "CDP Chrome не подключён (:9222)"}</span>
        </div>
      )}
    </div>
  </div>;
}
