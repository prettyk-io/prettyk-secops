/**
 * BrowserPanel — StudioV2 right-tab: authoring browser panel.
 *
 * F-5: живая адресная строка, ← → навигация, лоадер.
 * F-6: Record — end-to-end proposal → DSL → ScenarioDeckStore.
 * F-7: ▶ Play — execute recorded steps in browser.
 * PW-A3 (27 Aug 2026): живой noVNC-стрим вместо скриншот-поллинга;
 * клик по стриму = нативный клик (observe через expose_binding), не координаты.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe, RotateCcw, Loader2, ExternalLink,
  Circle, Play, Square, ArrowLeft, ArrowRight, Link2, Unlink,
} from "lucide-react";
import { useCdpRecorder } from "../terminal/useCdpRecorder";
import { DSLProposalBanner } from "../terminal/DiscoveryOverlay";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { stepToDSL } from "./scenarioStepModel";

interface BS { ok: boolean; connected: boolean; url?: string | null; title?: string | null; streamUrl?: string | null; }

export function BrowserPanel() {
  const [status, setStatus] = useState<BS>({ ok: true, connected: false });
  const [navUrl, setNavUrl] = useState("http://juice-shop:3000");
  const [loading, setLoading] = useState(false);

  // ── F-7: Play state ──
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState(0);
  const playAbortRef = useRef<AbortController | null>(null);

  const poll = useCallback(async () => {
    try { const r = await fetch("/api/browser/status"); setStatus(await r.json() as BS); } catch { setStatus({ ok: true, connected: false }); }
  }, []);

  useEffect(() => { poll(); const i = setInterval(poll, 3000); return () => clearInterval(i); }, [poll]);

  // F-5: sync navUrl from CDP
  useEffect(() => { if (status.url) setNavUrl(status.url); }, [status.url]);

  const nav = useCallback(async () => { if (!navUrl) return; setLoading(true);
    try { await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: navUrl }) }); await poll(); } finally { setLoading(false); }
  }, [navUrl, poll]);

  // F-5: back / forward
  const doBack = useCallback(async () => {
    setLoading(true);
    try { await fetch("/api/browser/back", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); await poll(); setLoading(false); }
    catch { setLoading(false); }
  }, [poll]);
  const doForward = useCallback(async () => {
    setLoading(true);
    try { await fetch("/api/browser/forward", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); await poll(); setLoading(false); }
    catch { setLoading(false); }
  }, [poll]);
  const doReload = useCallback(async () => {
    setLoading(true);
    try { await fetch("/api/browser/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expression: "window.location.reload()" }) }); await poll(); setLoading(false); }
    catch { setLoading(false); }
  }, [poll]);

  const c = status.connected;
  const streamUrl = status.streamUrl ?? null;

  // ── Record mode (F-6): CDP observe → proposal → DSL-шаг ──
  const decks = useScenarioDeckStore(s => s.decks);
  const insertStep = useScenarioDeckStore(s => s.insertStep);
  const deckId = decks[0]?.id ?? "browser-stage";
  const existingDslLines = (decks[0]?.steps ?? []).map(s => stepToDSL(s));

  const recorder = useCdpRecorder({
    deckId,
    existingDslLines,
    onStepAccepted: ({ step }) => {
      const current = useScenarioDeckStore.getState().decks;
      const target = current[0];
      if (!target) return;
      // F-13: insertStep кладёт готовый шаг целиком (no addStep+updateStep workaround)
      insertStep(target.id, { ...step, led: "predicted" as const });
    },
  });

  // ── F-7: Play recorded steps ──
  const doPlay = useCallback(async () => {
    const steps = useScenarioDeckStore.getState().decks[0]?.steps ?? [];
    if (steps.length === 0) return;
    const abort = new AbortController();
    playAbortRef.current = abort;
    setPlaying(true);
    setPlayStep(0);
    for (let i = 0; i < steps.length; i++) {
      if (abort.signal.aborted) break;
      setPlayStep(i + 1);
      const s = steps[i]!;
      try {
        if (s.action === "Click") {
          await fetch("/api/browser/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, strategy: s.strategy }) });
        } else if (s.action === "Type") {
          await fetch("/api/browser/type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, text: s.payload, strategy: s.strategy }) });
        } else if (s.action === "Open") {
          await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.payload }) });
        } else if (s.action === "Wait") {
          await new Promise(r => setTimeout(r, Number(s.payload) || 1000));
        }
      } catch { /* step failed — continue */ }
      if (i < steps.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setPlaying(false);
    setPlayStep(0);
    playAbortRef.current = null;
  }, []);

  const stopPlay = useCallback(() => {
    playAbortRef.current?.abort();
    setPlaying(false);
    setPlayStep(0);
    playAbortRef.current = null;
  }, []);

  const steps = decks[0]?.steps ?? [];

  return <div className="flex flex-col h-full" style={{ background: "#0f172a", color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>
    {/* Status bar */}
    <div className="flex items-center gap-2 px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
      {c ? <><div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} /><Link2 className="size-3" style={{ color: "#22c55e" }} /><span className="text-xs font-medium" style={{ color: "#22c55e" }}>Authoring</span></> : <><div className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /><Unlink className="size-3" style={{ color: "#ef4444" }} /><span className="text-xs" style={{ color: "#ef4444" }}>Нет браузера</span></>}
      <div className="flex-1" />{loading && <Loader2 className="size-3 animate-spin" style={{ color: "#38bdf8" }} />}
      {playing && <span className="text-[10px] text-cyan-400 font-mono">Step {playStep}/{steps.length}</span>}
      <span className="text-[10px] truncate max-w-[180px]" style={{ color: "#64748b" }}>{status.title || navUrl}</span>
    </div>

    {/* Navigation bar: ← → address Go ▶ ▷ ⬤ */}
    <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: "1px solid #1e293b" }}>
      {/* F-5: ← → */}
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={doBack} disabled={loading || !c || playing}><ArrowLeft className="size-3" /></Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={doForward} disabled={loading || !c || playing}><ArrowRight className="size-3" /></Button>

      <Input value={navUrl} onChange={(e:any) => setNavUrl(e.target.value)} onKeyDown={(e:any) => e.key === "Enter" && nav()} disabled={playing}
        className="h-7 text-xs flex-1 min-w-0" style={{ background: "#09090b", borderColor: "#1e293b", color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }} />

      {/* Go / Launch */}
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={nav} disabled={loading || !c || playing}><ExternalLink className="size-3" /></Button>
      <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1" style={{ borderColor: "#0ea5e9", color: "#38bdf8", fontFamily: "Golos UI, sans-serif" }} onClick={nav} disabled={loading || !c || playing} title="Запустить браузер">
        {loading ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Запустить
      </Button>

      {/* F-7: Play / Stop */}
      {playing ? (
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1" style={{ borderColor: "#f59e0b", color: "#f59e0b", fontFamily: "Golos UI, sans-serif" }} onClick={stopPlay} title="Остановить воспроизведение">
          <Square className="size-3" /> Stop
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1" style={{ borderColor: "#22c55e", color: "#22c55e", fontFamily: "Golos UI, sans-serif" }} onClick={doPlay} disabled={!c || loading || steps.length === 0} title="Проиграть записанные шаги">
          <Play className="size-3" /> Play
        </Button>
      )}

      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={doReload} disabled={loading || !c || playing}><RotateCcw className="size-3"/></Button>

      {/* F-6: Record toggle */}
      <Button
        variant={recorder.state.recording ? "default" : "outline"}
        size="sm"
        className="h-7 shrink-0 gap-1"
        style={recorder.state.recording ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff", fontFamily: "Golos UI, sans-serif" } : { borderColor: "#dc2626", color: "#f87171", fontFamily: "Golos UI, sans-serif" }}
        onClick={() => recorder.state.recording ? recorder.stopRecording() : recorder.startRecording()}
        disabled={!c || playing}
        title={recorder.state.recording ? "Остановить запись" : "Начать запись (клик в браузере = шаг)"}
      >
        {recorder.state.recording ? <Square className="size-3" /> : <Circle className="size-3" />}
        {recorder.state.recording ? "Стоп" : "Запись"}
      </Button>
    </div>

    {/* F-6: Proposal banner */}
    {recorder.state.proposal && (
      <div className="px-2 py-1.5 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
        <DSLProposalBanner proposal={recorder.state.proposal} onAccept={() => { recorder.acceptProposal(); }} onReject={() => { recorder.rejectProposal(); }} />
      </div>
    )}
    {recorder.state.ambiguous && (
      <div className="px-3 py-1.5 shrink-0 text-[10px]" style={{ borderBottom: "1px solid #1e293b", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>Неоднозначный локатор — выберите элемент точнее</div>
    )}

    {/* Viewport: живой noVNC-стрим (PW-A3) */}
    <div className="flex-1 overflow-hidden min-h-0 relative" style={{ background: "#09090b" }}>
      {streamUrl ? (
        <iframe
          src={streamUrl}
          title="Live authoring browser"
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "#475569" }}>
          <Globe className="size-8 opacity-30" />
          <span className="text-xs">{c ? "Запуск живого стрима…" : "Authoring browser не подключён"}</span>
        </div>
      )}
    </div>
  </div>;
}
