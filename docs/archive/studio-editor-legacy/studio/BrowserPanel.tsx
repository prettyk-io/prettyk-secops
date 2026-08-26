import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, RotateCcw, Camera, Link2, Unlink, Loader2, ExternalLink } from "lucide-react";

interface BS { ok: boolean; connected: boolean; url?: string | null; title?: string | null; }

export function BrowserPanel() {
  const [status, setStatus] = useState<BS>({ ok: true, connected: false });
  const [navUrl, setNavUrl] = useState("http://juice-shop:3000");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const poll = useCallback(async () => {
    try { const r = await fetch("/api/browser/status"); setStatus(await r.json() as BS); } catch { setStatus({ ok: true, connected: false }); }
  }, []);

  useEffect(() => { poll(); const i = setInterval(poll, 3000); return () => clearInterval(i); }, [poll]);

  const nav = useCallback(async () => { if (!navUrl) return; setLoading(true);
    try { await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: navUrl }) }); poll(); } finally { setLoading(false); }
  }, [navUrl, poll]);

  const shot = useCallback(async () => { setLoading(true);
    try { const r = await fetch("/api/browser/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); const d = await r.json(); if (d.ok && d.screenshot) setScreenshot(d.screenshot as string); } finally { setLoading(false); }
  }, []);

  const c = status.connected;

  return <div className="flex flex-col h-full" style={{ background: "#0f172a", color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>
    <div className="flex items-center gap-2 px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
      {c ? <><div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} /><Link2 className="size-3" style={{ color: "#22c55e" }} /><span className="text-xs font-medium" style={{ color: "#22c55e" }}>CDP</span></> : <><div className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /><Unlink className="size-3" style={{ color: "#ef4444" }} /><span className="text-xs" style={{ color: "#ef4444" }}>Нет CDP</span></>}
      <div className="flex-1" />{loading && <Loader2 className="size-3 animate-spin" style={{ color: "#38bdf8" }} />}
      <span className="text-[10px] truncate max-w-[180px]" style={{ color: "#64748b" }}>{status.title || navUrl}</span>
    </div>
    <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: "1px solid #1e293b" }}>
      <Input value={navUrl} onChange={(e:any) => setNavUrl(e.target.value)} onKeyDown={(e:any) => e.key === "Enter" && nav()} className="h-7 text-xs" style={{ background: "#09090b", borderColor: "#1e293b", color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }} />
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={nav} disabled={loading || !c}><ExternalLink className="size-3" /></Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={()=>{setLoading(true);fetch("/api/browser/eval",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expression:"window.location.reload()"})}).finally(()=>{setLoading(false);setTimeout(poll,500);})}} disabled={loading||!c}><RotateCcw className="size-3"/></Button>
      <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={shot} disabled={loading||!c}><Camera className="size-3"/></Button>
    </div>
    <div className="flex-1 overflow-auto min-h-0" style={{ background: "#09090b" }}>
      {screenshot ? <img src={screenshot} alt="screenshot" className="w-full" /> : <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: "#475569" }}><Globe className="size-8 opacity-30" /><span className="text-xs">{c ? "Нажми 📷 для скриншота" : "CDP Chrome не подключён"}</span></div>}
    </div>
  </div>;
}